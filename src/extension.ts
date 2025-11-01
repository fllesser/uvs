import * as vscode from 'vscode';

let terminal: vscode.Terminal | undefined;

async function ensurePythonVersion(folderUri: vscode.Uri | undefined): Promise<void> {
    if (!folderUri) {
        return;
    }

    const pyverUri = vscode.Uri.joinPath(folderUri, '.python-version');
    try {
        await vscode.workspace.fs.stat(pyverUri);
        // file exists, nothing to do
        return;
    } catch (e) {
        // not exists, continue to try creating from pyproject.toml
    }

    const pyprojectUri = vscode.Uri.joinPath(folderUri, 'pyproject.toml');
    let content: string;
    try {
        const data = await vscode.workspace.fs.readFile(pyprojectUri);
        content = new TextDecoder().decode(data);
    } catch (e) {
        // no pyproject.toml found or can't read it
        return;
    }

    // Try to extract project.requires-python value
    // Look for requires-python = "..." (in [project] section or anywhere)
    const reqMatch = content.match(/requires-python\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\n#]+))/i);
    const spec = reqMatch ? (reqMatch[1] || reqMatch[2] || reqMatch[3] || '').trim() : '';
    if (!spec) {
        return;
    }

    // Determine minimal version from the spec string.
    // Only accept a '>=' style minimum (e.g., '>=3.8' or '>=3.8,<4').
    // Do NOT coerce a bare major version like '3' into '3.0'.
    let minVersion: string | null = null;
    const geMatch = spec.match(/>=\s*([0-9]+(?:\.[0-9]+){0,2})/);
    if (geMatch) {
        minVersion = geMatch[1];
    }

    if (!minVersion) {
        return;
    }

    try {
        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(pyverUri, encoder.encode(minVersion + '\n'));
        vscode.window.showInformationMessage(`.python-version created with minimum Python ${minVersion}`);
    } catch (e) {
        // ignore write errors
    }
}

function getConfig() {
    const cfg = vscode.workspace.getConfiguration('uvs');
    return {
        command: cfg.get<string>('command', 'uv sync'),
        autoEnable: cfg.get<boolean>('autoEnable', true),
        delaySeconds: cfg.get<number>('delaySeconds', 2),
        showOutput: cfg.get<boolean>('showOutput', true)
    };
}

async function runSyncCommand(showOutput: boolean, command: string, folderUri?: vscode.Uri) {
    if (!command || command.trim().length === 0) {
        vscode.window.showErrorMessage('uvs: no command configured');
        return;
    }

    // Remove help flags (-h, --help, -help) if present, then run the cleaned command.
    // This is more forgiving: users who accidentally configure a help flag will still run the intended command.
    const helpRemovePattern = /(?:\s|^)(?:-h\b|--help\b|-help\b)(?:\s|$)/g;
    const cleaned = command.replace(helpRemovePattern, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length === 0) {
        vscode.window.showWarningMessage('uvs: command only contained help flags and was not executed. Configure a valid command (default: "uv sync").');
        return;
    }
    // Use cleaned command from now on
    command = cleaned;

    if (folderUri) {
        // ensure .python-version exists or create it from pyproject.toml
        try {
            await ensurePythonVersion(folderUri);
        } catch (e) {
            // continue even if ensuring fails
        }
    }

    if (!terminal) {
        terminal = vscode.window.createTerminal({ name: 'uvs' });
    }

    try {
        terminal.sendText(command, true);
        if (showOutput) {
            terminal.show(true);
        }
        // Keep terminal reference; user can close and it will be recreated next run.
    } catch (err) {
        vscode.window.showErrorMessage(`uvs: failed to run command: ${String(err)}`);
        console.error('uvs error', err);
    }
}

export function activate(context: vscode.ExtensionContext) {
    const cfg = getConfig();

    const disposable = vscode.commands.registerCommand('uvs.syncNow', async () => {
        const c = getConfig();
        // choose active workspace folder if available
        const folderUri = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
            ? vscode.workspace.workspaceFolders[0].uri
            : undefined;
        await runSyncCommand(c.showOutput, c.command, folderUri);
    });
    context.subscriptions.push(disposable);

    // If workspace contains pyproject.toml and autoEnable is true, run after delay
    if (cfg.autoEnable) {
        const delay = Math.max(0, cfg.delaySeconds || 0) * 1000;
        setTimeout(async () => {
            // verify pyproject.toml exists in workspace and remember folder
            const folders = vscode.workspace.workspaceFolders;
            let found = false;
            let foundFolderUri: vscode.Uri | undefined;
            if (folders) {
                for (const folder of folders) {
                    try {
                        const uri = vscode.Uri.joinPath(folder.uri, 'pyproject.toml');
                        await vscode.workspace.fs.stat(uri);
                        found = true;
                        foundFolderUri = folder.uri;
                        break;
                    } catch (e) {
                        // not found in this folder
                    }
                }
            }

            if (found && foundFolderUri) {
                // run in the folder where pyproject.toml was found
                await runSyncCommand(cfg.showOutput, cfg.command, foundFolderUri);
            } else {
                // If extension was activated by onStartupFinished and not workspaceContains, be quiet.
            }
        }, delay);
    }
}

export function deactivate() {
    // do not dispose terminal so user can see previous output; let VS Code handle it
}

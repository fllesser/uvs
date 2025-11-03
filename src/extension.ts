import * as vscode from 'vscode';

async function detectMinPythonVersion(folderUri: vscode.Uri | undefined): Promise<string | null> {
    if (!folderUri) {
        return null;
    }

    const pyverUri = vscode.Uri.joinPath(folderUri, '.python-version');
    try {
        await vscode.workspace.fs.stat(pyverUri);
        // .python-version exists, no need to detect
        return null;
    } catch (e) {
        // not exists, continue to detect from pyproject.toml
    }

    const pyprojectUri = vscode.Uri.joinPath(folderUri, 'pyproject.toml');
    let content: string;
    try {
        const data = await vscode.workspace.fs.readFile(pyprojectUri);
        content = new TextDecoder().decode(data);
    } catch (e) {
        // no pyproject.toml found or can't read it
        return null;
    }

    // Try to extract project.requires-python value
    // Look for requires-python = "..." (in [project] section or anywhere)
    const reqMatch = content.match(/requires-python\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\n#]+))/i);
    const spec = reqMatch ? (reqMatch[1] || reqMatch[2] || reqMatch[3] || '').trim() : '';
    if (!spec) {
        return null;
    }

    // Determine minimal version from the spec string.
    // Only accept a '>=' style minimum (e.g., '>=3.8' or '>=3.8,<4').
    // Do NOT coerce a bare major version like '3' into '3.0'.
    let minVersion: string | null = null;
    const geMatch = spec.match(/>=\s*([0-9]+(?:\.[0-9]+){0,2})/);
    if (geMatch) {
        minVersion = geMatch[1];
    }

    return minVersion;
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

    let finalCommand = command;
    if (folderUri) {
        // detect minimum Python version if .python-version doesn't exist
        const minVersion = await detectMinPythonVersion(folderUri);
        if (minVersion) {
            // add -p minVersion to command if .python-version doesn't exist
            finalCommand = `${command} -p ${minVersion}`;
        }
    }

    let terminal = vscode.window.terminals.find(t => t.name === 'uvs');

    if (!terminal) {
        terminal = vscode.window.createTerminal({ name: 'uvs' });
        // 等待虚拟环境自动激活
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (showOutput) {
        terminal.show(true);
    }

    try {
        terminal.sendText(finalCommand, true);
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

# uvs

自动在打开包含 `pyproject.toml` 的 Python 项目时运行 `uv sync`（或用户配置的命令）。

## 功能
- 自动检测包含 `pyproject.toml` 的工作区并在激活后运行命令（可配置延迟）。
- 提供命令 `uvs: uv sync`（命令 id: `uvs.syncNow`）用于手动触发。
- 配置项支持自定义命令、自动启用开关、延迟秒数以及是否展示输出终端。

## 设置
在设置里搜索 `uvs`，或在 `settings.json` 中添加：

```json
"uvs.command": "uv sync",
"uvs.autoEnable": true,
"uvs.delaySeconds": 2,
"uvs.showOutput": true
```

## 开发/编译
1. 安装依赖：

```bash
# 在项目根目录运行
npm install
```

2. 编译 TypeScript：

```bash
npm run compile
```

3. 在 VS Code 中按 F5 启动 Extension Development Host 进行调试。

## 注意
- 本扩展假设 `uv` 命令可在终端环境中运行（例如在虚拟环境或全局环境中）。
- 如果需要其它行为（例如使用远程同步、需要认证等），请说明需求我可以扩展实现。

4. 打包并安装在 VS Code 中：
```bash
npm run compile && npx vsce package --out uvs.vsix && ls -la uvs.vsix && code --install-extension uvs.vsix
```
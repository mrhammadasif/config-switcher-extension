# Config Switcher

Switches a destination config file between dev and local source files from the VS Code status bar.

## Behavior

- Shows one status bar toggle when a workspace contains `public/config.dev.json` or `public/config.local.json`.
- Reads the destination config file and treats the current environment as local when `api.baseUri` contains `localhost`.
- Shows `$(home) Local` for local configs and `$(cloud) Dev` for dev configs.
- Clicking the toggle copies the opposite source file over the destination config file.
- Watches the workspace for those files being created, changed, or deleted.

## Settings

The extension works out of the box with these default paths:

- Dev source: `public/config.dev.json`
- Local source: `public/config.local.json`
- Destination: `public/config.json`

All paths are workspace-relative. Absolute paths and paths outside the workspace are rejected.

You can override the defaults in VS Code settings:

```json
{
  "configSwitcher.devConfigPath": "public/config.dev.json",
  "configSwitcher.localConfigPath": "public/config.local.json",
  "configSwitcher.targetConfigPath": "public/config.json"
}
```

The extension uses the standard VS Code extension API and should work in compatible VS Code-based editors such as Cursor and Antigravity.

## Development

```bash
npm install
npm test
```

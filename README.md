# EG Config Switcher

Switches `public/config.json` between environment-specific files from the VS Code status bar.

## Behavior

- Shows one status bar toggle when a workspace contains `public/config.dev.json` or `public/config.local.json`.
- Reads `public/config.json` and treats the current environment as local when `api.baseUri` contains `localhost`.
- Shows `$(home) Local` for local configs and `$(cloud) Dev` for dev configs.
- Clicking the toggle copies the opposite file over `public/config.json`.
- Watches the workspace for those files being created, changed, or deleted.

The extension uses the standard VS Code extension API and should work in compatible VS Code-based editors such as Cursor and Antigravity.

## Development

```bash
npm install
npm test
```

# VS Code panel

## Description

`packages/vscode`: host `web` in a webview, pass the workspace root, start or attach to the
server, forward a block click to `vscode.open`.

## Acceptance Criteria

- [ ] Opens as a panel beside the terminal
- [ ] Draws nothing itself; the same `web` bundle runs in the browser and the panel
- [ ] CSP allows only the bundled script and the local WebSocket

## Definition of Done

- [ ] `npm run gate` green
- [ ] ENGINEERING_NOTES §5 entry closed

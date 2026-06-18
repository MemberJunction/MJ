---
"@memberjunction/computer-use": patch
"@memberjunction/remote-browser-base": patch
"@memberjunction/remote-browser-cdp": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
---

Add clipboard paste-in and copy-out to the remote-browser human-control (Self-Hosted Chrome canvas viewer), which previously couldn't bridge the local and remote clipboards.

- **Paste-in:** a new `'text'` `RemoteBrowserHumanInput` kind, mapped (CDP) to the existing text-insertion path (`TypeAction` / `Input.insertText`) — no clipboard sync needed. The viewer captures the local `paste`, reads `clipboardData`, and relays the text to the remote page's focused element.
- **Copy-out:** a new capability-gated `IRemoteBrowserSession.GetSelectionText()` (CDP `page.evaluate(window.getSelection())`) + a `GetRemoteBrowserSelection` GraphQL query; the viewer captures the local `copy`, fetches the remote selection, and writes it to the local clipboard via `navigator.clipboard.writeText` (best-effort, gated on `HumanTakeover`).

Lets a human controlling the remote browser paste credentials in and copy text out. Tests added for the `'text'` mapping, `GetSelectionText`, and the channel relay.

---
"@memberjunction/computer-use": patch
"@memberjunction/remote-browser-base": patch
"@memberjunction/remote-browser-cdp": patch
"@memberjunction/server": patch
"@memberjunction/ng-conversations": patch
---

Resize the remote Chromium browser viewport in place to match the usable drawer area below the toolbar instead of scaling a fixed 1280 × 720 desktop frame, render the canvas and cursor overlay edge-to-edge at the frame's aspect ratio, re-arm standby `browser_*` tools after closing the drawer with `CloseRemoteBrowserPanel()`, and keep `HideRemoteBrowserPanel()` separate when toggling the header Browser button.

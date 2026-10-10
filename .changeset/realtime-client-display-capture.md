---
"@memberjunction/ai-realtime-client": patch
---

Adds `RequestDisplayCapture` and `GetDisplayCaptureSupport` to `@memberjunction/ai-realtime-client/media`. `RequestDisplayCapture` opens the browser's share picker with surface hints (never offering the current page for a normal share), reports what the user shared and when sharing ends, and can share a single panel of the page through Element Capture or Region Capture on Chromium browsers. It always resolves with a status (`started`, `cancelled` or `failed` with a reason) instead of throwing. `GetDisplayCaptureSupport` tells a caller whether panel capture is possible, so Firefox and Safari can show a panel to the agent through its channel frames instead. `CreateScreenCapture` is deprecated.

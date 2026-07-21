---
"@memberjunction/communication-types": patch
"@memberjunction/communication-engine": patch
"@memberjunction/communication-sendgrid": patch
"@memberjunction/communication-gmail": patch
"@memberjunction/communication-twilio": patch
"@memberjunction/communication-ms-graph": patch
"@memberjunction/communication-expo-push": patch
"@memberjunction/scheduling-engine": patch
---

Communication **DryRun** send mode + a real HTML-body fallback fix.

- **DryRun seam (new capability)** — `Message.DryRun` and `MessageResult.DryRun` on the base contract (`communication-types`), threaded through the engine and honored by all five shipping providers (SendGrid, Gmail, Twilio, MS Graph, Expo Push). When `DryRun` is true a provider runs its **full** preflight + payload construction and reports success **without** contacting its external service, stamping `MessageResult.DryRun = true`. Lets scheduled jobs and tests exercise the entire send pipeline with zero real messages sent. `scheduling-engine` passes the flag through on scheduled communication sends.
- **B64 fix (`communication-engine`)** — `ProcessedMessageServer.Process` derives the HTML body from the BodyTemplate (its HTML content render, or the documented rendered-text fallback), then the trailing `else` branch unconditionally overwrote it with `HTMLBody || ''` — so any message without an explicit HTMLBody/HTMLBodyTemplate shipped an **empty** HTML body, making the fallback dead code. The derived value is now preserved (`HTMLBody || ProcessedHTMLBody || ''`).

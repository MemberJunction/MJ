---
"@memberjunction/mobile-app": patch
---

Return sends the message in the mobile composer, with the web's exact precedence: an open mention
picker with results completes the mention first, Shift+Return inserts a newline wherever the
platform reports modifiers, and the policy is configurable per host via `SubmitOnEnter`. Defaults to
sending only when a hardware keyboard is attached — an on-screen keyboard has no Shift to fall back
on, so sending there would leave no way to type a second line.

Also fixes mention tokens leaking into conversation titles and list snippets. A conversation opened
with `@Sage …` was named from the wire format and showed as `@{"type":"agent","id":"55…` in the
thread header and in every row of the conversation list; the conversion now happens where the view
model is built, which also repairs conversations already named that way.

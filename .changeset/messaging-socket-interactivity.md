---
"@memberjunction/messaging-adapters": patch
---

Fix Slack interactivity being inert in Socket Mode

Socket Mode subscribed only to `message` and `app_mention`, so every interactive element the block builder renders — the "Fill Out Form" button, choice buttons, action buttons — did nothing: the click produced an event no listener consumed. `handleSlackInteraction`, with its full modal build and submit path, was wired only to the HTTP route, which additionally requires a `SigningSecret` that a Socket Mode deployment has no reason to configure.

This is not cosmetic: an agent that asks a clarifying question through a form could not be answered at all, so any human-in-the-loop flow dead-ended.

Socket Mode now routes `interactive`, `block_actions`, and `view_submission` to the same handler, converting the parsed payload back to the JSON string the handler's contract expects. Interactivity must still be enabled on the Slack app.

Tests: 335/335 (2 added); removing the subscriptions fails both.

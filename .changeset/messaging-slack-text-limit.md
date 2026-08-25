---
"@memberjunction/messaging-adapters": patch
---

Fix streaming updates failing with `msg_too_long` on any long agent output

`MAX_TEXT_LENGTH` was 39,000 — the figure for a message's total **block** payload, not for the `text` field, which Slack rejects past roughly 4,000 characters. Truncation therefore never engaged before the API refused the call: every progress update for a long response failed, the placeholder froze mid-run, and the log filled with `msg_too_long`. Especially visible when a model streams a raw envelope containing inlined file data.

Now 3,900, leaving room for the truncation notice. Tests: 338/338 (3 added); restoring the old limit fails two.

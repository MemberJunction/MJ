---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/messaging-adapters": minor
---

Add a `compose:email` actionable command so an agent can hand the user a pre-filled email draft.

The agent drafts; the user sends. Nothing in this path transmits mail — the host opens the user's
own compose window via a `mailto:` URL and the user decides whether to send.

- **ai-core-plus** — `ComposeEmailCommand` joins the `ActionableCommand` union, with `BuildMailtoURL`,
  `MAILTO_MAX_URL_LENGTH` and `IsMailtoURLWithinLimit`. The command carries no target field: which
  compose surface opens is the host's decision, so retargeting later is a one-handler change rather
  than a migration across every agent that emits one.
- **ng-conversations** — the handler opens the mail client via a synthesized anchor click (not
  `window.open`, which strands an `about:blank` tab on a non-http scheme). Past the length limit it
  refuses to open, copies the body best-effort, and emits for the host to open the draft artifact
  instead: a mail client handed an over-long URL does not error, it opens a draft with the body
  **silently truncated**.
- **messaging-adapters** — Slack and Teams degrade to a note naming the draft, because a `mailto:`
  URL fails both platforms' button-URL checks and the command would otherwise render as nothing.

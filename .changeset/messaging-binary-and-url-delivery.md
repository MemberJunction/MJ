---
"@memberjunction/messaging-adapters": patch
---

Deliver generated files and images to chat, and stop unopenable URLs from failing the whole reply

Three delivery defects, each of which made an agent's completed work invisible:

- **Base64 output was silently dropped.** Slack's `image` blocks can only reference a public https URL, so every generated image — and any file an agent inlined — was persisted server-side and never delivered. Adapters may now implement `uploadMediaOutputs` (Slack does, via `files.uploadV2`, requiring the `files:write` scope) and the base class calls it after the text reply posts.
- **Inlined files are decoded and uploaded.** MJ's document actions embed a whole generated file as `data:<mime>;base64,…` when no file storage account is configured. That is unusable as a chat link — thousands of unclickable characters that also breach Slack's message limit — so the bytes are decoded and sent as a real attachment. MIME types whose subtype is not a valid extension are mapped properly (a .docx was becoming `…wordprocessingml.document`).
- **A non-public button URL failed the entire message.** Slack rejects a message with `invalid_blocks` when a block element's `url` is not a public http(s) address, so with a localhost `ExplorerBaseURL` — the normal local-dev value — a reply carrying any resource command never posted at all: work done, artifact created, user saw nothing. Such URLs now degrade to mrkdwn links (which Slack accepts), and `data:`/`blob:`/`file:` URIs are never rendered.

Tests: 333/333 (11 added), each mutation-checked.

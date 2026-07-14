---
'@memberjunction/ng-explorer-core': minor
'@memberjunction/ng-shared': minor
'@memberjunction/ng-composer': minor
'@memberjunction/ng-conversations': minor
'@memberjunction/core-entities': patch
---

Unified Ctrl+K omnibar command palette + composer draft persistence.

- **Omnibar (ng-explorer-core)**: pluggable `OmnibarProvider` ClassFactory registry powering a unified Ctrl+K palette (search, `@agent`, `#entity`, `/skills`, `>commands`, recent searches), gated by a two-layer switch — the `Shell.Omnibar.Enabled` instance config flag is the master availability switch (default ON; OFF = legacy trio for everyone), and each user opts in personally via My Profile → Command Palette (UserInfoEngine setting `mj.shell.omnibar.enabled`, default OFF, cross-device, flips live). Modal palette is summonable from within editable elements (Slack/Linear semantics). `@agent` selection lands in Chat with a one-shot `agent|agentReq` nonce instruction so URL↔tab-config sync echoes can never re-stage the pre-address or wipe an in-progress draft.
- **Composer (ng-composer)**: public `InsertMention()` API stages a resolved mention pill programmatically (chip + trailing space + caret focus), `FocusCaretAtEnd()`, blur output, and full serialized-mention rehydration — `writeValue` re-renders `@{...}` tokens as pills via `ParseSerializedMentions`.
- **Conversations (ng-conversations)**: `InsertAgentMention()` resolves an agent name to a pill with replace-not-stack semantics and focus re-assertion; new `ComposerDraftStore` persists in-progress drafts per conversation (plus the new-conversation composer) via `UserInfoEngine` under `mj.chat.drafts.v1` — debounced while typing, flushed on blur, cleared on send, restored (pills included) on reload across sessions/devices.
- **core-entities**: `UserInfoEngine.SetSetting` recovers when a cached settings row was deleted out-of-band (recreates instead of failing the UPDATE).

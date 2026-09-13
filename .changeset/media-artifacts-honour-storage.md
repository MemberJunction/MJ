---
"@memberjunction/ai-agents": patch
---

Store agent-generated media in configured file storage, not inline

`CreateMediaArtifacts` wrote every image, audio and video artifact inline as a
`data:<mime>;base64,...` string in `ArtifactVersion.Content`, regardless of whether a file storage
account was configured — while `ProcessFileArtifacts`, handling file outputs a few lines away,
honoured it. Media now takes the same route: upload to the resolved storage account when one is
configured, and fall back to inline when it is not, or when the upload fails.

This was an omission rather than a decision. The method was added to migrate media off the
deprecated `ConversationDetailAttachment` table and inherited that path's inline behaviour; the
storage branch had landed in its sibling six weeks earlier. Both call the same
`createArtifactWithVersion` helper, so the two looked consistent. Nothing downstream required
inline media — `gatherConversationArtifacts` and all three Angular viewers already branch on
`ContentMode === 'File'`.

The cost was silent: a generated image is routinely several megabytes, and inline storage puts that
base64 in a SQL column and ships it in full on every read of the row. In one production database,
35 images accounted for 129 MB of `ArtifactVersion.Content`.

`CreateMediaArtifacts` takes the resolved storage account as a new optional final parameter, so
existing callers are unaffected — omitting it falls back to the first active account.

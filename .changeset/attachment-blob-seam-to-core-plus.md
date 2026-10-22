---
"@memberjunction/ai-core-plus": patch
"@memberjunction/aiengine": patch
"@memberjunction/ng-conversations": patch
---

Move the conversation-attachment blob seam (`IAttachmentBlobStore`, `AttachmentBlobUploadInput`,
`AttachmentBlobUploadResult`, `AttachmentBlobStoreUnavailableError`) from `@memberjunction/aiengine`
to `@memberjunction/ai-core-plus`, next to the placement policy in `ConversationUtility`. `aiengine`
re-exports it, so existing consumers are unaffected.

`ng-conversations` implements this seam for the browser and imported the types with `import type`,
on the reasoning that an erased import costs nothing. It costs nothing at *runtime* — but the
class-registration manifest generator walks **package.json**, not imports, so the declared
dependency was a live edge regardless. When `aiengine` gained a `@memberjunction/storage`
dependency, that edge carried seven storage-driver classes into the browser manifest and broke the
MJExplorer bundle on `node:net` / `node:stream` / `node-fetch`.

The rule this encodes: a browser-reachable package must not *declare* a server-only dependency,
even for a type. `ng-conversations` no longer declares `aiengine` at all.

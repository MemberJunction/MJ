---
"@memberjunction/aiengine": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
---

Put conversation-attachment blob access behind a seam, so the attachment service stops being server-only — and fix the inline-everything bug that duplication had already caused.

`ConversationAttachmentService` is 859 lines of attachment *policy*: limit validation, the inline-vs-MJStorage threshold, modality resolution, thumbnails, content URLs for AI consumption. None of it is platform-specific. But it imported `@memberjunction/storage` for four members, and that package depends on `@aws-sdk/client-s3`, `@azure/storage-blob`, `dropbox` and more — so one import made the whole package unusable from any browser or React Native client. It was that package's **only** server-only dependency.

The predictable result was three implementations of one policy: this service, a 494-line copy in `@memberjunction/ng-conversations`, and a third in the mobile app. And they had already drifted — **the Angular copy stored every attachment inline**, never consulting `ConversationUtility.ShouldStoreInline`, so a 5 MB image went into a database column instead of MJStorage, contradicting the `MJ: Conversation Detail Attachments` contract that `InlineData` is for small attachments and `FileID` for large ones.

**The seam.** `IAttachmentBlobStore` — `Upload` / `Download` / `GetDownloadUrl` / `Delete`. Three deliberate choices:

- **base64 at the boundary, never `Buffer`.** `Buffer` is a Node global; its presence in a shared signature is precisely what pinned this to one runtime. (The realtime runtime extraction learned the same lesson when `Blob` had leaked into session orchestration.)
- **Optional by contract.** A host binding nothing gets inline attachments and a distinct, recognizable "storage not available on this host" — so a caller can tell a *deployment shape* from an *incident*. That is the normal case for an end user, who typically cannot write to MJStorage at all.
- **Bindings live outside the service.** `MJStorageBlobStore` (MJServer, wrapping `FileStorageEngine`) and `GraphQLAttachmentBlobStore` (ng-conversations, wrapping the existing `GraphQLFileStorageClient`). Neither is imported by the service.

**What changed behaviourally:** Explorer now honours the storage threshold — large attachments go to MJStorage through MJAPI instead of silently inline. Everything else is a same-shape substitution.

`DownloadFileContent` returns `string` (base64) rather than `Buffer | null`; its one caller, `RunAIAgentResolver`, is updated. Behaviour is otherwise unchanged: the MJStorage bodies moved verbatim, and the account-vs-provider credential resolution — which previously existed in only one of the three near-identical driver-resolution blocks — is now shared by all of them.

Verified: full monorepo build 306/306 + 278/278; ng-conversations 1,324 tests green; aiengine 130 tests green (including new seam coverage); mobile 195 green.

**Scope of the portability win, stated exactly.** This takes `@memberjunction/storage` — and with it the AWS, Azure and Dropbox SDKs — out of the attachment service's dependency graph, and it puts the inline-vs-storage decision behind one shared `ConversationUtility.ShouldStoreInline` call on every surface. It does **not** make `@memberjunction/aiengine` importable from a browser at runtime: the package's entry point also exports `AIEngine`, which imports Node's `crypto` at module scope for an embedding-cache key, and Explorer's bundler cannot resolve that. So the Angular host takes the *type* from this package (`import type`, erased at compile time) and the *policy* from `@memberjunction/ai-core-plus`, holding its own `GraphQLAttachmentBlobStore` rather than reaching through `GetAttachmentService()`. Removing that one `crypto` import — or splitting the package's entry points — is the remaining step, and it belongs to `aiengine`'s owners.

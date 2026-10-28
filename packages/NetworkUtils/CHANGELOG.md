# @memberjunction/network-utils

## 6.2.0-edge.6

### Minor Changes

- 1090caa: Add the content pipeline framework: Discover, Extract, Tag, Segment, Embed and Delete stages that run over
  Content Sources, Items and Chunks through Record Set Processing's new `Pipeline Stage` work type. One
  working record passes between stages, each well-known field carrying a confidence score so stages resolve
  a shared field on merit. Only the hydrator and committer touch the database, so a test run is the same
  code with commits withheld.

  The stages reuse what MJ already has. Discover and Extract call the Content Source Type's existing driver
  (new optional `Discover` and `Fetch` on `AutotagBase`); file-type detection reads `MJ: Content File Types`
  (new `ByteSignature`, `IsText`, `ExtractorKey` columns, seeded in metadata); durable copies go through
  `FileStorageEngine.UploadFile`; Tag, Embed and Delete share the autotagger's prompt helpers and its new
  `ContentVectorInfrastructure`, which also routes a source or content type that names only a `VectorIndexID`
  (with no `EmbeddingModelID`) to that index using the index's own `EmbeddingModelID`. Document parsing moves
  into `@memberjunction/document-parsing`, used by Get File Content (which now trims extracted PDF and Word
  text) and the pipeline. Record Set Processing gains a per-work-type tracker pairing, so scheduled and
  on-change runs record the same detail rows as manual ones. Additionally, `AutotagLocalFileSystem` skips
  symbolic links and recurses into subfolders during tagging; `AutotagCloudStorage` normalizes extensions
  written with or without a leading dot and prefers the provider's first configured `MJ: File Storage Accounts`
  row over environment variables; `NormalizeAutotagKeywords` in `@memberjunction/content-autotagging` drops blank
  tag names; and `ContentItemTagBridge` in `@memberjunction/tag-engine` delegates `MJ: Tagged Items` creation to
  `TagEngine.CreateTaggedItem` (updating the stored weight on re-tagging).

## 6.2.0-edge.5

## 6.2.0-edge.4

## 6.2.0-edge.3

## 6.2.0-edge.2

## 6.2.0-edge.1

## 6.2.0-edge.0

## 6.1.0

### Patch Changes

- 7857d8e: Add `@memberjunction/network-utils` and remove `axios` from the repository.

  The SSRF guard added for the web/HTTP actions was Actions-specific but the concern is not, so it
  moves into a new dependency-free, Node-only package (`node:dns` + `node:net` only) that any
  server-side package can depend on: `AssertPublicUrl`, `SafeFetch`, `IsBlockedIPAddress`, `SSRFError`.

  The same package ships `HttpClient` / `HttpRequest` — a native-`fetch` HTTP client that replaces
  `axios` across all 11 packages that used it. Consolidating on one client removes the third-party
  dependency and puts the SSRF guard one option flag (`ValidateUrl`) away from every outbound call
  site, which was impossible when each package reached for `axios` directly.

  Also fixes an SSRF sink the original pass missed: the `API Rate Limiter` action takes a
  caller-controlled URL and returns the response body, and is now guarded.

  Public exports use `PascalCase`, per repo convention.

- 9cbe17f: Fix a resource leak introduced by the axios→native-`fetch` migration: several call sites (SharePoint/Box/Dropbox drivers, GraphQL Query, URL Metadata Extractor, Web Page Content, the generic file-URL loader, LearnWorlds, SendGrid Inbound Parse delete) discarded a `fetch`/`SafeFetch` response on an error or retry-discard branch without ever reading or cancelling its body, pinning the underlying connection out of Node's keep-alive pool until GC finalized it. Added `DrainResponseBody` to `@memberjunction/network-utils` and wired it into every affected branch, plus closed the same latent gap in `HttpRequest`'s own `ResponseType: 'stream'` + non-2xx path.

## 6.1.0-edge.7

## 6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 9cbe17f: Fix a resource leak introduced by the axios→native-`fetch` migration: several call sites (SharePoint/Box/Dropbox drivers, GraphQL Query, URL Metadata Extractor, Web Page Content, the generic file-URL loader, LearnWorlds, SendGrid Inbound Parse delete) discarded a `fetch`/`SafeFetch` response on an error or retry-discard branch without ever reading or cancelling its body, pinning the underlying connection out of Node's keep-alive pool until GC finalized it. Added `DrainResponseBody` to `@memberjunction/network-utils` and wired it into every affected branch, plus closed the same latent gap in `HttpRequest`'s own `ResponseType: 'stream'` + non-2xx path.

## 6.1.0-edge.4

### Patch Changes

- 7857d8e: Add `@memberjunction/network-utils` and remove `axios` from the repository.

  The SSRF guard added for the web/HTTP actions was Actions-specific but the concern is not, so it
  moves into a new dependency-free, Node-only package (`node:dns` + `node:net` only) that any
  server-side package can depend on: `AssertPublicUrl`, `SafeFetch`, `IsBlockedIPAddress`, `SSRFError`.

  The same package ships `HttpClient` / `HttpRequest` — a native-`fetch` HTTP client that replaces
  `axios` across all 11 packages that used it. Consolidating on one client removes the third-party
  dependency and puts the SSRF guard one option flag (`ValidateUrl`) away from every outbound call
  site, which was impossible when each package reached for `axios` directly.

  Also fixes an SSRF sink the original pass missed: the `API Rate Limiter` action takes a
  caller-controlled URL and returns the response body, and is now guarded.

  Public exports use `PascalCase`, per repo convention.

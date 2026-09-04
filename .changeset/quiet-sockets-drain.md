---
"@memberjunction/network-utils": patch
"@memberjunction/storage": patch
"@memberjunction/core-actions": patch
"@memberjunction/actions-bizapps-lms": patch
"@memberjunction/communication-sendgrid": patch
---

Fix a resource leak introduced by the axios→native-`fetch` migration: several call sites (SharePoint/Box/Dropbox drivers, GraphQL Query, URL Metadata Extractor, Web Page Content, the generic file-URL loader, LearnWorlds, SendGrid Inbound Parse delete) discarded a `fetch`/`SafeFetch` response on an error or retry-discard branch without ever reading or cancelling its body, pinning the underlying connection out of Node's keep-alive pool until GC finalized it. Added `DrainResponseBody` to `@memberjunction/network-utils` and wired it into every affected branch, plus closed the same latent gap in `HttpRequest`'s own `ResponseType: 'stream'` + non-2xx path.

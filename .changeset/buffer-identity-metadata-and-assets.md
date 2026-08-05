---
"@memberjunction/actions-bizapps-social": minor
---

Buffer: publish as another identity, pass per-service metadata, and fix the createPost assets shape.

**`CredentialID`** is now accepted by every Buffer action. When given, the calls are made with the `accessToken` from that `MJ: Credentials` row instead of the CompanyIntegration's own token — which is what publishing to an employee's personal channel, or reading the queue of the person who owns it, requires. `CompanyIntegrationID` stays required: it is what identifies which Buffer integration this is, and the organization and channel context still come from it. A `CredentialID` that was supplied but cannot be read is **fatal** (`INVALID_CREDENTIAL`), never a silent fallback to the tenant token — falling back would publish under the wrong identity with nothing for the caller to notice. The token itself never travels through action params; only its id does.

**`PlatformMetadata`** on `Create Post (Buffer)` passes Buffer's per-service extras through to the mutation — `{ "linkedin": { "annotations": [...] } }` is how a LinkedIn @mention survives the trip, and without it the post publishes as plain text with the mention spelled out. It is accepted as an object or as a JSON string, since both forms arrive in practice. It is passed through untouched rather than modelled, because its shape belongs to whichever network the channel points at and Buffer extends it independently of this package. Unparseable input **fails** rather than being dropped, for the same reason the credential failure is fatal: quietly posting without the metadata publishes something other than what the caller composed.

**Fix — the createPost assets shape.** Buffer moved createPost's input to `[AssetInput!]` (`[{ image: { url } }]`, one entry per attachment naming its kind) on 2026-05-25 and rejects the older `{ images: [...] }` object, which is what this package was sending. Any post with `ImageURLs`, `VideoURLs` or `MediaLink` was therefore being rejected by Buffer. Reads are unaffected — Buffer still *returns* the object form — so the input shape is now its own type, `BufferAssetInput`, alongside the unchanged `BufferAssets` response type.

This is a breaking change for any caller passing a hand-built `assets` object to the protected `createBufferPost`; the action's own `ImageURLs`/`VideoURLs`/`MediaLink` params are unchanged.

27 tests cover the credential override, the metadata passthrough and the asset shape.

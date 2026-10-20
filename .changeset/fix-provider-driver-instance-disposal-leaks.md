---
"@memberjunction/communication-engine": patch
"@memberjunction/storage": patch
"@memberjunction/auth-providers": patch
---

fix: cache/dispose provider and driver instances that were being silently rebuilt or leaked on every call

Memory-leak audit findings (Round 15, 2026-09-19):

- **`CommunicationEngine.GetProvider()`** constructed a brand-new provider instance (Twilio/Gmail/MSGraph/etc.) via `ClassFactory.CreateInstance` on every single send — including once per recipient during a bulk `SendMessages()` call. Because each provider's own SDK-client cache (`MJLruCache`) lives on the instance, this silently defeated the earlier fix that added those caches: they were rebuilt empty and thrown away on every call in production, causing sawtooth GC pressure and SDK-client/socket churn on every bulk send. `GetProvider()` now caches resolved provider instances by name, bounded by the small, admin-managed number of registered communication providers.
- **`FileStorageEngine.RefreshDriverCache()`** dropped every cached storage driver — including live SDK clients (S3Client, BlobServiceClient, etc.) — with no disposal, and is reachable from ordinary end-user activity (`UploadFile()` force-refreshes the whole driver cache any time a requested `storageAccountId` isn't found). `FileStorageBase` gains a `Dispose()` hook (no-op by default, since most of the storage SDKs used here expose no explicit teardown API); `AWSFileStorage` overrides it to destroy its `S3Client`, mirroring the destroy-before-reassign it already does internally on re-init. `FileStorageEngine` now disposes every cached driver before clearing the cache.
- **`AuthProviderFactory.register()`/`clear()`** dropped the previous `BaseAuthProvider` instance — each holding a live `https.Agent` keep-alive socket pool and `jwksClient` — with no cleanup, on every admin-triggered auth-catalog refresh. `BaseAuthProvider` now retains its HTTP agent and exposes `Dispose()` to destroy it; `IAuthProvider.Dispose()` is optional. `register()` disposes the provider it's replacing (but not when the same instance re-registers itself); `clear()` disposes every provider first.

No behavior changes to any success path. 19 new unit tests cover the caching/disposal semantics, including edge cases (failed lookups aren't cached, throwing `Dispose()` doesn't block disposing sibling drivers, same-instance re-registration isn't disposed, providers with no `Dispose()` method are tolerated).

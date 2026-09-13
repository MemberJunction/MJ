---
"@memberjunction/ai-blackforestlabs": patch
"@memberjunction/core-actions": patch
"@memberjunction/component-registry-server": patch
"@memberjunction/db-auto-doc": patch
"@memberjunction/server": patch
"@memberjunction/react-runtime": patch
"@memberjunction/schema-engine": patch
---

Memory/resource leak fixes surfaced by the Round 13 audit: drain previously-discarded `fetch()` response bodies at six call sites (BlackForestLabs, IntegrationDiscoveryResolver's webhook sender, WebPageContentAction's content-too-large guard, the React runtime's external component registry client, and RuntimeSchemaManager's restart poll) so undici no longer pins keep-alive connections; bound `RemoteBrowserActionResolver`'s process-lifetime screencast/audio-stream idempotency maps with a TTL sweep so a crashed or disconnected session no longer leaks a permanent entry; add missing SQL connection-pool `'error'` listeners (ComponentRegistry's server, DBAutoDoc's three drivers) and close DBAutoDoc's connection pool on its error path so a failed analysis run no longer leaves it open for the rest of the CLI process.

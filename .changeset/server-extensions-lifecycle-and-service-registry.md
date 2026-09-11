---
"@memberjunction/server-extensions-core": minor
"@memberjunction/server": minor
"@memberjunction/messaging-adapters": minor
---

Implement Server Extension Lifecycle (Phase 2): Pre-Auth vs Post-Auth phases, typed Service Registry, reserved root collision guards, and cross-extension lifecycle hook.

- **Pre-Auth vs. Post-Auth Phases (G1)**: Introduce `ServerExtensionPhase` (`'pre-auth' | 'post-auth'`) on `BaseServerExtension` (`DefaultPhase`) and `ServerExtensionConfig` (`Phase`). Mount pre-auth extensions before authentication middleware (for webhook signatures) and post-auth extensions after `createUnifiedAuthMiddleware`.
- **Reserved Roots Collision Prevention (G2)**: Enforce validation against reserved system endpoints (`/graphql`, `/auth`, `/health`, `/media`, `/schema`, `/mcp`) so extensions cannot shadow core routes.
- **Typed Service Registry & Init Context (G3)**: Pass `ServerExtensionInitContext` with `app`, `services`, `httpServer`, `publicUrl`, and `phase`. Provide `ServerExtensionServiceRegistry` for decoupled cross-extension service discovery. Automatically register `ExtensionInitResult.Service` into the registry.
- **Awaitable Cross-Extension Hook**: Add `OnAllExtensionsMounted(context)` lifecycle hook awaited across all loaded extensions after all phases mount.
- **Telephony Service Discovery**: Register core telephony and meeting services (`TwilioTelephonyService`, `VonageTelephonyService`, `RingCentralTelephonyService`, `TeamsMeetingsService`) into `ServerExtensionServiceRegistry`.
- **Messaging Adapters Alignment**: Expose `SlackAdapter` and `TeamsAdapter` services in `SlackMessagingExtension` and `TeamsMessagingExtension` with explicit `DefaultPhase = 'pre-auth'`.
- **Developer Guide**: Author comprehensive `guides/SERVER_EXTENSIONS_GUIDE.md` and update package READMEs.

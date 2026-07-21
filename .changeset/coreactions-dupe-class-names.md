---
"@memberjunction/core-actions": patch
"@memberjunction/auth-providers": patch
---

Fix duplicate class names in CoreActions, and export the concrete auth providers.

`find-candidate-actions.action.ts` and `find-candidate-agents.action.ts` were copy-pasted from their `find-best-*` siblings and the class name was never changed, so each pair declared the same TypeScript class name (`FindBestActionAction` / `FindBestAgentAction`) under **different** ClassFactory keys.

This was not cosmetic. A barrel can only export one class per name, so only the copy was exported — which meant `find-best-action` / `find-best-agent` were **absent from the ServerBootstrap class manifest** and therefore unprotected from tree-shaking. A shaken-out registration resolves to `BaseAction`, producing a hollow action rather than a hard failure. It also made the manifest's `FindBestActionAction` symbol resolve to the *candidate* implementation, so the manifest was actively misleading.

Renamed the copies to match their files and registration keys (`FindCandidateActionsAction` / `FindCandidateAgentsAction`) and exported all four.

Also exports the six concrete auth providers (`Auth0Provider`, `CognitoProvider`, `GoogleProvider`, `MSALProvider`, `OktaProvider`, `WorkOSProvider`). They are `@RegisterClass` plugins resolved by key at runtime, so they were reachable through the factory but not importable by name — leaving downstream consumers unable to subclass or reference them. `MagicLinkProvider` was already exported; this brings the rest to parity.

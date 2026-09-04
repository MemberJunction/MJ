---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

`configOverridesJson` names the keys it is about to ignore.

`StartRealtimeClientSession` accepts `configOverridesJson`, gates it behind the `Realtime: Advanced Session Controls` authorization, and threads it through `PrepareClientSession` — but `normalizeConfig` reads only `merged['realtime']` and returns an object built exclusively from that section. Every other top-level key was discarded with no error, no warning and no log. Authorization-gating a field implies the payload matters, which is what made the silence expensive: a caller sending `{"realtime":{…},"caliber":{…}}` had it serialize, pass the gate, cross the wire and vanish, with its own tests correctly asserting it built the payload right. Every such session ran on default configuration.

`realtime-coagent-config.ts` is deliberately framework-free — no DB, no metadata provider, no logging imports, every function a pure transformation — so it does not learn to log. It reports the drops as data:

```typescript
export type IgnoredRealtimeConfigReason = 'unknown-section' | 'unknown-key' | 'wrong-type';
export interface IgnoredRealtimeConfigKey { readonly path: string; readonly reason: IgnoredRealtimeConfigReason; }
export function FindIgnoredRealtimeConfigKeys(overridesJson: string | null | undefined): readonly IgnoredRealtimeConfigKey[];
export const REALTIME_CONFIG_SECTION_KEYS: readonly (keyof RealtimeConfigSection)[];
```

and `assertRuntimeOverridesAuthorized` — which already logs — does the talking.

**Warns rather than rejects.** Rejection is stricter and defensible in a major; in a patch it would turn a previously-accepted payload into a hard error for callers that cannot be seen from here. The reasoning sits at the call site so the next reader knows rejection was considered.

**Reported after the authorization decision, not before.** A payload that fails the gate already throws a structured error, so reporting drops for a request that never ran would be noise. Silence only ever existed for *accepted* payloads.

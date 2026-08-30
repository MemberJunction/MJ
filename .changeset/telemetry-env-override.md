---
"@memberjunction/server": patch
---

`MJ_TELEMETRY_ENABLED` could never take effect.

`telemetrySchema` read the environment variable inside a Zod `.default()`:

```ts
enabled: zodBooleanWithTransforms().default(process.env.MJ_TELEMETRY_ENABLED !== 'false')
```

A `.default()` only fires when the key is **absent** from the object being parsed. `loadConfig()` parses `mergeConfigs(DEFAULT_SERVER_CONFIG, userConfig)`, and `DEFAULT_SERVER_CONFIG` always supplies `telemetry: { enabled: true, level: 'standard' }` — so the key was never absent, the default never ran, and the variable had no effect whatsoever. Confirmed on a live deployment: setting it to `false` and restarting left telemetry on; only `telemetry: { enabled: false }` in `mj.config.cjs` worked.

The env read moves to where the value is actually produced, in `DEFAULT_SERVER_CONFIG` — the same shape already used a few lines below for `loggingSettings.graphql.logVariables`, so this follows the file's existing precedent rather than introducing a second convention. An explicit setting in `mj.config.cjs` still wins over the environment, because the user config is merged on top.

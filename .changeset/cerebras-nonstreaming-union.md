---
"@memberjunction/ai-cerebras": patch
---

Cerebras: narrow the non-streaming response to the SDK's non-streaming union member.

`ChatCompletion` is exported as a union of the non-streaming response, a chunk response and an error
chunk. Only the first carries `choices`, `usage` and `model`, so holding the bare union makes those
three reads fail to compile.

Not a current break. The lockfile resolves `@cerebras/cerebras_cloud_sdk` to 1.64.1, where the type
is not yet a union, so the package builds clean today. The declared range is `^1.64.1`, which admits
1.91.0 — where it is — so this surfaces for anyone installing fresh outside the lockfile, and becomes
CI's the moment the lockfile is refreshed. The method is `nonStreamingChatCompletion`, so the
narrowing is correct by construction and the cast is erased at runtime.

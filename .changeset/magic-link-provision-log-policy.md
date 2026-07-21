---
"@memberjunction/server": patch
---

Pin the MagicLink provisioned-external-user notice as a deliberate default-log line. Following the startup-notice cleanup that made the ephemeral-keypair and provider-registered messages verbose-only, this documents at the call site why the provisioning notice in `MagicLinkService.createScopedUser` is intentionally NOT verbose-gated — provisioning an external account via magic-link redemption is a security-relevant event that belongs in the default server log — and adds a unit test asserting it still emits with `MJ_VERBOSE` unset, so a future log-cleanup sweep cannot silently quiet it. No runtime behavior change.

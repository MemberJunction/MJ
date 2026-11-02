---
"@memberjunction/server": patch
"@memberjunction/global": patch
"@memberjunction/ng-explorer-core": patch
---

Warn when magic-link signing keys are ephemeral outside local dev (and expose `MagicLinkKeyManager.IsEphemeral`); explain unregistered dashboard classes with the registered keys and likely causes via the new `ClassFactory.DescribeMissingRegistration`.

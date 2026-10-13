---
"@memberjunction/encryption": patch
---

Startup no longer raises an alarm for an encryption key that no entity field encrypts with.

The startup validator printed `ENCRYPTION KEY VALIDATION FAILED`, and failed validation, for every active key whose material was missing. It told the operator to generate a random key. That is right for a key fields encrypt with, because saves through those fields fail without it. It is wrong for a key that only decrypts values encrypted elsewhere, such as an app's own key that ships pre-encrypted credentials and is given only to some installs: the app works without it, and a random key can never decrypt those values.

- **Keys entity fields encrypt with** are unchanged: a missing or unusable one still prints the box and fails validation.
- **Any other key**, when not configured on this install, logs the same single "not configured on this install" warning that decryption gives, deduplicated with it. When it is configured but unusable, it logs a warning with the source's own error. Neither fails validation.
- `ValidateAllKeys` results gain `IsConfigured` on a failure: whether the source holds the key at all. It is asked only after a failure, so remote sources cost nothing extra.

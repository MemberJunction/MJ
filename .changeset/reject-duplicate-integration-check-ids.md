---
"@memberjunction/testing-integration": patch
---

`IntegrationCheckRegistry` now rejects a duplicate check Id instead of silently replacing the earlier check (#5456). Before, a second check registered under an existing Id overwrote the first, which then never ran and was never reported missing.

- `Register` throws, naming the Id, when the Id already belongs to a different check. Registering the same object again is a no-op. An equivalent copy (same Id, Name, tier flags and function source, as produced when a bundler evaluates the same check module twice) is accepted and replaces the stored one.
- `RegisterLifecycle` applies the same rule per bundle: a different Setup/Teardown for a bundle that already has one throws.

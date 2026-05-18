# Failure pattern catalog

Per architecture §4.19. Known failure modes connector code (or extraction agents) can encounter, with root cause + resolution. Consulted preemptively before kicking off CodeBuilder so the same bug isn't re-discovered across vendors.

## Entry format

One JSON file per pattern, named `FP-<NNN>_<short_title>.json`. Schema:

```json
{
  "ID": "FP-NNN",
  "Symptom": "...",            // Observable behavior at failure time
  "RootCause": "...",          // Why it happens
  "Resolution": "...",         // How to fix it (link to auth-helpers / strategy library / etc.)
  "AffectedVendors": [],       // Populated as vendors exhibit this pattern
  "DetectionScript": null,     // Optional: tiny script that detects the pattern in a connector workspace
  "AutoFixApplicable": false,  // True only when the fix is mechanical + safe
  "AutoFixScript": null        // Optional: tiny script that applies the fix
}
```

`AffectedVendors` grows over time as vendors are processed and patterns surface. The catalog is reviewed before each CodeBuilder run so known patterns are anticipated.

## Current entries

- `FP-001_OAuth_RefreshToken_Rotation.json` — OAuth2 refresh-token rotation issue. Resolved via `auth-helpers/OAuth2TokenManager.RefreshToken` which preserves the existing refresh_token when the response omits it.

---
"@memberjunction/server": patch
---

- Replace error throwing with warning logging for entity save
  inconsistencies

  - Add ErrorLog table record creation for proper tracking and debugging
  - Maintain existing LogError functionality for immediate logging
  - Allow save operations to continue instead of being cancelled
  - Add structured logging with entity name, differences, and overlap
    details

  **Impact:**

  - Users can now successfully save records that previously failed due to
    inconsistent state
  - All inconsistencies are still logged for debugging purposes
  - No breaking changes to existing functionality

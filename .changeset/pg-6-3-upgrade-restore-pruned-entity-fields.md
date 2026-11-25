---
"@memberjunction/core": patch
---

Fix PostgreSQL databases upgraded from 6.1.x or 6.2.x to 6.3 missing 36 virtual EntityField rows that a fresh 6.3 install has (#6564). A new PostgreSQL-only migration restores the rows with fresh-install IDs and values.

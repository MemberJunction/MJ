---
"@memberjunction/server": patch
---

The server now says when a login runs as a User record whose email differs from the identity in its token. A configured `USER_EMAIL_MAP` is printed at startup with every entry, each remapped login logs a warning naming both addresses, and any other mismatch logs a warning too. The `Session Established` audit row records the token email, the lookup email, the resolved user's email and whether they differ, and its description names both when they do. Login behavior is unchanged.

---
"@memberjunction/global": patch
---

ClassFactory.Register now ignores a second physical copy of an already-registered class (same base class, key and name, identical source, and not a same-named override) instead of giving it a higher priority, so a duplicated package can no longer outrank a real subclass. It logs one warning naming the class.

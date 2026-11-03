---
"@memberjunction/server": patch
---

fix(server): clustering loads the records and the stored-vector list in one RunViews batch, then fetches VectorJSON only for the vectors it returns, bypassing the server RunView cache so only the requested columns are read

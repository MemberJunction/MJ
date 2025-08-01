---
"@memberjunction/server": patch
---

fix: Add error handling to CreateQuerySystemUser resolver to prevent
server crashes

- Wrap Query Categories entity creation in try/catch block
- Add null check after GetEntityObject call
- Improve error messages with actual error details
- Prevents "Entity Query Categories not found" from killing MJAPI
  process

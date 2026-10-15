---
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
---

Close realtime sessions before recording uploads, continue teardown after disconnect errors, and warn before leaving during recording saves. Preserve ownership and consent checks while allowing recording storage for UI-role owners, and delete completed recording shards with the correct storage prefix.

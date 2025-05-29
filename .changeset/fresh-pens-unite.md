---
"@memberjunction/server": patch
---

Fix bug where conversation remains stuck on "Processing" state when HTTP post request to Skip API throws an error. Conversation will now be switched back to "Available".

---
"@memberjunction/server": minor
---

fix: increase File ContentType column length to 255 characters

- Updated database migration to increase ContentType column from 50 to 255 characters
- Fixed FileResolver to properly handle file creation with updated entity
- This allows for longer MIME type strings that were previously truncated
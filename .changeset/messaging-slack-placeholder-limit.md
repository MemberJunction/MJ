---
"@memberjunction/messaging-adapters": patch
---

Truncate Slack modal placeholders to the platform's 150-character limit

An over-long placeholder fails the entire `views.open` call with `invalid_arguments`, so the modal never opens and the form button appears dead — with the only clue in the server log. A form question's label is free text and easily longer than 150 characters.

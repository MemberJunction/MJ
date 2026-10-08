---
"@memberjunction/server": patch
---

A Flow agent started from a conversation now posts its result back into that conversation.

When a task-graph workflow finished, `TaskGraphContinuationDeliverer` posted the outcome as the server's service user. The conversation's access check allows only the conversation's owner and its editors, so the post was refused ("You do not have access to this conversation"). The user saw only "Started … I'll follow up when it finishes", and the result existed only on the run's task record.

The outcome is now posted as the user who started the submitting agent run, or the conversation's owner when the run records no user. A `reinvoke` continuation turn runs as that user too, with the same identity and permissions as the run it continues. The service user is used, and logged, only when neither user can be found in the user cache.

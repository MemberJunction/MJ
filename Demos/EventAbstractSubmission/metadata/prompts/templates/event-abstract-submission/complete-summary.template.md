# Abstract Submission Processing Complete

Successfully processed {{ payload.responseCount }} Typeform responses.

**Summary:**
- Total submissions created: {{ payload.responseCount }}
- Event ID: {{ payload.eventID }}
- Form ID: {{ payload.typeformFormID }}

All submission and speaker records have been created in the database.

{{ #if payload.autoEvaluate }}
AI evaluation has been triggered for all submissions.
{{ /if }}

You can now review the submissions in the Events system.

---
"@memberjunction/core": minor
"@memberjunction/server": patch
"@memberjunction/ng-feedback": patch
"@memberjunction/core-entities": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Add email notifications for user feedback GitHub issues. New UserFeedbackSubmission table tracks submitter email-to-issue mappings. GitHub webhook router receives issue and comment events and sends email notifications via NotificationEngine. Client-side success dialog adapts messaging based on email configuration.

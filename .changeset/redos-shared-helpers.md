---
"@memberjunction/actions-bizapps-lms": patch
"@memberjunction/communication-gmail": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/global": patch
"@memberjunction/integration-engine": patch
"@memberjunction/lists": patch
"@memberjunction/messaging-adapters": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-file-storage": patch
"@memberjunction/ng-user-routines": patch
"@memberjunction/ng-whiteboard": patch
"@memberjunction/predictive-studio-core": patch
"@memberjunction/predictive-studio-sidecar": patch
"@memberjunction/realtime-widget": patch
"@memberjunction/server": patch
"@memberjunction/storage": patch
"@memberjunction/telephony-adapters": patch
---

Replace backtracking regexes (CodeQL `js/polynomial-redos`) with linear scans: new `TrimTrailingChars`, `TrimLeadingChars`, `TrimChars` and `IsEmailShaped` helpers in `@memberjunction/global`, used for URL, path and base64 trims and email-shape checks, plus index scans for Markdown fences and Slack link conversion. Results are unchanged for every input.

---
"@memberjunction/global": patch
"@memberjunction/ng-search": patch
"@memberjunction/ng-dashboard-viewer": patch
---

Fix XSS vulnerability in highlight match bindings by escaping HTML entities via centralized EscapeHTML utility.

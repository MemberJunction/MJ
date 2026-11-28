---
"@memberjunction/ng-dashboards": patch
"@memberjunction/server": patch
---

Data Explorer builds its initial query params with `Object.fromEntries`, so a `__proto__` key in the page URL stays data, and MJServer's outbound-request error logs pass the URL and error text through `SanitizeForLog` (CodeQL #496, #177; #5569).

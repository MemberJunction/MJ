---
"@memberjunction/sql-parser": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-bootstrap": patch
---

Fix SQLParser to extract parameters from Jinja2 control flow conditions ({% if %}/{% elif %}) and remove hardcoded golden-queries reusability check from QueryEntityServer.

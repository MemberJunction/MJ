---
"@memberjunction/ng-artifacts": patch
"@memberjunction/communication-gmail": patch
"@memberjunction/templates": patch
---

Security (#4253, remaining pieces): the JSON artifact viewer's HTML iframe no longer gets `allow-same-origin`. The Gmail provider strips CR/LF from header values. Nunjucks runs with `dev: false`, so render errors no longer carry stack traces. The rest of #4253 (the `CustomWhereClause` Owner gate, stored WhereClause screening, Conditional action hardening) already reached lts/5 through the C1, C8 and C9 ports.

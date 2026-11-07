---
"@memberjunction/global": patch
"@memberjunction/actions-base": patch
"@memberjunction/feature-pipelines": patch
"@memberjunction/actions": patch
---

Screen Record Process `OnChangeFilter` and workflow trigger `filter` expressions with the expression allowlist before they are saved and compiled into Action Filter code. `ScreenExpression` takes an optional list of functions the expression may call by bare name, used for `DidFieldChange` / `DidFieldChangeToValue`. A Record Process whose filter is refused fails validation on `OnChangeFilter` (#5569).

---
"@memberjunction/ng-markdown": patch
---

`<mj-markdown>` re-renders when a PascalCase input changes (`[Data]`, `[EnableHtml]`, ...), not only its deprecated camelCase alias. MathML detection no longer matches custom elements such as `<math-field>`.

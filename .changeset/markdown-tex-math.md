---
"@memberjunction/markdown-core": patch
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-chat": patch
---

Markdown now renders TeX math, the way language models write it: `$…$` and `\(…\)` inline, `$$…$$` and `\[…\]` for display math.

- **markdown-core:** a new `CreateMathExtension` recognizes the math and emits a `code.mj-math` placeholder holding the TeX (a `math` / `mathBlock` token on the AST path). It is tokenized first, so `_` and `*` inside a formula no longer become emphasis, and smartypants leaves its quotes and dashes alone. Single dollars follow Pandoc's rule, so prices stay prices ("$5 and $10", "$5-$10"), and `\[…\]`/`\(…\)` count only around something that reads as TeX, so escaped brackets like "\[1\]" stay brackets. On by default; `enableMath: false` turns it off.
- **ng-markdown:** `MarkdownService.RenderMath(container)` typesets the placeholders with KaTeX as MathML, which browsers lay out natively, so hosts need no KaTeX stylesheet or fonts. KaTeX is loaded on first use, like Mermaid, so documents without math never download it. `<mj-markdown>` calls it after render (new `EnableMath` input). TeX that KaTeX can't parse, or that defines macros, stays visible as source; user sizes are capped. Chrome ignores MathML's `mathvariant` and `columnalign`, so styled letters are spelled with Unicode math characters (\mathbf{E} as 𝐄, \mathbb{R} as ℝ) and the stylesheet aligns `aligned`/`cases` columns.
- **ng-chat:** typesets math in its messages (`RenderMath` after `parse()`).

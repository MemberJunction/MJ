---
"@memberjunction/ai-agents": patch
"@memberjunction/context-crush": patch
"@memberjunction/core-actions": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-whiteboard": patch
"@memberjunction/markdown-core": patch
"@memberjunction/react-runtime": patch
"@memberjunction/external-data-sources": patch
---

Content parsers read their input in linear time (CodeQL js/polynomial-redos, part of #5571). SKILL.md frontmatter, pipeline `{{ }}` templates, ContextCrush signature and whitespace passes, sentence and cell-range parsing, Loop templates, RSS/Atom item and permalink-guid extraction, vector template fields, Component Studio headings, realtime transcript markdown, whiteboard markdown export, SVG detection, React runtime error context and rgb() parsing, and connection-string redaction no longer use regexes that take quadratic time on crafted input. Results for well-formed input are unchanged.

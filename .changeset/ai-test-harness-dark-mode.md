---
"@memberjunction/ng-ai-test-harness": patch
---

Migrate AI Execution Monitor and node components to MJ semantic design tokens so the panel renders correctly in dark mode. Replaces hardcoded hex values (`#fff`, `#f8f9fa`, `#1a1a1a`, `#2196f3`, `#e0e0e0`, etc.) and legacy `--mj-blue` / `--gray-*` references with `--mj-bg-*`, `--mj-text-*`, `--mj-border-*`, `--mj-brand-primary`, and `--mj-status-*` tokens.

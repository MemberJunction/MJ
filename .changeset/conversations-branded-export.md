---
"@memberjunction/ng-conversations": minor
---

Brandable conversation export + an additive `headerActions` slot. `ExportBranding` (`brandTokens` / `logoUrl` / `title` / `trademark`), supplied via `exportBranding` on `mj-conversation-chat-area`, now applies across all four export formats: HTML gets theme colors as a sanitized `:root{}` block, an inlined data-URI logo, the title, and a styled trademark footer; markdown/text carry the title and trademark (markdown also references the logo); JSON emits a `branding` block. The HTML export's stylesheet was converted to `var(--mj-token, <legacyHex>)` where every fallback is the exact prior literal, so an unbranded export renders identically to previous releases and the JSON/markdown/text output is byte-identical.

Host CSS values baked into the exported document pass a safe-function **allowlist** (`var`/`calc`/`min`/`max`/`clamp`/`rgb`/`rgba`/`hsl`/`hsla`/`hwb`/`lab`/`lch`/`oklab`/`oklch`/`color`/`color-mix`) plus a rejection of declaration- and tag-escape characters. Blocking only `url()` would have let `image-set()`, `-webkit-image-set()`, `cross-fade()`, `image()`, and `src()` fetch a remote URL from an exported local file without ever writing the literal `url(`.

Also adds `exportButtonLabel` / `exportButtonIcon` for relabeling the header Export button, the download-free `ExportService.BuildExportContent()` and `SnapshotBrandTokens()` seams, and a seventh chat slot — `headerActions` — which appends host buttons inside the DEFAULT header's action strip (a projected `header` slot replaces the whole header and therefore suppresses it).

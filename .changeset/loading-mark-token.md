---
"@memberjunction/ng-shared-generic": patch
---

`<mj-loading>` can render a brand theme's mark (LXP P5). The loading screen's mark was an inline hardcoded MJ SVG path, with only its fill reading a token, so a white-label host hid the SVG and painted `--mj-logo-mark` on the wrapper's `::before`, coupled to the component's internals.

- New optional token `--mj-loading-mark`. When a theme sets it to an image, the component renders that image inside the same sized, animated wrapper instead of the inline SVG, so the size presets and pulse/spin/bounce still apply. Read once at init from the host's computed style.
- MJ's tokens leave it unset on purpose, so MJ's own loader (inline mark, `--mj-logo-color`, seasonal fills) is unchanged. It is a separate token from `--mj-logo-mark` because MJ sets that one itself. An image mark does not take the seasonal fill colors.
- Documented in the design-tokens rule's Logo Tokens table and in `_tokens.scss`.

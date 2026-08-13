---
paths:
  - "**/*.scss"
  - "**/*.css"
---

# 🚨 CRITICAL: Design Token System — NO HARDCODED COLORS 🚨

MemberJunction uses a comprehensive CSS custom property (design token) system defined in `packages/Angular/Generic/shared/src/lib/_tokens.scss`. **Every color in component CSS MUST use design tokens.** Hardcoded hex values (`#264FAF`, `#333`, `#f5f5f5`, etc.) break dark mode, prevent white-labeling, and create maintenance debt.

## The Rule

**NEVER write hardcoded hex/rgb colors in component CSS.** Always use the appropriate semantic token. This applies to ALL properties: `color`, `background`, `border`, `fill`, `box-shadow`, `outline`, etc.

```css
/* ❌ WRONG — hardcoded hex values */
.my-component {
    color: #333;
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
}

/* ✅ CORRECT — semantic design tokens */
.my-component {
    color: var(--mj-text-primary);
    background: var(--mj-bg-surface-card);
    border: 1px solid var(--mj-border-default);
}
```

## Token Categories (Use ONLY Semantic Tokens)

**NEVER use primitive tokens (`--mj-color-neutral-*`, `--mj-color-brand-*`) in component CSS.** Primitives don't adapt to dark mode. Always use semantic tokens:

### Text Colors
| Token | Purpose |
|---|---|
| `--mj-text-primary` | Main body text, headings |
| `--mj-text-secondary` | Supporting text, labels |
| `--mj-text-muted` | De-emphasized text, captions |
| `--mj-text-disabled` | Disabled/placeholder text |
| `--mj-text-inverse` | Text on dark/colored backgrounds |
| `--mj-text-link` | Clickable links |

### Background Colors
| Token | Purpose |
|---|---|
| `--mj-bg-page` | Full-page background |
| `--mj-bg-surface` | Cards, panels, modals |
| `--mj-bg-surface-card` | Slightly tinted cards, secondary surfaces |
| `--mj-bg-surface-sunken` | Inset areas, code backgrounds |
| `--mj-bg-surface-elevated` | Elevated surfaces, dropdowns |
| `--mj-bg-surface-hover` | Hover states on surfaces |
| `--mj-bg-surface-active` | Active/pressed states |
| `--mj-bg-overlay` | Modal/drawer backdrops |

### Border Colors
| Token | Purpose |
|---|---|
| `--mj-border-default` | Standard borders |
| `--mj-border-subtle` | Very light borders |
| `--mj-border-strong` | Emphasized borders, scrollbar thumbs |
| `--mj-border-focus` | Focus rings |

### Brand Colors
| Token | Purpose |
|---|---|
| `--mj-brand-primary` | Primary buttons, active states, accents |
| `--mj-brand-primary-hover` | Primary hover state |
| `--mj-brand-primary-active` | Primary pressed state |

### Status Colors
| Token | Purpose |
|---|---|
| `--mj-status-success` / `-bg` / `-text` / `-border` | Success states |
| `--mj-status-warning` / `-bg` / `-text` / `-border` | Warning states (orange) |
| `--mj-status-error` / `-bg` / `-text` / `-border` | Error states (red) |
| `--mj-status-info` / `-bg` / `-text` / `-border` | Informational states |

### Logo Tokens
| Token | Purpose |
|---|---|
| `--mj-logo-mark` | Logo icon (auto-switches light/dark) |
| `--mj-logo-mark-inverse` | Logo icon for dark backgrounds |
| `--mj-logo-wordmark` | Full logo with text |
| `--mj-logo-color` | Loading spinner fill color |

## Common Hex → Token Mappings

When migrating or reviewing code, use these mappings:

| Hex | Token |
|---|---|
| `#333`, `#334155` | `--mj-text-primary` |
| `#555`, `#475569`, `#666` | `--mj-text-secondary` |
| `#757575`, `#888`, `#64748b` | `--mj-text-muted` |
| `#999`, `#94a3b8`, `#aaa` | `--mj-text-disabled` |
| `#fff` (on colored bg) | `--mj-text-inverse` |
| `white` (background) | `--mj-bg-surface` |
| `#f5f5f5`, `#f8f9fa`, `#f9f9f9`, `#fafafa` | `--mj-bg-surface-card` |
| `#f0f0f0`, `#f1f1f1`, `#f1f5f9` | `--mj-bg-surface-sunken` |
| `#e0e0e0`, `#e2e8f0`, `#d1d5db`, `#e5e7eb` | `--mj-border-default` |
| `#ccc`, `#cbd5e1` | `--mj-border-strong` |
| `#ef6c00`, `#ff6600` (warning/orange) | `--mj-status-warning` |
| `#e65100` (dark orange) | `--mj-status-warning-text` |
| `#e53e3e`, `#dc2626` (error/red) | `--mj-status-error` |
| `#c53030`, `#b91c1c` (dark red) | `--mj-status-error-text` |
| `#264FAF`, `#0076b6` (MJ blue) | `--mj-brand-primary` |

## Translucent Colors with `color-mix()`

For translucent variants of token colors (tinted backgrounds, focus rings), use `color-mix()`:

```css
/* ✅ Tinted background from a token */
background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));

/* ✅ Focus ring from a token */
box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);

/* ✅ Subtle warning background */
background: color-mix(in srgb, var(--mj-status-warning) 8%, var(--mj-bg-surface));
```

## When Hardcoded Colors ARE Acceptable

1. **SVG data URIs** — CSS variables cannot be used inside `url("data:image/svg+xml,...")`. Use `%23` encoded hex.
2. **Code editor backgrounds** — Dark-on-dark code editors (e.g., `#1e1e1e` for CodeMirror) are intentionally static.
3. **Categorical/chart colors** — Data visualization colors that must remain distinct regardless of theme.
4. **`rgba()` alpha on white** — `rgba(255, 255, 255, 0.15)` for overlays on colored backgrounds is fine since it's relative to the surface it sits on.
5. **CSS variable fallbacks** — `var(--mj-text-inverse, white)` fallback values are acceptable.

## Before Submitting Any CSS

Run this mental checklist:
1. Does every `color:`, `background:`, `border-color:`, `fill:` use a token? If not, fix it.
2. Did I use a **semantic** token (not a primitive like `--mj-color-neutral-300`)? Primitives don't adapt to dark mode.
3. Will this look correct in dark mode? Semantic tokens auto-adapt; hardcoded values don't.
4. For `white`/`#fff` — is it text on a colored background (`--mj-text-inverse`) or a surface background (`--mj-bg-surface`)?

## Button styling

Don't override `.mj-btn` in component CSS — see [`packages/Angular/CLAUDE.md`](../../packages/Angular/CLAUDE.md) for the rule and the sanctioned customization path. Enforced by `npm run check:ui-buttons`.

## Local CI mirror

These rules are enforced by CI on PRs targeting `next`. Run them locally before pushing (requires your changes to be committed — the check diffs against `origin/next`):

- `npm run check:ui` — both gates against changed CSS/SCSS vs `origin/next` (matches PR behavior)
- `npm run check:ui-tokens` — hardcoded-color gate only (hex, rgb/rgba, hsl/hsla — except shadow neutrals `rgba(0,0,0,X)` / `rgba(255,255,255,X)`)
- `npm run check:ui-buttons` — `.mj-btn` override gate only
- `npm run check:ui:all` — audit the whole `packages/Angular/` tree (cleanup work; reports pre-existing violations CI doesn't gate on)
- `npm run check:ui:adoption` — re-run the measurement script (writes to `plans/adoption-metrics.md`)

Scripts live at `.github/scripts/check-css-hex-tokens.sh` and `.github/scripts/check-mj-btn-override.sh`. Both accept `--file <path>` for single-file checks.

## Related

- **[App Color Architecture](../../guides/APP_COLOR_ARCHITECTURE.md)** — why dashboards must not hardcode hex; migration path.
- **[Theming](../../guides/THEMING.md)** — pointer to the authoritative theming guide co-located with `ThemeService`.

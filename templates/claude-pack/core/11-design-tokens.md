# Design Tokens — no hardcoded colors, ever

MJ uses a comprehensive CSS-variable token system defined in
`packages/Angular/Generic/shared/src/lib/_tokens.scss`. **Every color in
component CSS must use a design token.** Hardcoded hex values
(`#264FAF`, `#333`, `#f5f5f5`) break dark mode, prevent white-labeling,
and pile up as maintenance debt.

## The rule

Never write hardcoded hex/rgb colors in component CSS. Always use the
appropriate semantic token. Applies to **all** properties: `color`,
`background`, `border`, `fill`, `box-shadow`, `outline`, etc.

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

## Semantic vs. primitive tokens

Two layers exist in `_tokens.scss`:

- **Primitive tokens** — raw color values, e.g. `--mj-color-neutral-300`,
  `--mj-color-brand-500`. Don't use these in component CSS.
- **Semantic tokens** — purpose-named, theme-aware, e.g. `--mj-text-primary`,
  `--mj-bg-surface`. Use these.

**Why not primitives in components:** primitives don't adapt to dark mode.
`--mj-color-neutral-300` is a fixed light-gray everywhere; `--mj-text-muted`
maps to the right gray for the active theme.

## The semantic token catalog

### Text colors

| Token | Purpose |
|---|---|
| `--mj-text-primary` | Main body text, headings |
| `--mj-text-secondary` | Supporting text, labels |
| `--mj-text-muted` | De-emphasized text, captions |
| `--mj-text-disabled` | Disabled / placeholder text |
| `--mj-text-inverse` | Text on dark / colored backgrounds |
| `--mj-text-link` | Clickable links |

### Background colors

| Token | Purpose |
|---|---|
| `--mj-bg-page` | Full-page background |
| `--mj-bg-surface` | Cards, panels, modals |
| `--mj-bg-surface-card` | Slightly tinted cards, secondary surfaces |
| `--mj-bg-surface-sunken` | Inset areas, code backgrounds |
| `--mj-bg-surface-elevated` | Elevated surfaces, dropdowns |
| `--mj-bg-surface-hover` | Hover states on surfaces |
| `--mj-bg-surface-active` | Active / pressed states |
| `--mj-bg-overlay` | Modal / drawer backdrops |

### Border colors

| Token | Purpose |
|---|---|
| `--mj-border-default` | Standard borders |
| `--mj-border-subtle` | Very light borders |
| `--mj-border-strong` | Emphasized borders, scrollbar thumbs |
| `--mj-border-focus` | Focus rings |

### Brand colors

| Token | Purpose |
|---|---|
| `--mj-brand-primary` | Primary buttons, active states, accents |
| `--mj-brand-primary-hover` | Primary hover state |
| `--mj-brand-primary-active` | Primary pressed state |

### Status colors

| Token | Purpose |
|---|---|
| `--mj-status-success` + `-bg` / `-text` / `-border` | Success states |
| `--mj-status-warning` + variants | Warning states (orange) |
| `--mj-status-error` + variants | Error states (red) |
| `--mj-status-info` + variants | Informational states |

Each status color also has `-bg`, `-text`, `-border` variants for full
"alert box" recipes.

### Logo tokens

| Token | Purpose |
|---|---|
| `--mj-logo-mark` | Logo icon (auto-switches light/dark) |
| `--mj-logo-mark-inverse` | Logo icon for dark backgrounds |
| `--mj-logo-wordmark` | Full logo with text |
| `--mj-logo-color` | Loading spinner fill color |

## Common hex → token mappings

When migrating an existing component or reviewing CSS, use these
substitutions:

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
| `#ef6c00`, `#ff6600` (warning / orange) | `--mj-status-warning` |
| `#e65100` (dark orange) | `--mj-status-warning-text` |
| `#e53e3e`, `#dc2626` (error / red) | `--mj-status-error` |
| `#c53030`, `#b91c1c` (dark red) | `--mj-status-error-text` |
| `#264FAF`, `#0076b6` (MJ blue) | `--mj-brand-primary` |

## Translucency — use `color-mix()`

For tinted backgrounds, focus rings, etc., compose a translucent variant
from a token instead of using `rgba(..., 0.x)` with a hardcoded color:

```css
/* ✅ Tinted background from a token */
background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));

/* ✅ Focus ring from a token */
box-shadow: 0 0 0 3px color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);

/* ✅ Subtle warning background */
background: color-mix(in srgb, var(--mj-status-warning) 8%, var(--mj-bg-surface));
```

The percentage-and-base form means the result adapts when the brand
color changes (white-labeling) and when the theme switches (dark mode).

## When hardcoded colors ARE acceptable

A small set of cases where literal hex is fine:

1. **SVG `data:` URIs** — CSS variables can't be used inside
   `url("data:image/svg+xml,…")`. Use `%23` URL-encoded hex.

2. **Code editor backgrounds** — dark-on-dark editors like CodeMirror
   (`#1e1e1e`) are intentionally static.

3. **Categorical / chart colors** — data-visualization colors that
   must stay distinct regardless of theme.

4. **`rgba()` alpha on white for overlays** — `rgba(255, 255, 255, 0.15)`
   for translucent overlays on colored backgrounds is fine; it's
   relative to whatever surface it sits on.

5. **CSS variable fallbacks** — `var(--mj-text-inverse, white)` fallback
   values are fine.

## Pre-submit checklist

Before submitting CSS:

- [ ] Every `color:` / `background:` / `border-color:` / `fill:` uses a
      token (no hex)?
- [ ] You used a **semantic** token (not a primitive like
      `--mj-color-neutral-300`)?
- [ ] Will this look right in dark mode? (Semantic tokens auto-adapt.)
- [ ] For `white` / `#fff` — is it text on a colored bg
      (`--mj-text-inverse`) or a surface bg (`--mj-bg-surface`)?

If you can't answer "yes" to all four, find the right semantic token
before merging.

# @memberjunction/theme-engine

Framework-agnostic derivation of the full MemberJunction `--mj-*` design-token
contract from a small set of brand **seeds**. Zero runtime dependencies, so the same
code runs in the Angular theme builder (live preview) and in a future server-side
overlay endpoint.

A theme is a **brand**; light/dark is the user's mode layered under it. The entity
stores ~8 seeds — not tokens — and the full contract (OKLCH ramps, semantic tokens,
state families, dark re-point, chart palette, shadows, radii) is derived at load.

## Usage

```ts
import { derive, emitOverlayCss, MJ_DEFAULT_SEEDS } from '@memberjunction/theme-engine';

const theme = derive({ primary: '#7c3aed', accent: '#22d3ee', radius: 12 });

theme.tokens.light;   // resolved semantic tokens (hex) for light mode
theme.tokens.dark;    // resolved semantic tokens (hex) for dark mode
theme.contrast;       // per-mode + hover WCAG report, with clamp suggestions
emitOverlayCss('acme', theme);  // CSS scoped to [data-theme-overlay="acme"]
```

## Seeds

| Seed | Meaning | Default |
|---|---|---|
| `primary` | primary brand hue anchor (→ brand-500) | required |
| `accent` | accent hue anchor (→ accent-400) | `primary` |
| `tertiary` | tertiary hue anchor (→ tertiary-500) | `accent` |
| `neutralChroma` | brand-hue bleed into the gray stack, OKLCH chroma 0..~0.08 (G2) | `0.037` |
| `vibrancy` | global saturation multiplier for brand ramps | `1` |
| `radius` | base corner radius in px → `--mj-radius-md` | `8` |
| `depth` | brand-shadow intensity 0..1 (G3) | `1` |
| `fontFamily` / `fontFamilyMono` | type stacks (G1) | MJ Inter / JetBrains Mono |
| `vizPalette` | explicit categorical chart palette override (G4) | derived from brand hue |

## How derivation works

Each brand family (brand / accent / tertiary / neutral) carries a **measured OKLCH
shape** lifted from MJ's own default ramps. A seed supplies the hue and a chroma scale
relative to the family anchor; the shape is re-hued and its chroma rescaled. Feeding
`MJ_DEFAULT_SEEDS` therefore reproduces MJ's `_tokens.scss` within ~0.03 OKLab ΔE
(verified by the test suite), while any other hue inherits MJ's proven, perceptually
uniform lightness structure.

The emitted overlay only redefines the **primitive** ramps (plus viz, shadow, font,
radius). Every semantic token and the entire `[data-theme="dark"]` block in
`_tokens.scss` are `var(--mj-color-*)` references, so overriding primitives cascades
into both modes automatically — the dark re-point and hover families come for free,
with no parallel token mapping that could drift from the base stylesheet.

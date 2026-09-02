# @memberjunction/ng-hierarchy-tree

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [c09c818]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ng-ui-components@6.1.0-edge.5
  - @memberjunction/ng-base-forms@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ng-base-forms@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/ng-ui-components@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 05865ea: feat(angular): introduce `@memberjunction/ng-hierarchy-tree` visual hierarchy component and wire 15 core entity form hierarchy panels
  - **`@memberjunction/ng-hierarchy-tree`**: Reusable D3-based interactive visual hierarchy and taxonomy tree component with smooth pan/zoom, dynamic primary key metadata extraction, real-time path search and ancestor branch auto-expansion, subtree focus, cancelable lifecycle events, and `--mj-*` design token theming.
  - **`@memberjunction/ng-core-entity-forms`**: Adds 15 visual hierarchy form panels in the `after-related` slot for self-referencing and category entities in MJ Core (`AI Agent Categories`, `AI Prompt Categories`, `Action Categories`, `Dashboard Categories`, `Query Categories`, `Tags`, `Projects`, `Content Items`, `File Categories`, `List Categories`, `Record Process Categories`, `Skills`, `Template Categories`, `Test Suites`, `User View Categories`).
  - **`@memberjunction/ng-gantt`**: Polish host height layout on `MJGanttChartComponent`.

### Patch Changes

- 1f4af2b: Repair two things the hierarchy-tree package landed with.

  **`pnpm-lock.yaml` was never regenerated**, so the workspace had a package no lockfile
  importer described. Every CI job begins with `pnpm install --frozen-lockfile`, which
  refuses that state — so unit tests, the deterministic integration tier, the dependency
  check and the standards gate all failed before running a single assertion, on `next` and
  on every PR branching from it. The lockfile is now regenerated: purely additive, one new
  importer plus the `link:` entry in `core-entity-forms`, no dependency resolution churn.

  **The component styles hardcoded colors**, which breaks theming and white-labeling. The
  brand-tinted `rgba(56, 189, 248, …)` values are now `color-mix()` over
  `--mj-brand-primary`; the `#041124` text on brand-colored buttons is `--mj-text-inverse`;
  the amber and green node states are `--mj-status-warning` / `--mj-status-success`; the
  overlay backdrop is `--mj-bg-overlay`; and the primary-button hover is
  `--mj-brand-primary-hover`. Neutral `rgba(0,0,0,…)` / `rgba(255,255,255,…)` shadow and
  overlay values are unchanged — the gate permits them and no semantic token replaces them.

  **The component bound the global metadata provider.** It is an L1 widget
  (`"mjUILayer": "widgets"`), so `new Metadata()` and `new RunView()` were UI-layering
  violations: hosted against a non-default connection — as it is inside Explorer's
  `core-entity-forms` — the tree would silently query the wrong database.
  `HierarchyTreeComponent` now extends `BaseAngularComponent`, which supplies the standard
  `@Input() Provider` and `ProviderToUse`, and both call sites route through it. Callers
  that never set `Provider` are unaffected: it falls back to the ambient provider.

  `HierarchyTreeConfig.DefaultColor` now defaults to `'var(--mj-brand-primary, #38bdf8)'`
  rather than the bare hex. It is bound to `[style.background]` / `[style.color]`, so the
  token resolves at paint time and the default node accent follows the active theme instead
  of staying a fixed dark-mode blue. The fallback preserves the previous rendering wherever
  the token stylesheet is absent, and callers passing their own color are unaffected.

- Updated dependencies [834f8d7]
- Updated dependencies [a2e4e09]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [69f2bf2]
- Updated dependencies [05865ea]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [ac6755c]
- Updated dependencies [73c853b]
- Updated dependencies [051e0ff]
- Updated dependencies [142cf2a]
- Updated dependencies [95fc3e6]
- Updated dependencies [e635378]
- Updated dependencies [26046d8]
- Updated dependencies [cefc302]
- Updated dependencies [44ac084]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [6e98173]
- Updated dependencies [0869c24]
- Updated dependencies [aa9006b]
- Updated dependencies [a76cf28]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [9b6fb5b]
- Updated dependencies [b46330e]
- Updated dependencies [2a0262d]
- Updated dependencies [6ef741e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ng-base-forms@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/ng-ui-components@6.1.0-edge.3

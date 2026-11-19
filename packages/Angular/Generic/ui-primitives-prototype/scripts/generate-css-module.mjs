import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileString } from 'sass';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');

// 1. Compile real _tokens.scss from @memberjunction/ng-shared-generic.
const sharedPkgDir = dirname(require.resolve('@memberjunction/ng-shared-generic/package.json'));
const tokensScss = readFileSync(join(sharedPkgDir, 'dist', 'lib', '_tokens.scss'), 'utf8');
const compiledTokensCss = compileString(tokensScss).css;

// 2. Read real @angular/cdk prebuilt overlay + a11y CSS (includes .cdk-overlay-popover top-layer reset).
const cdkPkgDir = dirname(require.resolve('@angular/cdk/package.json'));
const cdkOverlayCss = readFileSync(join(cdkPkgDir, 'overlay-prebuilt.css'), 'utf8');
const cdkA11yCss = readFileSync(join(cdkPkgDir, 'a11y-prebuilt.css'), 'utf8');

// 3. Wave 0 foundation additions (WS6b radius roles, control heights, surface levels, open tone defaults).
const wave0FoundationCss = `
:root {
  --mj-control-height-sm: 32px;
  --mj-control-height-md: 40px;
  --mj-control-height-lg: 52px;

  --mj-radius-control: var(--mj-radius-md);
  --mj-radius-surface: var(--mj-radius-lg);
  --mj-radius-overlay: var(--mj-radius-lg);
  --mj-radius-pill: var(--mj-radius-full);

  --mj-z-overlay: 1200;

  --mj-surface-sunken-bg: var(--mj-bg-surface-sunken);
  --mj-surface-sunken-border: var(--mj-border-subtle);
  --mj-surface-sunken-shadow: 0 0 transparent;

  --mj-surface-base-bg: var(--mj-bg-surface);
  --mj-surface-base-bg-hover: var(--mj-bg-surface-hover);
  --mj-surface-base-bg-selected: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface));
  --mj-surface-base-border: var(--mj-border-default);
  --mj-surface-base-border-selected: var(--mj-brand-primary);
  --mj-surface-base-shadow: 0 0 transparent;

  --mj-surface-elevated-bg: var(--mj-bg-surface-elevated);
  --mj-surface-elevated-bg-hover: var(--mj-bg-surface-hover);
  --mj-surface-elevated-bg-selected: color-mix(in srgb, var(--mj-brand-primary) 14%, var(--mj-bg-surface-elevated));
  --mj-surface-elevated-border: var(--mj-border-default);
  --mj-surface-elevated-border-selected: var(--mj-brand-primary);
  --mj-surface-elevated-shadow: var(--mj-shadow-md);

  --mj-surface-overlay-bg: var(--mj-bg-surface-elevated);
  --mj-surface-overlay-bg-hover: var(--mj-bg-surface-hover);
  --mj-surface-overlay-border: var(--mj-border-default);
  --mj-surface-overlay-shadow: var(--mj-shadow-xl);

  --mj-tone-success-text: var(--mj-status-success-text);
  --mj-tone-success-border: var(--mj-status-success-border);
  --mj-tone-success-bg: var(--mj-status-success-bg);

  --mj-tone-warning-text: var(--mj-status-warning-text);
  --mj-tone-warning-border: var(--mj-status-warning-border);
  --mj-tone-warning-bg: var(--mj-status-warning-bg);

  --mj-tone-error-text: var(--mj-status-error-text);
  --mj-tone-error-border: var(--mj-status-error-border);
  --mj-tone-error-bg: var(--mj-status-error-bg);
}

@media (pointer: coarse) {
  :root {
    --mj-control-height-sm: 44px;
    --mj-control-height-md: 44px;
  }
}

[data-theme='dark'] {
  --mj-surface-base-bg-selected: color-mix(in srgb, var(--mj-brand-primary) 20%, var(--mj-bg-surface));
  --mj-surface-elevated-bg-selected: color-mix(in srgb, var(--mj-brand-primary) 22%, var(--mj-bg-surface-elevated));
  --mj-surface-elevated-text-secondary: var(--mj-color-neutral-200);
  --mj-surface-elevated-text-muted: var(--mj-color-neutral-300);
  --mj-surface-overlay-text-secondary: var(--mj-color-neutral-200);
  --mj-surface-overlay-text-muted: var(--mj-color-neutral-300);
}

.mj-surface-sunken {
  --_mj-surface-level-bg: var(--mj-surface-sunken-bg);
  --_mj-surface-level-border: var(--mj-surface-sunken-border);
  --_mj-surface-level-shadow: var(--mj-surface-sunken-shadow);
}

.mj-surface-base {
  --_mj-surface-level-bg: var(--mj-surface-base-bg);
  --_mj-surface-level-bg-hover: var(--mj-surface-base-bg-hover);
  --_mj-surface-level-bg-selected: var(--mj-surface-base-bg-selected);
  --_mj-surface-level-border: var(--mj-surface-base-border);
  --_mj-surface-level-border-selected: var(--mj-surface-base-border-selected);
  --_mj-surface-level-shadow: var(--mj-surface-base-shadow);
}

.mj-surface-elevated {
  --_mj-surface-level-bg: var(--mj-surface-elevated-bg);
  --_mj-surface-level-bg-hover: var(--mj-surface-elevated-bg-hover);
  --_mj-surface-level-bg-selected: var(--mj-surface-elevated-bg-selected);
  --_mj-surface-level-border: var(--mj-surface-elevated-border);
  --_mj-surface-level-border-selected: var(--mj-surface-elevated-border-selected);
  --_mj-surface-level-shadow: var(--mj-surface-elevated-shadow);
  --mj-text-secondary: var(--mj-surface-elevated-text-secondary, var(--mj-text-secondary));
  --mj-text-muted: var(--mj-surface-elevated-text-muted, var(--mj-text-muted));
}

.mj-surface-overlay {
  --_mj-surface-level-bg: var(--mj-surface-overlay-bg);
  --_mj-surface-level-bg-hover: var(--mj-surface-overlay-bg-hover);
  --_mj-surface-level-border: var(--mj-surface-overlay-border);
  --_mj-surface-level-shadow: var(--mj-surface-overlay-shadow);
  --mj-text-secondary: var(--mj-surface-overlay-text-secondary, var(--mj-text-secondary));
  --mj-text-muted: var(--mj-surface-overlay-text-muted, var(--mj-text-muted));
}
`;

const primitivesCssPath = resolve(packageRoot, 'src/lib/styles/primitives-prototype.css');
const primitivesCss = readFileSync(primitivesCssPath, 'utf8');

const combinedCss = `@layer reset, foundation, primitives;\n\n@layer foundation {\n${compiledTokensCss}\n${wave0FoundationCss}\n}\n\n@layer primitives {\n${cdkOverlayCss}\n${cdkA11yCss}\n}\n\n${primitivesCss}`;

const outTsPath = resolve(packageRoot, 'src/lib/styles/prototype-css.generated.ts');
writeFileSync(
  outTsPath,
  `// Generated by scripts/generate-css-module.mjs\nexport const PROTOTYPE_CSS = ${JSON.stringify(combinedCss)};\n`,
  'utf8'
);

mkdirSync(resolve(packageRoot, 'dist/element'), { recursive: true });
writeFileSync(resolve(packageRoot, 'dist/element/mj-wave0-prototype.css'), combinedCss, 'utf8');

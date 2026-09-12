// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import * as publicApi from '../public-api';
import { MJExplorerAppModule, MJExplorerAppComponent } from '../public-api';

/**
 * Entry-point smoke test: importing the public entry must succeed (catches
 * broken exports / import-graph breakage) and the load-bearing symbols the
 * package exists to provide must be real constructors.
 */
describe('@memberjunction/ng-explorer-app', () => {
  it('exposes a non-empty public export surface', () => {
    expect(Object.keys(publicApi).length).toBeGreaterThan(0);
  });

  it('exports its load-bearing classes as constructors', () => {
    expect(MJExplorerAppModule).toBeTypeOf('function');
    expect(MJExplorerAppComponent).toBeTypeOf('function');
  });
});

/**
 * Login-surface contract: the sign-in page is themable end to end through the
 * --mj-login-* token group (see packages/Angular/Generic/shared/THEMING.md), so its
 * stylesheet must stay expressed in tokens and its copy must stay host-bindable.
 * These read the shipped sources, because the regressions they guard against —
 * a hardcoded color, a primitive token, copy welded into the template — compile
 * clean and render fine on the default brand; they only break white-labelling.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const componentCss = readFileSync(fileURLToPath(new URL('../lib/explorer-app.component.css', import.meta.url)), 'utf8');
const componentHtml = readFileSync(fileURLToPath(new URL('../lib/explorer-app.component.html', import.meta.url)), 'utf8');

describe('login surface theming contract', () => {
  it('references no primitive tokens (they do not adapt to dark mode or theming)', () => {
    // The banner text used to pin --mj-color-neutral-0; it now reads --mj-login-banner-text.
    expect(componentCss).not.toMatch(/--mj-color-/);
  });

  it('hardcodes no colors (hex / rgb / hsl)', () => {
    const colorLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
    expect(componentCss).not.toMatch(colorLiteral);
  });

  it('paints the story panel and sign-in column from the login token group', () => {
    expect(componentCss).toContain('background: var(--mj-login-banner-bg)');
    expect(componentCss).toContain('color: var(--mj-login-banner-text)');
    expect(componentCss).toContain('color: var(--mj-login-banner-text-secondary)');
    expect(componentCss).toContain('var(--mj-login-panel-bg');
    expect(componentCss).toContain('var(--mj-login-banner-logo');
  });

  it('binds the banner copy and logo label to host inputs instead of hardcoding them', () => {
    expect(componentHtml).toContain('{{ LoginBannerTitle }}');
    expect(componentHtml).toContain('{{ LoginBannerSubtitle }}');
    expect(componentHtml).toContain('[attr.aria-label]="LoginBannerLogoLabel"');
    // The defaults live on the component as input initializers, not in the template.
    expect(componentHtml).not.toContain('Welcome back');
    expect(componentHtml).not.toContain('Sign in to continue');
  });
});

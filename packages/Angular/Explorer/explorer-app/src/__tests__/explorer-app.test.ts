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

  it('paints the configured cards from the login token group, both surfaces', () => {
    expect(componentCss).toContain('var(--mj-login-card-bg)');
    expect(componentCss).toContain('var(--mj-login-banner-card-bg)');
    expect(componentCss).toContain('var(--mj-login-centered-card-width');
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

/**
 * Composition contract: the screen must stay rearrangeable and extensible from outside.
 * Each assertion pins a property a host depends on and that a refactor could silently drop —
 * a slot stops being consulted, a region disappears from a layout, or a card link loses the
 * tab-nap protection that makes external links safe to configure.
 */
describe('login surface composition contract', () => {
  const SLOTS = ['bannerContent', 'bannerFooter', 'panelHeader', 'panelFooter'];

  it('consults every declared slot, and renders a default when one is unfilled', () => {
    for (const slot of SLOTS) {
      expect(componentHtml).toContain(`LoginSlotTemplate('${slot}')`);
    }
    // The two replaceable regions must keep an @else — an unfilled slot renders the stock
    // content, never a hole. bannerContent falls back to the brand block; the footers to cards.
    expect(componentHtml).toMatch(/LoginSlotTemplate\('bannerContent'\)[\s\S]*?\} @else \{/);
    expect(componentHtml).toMatch(/LoginSlotTemplate\('bannerFooter'\)[\s\S]*?\} @else if \(LoginBannerCards\.length\)/);
    expect(componentHtml).toMatch(/LoginSlotTemplate\('panelFooter'\)[\s\S]*?\} @else if \(LoginPanelCards\.length\)/);
  });

  it('keeps the picker outside the slots — a host surrounds sign-in, never replaces it', () => {
    expect(componentHtml).toContain('<mj-login-picker');
    const pickerAt = componentHtml.indexOf('<mj-login-picker');
    const stackAt = componentHtml.indexOf('login-panel-stack');
    expect(stackAt).toBeGreaterThan(-1);
    expect(pickerAt).toBeGreaterThan(stackAt);
  });

  it('gives every layout a class the stylesheet actually implements', () => {
    for (const [binding, rule] of [
      ['login-wrapper--split-reverse', '.login-wrapper--split-reverse'],
      ['login-wrapper--centered', '.login-wrapper--centered'],
    ]) {
      expect(componentHtml).toContain(binding);
      expect(componentCss).toContain(rule);
    }
  });

  it('keeps the story copy visible in the centered layout', () => {
    // The ≤900px stacked rules display:none the copy; the centered layout is auto-height and
    // must win. Same specificity, so it only holds while this block stays after them.
    const centeredCopyAt = componentCss.indexOf('.login-wrapper--centered .main-banner .banner-welcome');
    const stackedCopyAt = componentCss.indexOf('.login-wrapper .main-banner .banner-welcome');
    expect(centeredCopyAt).toBeGreaterThan(stackedCopyAt);
    expect(componentCss.slice(centeredCopyAt)).toMatch(/display: block/);
  });

  it('keeps split-reverse from surviving into the stacked layout', () => {
    // Mirroring a split has no meaning once the panes stack, so the breakpoint rule must win.
    const reverseAt = componentCss.indexOf('.login-wrapper--split-reverse');
    const stackAt = componentCss.indexOf('Responsive Breakpoints');
    expect(reverseAt).toBeLessThan(stackAt);
  });

  it('makes a configured external card link tab-nap safe', () => {
    expect(componentHtml).toContain(`card.newTab ? 'noopener noreferrer' : null`);
    expect(componentHtml).toContain(`card.newTab ? '_blank' : null`);
  });
});

/**
 * Overflow contract. The app shell sets `html, body { overflow: hidden }`, so a login column that
 * does not scroll its own content simply loses it — and a scroller that centres with
 * `justify-content: center` strands the overflow above the scroll origin, where no amount of
 * scrolling reaches it. Both columns therefore scroll and centre with auto margins instead.
 * This regressed silently once (many configured cards, and any tenant with many identity
 * providers on a short viewport), which is why it is pinned here rather than left to review.
 */
describe('login surface overflow contract', () => {
  /**
   * Comments come out of the WHOLE sheet before any rule is located, not out of an extracted
   * body. These comments quote CSS — `html, body { overflow: hidden }` — so a brace inside one
   * truncates naive rule extraction, and the leftover prose then matches the very pattern an
   * assertion is trying to rule out. Both failure modes bit while writing this.
   */
  const css = componentCss.replace(/\/\*[\s\S]*?\*\//g, '');

  /** The declarations of the first rule whose selector list contains `selector`. */
  function ruleBody(selector: string): string {
    const at = css.indexOf(selector);
    if (at < 0) return '';
    const open = css.indexOf('{', at);
    const close = css.indexOf('}', open);
    return css.slice(open + 1, close);
  }

  for (const [column, child] of [
    ['.login-wrapper .main-banner', '.login-wrapper .banner-brand'],
    ['.login-wrapper .login-btn', '.login-wrapper .login-panel-stack'],
  ]) {
    it(`${column} scrolls its own content and never centres a scroller`, () => {
      const body = ruleBody(column);
      expect(body).toContain('overflow-y: auto');
      expect(body).not.toMatch(/justify-content:\s*center/);
      expect(ruleBody(child)).toContain('margin-block: auto');
    });
  }

  it('the centered layout scrolls at the wrapper, not in the columns it stacks', () => {
    const wrapper = ruleBody('.login-wrapper--centered {');
    expect(wrapper).toContain('overflow-y: auto');
    expect(wrapper).not.toMatch(/justify-content:\s*center/);
    expect(ruleBody('.login-wrapper--centered .main-banner')).toContain('margin-top: auto');
    expect(ruleBody('.login-wrapper--centered .login-btn')).toContain('margin-bottom: auto');
  });
});

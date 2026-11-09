/**
 * Carries the widget's GLOBAL style layer into whatever document it is embedded in.
 *
 * A one-script embed lands on a page that never loaded MJ's stylesheets, so the widget brings what every MJ
 * Angular surface silently assumes a host application already has: the `--mj-*` design tokens (without them
 * every `var(--mj-*)` in the tree resolves to nothing), the global CSS behind `mjButton` / `mj-switch` (a
 * directive and a style-less component that ship no styles of their own), and Font Awesome (MJ renders icons
 * as bare class names and ships no font). `scripts/build-global-styles.mjs` compiles all three from MJ's own
 * sources into `widget-global-styles.generated.css` at `prebuild`, inside `@layer mj-realtime-widget-defaults`.
 *
 * The layer is the whole safety argument: an UNLAYERED declaration beats a layered one whatever the source
 * order, so an embedding MJ application's own `:root` tokens — including its `[data-theme="dark"]` — keep
 * winning and only the gaps get filled. Per-page `theme-tokens` land inline on the widget host and outrank
 * both.
 *
 * Why a component rather than a `document.head` injection: `ViewEncapsulation.None` already means "put these
 * styles in the document", Angular dedupes them across instances, and the layer arrives on BOTH entry paths —
 * the element bundle and an Angular host using the component. It renders nothing.
 */
import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'mj-realtime-widget-global-styles',
  standalone: true,
  template: '',
  encapsulation: ViewEncapsulation.None,
  styles: ['mj-realtime-widget-global-styles { display: none; }'],
  styleUrls: ['../theme/widget-global-styles.generated.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WidgetGlobalStylesComponent {}

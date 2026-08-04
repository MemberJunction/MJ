import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { InjectWhiteboardSubmitHelper } from './whiteboard-widget-bridge';

/**
 * `wbWidgetSrcdoc` — builds the sandboxed iframe `srcdoc` document for one HTML widget,
 * with a lifecycle that guarantees BOTH halves of the widget rendering contract:
 *
 *  1. **Widget documents are rebuilt per MOUNT.** A pure pipe is instantiated per
 *     binding-in-view, so every time a widget frame is (re)created — page switch away and
 *     back, the viewport-lazy `@if` toggling, panel collapse/expand, whole-board
 *     re-creation — the NEW embedded view gets a NEW pipe instance and therefore a fresh
 *     `SafeHtml` whose first binding pass always writes `srcdoc` onto the new iframe.
 *     No component-level cache can hand a re-mounted frame a stale instance.
 *  2. **Still-mounted widgets never reload on unrelated board activity.** While the view
 *     stays alive, Angular re-invokes a pure pipe only when the INPUT VALUE changes, and
 *     the per-instance memo below additionally pins the returned `SafeHtml` identity for
 *     an unchanged source. Whole-scene `'replace'` journal ops (undo / redo / page rename
 *     / `LoadFromJSON` restores) that re-create the item OBJECT but not its `Html` string
 *     therefore cause NO `srcdoc` rewrite and NO iframe reload — widget runtime state
 *     survives. Only an actual `Html` edit (rich editor Apply, `Whiteboard_UpdateContent`)
 *     produces a new document and reloads the frame.
 *
 * History: the board previously memoized `SafeHtml` per item ID in a component-level map
 * invalidated from journal ops (`'remove'` / `'replace'`). That decoupled the cached
 * document's lifetime from the iframe element's lifetime — unmount paths that journal
 * nothing (the viewport-lazy toggle) left stale entries behind, and every `'replace'`
 * (page switch, rename, undo) nuked the cache and force-reloaded widgets that never
 * changed. Tying the memo to the VIEW (this pipe) removes the entire invalidation
 * problem: mount ⇒ fresh document, unchanged source ⇒ stable identity, changed source ⇒
 * new document.
 *
 * SECURITY — why `bypassSecurityTrustHtml` is correct here: Angular's sanitizer would
 * strip the scripts/styles/SVG that make a widget useful, but the payload NEVER touches
 * the app's DOM — it only becomes the `srcdoc` of an iframe whose `sandbox` attribute is
 * `allow-scripts` ONLY. Without `allow-same-origin` the frame runs in a unique opaque
 * origin: its scripts cannot reach the parent document, the MJ session, cookies, or any
 * storage, and adding `allow-same-origin` (which would let the frame script remove its
 * own sandbox) is deliberately ruled out. By design there is NO DOM sanitization inside
 * the sandbox — the sandbox IS the boundary.
 *
 * Every produced document gets the `MJWhiteboard.submit` input-bridge helper prepended
 * exactly once (idempotent — see {@link InjectWhiteboardSubmitHelper}), so the explicit
 * submit path and the ambient interaction recorder work on every mount.
 */
@Pipe({ name: 'wbWidgetSrcdoc', standalone: true, pure: true })
export class WhiteboardWidgetSrcdocPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  /** Last source transformed by THIS instance (one instance per mounted frame). */
  private lastHtml: string | null = null;
  /** The pinned `SafeHtml` for {@link lastHtml} — identity-stable while mounted. */
  private lastSafe: SafeHtml | null = null;

  /**
   * The widget's iframe `srcdoc`: the helper-injected source wrapped as trusted HTML.
   * Identity-stable for an unchanged `html` on the same instance (no iframe reload);
   * a changed `html` — or a fresh instance on a re-mounted frame — builds a new document.
   */
  public transform(html: string): SafeHtml {
    if (this.lastSafe !== null && this.lastHtml === html) {
      return this.lastSafe;
    }
    const safe = this.sanitizer.bypassSecurityTrustHtml(InjectWhiteboardSubmitHelper(html));
    this.lastHtml = html;
    this.lastSafe = safe;
    return safe;
  }
}

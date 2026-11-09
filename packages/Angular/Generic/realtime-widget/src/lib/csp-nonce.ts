import { REALTIME_WIDGET_TAG } from './element-types';

/**
 * The CSP nonce for the styles the widget injects. Read from the first `<mj-realtime-widget>` already on the
 * page (`csp-nonce`, or Angular's own `ngcspnonce`), else from any `<script nonce>` / `<style nonce>` — the same
 * nonce a page that sets a strict CSP already has.
 */
export function ReadCspNonce(doc: Document = document): string {
  const host = doc.querySelector(REALTIME_WIDGET_TAG);
  const fromHost = host?.getAttribute('csp-nonce') || host?.getAttribute('ngcspnonce');
  if (fromHost) {
    return fromHost;
  }
  const tagged = doc.querySelector<HTMLElement>('script[nonce], style[nonce]');
  return tagged?.nonce || tagged?.getAttribute('nonce') || '';
}

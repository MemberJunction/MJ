export const TOUR_HOST_TAG = 'mj-tour-host';

/**
 * Reads the CSP nonce for styles injected by `<mj-tour-host>` or Stage-2 Angular bootstrap.
 * Checks `<mj-tour-host csp-nonce="...">`, `ngcspnonce`, then any `<script nonce>` / `<style nonce>`.
 */
export function ReadCspNonce(doc: Document = document): string {
  const host = doc.querySelector(TOUR_HOST_TAG);
  const fromHost = host?.getAttribute('csp-nonce') || host?.getAttribute('ngcspnonce');
  if (fromHost) {
    return fromHost;
  }
  const tagged = doc.querySelector<HTMLElement>('script[nonce], style[nonce]');
  return tagged?.nonce || tagged?.getAttribute('nonce') || '';
}

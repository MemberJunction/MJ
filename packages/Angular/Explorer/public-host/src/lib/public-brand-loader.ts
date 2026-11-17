import { SanitizePublicLoginScreen, type PublicLoginScreen } from '@memberjunction/theme-engine';
import type { MJBootstrapEnvironment } from './public-page-entry';
import { BuildLoginScreenURL } from './public-host-urls';

const BRAND_FETCH_TIMEOUT_MS = 5000;

/**
 * Fetches the sign-in page design published in Login Studio, so public pages can use the same brand.
 * Never rejects: a server without the route, a network failure or a bad body resolve to null.
 */
export async function LoadPublicBrand(environment: MJBootstrapEnvironment, timeoutMs: number = BRAND_FETCH_TIMEOUT_MS): Promise<PublicLoginScreen | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(BuildLoginScreenURL(environment), { method: 'GET', signal: controller.signal, credentials: 'omit' });
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? SanitizePublicLoginScreen(body) : null;
  } catch (error) {
    console.warn(`[PublicHost] Could not load the brand: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

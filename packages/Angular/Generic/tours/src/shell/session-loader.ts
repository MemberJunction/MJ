/**
 * Locates and lazily loads the Stage-2 Angular tour session bundle (`mj-tours-session.js`)
 * relative to the Stage-1 shell script URL.
 */
import { TOUR_SHELL_SESSION_CONTRACT_VERSION, type TourSessionModule } from './session-contract';

export const TOUR_SESSION_CHUNK_FILE = 'mj-tours-session.js';

let shellScriptUrl: string | null = null;

export function SetTourShellScriptUrl(url: string | null): void {
  shellScriptUrl = url && url.length > 0 ? url : null;
}

export function GetTourShellScriptUrl(doc: Document = document): string {
  if (shellScriptUrl !== null) {
    return shellScriptUrl;
  }
  const scripts = Array.from(doc.getElementsByTagName('script'));
  const found = scripts.find((s) => /mj-tours(?:\.min)?\.js(?:[?#]|$)/.test(s.src));
  return found?.src || doc.baseURI;
}

export function ResolveTourSessionUrl(explicit: string | null | undefined, doc: Document = document): string {
  const base = GetTourShellScriptUrl(doc);
  try {
    return new URL(explicit || TOUR_SESSION_CHUNK_FILE, base).href;
  } catch {
    throw new Error(`Invalid tour session URL '${explicit ?? TOUR_SESSION_CHUNK_FILE}' relative to '${base}'.`);
  }
}

export type TourSessionImporter = (url: string) => Promise<TourSessionModule>;

/**
 * AGENTS.md Rule #8 Category 3 (Genuine bundle-size deferral for two-stage web element):
 * Stage-1 (`mj-tours.js`) is a ~10 KB vanilla shell; Angular, Zone.js, RxJS, and MJ runtime
 * live in Stage-2 (`mj-tours-session.js`) and load via dynamic `import()` only when a tour runs.
 */
export const DefaultTourSessionImporter: TourSessionImporter = (url) =>
  import(/* @vite-ignore */ url) as Promise<TourSessionModule>;

let activeImporter: TourSessionImporter = DefaultTourSessionImporter;
const moduleCache = new Map<string, Promise<TourSessionModule>>();

export function SetTourSessionImporter(next: TourSessionImporter): TourSessionImporter {
  const prev = activeImporter;
  activeImporter = next;
  return prev;
}

export function ResetTourSessionLoaderCache(): void {
  moduleCache.clear();
}

export function LoadTourSessionModule(url: string): Promise<TourSessionModule> {
  const cached = moduleCache.get(url);
  if (cached) {
    return cached;
  }
  const pending = activeImporter(url).then((mod) => {
    if (mod.SESSION_CONTRACT_VERSION !== TOUR_SHELL_SESSION_CONTRACT_VERSION) {
      throw new Error(
        `Tour session module at ${url} uses contract v${String(mod.SESSION_CONTRACT_VERSION)} (expected v${String(TOUR_SHELL_SESSION_CONTRACT_VERSION)}).`,
      );
    }
    return mod;
  });
  moduleCache.set(url, pending);
  pending.catch(() => moduleCache.delete(url));
  return pending;
}

/**
 * Finds, prefetches and loads the call chunk.
 *
 * The chunk is a separate ES module the shell fetches with a dynamic `import()`. Two things about that are
 * deliberate and worth stating where the next reader will look:
 *
 *  - It is relative to the SHELL'S OWN URL, so a CDN path works with no configuration: the shell records the
 *    URL of the `<script>` that carried it, and the chunk sits beside it.
 *  - Prefetching is `<link rel="modulepreload">`, which downloads (and parses) the module WITHOUT running it.
 *    Running it has side effects on the page (zone.js patches timers and promises), and those must wait for a
 *    visitor who actually starts a call.
 */
import { SHELL_SESSION_CONTRACT_VERSION, type WidgetSessionHandle, type WidgetSessionModule, type WidgetSessionOptions } from './session-contract';

/** The call chunk's file name, beside the shell. */
export const SESSION_CHUNK_FILE = 'mj-realtime-widget-session.js';

let scriptUrl: string | null = null;

/** Records where the shell was loaded from. Called once by the script entry, with `document.currentScript.src`. */
export function SetShellScriptUrl(url: string | null): void {
  scriptUrl = url && url.length > 0 ? url : null;
}

/**
 * The shell's own URL: the recorded one, else the first `<script>` whose file name looks like the shell's, else
 * the page itself (so a chunk placed beside the page still works).
 */
export function GetShellScriptUrl(doc: Document = document): string {
  if (scriptUrl !== null) {
    return scriptUrl;
  }
  const scripts = Array.from(doc.getElementsByTagName('script'));
  const found = scripts.find((s) => /mj-realtime-widget(?:\.min)?\.js(?:[?#]|$)/.test(s.src));
  return found?.src || doc.baseURI;
}

/** Where the call chunk is: the page's explicit `session-url`, else beside the shell. */
export function ResolveSessionUrl(explicit: string | null, doc: Document = document): string {
  const base = GetShellScriptUrl(doc);
  try {
    return new URL(explicit ?? SESSION_CHUNK_FILE, base).href;
  } catch {
    throw new Error(`The call code location "${explicit ?? SESSION_CHUNK_FILE}" is not a valid URL (resolved against ${base}).`);
  }
}

/** How the shell obtains the call module; tests replace it. */
export type SessionImporter = (url: string) => Promise<WidgetSessionModule>;

/**
 * The one dynamic `import()` in the shell.
 *
 * Why a dynamic import is correct here (MJ allows one only for a measured bundle-size deferral, and this is it):
 * the call code (Angular, the realtime overlay, drivers, channels, the GraphQL client) is about 15 MB raw / 4 MB
 * gzip, and a public marketing page must not pay it before a visitor presses a button. The shell is the small
 * part that renders the button; this import is the line between the two. The specifier is computed at run time
 * (relative to the shell's URL), so no bundler can or should inline it.
 */
export const DefaultSessionImporter: SessionImporter = (url) => import(/* @vite-ignore */ url) as Promise<WidgetSessionModule>;

let importer: SessionImporter = DefaultSessionImporter;

/** Replaces the importer (tests). Returns the previous one. */
export function SetSessionImporter(next: SessionImporter): SessionImporter {
  const previous = importer;
  importer = next;
  return previous;
}

const loads = new Map<string, Promise<WidgetSessionModule>>();

/** Forgets cached loads (tests, and a retry after a failed load). */
export function ResetSessionLoads(): void {
  loads.clear();
}

/** Loads the call module once per URL; a failed load is forgotten so the next attempt tries again. */
export function LoadSessionModule(url: string): Promise<WidgetSessionModule> {
  const existing = loads.get(url);
  if (existing) {
    return existing;
  }
  const pending = importer(url).then((module) => {
    if (module.SESSION_CONTRACT_VERSION !== SHELL_SESSION_CONTRACT_VERSION) {
      throw new Error(
        `The call code at ${url} speaks contract ${String(module.SESSION_CONTRACT_VERSION)} but this script speaks ${String(SHELL_SESSION_CONTRACT_VERSION)}. Load both files from the same release.`
      );
    }
    return module;
  });
  loads.set(url, pending);
  pending.catch(() => loads.delete(url));
  return pending;
}

/** Loads the call module and creates one element's session from it. */
export async function CreateSessionFor(url: string, options: WidgetSessionOptions): Promise<WidgetSessionHandle> {
  const module = await LoadSessionModule(url);
  return module.CreateWidgetSession(options);
}

const prefetched = new Set<string>();

/**
 * Starts downloading the call module without running it (`<link rel="modulepreload">`). Idempotent per URL.
 *
 * @param url The call module's URL.
 * @param nonce The page's CSP nonce, for pages whose `script-src` is nonce-based.
 * @param doc The document to put the link in.
 * @returns The link, or `null` when it was already requested or the platform cannot preload modules.
 */
export function PrefetchSession(url: string, nonce: string | null, doc: Document = document): HTMLLinkElement | null {
  if (prefetched.has(url)) {
    return null;
  }
  prefetched.add(url);
  const link = doc.createElement('link');
  link.rel = 'modulepreload';
  link.href = url;
  if (nonce) {
    link.setAttribute('nonce', nonce);
  }
  doc.head.appendChild(link);
  return link;
}

/** Forgets which URLs were prefetched (tests). */
export function ResetSessionPrefetches(): void {
  prefetched.clear();
}

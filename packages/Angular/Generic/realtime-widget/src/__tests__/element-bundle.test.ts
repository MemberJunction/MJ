import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * The shipped one-script embed, exercised as a page would: the BUILT shell, the lazily loaded call chunk and the
 * lazy Interactive Component chunk, booted from the static sample page by `scripts/boot-bundle.mjs` in jsdom with
 * `eval` and the `Function` constructor throwing (what a CSP without `unsafe-eval` does).
 *
 * It proves what unit tests cannot: the Angular linker ran (no `ɵɵngDeclare` anywhere, so no JIT), the shell is
 * small and alone on the page until a call starts, `start()` loads the call chunk and the element upgrades into a
 * running call, the Interactive Component chunk loads only when that channel is in scope, string-keyed
 * `@RegisterClass` registrations survived minification, and the sample page is CSP-clean.
 *
 * jsdom cannot run a real module `import()`, so the call chunk executes in Node with jsdom's globals; see the
 * harness's header for exactly what that does and does not show. Needs `pnpm run build` first (`test` depends on
 * `build` in turbo). A missing bundle FAILS rather than skips: a skipped gate reads as a passing one.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dist = resolve(root, 'dist/element');
const shellPath = join(dist, 'mj-realtime-widget.js');
const sessionPath = join(dist, 'mj-realtime-widget-session.js');
const samplePath = resolve(root, 'sample/index.html');

interface BootReport {
  errors: string[];
  csp: { evalBlocked: boolean; functionBlocked: boolean };
  scripts: string[];
  steps: {
    shell: { defined: boolean; phase: string; startButton: string | null; zoneLoaded: boolean; callFilesLoaded: string[]; firstRenderMs: number | null; properties: Record<string, unknown>; methods: string[] };
    start: { phase: string; zoneLoaded: boolean; filesLoaded: string[]; errorShown: string | null; events: Array<{ name: string; code?: string; phase?: string }>; interactiveChunkLoaded: boolean; rasterizerChunkLoaded: boolean };
    interactive: { phase: string; filesLoaded: string[]; interactiveChunkLoaded: boolean };
    frameCapture: { phase: string; filesLoaded: string[]; rasterizerChunkLoaded: boolean };
  };
}

function allJsFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.js')) {
        out.push(full);
      }
    }
  };
  walk(dist);
  return out;
}

describe('mj-realtime-widget element bundle', () => {
  beforeAll(() => {
    if (!existsSync(shellPath) || !existsSync(sessionPath)) {
      throw new Error(`Bundle not built under ${dist}. Run \`pnpm run build\` in packages/Angular/Generic/realtime-widget first.`);
    }
  });

  describe('the files', () => {
    it('is a small classic-script shell beside a call module and its chunks', () => {
      const shell = readFileSync(shellPath);
      expect(shell.length).toBeLessThan(80 * 1024);
      expect(gzipSync(shell).length).toBeLessThan(40 * 1024);
      expect(statSync(sessionPath).size).toBeGreaterThan(shell.length * 20);
      expect(existsSync(join(dist, 'chunks'))).toBe(true);
    });

    it('keeps everything heavy out of the shell: no Angular, rxjs, zone.js or MemberJunction runtime', () => {
      const text = readFileSync(shellPath, 'utf8');
      expect(text).not.toContain('ɵɵ');
      expect(text).not.toMatch(/\bZone\b.*runTask/);
      expect(text).not.toContain('RealtimeSessionRuntime');
      expect(text).not.toContain('@angular');
    });

    it('was linked ahead of time: no partial declarations remain in any file, so no JIT compiler is needed', () => {
      const offenders = allJsFiles().filter((file) => readFileSync(file, 'utf8').includes('ɵɵngDeclare'));
      expect(offenders.map((f) => f.replace(dist, ''))).toEqual([]);
    });

    it('keeps the string-keyed channel registrations the ClassFactory resolves at runtime', () => {
      const text = allJsFiles()
        .filter((f) => !f.includes('/chunks/katex') && !f.includes('/chunks/xlsx'))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      for (const key of ['IdentityVerificationChannel', 'RealtimeWhiteboardChannel', 'RealtimeMediaChannel', 'RealtimeInteractiveComponentChannel']) {
        expect(text, key).toContain(key);
      }
    });

    it('splits the Interactive Component channel into its own file, which the call module reaches only dynamically', () => {
      const chunks = readdirSync(join(dist, 'chunks')).filter((f) => f.startsWith('interactive-chunk-entry-') && f.endsWith('.js'));
      expect(chunks).toHaveLength(1);
      expect(readFileSync(join(dist, 'chunks', chunks[0]), 'utf8')).toContain('InteractiveComponentHostComponent');
      const session = readFileSync(sessionPath, 'utf8');
      expect(session).not.toMatch(new RegExp(`^import[^;]*${chunks[0]}`, 'm'));
    });

    it('guards the element definition so a second bundle on the page is a no-op', () => {
      expect(readFileSync(shellPath, 'utf8')).toMatch(/customElements\.get\(/);
    });
  });

  describe('booted from the static sample page under a no-eval window', () => {
    let report: BootReport;

    beforeAll(() => {
      const stdout = execFileSync(process.execPath, [join(root, 'scripts/boot-bundle.mjs'), samplePath], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 });
      const lastLine = stdout.trim().split('\n').at(-1) ?? '';
      report = JSON.parse(lastLine) as BootReport;
    }, 130000);

    it('really blocked eval and the Function constructor, and the page raised no script errors', () => {
      expect(report.csp).toEqual({ evalBlocked: true, functionBlocked: true });
      expect(report.errors).toEqual([]);
    });

    it('the shell alone defines the element and renders the start button: no call code fetched, no zone.js on the page', () => {
      const shell = report.steps.shell;
      expect(shell.defined).toBe(true);
      expect(shell.phase).toBe('idle');
      expect(shell.startButton).toBe('Talk to Sage');
      expect(shell.callFilesLoaded).toEqual([]);
      expect(shell.zoneLoaded).toBe(false);
    });

    it('renders its first frame quickly (jsdom, so only a sanity bound; the number is reported)', () => {
      expect(report.steps.shell.firstRenderMs).not.toBeNull();
      expect(report.steps.shell.firstRenderMs as number).toBeLessThan(500);
    });

    it('exposes the contract before the call code exists: attributes as properties, and every method', () => {
      const shell = report.steps.shell;
      expect(shell.properties).toMatchObject({ apiUrl: 'https://api.example.com', widgetKey: 'pk_live_replace_me', channels: ['IdentityVerification'], perception: 'ask', preload: 'hover' });
      expect(shell.methods).toEqual(['start', 'end', 'openChannel', 'sendContextNote', 'requestSpokenResponse', 'registerChannel']);
    });

    it('start() loads the call module and its chunks, then the element upgrades into a running call (here ending in the launcher\'s own error)', () => {
      const start = report.steps.start;
      expect(start.filesLoaded).toContain('mj-realtime-widget-session.js');
      expect(start.filesLoaded.length).toBeGreaterThan(5);
      expect(start.zoneLoaded).toBe(true);
      expect(start.events.filter((e) => e.name === 'mj-phase-changed').map((e) => e.phase)).toEqual(['booting', 'connecting', 'error']);
      expect(start.events.find((e) => e.name === 'mj-error')).toMatchObject({ code: 'launcher-failed', phase: 'error' });
      expect(start.phase).toBe('error');
      expect(start.errorShown).toBe('launcher exploded on purpose');
    });

    it('downloads the rasterizer chunk only for a call whose page set frame-capture', () => {
      expect(report.steps.start.rasterizerChunkLoaded).toBe(false);
      expect(report.steps.interactive.filesLoaded.some((f) => f.includes('frame-capture-chunk-entry'))).toBe(false);
      expect(report.steps.frameCapture.rasterizerChunkLoaded).toBe(true);
    });

    it('does not download the Interactive Component channel unless it is in the session\'s scope, and does when it is', () => {
      expect(report.steps.start.interactiveChunkLoaded).toBe(false);
      expect(report.steps.interactive.interactiveChunkLoaded).toBe(true);
      expect(report.steps.interactive.filesLoaded).toHaveLength(1);
    });
  });

  describe('the DOM rasterizer chunk', () => {
    it('is its own file: html-to-image is in no other file, so neither the shell nor an ordinary call pays for it', () => {
      const withRasterizer = allJsFiles().filter((f) => readFileSync(f, 'utf8').includes('data:image/svg+xml;charset=utf-8,') && readFileSync(f, 'utf8').includes('foreignObject'));
      const names = withRasterizer.map((f) => f.replace(dist + '/', ''));
      expect(names.some((n) => n.includes('frame-capture-chunk-entry'))).toBe(true);
      expect(names.some((n) => n === 'mj-realtime-widget.js' || n === 'mj-realtime-widget-session.js' || n.includes('interactive-chunk-entry'))).toBe(false);
    });
  });

  describe('the sample page', () => {
    it('is CSP-clean itself: strict policy, no inline script, no eval allowance, scripts from its own origin', () => {
      const html = readFileSync(samplePath, 'utf8');
      const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? '';
      expect(policy).toContain("script-src 'self'");
      expect(policy).not.toContain('unsafe-eval');
      expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(/<script(?![^>]*\ssrc=)[^>]*>/.test(html)).toBe(false);
      expect(html).toContain('../dist/element/mj-realtime-widget.js');
    });
  });
});

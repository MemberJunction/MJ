/**
 * Boots the BUILT shell + call chunk the way a page would, in jsdom, under a window whose `eval` and `Function`
 * constructor throw (what a Content-Security-Policy without `unsafe-eval` does), and prints a JSON report.
 *
 *   node scripts/boot-bundle.mjs [path-to-page.html]
 *
 * jsdom cannot run a real dynamic `import()` of a module, so the shell script runs in jsdom's realm and its
 * `import()` is routed (via `importModuleDynamically`) to Node's own ES-module loader; the call chunk therefore
 * executes in Node with jsdom's globals installed. That is the closest thing to a browser available without
 * one, and it exercises the real built files: the shell, the call chunk, its static chunk graph and the lazy
 * channel chunk. What it cannot show is network behaviour or a real browser's CSP enforcement.
 *
 * The report is consumed by `src/__tests__/element-bundle.test.ts`; running it by hand is a quick smoke test.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { Script, constants } from 'node:vm';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pagePath = resolve(process.argv[2] ?? join(root, 'sample/index.html'));

const logDir = mkdtempSync(join(tmpdir(), 'mj-bundle-'));
const logFile = join(logDir, 'loaded.txt');
writeFileSync(logFile, '');
process.env.MJ_BUNDLE_LOAD_LOG = logFile;
register(pathToFileURL(join(here, 'bundle-load-hook.mjs')).href);

const report = { errors: [], steps: {}, csp: {} };
const loadedSince = (mark) =>
    readFileSync(logFile, 'utf8')
        .split('\n')
        .filter((url) => url.includes('/dist/element/'))
        .map((url) => url.slice(url.indexOf('/dist/element/') + '/dist/element/'.length))
        .slice(mark);
const loadedCount = () => readFileSync(logFile, 'utf8').split('\n').filter((url) => url.includes('/dist/element/')).length;

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => report.errors.push(String(error.message).slice(0, 300)));
const dom = await JSDOM.fromFile(pagePath, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
const window = dom.window;
const document = window.document;

// jsdom's globals, lazily, on Node's global object: the call chunk runs in Node's realm.
for (const key of Object.getOwnPropertyNames(window)) {
    if (!(key in globalThis)) {
        Object.defineProperty(globalThis, key, { configurable: true, get: () => window[key], set: (value) => Object.defineProperty(globalThis, key, { value, writable: true, configurable: true }) });
    }
}
Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
Object.defineProperty(globalThis, 'self', { value: window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });

// The CSP: no eval, no Function constructor. Wrapping (not replacing) Function keeps `Function.prototype` usable.
// jsdom's own selector engine (nwsapi) compiles selectors with `new Function` — a jsdom implementation detail a
// real browser does not share — so a call whose immediate caller is nwsapi is let through; anything else throws.
const refuse = () => {
    throw new EvalError("Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script");
};
const callerIsJsdomSelectorEngine = () => (new Error().stack?.split('\n')[3] ?? '').includes('/nwsapi/');
const blockedFunction = new Proxy(Function, {
    construct: (target, args) => (callerIsJsdomSelectorEngine() ? Reflect.construct(target, args) : refuse()),
    apply: (target, thisArg, args) => (callerIsJsdomSelectorEngine() ? Reflect.apply(target, thisArg, args) : refuse()),
});
for (const target of [window, globalThis]) {
    target.Function = blockedFunction;
    target.eval = refuse;
}
report.csp = { evalBlocked: (() => { try { window.eval('1'); return false; } catch { return true; } })(), functionBlocked: (() => { try { new window.Function('return 1'); return false; } catch { return true; } })() };

const runScript = (scriptElement) => {
    const file = fileURLToPath(scriptElement.src);
    const source = readFileSync(file, 'utf8');
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => scriptElement });
    try {
        new Script(source, { filename: file, importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER }).runInContext(dom.getInternalVMContext());
    } finally {
        Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null });
    }
};

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// ── Step 1: the shell only ───────────────────────────────────────────────────────────────────────
const scripts = Array.from(document.querySelectorAll('script[src]'));
report.scripts = scripts.map((s) => s.getAttribute('src'));
const startedAt = performance.now();
let firstRenderMs = null;
for (const script of scripts) {
    if (!existsSync(fileURLToPath(script.src))) {
        report.errors.push(`script not found: ${script.getAttribute('src')}`);
        continue;
    }
    runScript(script);
    if (firstRenderMs === null && document.querySelector('.mjw-start')) {
        firstRenderMs = performance.now() - startedAt;
    }
}
await wait(50);
const widget = document.getElementById('widget');
const events = [];
for (const name of ['mj-ready', 'mj-phase-changed', 'mj-error', 'mj-session-started', 'mj-channel-opened']) {
    widget.addEventListener(name, (event) => events.push({ name, detail: event.detail }));
}
report.steps.shell = {
    defined: Boolean(window.customElements.get('mj-realtime-widget')),
    phase: widget.getAttribute('data-phase'),
    startButton: document.querySelector('.mjw-start')?.textContent?.trim() ?? null,
    zoneLoaded: typeof window.Zone !== 'undefined' || typeof globalThis.Zone !== 'undefined',
    callFilesLoaded: loadedSince(0),
    firstRenderMs: firstRenderMs === null ? null : Math.round(firstRenderMs * 10) / 10,
    properties: { apiUrl: widget.apiUrl, widgetKey: widget.widgetKey, channels: widget.channels, perception: widget.perception, preload: widget.preload },
    methods: ['start', 'end', 'openChannel', 'sendContextNote', 'requestSpokenResponse', 'registerChannel'].filter((m) => typeof widget[m] === 'function'),
};

// ── Step 2: start() — the call chunk loads, the element upgrades into a running call ─────────────
const mark2 = loadedCount();
widget.removeAttribute('channels'); // keep the Interactive Component channel out of scope for this call
widget.setAttribute('require-consent', 'false');
widget.launcher = {
    Launch: async () => {
        throw new Error('launcher exploded on purpose');
    },
};
widget.sendContextNote('queued before the call code existed');
const started = widget.start();
await Promise.race([started, wait(60000)]);
await wait(300);
report.steps.start = {
    phase: widget.getAttribute('data-phase'),
    zoneLoaded: typeof window.Zone !== 'undefined' || typeof globalThis.Zone !== 'undefined',
    filesLoaded: loadedSince(mark2),
    errorShown: document.querySelector('.mjw-alert__message')?.textContent ?? null,
    events: events.map((e) => ({ name: e.name, code: e.detail?.code, phase: e.detail?.phase })),
};
report.steps.start.interactiveChunkLoaded = report.steps.start.filesLoaded.some((f) => f.includes('interactive-chunk-entry'));

// ── Step 3: a second call whose scope includes the Interactive Component channel ─────────────────
const mark3 = loadedCount();
widget.setAttribute('channels', 'InteractiveComponent');
await widget.end();
await widget.start();
await wait(500);
report.steps.interactive = {
    phase: widget.getAttribute('data-phase'),
    filesLoaded: loadedSince(mark3),
};
report.steps.interactive.interactiveChunkLoaded = report.steps.interactive.filesLoaded.some((f) => f.includes('interactive-chunk-entry'));

// ── Step 4: a call whose page set frame-capture: the rasterizer chunk loads, before the mint ───────
const mark4 = loadedCount();
widget.removeAttribute('channels');
widget.setAttribute('frame-capture', '');
await widget.end();
await widget.start();
await wait(500);
report.steps.frameCapture = { phase: widget.getAttribute('data-phase'), filesLoaded: loadedSince(mark4) };
report.steps.frameCapture.rasterizerChunkLoaded = report.steps.frameCapture.filesLoaded.some((f) => f.includes('frame-capture-chunk-entry'));
report.steps.start.rasterizerChunkLoaded = report.steps.start.filesLoaded.some((f) => f.includes('frame-capture-chunk-entry'));

console.log(JSON.stringify(report));
process.exit(0);

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted Playwright spies so the vi.mock factory (which is hoisted above imports)
// can reference them. BrowserManager imports `chromium` from 'playwright'; mocking
// the module fully isolates these tests from any real browser or DB dependency.
const { launch, connect, connectOverCDP } = vi.hoisted(() => ({
  launch: vi.fn(),
  connect: vi.fn(),
  connectOverCDP: vi.fn(),
}));

vi.mock('playwright', () => ({
  chromium: { launch, connect, connectOverCDP },
}));

import type { Page } from 'playwright';
import { BrowserManager, ClassifyConnectEndpoint } from '../../lib/browser-context';
import { DISABLE_WEBRTC_SCRIPT } from '../../lib/network-policy';

const CONNECT_ENV_VAR = 'MJ_REACT_TEST_HARNESS_CONNECT';
const REUSE_CONTEXT_ENV_VAR = 'MJ_REACT_TEST_HARNESS_REUSE_CONTEXT';

type Spy = ReturnType<typeof vi.fn>;
type FakePage = { close: Spy; route: Spy; routeWebSocket: Spy; addInitScript: Spy; unrouteAll: Spy; goto: Spy };
type FakeContext = { newPage: Spy; close: Spy; route: Spy; routeWebSocket: Spy };
type FakeBrowser = { newContext: Spy; contexts: Spy; close: Spy };

/** A fake browser whose contexts all open the same page; launch and both connects return it. */
function installFakeBrowser(): { page: FakePage; context: FakeContext; existingContext: FakeContext; browser: FakeBrowser } {
  const page: FakePage = {
    close: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockResolvedValue(undefined),
    routeWebSocket: vi.fn().mockResolvedValue(undefined),
    addInitScript: vi.fn().mockResolvedValue(undefined),
    unrouteAll: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(null),
  };
  const fakeContext = (): FakeContext => ({
    newPage: vi.fn().mockResolvedValue(page),
    close: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockResolvedValue(undefined),
    routeWebSocket: vi.fn().mockResolvedValue(undefined),
  });
  const context = fakeContext();
  const browser: FakeBrowser = {
    newContext: vi.fn().mockResolvedValue(context),
    contexts: vi.fn().mockReturnValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  };
  launch.mockResolvedValue(browser);
  connect.mockResolvedValue(browser);
  connectOverCDP.mockResolvedValue(browser);
  return { page, context, existingContext: fakeContext(), browser };
}

describe('ClassifyConnectEndpoint', () => {
  it('classifies http(s):// endpoints as CDP', () => {
    expect(ClassifyConnectEndpoint('http://localhost:9222')).toBe('cdp');
    expect(ClassifyConnectEndpoint('https://chrome.example.com')).toBe('cdp');
  });

  it('classifies ws(s):// endpoints as a Playwright server', () => {
    expect(ClassifyConnectEndpoint('ws://localhost:55001/abc')).toBe('server');
    expect(ClassifyConnectEndpoint('wss://pw.example.com/abc')).toBe('server');
  });

  it('honors an explicit hint over the scheme', () => {
    // A raw CDP websocket also starts with ws:// — the override forces CDP.
    expect(ClassifyConnectEndpoint('ws://localhost:9222/devtools/browser/x', 'cdp')).toBe('cdp');
    expect(ClassifyConnectEndpoint('http://localhost:9222', 'server')).toBe('server');
  });

  it('throws on an unrecognized scheme when auto-detecting', () => {
    expect(() => ClassifyConnectEndpoint('localhost:9222')).toThrow(/Unrecognized connect endpoint/);
    expect(() => ClassifyConnectEndpoint('tcp://x')).toThrow(/Unrecognized connect endpoint/);
  });
});

describe('BrowserManager attach behavior', () => {
  let page: FakePage;
  let context: FakeContext;
  let existingContext: FakeContext;
  let browser: FakeBrowser;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv[CONNECT_ENV_VAR] = process.env[CONNECT_ENV_VAR];
    savedEnv[REUSE_CONTEXT_ENV_VAR] = process.env[REUSE_CONTEXT_ENV_VAR];
    delete process.env[CONNECT_ENV_VAR];
    delete process.env[REUSE_CONTEXT_ENV_VAR];

    ({ page, context, existingContext, browser } = installFakeBrowser());
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('launches its own browser when no endpoint is supplied (default)', async () => {
    const mgr = new BrowserManager({ headless: true });
    await mgr.initialize();

    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith({ headless: true, args: ['--dns-prefetch-disable'] });
    expect(connect).not.toHaveBeenCalled();
    expect(connectOverCDP).not.toHaveBeenCalled();
    expect(browser.newContext).toHaveBeenCalledTimes(1);
  });

  it('attaches over a Playwright server for ws:// endpoints', async () => {
    const mgr = new BrowserManager({ connect: 'ws://localhost:55001/abc' });
    await mgr.initialize();

    expect(connect).toHaveBeenCalledWith('ws://localhost:55001/abc');
    expect(launch).not.toHaveBeenCalled();
    expect(connectOverCDP).not.toHaveBeenCalled();
  });

  it('attaches over CDP for http:// endpoints', async () => {
    const mgr = new BrowserManager({ connect: 'http://localhost:9222' });
    await mgr.initialize();

    expect(connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
    expect(launch).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('honors connectType to force CDP on a ws:// endpoint', async () => {
    const mgr = new BrowserManager({ connect: 'ws://localhost:9222/x', connectType: 'cdp' });
    await mgr.initialize();

    expect(connectOverCDP).toHaveBeenCalledWith('ws://localhost:9222/x');
    expect(connect).not.toHaveBeenCalled();
  });

  it('falls back to the connect env var when no option is given', async () => {
    process.env[CONNECT_ENV_VAR] = 'http://localhost:9222';
    const mgr = new BrowserManager({});
    await mgr.initialize();

    expect(connectOverCDP).toHaveBeenCalledWith('http://localhost:9222');
    expect(launch).not.toHaveBeenCalled();
  });

  it('creates a fresh isolated context by default when attaching', async () => {
    browser.contexts.mockReturnValue([existingContext]); // existing tabs present...
    const mgr = new BrowserManager({ connect: 'http://localhost:9222' });
    await mgr.initialize();

    // ...but the default is isolation, so we do NOT reuse the existing context.
    expect(browser.newContext).toHaveBeenCalledTimes(1);
    expect(existingContext.newPage).not.toHaveBeenCalled();
  });

  it('reuses the existing default context when opted in', async () => {
    browser.contexts.mockReturnValue([existingContext]);
    const mgr = new BrowserManager({ connect: 'http://localhost:9222', reuseExistingContext: true });
    await mgr.initialize();

    expect(browser.newContext).not.toHaveBeenCalled();
    expect(existingContext.newPage).toHaveBeenCalledTimes(1);
  });

  it('creates a context when reuse is requested but none exists (server case)', async () => {
    browser.contexts.mockReturnValue([]); // fresh Playwright server has no contexts
    const mgr = new BrowserManager({ connect: 'ws://localhost:55001/x', reuseExistingContext: true });
    await mgr.initialize();

    expect(browser.newContext).toHaveBeenCalledTimes(1);
  });
});

describe('BrowserManager.close ownership', () => {
  let page: FakePage;
  let context: FakeContext;
  let existingContext: FakeContext;
  let browser: FakeBrowser;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[CONNECT_ENV_VAR];
    delete process.env[REUSE_CONTEXT_ENV_VAR];

    ({ page, context, existingContext, browser } = installFakeBrowser());
  });

  it('closes the browser we launched', async () => {
    const mgr = new BrowserManager({});
    await mgr.initialize();
    await mgr.close();

    expect(page.close).toHaveBeenCalledTimes(1);
    expect(context.close).toHaveBeenCalledTimes(1); // we own the context we created
    expect(browser.close).toHaveBeenCalledTimes(1); // we own the browser we launched
  });

  it('never closes a browser we only attached to', async () => {
    const mgr = new BrowserManager({ connect: 'ws://localhost:55001/x' });
    await mgr.initialize();
    await mgr.close();

    expect(page.close).toHaveBeenCalledTimes(1); // we created the page
    expect(context.close).toHaveBeenCalledTimes(1); // we created a fresh context
    expect(browser.close).not.toHaveBeenCalled(); // but the external browser stays alive
  });

  it('never closes a reused/shared context belonging to the attached browser', async () => {
    browser.contexts.mockReturnValue([existingContext]);
    const mgr = new BrowserManager({ connect: 'http://localhost:9222', reuseExistingContext: true });
    await mgr.initialize();
    await mgr.close();

    expect(page.close).toHaveBeenCalledTimes(1); // our page is closed
    expect(existingContext.close).not.toHaveBeenCalled(); // shared context is left intact
    expect(browser.close).not.toHaveBeenCalled(); // external browser stays alive
  });
});

describe('BrowserManager network allowlist', () => {
  let page: FakePage;
  let context: FakeContext;
  let existingContext: FakeContext;
  let browser: FakeBrowser;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[CONNECT_ENV_VAR];
    delete process.env[REUSE_CONTEXT_ENV_VAR];
    ({ page, context, existingContext, browser } = installFakeBrowser());
  });

  /** A fake Playwright route for `url`, made by `fromPage` when given (else it has no frame). */
  const fakeRoute = (url: string, fromPage?: object) => ({
    request: () => ({
      url: () => url,
      frame: () => {
        if (!fromPage) {
          throw new Error('no frame');
        }
        return { page: () => fromPage };
      },
    }),
    abort: vi.fn().mockResolvedValue(undefined),
    fallback: vi.fn().mockResolvedValue(undefined),
  });
  type RouteHandler = (route: ReturnType<typeof fakeRoute>) => Promise<void>;

  it('guards the context it creates: service workers blocked, requests and WebSockets routed', async () => {
    const mgr = new BrowserManager({});
    await mgr.Initialize();

    expect(browser.newContext).toHaveBeenCalledWith(expect.objectContaining({ serviceWorkers: 'block' }));
    expect(context.route).toHaveBeenCalledWith('**/*', expect.any(Function));
    expect(context.routeWebSocket).toHaveBeenCalledTimes(1);
    expect(page.route).toHaveBeenCalledWith('**/*', expect.any(Function));
    expect(page.routeWebSocket).toHaveBeenCalledTimes(1);
    expect(page.addInitScript).toHaveBeenCalledWith(DISABLE_WEBRTC_SCRIPT);
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ args: ['--dns-prefetch-disable'] }));
  });

  it("guards only its own pages in a reused context, never the user's other tabs", async () => {
    browser.contexts.mockReturnValue([existingContext]);
    const mgr = new BrowserManager({ connect: 'http://localhost:9222', reuseExistingContext: true });
    await mgr.Initialize();
    await mgr.GetPage();

    expect(existingContext.route).not.toHaveBeenCalled();
    expect(existingContext.routeWebSocket).not.toHaveBeenCalled();
    expect(page.route).toHaveBeenCalledTimes(2);
  });

  it("routes nothing in 'unrestricted' mode", async () => {
    const mgr = new BrowserManager({ networkAccess: 'unrestricted' });
    await mgr.Initialize();
    await mgr.GetPage();

    expect(browser.newContext).toHaveBeenCalledWith(expect.objectContaining({ serviceWorkers: 'allow' }));
    expect(context.route).not.toHaveBeenCalled();
    expect(page.route).not.toHaveBeenCalled();
    expect(page.addInitScript).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ args: [] }));
  });

  it('aborts a request to a host that was not allowed and records it for that page', async () => {
    const mgr = new BrowserManager({});
    await mgr.Initialize();
    mgr.AllowNetworkUrls(['https://unpkg.com/react.js']);
    const handler = page.route.mock.calls[0][1] as (route: ReturnType<typeof fakeRoute>) => Promise<void>;

    const allowed = fakeRoute('https://unpkg.com/antd.js');
    const outside = fakeRoute('https://attacker.example/c?rows=secret');
    await handler(allowed);
    await handler(outside);

    expect(allowed.fallback).toHaveBeenCalled();
    expect(allowed.abort).not.toHaveBeenCalled();
    expect(outside.abort).toHaveBeenCalledWith('blockedbyclient');
    // The page the manager opened: the fake context's newPage resolves to the shared fake page.
    const opened: Page = await context.newPage.mock.results[0].value;
    expect(mgr.GetBlockedRequests(opened)).toEqual(['https://attacker.example/c']);
  });

  it('allows the hosts given in the options from the start', async () => {
    const mgr = new BrowserManager({ allowedNetworkHosts: ['cdn.example.com'] });
    await mgr.Initialize();
    const handler = page.route.mock.calls[0][1] as (route: ReturnType<typeof fakeRoute>) => Promise<void>;
    const allowed = fakeRoute('https://cdn.example.com/lib.js');
    await handler(allowed);
    expect(allowed.fallback).toHaveBeenCalled();
  });

  it('records a request the context-wide route blocks for the page whose frame made it', async () => {
    const mgr = new BrowserManager({});
    await mgr.Initialize();
    const opened: Page = await context.newPage.mock.results[0].value;
    const contextHandler = context.route.mock.calls[0][1] as RouteHandler;

    const fromPage = fakeRoute('https://attacker.example/w?rows=secret', opened);
    const noFrame = fakeRoute('https://attacker.example/sw');
    await contextHandler(fromPage);
    await contextHandler(noFrame);

    expect(fromPage.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(noFrame.abort).toHaveBeenCalledWith('blockedbyclient');
    expect(mgr.GetBlockedRequests(opened)).toEqual(['https://attacker.example/w']);
  });

  it('does not throw when the page closed while a request was paused', async () => {
    const mgr = new BrowserManager({});
    await mgr.Initialize();
    const handler = page.route.mock.calls[0][1] as RouteHandler;
    const route = fakeRoute('https://attacker.example/c');
    route.abort.mockRejectedValue(new Error('Target page, context or browser has been closed'));

    await expect(handler(route)).resolves.toBeUndefined();
  });

  it('lets the page NavigateTo opens reach that origin, and no other page', async () => {
    const mgr = new BrowserManager({});
    await mgr.Initialize();
    await mgr.NavigateTo('https://myapp.local/test');
    const opened: Page = await context.newPage.mock.results[1].value;
    const contextHandler = context.route.mock.calls[0][1] as RouteHandler;

    const fromNavigatedPage = fakeRoute('https://myapp.local/app.js', opened);
    const fromOtherPage = fakeRoute('https://myapp.local/app.js', {});
    await contextHandler(fromNavigatedPage);
    await contextHandler(fromOtherPage);

    expect(page.goto).toHaveBeenCalledWith('https://myapp.local/test');
    expect(fromNavigatedPage.fallback).toHaveBeenCalled();
    expect(fromOtherPage.abort).toHaveBeenCalledWith('blockedbyclient');
  });

  it('removes a page\'s routes before closing it', async () => {
    const mgr = new BrowserManager({});
    await mgr.Initialize();
    const opened = await mgr.GetPage();
    await mgr.ClosePage(opened);

    expect(page.unrouteAll).toHaveBeenCalledWith({ behavior: 'ignoreErrors' });
    expect(page.close).toHaveBeenCalled();
    expect(page.unrouteAll.mock.invocationCallOrder[0]).toBeLessThan(page.close.mock.invocationCallOrder[0]);
  });
});

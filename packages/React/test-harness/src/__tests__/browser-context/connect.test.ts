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

import { BrowserManager, classifyConnectEndpoint } from '../../lib/browser-context';

const CONNECT_ENV_VAR = 'MJ_REACT_TEST_HARNESS_CONNECT';
const REUSE_CONTEXT_ENV_VAR = 'MJ_REACT_TEST_HARNESS_REUSE_CONTEXT';

describe('classifyConnectEndpoint', () => {
  it('classifies http(s):// endpoints as CDP', () => {
    expect(classifyConnectEndpoint('http://localhost:9222')).toBe('cdp');
    expect(classifyConnectEndpoint('https://chrome.example.com')).toBe('cdp');
  });

  it('classifies ws(s):// endpoints as a Playwright server', () => {
    expect(classifyConnectEndpoint('ws://localhost:55001/abc')).toBe('server');
    expect(classifyConnectEndpoint('wss://pw.example.com/abc')).toBe('server');
  });

  it('honors an explicit hint over the scheme', () => {
    // A raw CDP websocket also starts with ws:// — the override forces CDP.
    expect(classifyConnectEndpoint('ws://localhost:9222/devtools/browser/x', 'cdp')).toBe('cdp');
    expect(classifyConnectEndpoint('http://localhost:9222', 'server')).toBe('server');
  });

  it('throws on an unrecognized scheme when auto-detecting', () => {
    expect(() => classifyConnectEndpoint('localhost:9222')).toThrow(/Unrecognized connect endpoint/);
    expect(() => classifyConnectEndpoint('tcp://x')).toThrow(/Unrecognized connect endpoint/);
  });
});

describe('BrowserManager attach behavior', () => {
  let page: { close: ReturnType<typeof vi.fn> };
  let context: { newPage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let existingContext: { newPage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let browser: {
    newContext: ReturnType<typeof vi.fn>;
    contexts: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv[CONNECT_ENV_VAR] = process.env[CONNECT_ENV_VAR];
    savedEnv[REUSE_CONTEXT_ENV_VAR] = process.env[REUSE_CONTEXT_ENV_VAR];
    delete process.env[CONNECT_ENV_VAR];
    delete process.env[REUSE_CONTEXT_ENV_VAR];

    page = { close: vi.fn().mockResolvedValue(undefined) };
    context = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    existingContext = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    browser = {
      newContext: vi.fn().mockResolvedValue(context),
      contexts: vi.fn().mockReturnValue([]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    launch.mockResolvedValue(browser);
    connect.mockResolvedValue(browser);
    connectOverCDP.mockResolvedValue(browser);
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
    expect(launch).toHaveBeenCalledWith({ headless: true });
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
  let page: { close: ReturnType<typeof vi.fn> };
  let context: { newPage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let existingContext: { newPage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  let browser: {
    newContext: ReturnType<typeof vi.fn>;
    contexts: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[CONNECT_ENV_VAR];
    delete process.env[REUSE_CONTEXT_ENV_VAR];

    page = { close: vi.fn().mockResolvedValue(undefined) };
    context = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    existingContext = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    browser = {
      newContext: vi.fn().mockResolvedValue(context),
      contexts: vi.fn().mockReturnValue([]),
      close: vi.fn().mockResolvedValue(undefined),
    };
    launch.mockResolvedValue(browser);
    connect.mockResolvedValue(browser);
    connectOverCDP.mockResolvedValue(browser);
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

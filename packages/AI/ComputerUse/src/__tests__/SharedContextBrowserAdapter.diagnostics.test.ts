import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserContext, ConsoleMessage } from 'playwright';
import { SharedContextBrowserAdapter } from '../browser/SharedContextBrowserAdapter.js';
import { BrowserConfig } from '../types/browser.js';

/**
 * Diagnostic capture must be bounded, and must not let Playwright accumulate a
 * handle per console argument.
 *
 * Both halves come from run-20260730T200139Z, which OOM-killed a 155-test suite
 * two tests from the end. An Explorer defect
 * (`TabContainer.updateTabDisplayName` throwing NG0201 on every tab add/reload)
 * emitted 50,153 console errors. The unbounded buffer held our truncated copies,
 * and — far worse — Playwright retained a JSHandle per console argument for the
 * lifetime of the browser: 6.46 GB of one repeated string, 82% of the heap.
 *
 * The adapter imports playwright only as a TYPE, so no module mock is needed —
 * we hand it a mock BrowserContext and drive a Page mock through it.
 */

interface MockPage {
    close: ReturnType<typeof vi.fn>;
    setDefaultNavigationTimeout: ReturnType<typeof vi.fn>;
    setDefaultTimeout: ReturnType<typeof vi.fn>;
    url: ReturnType<typeof vi.fn>;
    isClosed: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
}

let page: MockPage;
let context: { newPage: ReturnType<typeof vi.fn> };
/** Handlers the adapter registered, by event name. */
let handlers: Map<string, (arg: unknown) => void>;

beforeEach(() => {
    vi.clearAllMocks();
    handlers = new Map();
    page = {
        close: vi.fn().mockResolvedValue(undefined),
        setDefaultNavigationTimeout: vi.fn(),
        setDefaultTimeout: vi.fn(),
        url: vi.fn().mockReturnValue('http://localhost:4200/'),
        isClosed: vi.fn().mockReturnValue(false),
        on: vi.fn().mockImplementation((evt: string, fn: (arg: unknown) => void) => {
            handlers.set(evt, fn);
        }),
    };
    context = { newPage: vi.fn().mockResolvedValue(page) };
});

async function makeAdapter(): Promise<SharedContextBrowserAdapter> {
    const adapter = new SharedContextBrowserAdapter(context as unknown as BrowserContext);
    await adapter.Launch(new BrowserConfig());
    return adapter;
}

/** A console message with `argCount` argument handles, tracking disposal. */
function makeConsoleMessage(text: string, argCount = 2) {
    const disposals: number[] = [];
    const args = Array.from({ length: argCount }, (_, i) => ({
        dispose: vi.fn().mockImplementation(() => {
            disposals.push(i);
            return Promise.resolve();
        }),
    }));
    return {
        msg: { type: () => 'error', text: () => text, args: () => args } as unknown as ConsoleMessage,
        args,
        disposals,
    };
}

function emitConsole(text: string, argCount = 2) {
    const built = makeConsoleMessage(text, argCount);
    handlers.get('console')!(built.msg);
    return built;
}

describe('SharedContextBrowserAdapter diagnostics', () => {
    it('buffers console errors and flushes them on drain', async () => {
        const adapter = await makeAdapter();
        emitConsole('boom');
        emitConsole('bang');

        const drained = adapter.GetDiagnostics();
        expect(drained.map((e) => e.message)).toEqual(['boom', 'bang']);
        // Drain empties the buffer — the next call sees nothing.
        expect(adapter.GetDiagnostics()).toEqual([]);
    });

    it('stops buffering at the cap instead of growing without bound', async () => {
        const adapter = await makeAdapter();
        adapter.MaxDiagnosticEvents = 5;

        for (let i = 0; i < 500; i++) emitConsole(`error ${i}`);

        const drained = adapter.GetDiagnostics();
        // 5 retained + 1 synthetic overflow notice.
        expect(drained).toHaveLength(6);
        expect(drained.slice(0, 5).map((e) => e.message)).toEqual([
            'error 0', 'error 1', 'error 2', 'error 3', 'error 4',
        ]);
    });

    it('reports how many events the cap discarded rather than truncating silently', async () => {
        const adapter = await makeAdapter();
        adapter.MaxDiagnosticEvents = 2;

        for (let i = 0; i < 12; i++) emitConsole(`error ${i}`);

        const notice = adapter.GetDiagnostics().at(-1)!;
        expect(notice.message).toContain('10 further event(s) discarded');
        expect(notice.message).toContain('flooding the console');
        expect(notice.level).toBe('warning');
    });

    it('clears the dropped count after reporting it once', async () => {
        const adapter = await makeAdapter();
        adapter.MaxDiagnosticEvents = 1;

        for (let i = 0; i < 5; i++) emitConsole(`error ${i}`);
        expect(adapter.GetDiagnostics().at(-1)!.message).toContain('4 further event(s) discarded');

        // A quiet step must not re-report the previous overflow.
        emitConsole('just one');
        const second = adapter.GetDiagnostics();
        expect(second).toHaveLength(1);
        expect(second[0].message).toBe('just one');
    });

    /**
     * The load-bearing half: Playwright materializes a JSHandle per console
     * argument whether or not anyone reads it, and the handle outlives the
     * BrowserContext. Capping our buffer bounds our copies (tens of MB) but not
     * these handles, which were the actual 6.5 GB.
     */
    it('disposes the argument handles of every console message', async () => {
        const adapter = await makeAdapter();
        const kept = emitConsole('kept', 2);
        await vi.waitFor(() => {
            expect(kept.args[0].dispose).toHaveBeenCalledTimes(1);
            expect(kept.args[1].dispose).toHaveBeenCalledTimes(1);
        });
        adapter.GetDiagnostics();
    });

    it('disposes argument handles even for messages the cap discarded', async () => {
        const adapter = await makeAdapter();
        adapter.MaxDiagnosticEvents = 1;

        emitConsole('kept', 1);
        const dropped = emitConsole('dropped', 3);

        await vi.waitFor(() => {
            for (const arg of dropped.args) {
                expect(arg.dispose).toHaveBeenCalledTimes(1);
            }
        });
        // The event itself was discarded, but its handles were still released.
        expect(adapter.GetDiagnostics().map((e) => e.message)).toEqual([
            'kept',
            expect.stringContaining('1 further event(s) discarded'),
        ]);
    });

    it('survives a handle that refuses to dispose', async () => {
        const adapter = await makeAdapter();
        const failing = {
            type: () => 'error',
            text: () => 'boom',
            args: () => [{ dispose: vi.fn().mockRejectedValue(new Error('gone')) }],
        } as unknown as ConsoleMessage;

        expect(() => handlers.get('console')!(failing)).not.toThrow();
        expect(adapter.GetDiagnostics().map((e) => e.message)).toEqual(['boom']);
    });

    it('resets buffer and dropped count when a new page is launched', async () => {
        const adapter = await makeAdapter();
        adapter.MaxDiagnosticEvents = 1;
        for (let i = 0; i < 4; i++) emitConsole(`error ${i}`);

        await adapter.Close();
        await adapter.Launch(new BrowserConfig());

        // Neither the retained event nor the overflow notice carries over.
        expect(adapter.GetDiagnostics()).toEqual([]);
    });

    it('applies the cap to page errors and failed requests too', async () => {
        const adapter = await makeAdapter();
        adapter.MaxDiagnosticEvents = 2;

        handlers.get('pageerror')!(new Error('first'));
        handlers.get('pageerror')!(new Error('second'));
        handlers.get('pageerror')!(new Error('third'));

        const drained = adapter.GetDiagnostics();
        expect(drained.filter((e) => e.type === 'pageerror').map((e) => e.message)).toEqual([
            'first', 'second',
        ]);
        expect(drained.at(-1)!.message).toContain('1 further event(s) discarded');
    });
});

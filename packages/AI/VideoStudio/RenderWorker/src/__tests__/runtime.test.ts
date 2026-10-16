import * as vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { MJVideoRuntime } from '@memberjunction/video-studio-core';
import { BuildPreambleScript, type PreambleRuntimeOptions } from '../index.js';

interface SandboxWindow {
    MJVideo: MJVideoRuntime;
    Math: Math;
    __hf: {
        seek?: (t: number) => void;
    };
    __timelines?: Record<string, unknown>;
    document?: {
        addEventListener: (event: string, cb: () => void) => void;
        querySelectorAll: (selector: string) => FakeElement[];
    };
    setTimeout: (cb: () => void, ms?: number) => void;
}

interface FakeElement {
    Attributes: Map<string, string>;
    getAttribute(name: string): string | null;
    hasAttribute(name: string): boolean;
    setAttribute(name: string, value: string): void;
}

function createFakeElement(initialAttrs: Record<string, string>): FakeElement {
    const map = new Map<string, string>(Object.entries(initialAttrs));
    return {
        Attributes: map,
        getAttribute(name: string): string | null {
            return map.has(name) ? (map.get(name) ?? null) : null;
        },
        hasAttribute(name: string): boolean {
            return map.has(name);
        },
        setAttribute(name: string, value: string): void {
            map.set(name, value);
        },
    };
}

function runPreambleInVm(
    options?: Partial<PreambleRuntimeOptions>,
    hosts: FakeElement[] = [],
    timelines: Record<string, unknown> = {},
): { Window: SandboxWindow; FireDomContentLoaded: () => void } {
    const domListeners: Array<() => void> = [];
    const mathCopy = Object.create(Math) as Math;
    mathCopy.random = Math.random;

    const sandbox: Record<string, unknown> = {
        Math: mathCopy,
        Object,
        String,
        Number,
        Array,
        isFinite,
        __hf: {},
        __timelines: timelines,
        setTimeout: (cb: () => void): void => cb(),
        document: {
            addEventListener: (event: string, cb: () => void): void => {
                if (event === 'DOMContentLoaded') {
                    domListeners.push(cb);
                }
            },
            querySelectorAll: (): FakeElement[] => hosts,
        },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const fullOptions: PreambleRuntimeOptions = {
        DataSnapshot: {
            Metrics: { Revenue: 125000, Tags: ['Q1', 'Q2'] },
        },
        Seed: 123456,
        Format: '16:9',
        Width: 1920,
        Height: 1080,
        Fps: 30,
        DurationSeconds: 5,
        ...options,
    };

    const scriptSource = BuildPreambleScript(fullOptions);
    vm.runInNewContext(scriptSource, sandbox);

    return {
        Window: sandbox as unknown as SandboxWindow,
        FireDomContentLoaded: (): void => {
            for (const listener of domListeners) {
                listener();
            }
        },
    };
}

describe('MJVideo runtime preamble in Node vm', () => {
    it('freezes window.MJVideo and deeply freezes nested Data', () => {
        const { Window } = runPreambleInVm();
        expect(Object.isFrozen(Window.MJVideo)).toBe(true);
        expect(Object.isFrozen(Window.MJVideo.Data)).toBe(true);
        const metrics = Window.MJVideo.Data.Metrics as { Revenue: number; Tags: string[] };
        expect(Object.isFrozen(metrics)).toBe(true);
        expect(Object.isFrozen(metrics.Tags)).toBe(true);

        expect(() => {
            (Window.MJVideo as unknown as Record<string, unknown>).Seed = 999;
        }).toThrow();
        expect(() => {
            metrics.Revenue = 0;
        }).toThrow();
    });

    it('replaces Math.random with MJVideo.Random and produces identical sequences across runs and out-of-order __hf.seek(t) calls', () => {
        const runA = runPreambleInVm({ Seed: 42 });
        const runB = runPreambleInVm({ Seed: 42 });

        expect(runA.Window.Math.random).toBe(runA.Window.MJVideo.Random);
        expect(runA.Window.MJVideo.Random()).toBe(runB.Window.MJVideo.Random());
        expect(runA.Window.MJVideo.Random()).toBe(runB.Window.MJVideo.Random());

        // Seek runA to t=1.5, then t=0.5, then back to t=1.5
        runA.Window.__hf.seek?.(1.5);
        const seqAt15First = [
            runA.Window.MJVideo.Random(),
            runA.Window.MJVideo.Random(),
            runA.Window.MJVideo.Random(),
        ];

        runA.Window.__hf.seek?.(0.5);
        const seqAt05 = [runA.Window.MJVideo.Random(), runA.Window.MJVideo.Random()];

        // Seek out-of-order back to t=1.5
        runA.Window.__hf.seek?.(1.5);
        const seqAt15Second = [
            runA.Window.MJVideo.Random(),
            runA.Window.MJVideo.Random(),
            runA.Window.MJVideo.Random(),
        ];
        expect(seqAt15Second).toEqual(seqAt15First);
        expect(seqAt05[0]).not.toBe(seqAt15First[0]);

        // Seek runB directly to t=1.5 without visiting t=0.5
        runB.Window.__hf.seek?.(1.5);
        expect([
            runB.Window.MJVideo.Random(),
            runB.Window.MJVideo.Random(),
            runB.Window.MJVideo.Random(),
        ]).toEqual(seqAt15First);
    });

    it('produces deterministic Noise(key, ...) values in [0, 1) and fires OnFrame on __hf.seek(t)', () => {
        const { Window } = runPreambleInVm({ Seed: 777 });
        const n1 = Window.MJVideo.Noise('particle', 3, 'x');
        const n2 = Window.MJVideo.Noise('particle', 3, 'x');
        const n3 = Window.MJVideo.Noise('particle', 4, 'x');

        expect(n1).toBe(n2);
        expect(n1).toBeGreaterThanOrEqual(0);
        expect(n1).toBeLessThan(1);
        expect(n1).not.toBe(n3);

        const observedTimes: number[] = [];
        Window.MJVideo.OnFrame((t) => observedTimes.push(t));

        // Even if HyperFrames replaces window.__hf.seek later, our setter wraps it
        let underlyingCalledWith = -1;
        Window.__hf.seek = (t: number): void => {
            underlyingCalledWith = t;
        };

        Window.__hf.seek(2.25);
        expect(underlyingCalledWith).toBe(2.25);
        expect(observedTimes).toEqual([2.25]);
    });

    it('auto-tags static [data-composition-id] hosts with data-no-timeline when no timeline is registered', () => {
        const staticHost = createFakeElement({ 'data-composition-id': 'static-card' });
        const animatedHost = createFakeElement({ 'data-composition-id': 'animated-card' });

        const { FireDomContentLoaded } = runPreambleInVm(
            {},
            [staticHost, animatedHost],
            { 'animated-card': { seek: () => undefined } },
        );

        FireDomContentLoaded();
        expect(staticHost.hasAttribute('data-no-timeline')).toBe(true);
        expect(animatedHost.hasAttribute('data-no-timeline')).toBe(false);
    });
});

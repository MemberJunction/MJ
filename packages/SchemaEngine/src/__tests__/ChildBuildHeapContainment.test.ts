/**
 * The CodeGen and compile steps run as SEPARATE node processes while the API process is still
 * resident holding its own V8 heap. `NODE_OPTIONS` is inherited, so before this fix the child
 * was handed the API's OWN `--max-old-space-size`.
 *
 * Observed 2026-09-14 on a 2 vCPU / 4 GB workspace compiling 364 new entities: API started at
 * `--max-old-space-size=1964` (the deployer reserving 1024 MB for the OS and this very child),
 * compile inherited the same 1964, and 1964 + 1964 > 3830. The kernel killed the largest RSS
 * mid-step. No V8 abort, no JS error — only `dmesg` recorded it.
 *
 * These pin the containment: the child's ceiling is always set, always ours, never the parent's.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RuntimeSchemaManager } from '../RuntimeSchemaManager.js';

/** Free memory the code under test sees. ESM exports cannot be spied, so the module is mocked. */
let freeBytes = 1016 * 1024 * 1024;
vi.mock('node:os', async () => {
    const actual = await vi.importActual<typeof import('node:os')>('node:os');
    return { ...actual, freemem: () => freeBytes };
});

/** Reach the private helpers under test without widening their visibility for real callers. */
type HeapInternals = {
    buildChildEnv(): NodeJS.ProcessEnv;
    resolveChildHeapMB(): number;
};
const internals = () => RuntimeSchemaManager.Instance as unknown as HeapInternals;

const heapOf = (env: NodeJS.ProcessEnv): number | null => {
    const m = /--max-old-space-size=(\d+)/.exec(env.NODE_OPTIONS ?? '');
    return m ? parseInt(m[1], 10) : null;
};

const ORIGINAL_NODE_OPTIONS = process.env.NODE_OPTIONS;
const ORIGINAL_HEAP_MB = process.env.RSU_COMPILE_HEAP_MB;

describe('build-child heap containment', () => {
    beforeEach(() => {
        delete process.env.RSU_COMPILE_HEAP_MB;
        // 4 GB box with ~1 GB free — the shape of the workspace that died.
        freeBytes = 1016 * 1024 * 1024;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS;
        else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS;
        if (ORIGINAL_HEAP_MB === undefined) delete process.env.RSU_COMPILE_HEAP_MB;
        else process.env.RSU_COMPILE_HEAP_MB = ORIGINAL_HEAP_MB;
    });

    it('does NOT hand the child the parent process ceiling', () => {
        process.env.NODE_OPTIONS = '--max-old-space-size=1964';
        const childHeap = heapOf(internals().buildChildEnv());
        expect(childHeap).not.toBeNull();
        // The exact failure: child and parent both permitted 1964 MB on a 3830 MB box.
        expect(childHeap).not.toBe(1964);
        expect(childHeap!).toBeLessThan(1964);
    });

    it('sets a ceiling even when the parent has none, so the child never gets V8 default sizing', () => {
        delete process.env.NODE_OPTIONS;
        expect(heapOf(internals().buildChildEnv())).not.toBeNull();
    });

    it('keeps every other inherited NODE_OPTIONS flag — some are load-bearing for the build', () => {
        process.env.NODE_OPTIONS = '--experimental-specifier-resolution=node --max-old-space-size=1964';
        const env = internals().buildChildEnv();
        expect(env.NODE_OPTIONS).toContain('--experimental-specifier-resolution=node');
        expect(env.NODE_OPTIONS).not.toContain('1964');
    });

    it('emits exactly one --max-old-space-size, never two competing ones', () => {
        process.env.NODE_OPTIONS = '--max-old-space-size=1964';
        const matches = (internals().buildChildEnv().NODE_OPTIONS ?? '').match(/--max-old-space-size=/g);
        expect(matches).toHaveLength(1);
    });

    it('an explicit RSU_COMPILE_HEAP_MB pins the ceiling', () => {
        process.env.NODE_OPTIONS = '--max-old-space-size=1964';
        process.env.RSU_COMPILE_HEAP_MB = '900';
        expect(heapOf(internals().buildChildEnv())).toBe(900);
    });

    it('floors the derived ceiling so a starved box aborts diagnosably instead of being OOM-killed', () => {
        freeBytes = 64 * 1024 * 1024;
        expect(internals().resolveChildHeapMB()).toBe(512);
    });

    it('caps the derived ceiling so a large box does not hand a build the whole machine', () => {
        freeBytes = 64 * 1024 * 1024 * 1024;
        expect(internals().resolveChildHeapMB()).toBe(4096);
    });

    it('carries the rest of the environment through unchanged', () => {
        process.env.NODE_OPTIONS = '--max-old-space-size=1964';
        const env = internals().buildChildEnv();
        expect(env.PATH).toBe(process.env.PATH);
    });
});

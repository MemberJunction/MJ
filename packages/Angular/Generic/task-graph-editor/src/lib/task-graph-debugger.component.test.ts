import { describe, expect, it } from 'vitest';
import { TaskGraphDebuggerComponent } from './task-graph-debugger.component';

/**
 * The debugger is a wrap of existing session wiring. These tests pin the public
 * helpers hosts already used (breakpoint / override lookup), not a new state machine.
 */
describe('TaskGraphDebuggerComponent', () => {
    it('HasBreakpoint and GetEdgeOverride match the bag the wrap already loaded', () => {
        const dbg = Object.create(TaskGraphDebuggerComponent.prototype) as TaskGraphDebuggerComponent;
        dbg.Breakpoints = ['AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'];
        dbg.EdgeOverrides = { 'BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB': 'true' };
        expect(dbg.HasBreakpoint('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);
        expect(dbg.HasBreakpoint('CCCCCCCC-CCCC-CCCC-CCCC-CCCCCCCCCCCC')).toBe(false);
        expect(dbg.GetEdgeOverride('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe('true');
        expect(dbg.GetEdgeOverride(null)).toBeNull();
    });

    it('Pause with no parent task is a no-op, same as the hosts', async () => {
        const dbg = Object.create(TaskGraphDebuggerComponent.prototype) as TaskGraphDebuggerComponent;
        Object.defineProperty(dbg, 'parentTaskID', { value: null, writable: true });
        await expect(dbg.Pause()).resolves.toBe(false);
    });
});

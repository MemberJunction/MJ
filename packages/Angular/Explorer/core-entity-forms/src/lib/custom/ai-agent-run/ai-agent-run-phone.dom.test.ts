/**
 * The AI Agent Run form on a phone: the tab strip becomes an `mj-section-picker` that offers the
 * two views that work at 375px (Timeline, Details). Visualization and Analytics stay desktop
 * views: a phone that lands on one is sent back to the timeline, and the timeline's detail pane
 * stacks under the list instead of beside it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MJAIAgentRunFormComponentExtended } from './ai-agent-run.component';

function form(over: object = {}): MJAIAgentRunFormComponentExtended {
    const f = Object.create(MJAIAgentRunFormComponentExtended.prototype) as MJAIAgentRunFormComponentExtended;
    Object.assign(f, { cdr: { markForCheck: () => undefined }, ActiveTab: 'timeline', IsPhone: false, VisualizationLoaded: false, AnalyticsLoaded: false }, over);
    return f;
}

describe('MJAIAgentRunFormComponentExtended on a phone', () => {
    it('offers Timeline and Details in the section picker, never the desktop views', () => {
        expect(form().SectionPickerItems.map((i) => i.Key)).toEqual(['timeline', 'details']);
    });

    it('routes a known pick through ChangeTab and ignores a desktop view or unknown key', () => {
        const f = form();
        const spy = vi.spyOn(f, 'ChangeTab').mockImplementation(() => undefined);
        f.OnSectionPicked('details');
        f.OnSectionPicked('visualization');
        f.OnSectionPicked('nope');
        expect(spy.mock.calls).toEqual([['details']]);
    });

    it('phone defaults send a desktop-only active tab back to the timeline and set the split direction', () => {
        const f = form({ ActiveTab: 'analytics' });
        f.ApplyPhoneDefaults(true);
        expect(f.ActiveTab).toBe('timeline');
        expect(f.IsPhone).toBe(true);
        expect(f.TimelineSplitDirection).toBe('vertical');
        const d = form({ ActiveTab: 'analytics' });
        d.ApplyPhoneDefaults(false);
        expect(d.ActiveTab).toBe('analytics');
        expect(d.TimelineSplitDirection).toBe('horizontal');
    });

    it('a phone keeps Details if that is where it landed', () => {
        const f = form({ ActiveTab: 'details' });
        f.ApplyPhoneDefaults(true);
        expect(f.ActiveTab).toBe('details');
    });

    describe('following the breakpoint', () => {
        const setMatchMedia = (matches: boolean | undefined): void => {
            const fn = matches === undefined ? undefined : () => ({ matches, addEventListener: () => undefined, removeEventListener: () => undefined });
            Object.defineProperty(window, 'matchMedia', { value: fn, configurable: true, writable: true });
        };
        afterEach(() => setMatchMedia(undefined));

        it('re-applies the phone defaults when the viewport crosses into phone width', () => {
            const f = form({ ActiveTab: 'visualization' });
            setMatchMedia(true);
            f.SyncPhoneViewport();
            expect(f.IsPhone).toBe(true);
            expect(f.ActiveTab).toBe('timeline');
            expect(f.TimelineSplitDirection).toBe('vertical');
            setMatchMedia(false);
            f.SyncPhoneViewport();
            expect(f.IsPhone).toBe(false);
            expect(f.TimelineSplitDirection).toBe('horizontal');
        });
    });
});

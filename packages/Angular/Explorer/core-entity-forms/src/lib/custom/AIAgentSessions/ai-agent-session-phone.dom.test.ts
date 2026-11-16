/**
 * AI Agent Sessions on a phone: the tab strip becomes an `mj-section-picker`. These specs pin
 * the adapter (strip order, a count only when the tab has rows, as the strip's badges do) and
 * the pick handler (a known key goes through ChangeTab; an unknown one is ignored).
 */
import { describe, it, expect, vi } from 'vitest';
import { MJAIAgentSessionFormComponentExtended } from './ai-agent-session-form.component';

const form = (over: object = {}) => Object.assign(Object.create(MJAIAgentSessionFormComponentExtended.prototype) as MJAIAgentSessionFormComponentExtended, {
    cdr: { markForCheck: () => undefined, detectChanges: () => undefined }, ActiveTab: 'runs', RunTree: [], Channels: [], Transcript: [],
}, over);

describe('AI Agent Sessions phone section picker', () => {
    it('lists the four tabs in strip order with counts only where there are rows', () => {
        const f = form({ RunTree: [1, 2], Channels: [], Transcript: [1, 2, 3] });
        expect(f.SectionPickerItems.map((i) => [i.Key, i.Title, i.Count ?? null])).toEqual([
            ['runs', 'Runs', 2], ['channels', 'Channels', null], ['transcript', 'Transcript', 3], ['details', 'Details', null],
        ]);
    });

    it('routes a known pick through ChangeTab and ignores an unknown key', () => {
        const f = form();
        const spy = vi.spyOn(f, 'ChangeTab').mockImplementation(() => undefined);
        f.OnSectionPicked('transcript');
        f.OnSectionPicked('nope');
        expect(spy.mock.calls).toEqual([['transcript']]);
    });
});

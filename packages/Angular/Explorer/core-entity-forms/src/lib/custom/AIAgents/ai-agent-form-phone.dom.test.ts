/**
 * AI Agents on a phone: the 6A hero summary, and the tab nav as an `mj-section-picker`. These
 * specs pin the summary text, the adapter from FormTabs (tab order, a numeric badge as the count),
 * and the pick handler (a known key goes through OnFormTabChange; an unknown key is ignored).
 */
import { describe, it, expect, vi } from 'vitest';
import { MJAIAgentFormComponentExtended } from './ai-agent-form.component';

function form(over: object = {}): MJAIAgentFormComponentExtended {
    return Object.assign(Object.create(MJAIAgentFormComponentExtended.prototype) as MJAIAgentFormComponentExtended, {
        cdr: { markForCheck: () => undefined, detectChanges: () => undefined },
        HeroDetailsOpen: false,
        IsOpenToEveryone: true,
        record: { Type: 'Loop', Parent: null },
        FormTabs: [
            { key: 'designer', label: 'Designer', icon: 'fa-solid fa-diagram-project' },
            { key: 'details', label: 'Details', icon: 'fa-solid fa-circle-info' },
            { key: 'invocations', label: 'Invocations', icon: 'fa-solid fa-bolt', badge: 4 },
            { key: 'notes', label: 'Notes', badge: 'new' },
        ],
        ActiveFormTab: 'designer',
    }, over);
}

describe('AI Agents phone hero summary', () => {
    it('names the agent type and who can run it', () => {
        expect(form().HeroSummary).toBe('Loop agent · Open to everyone');
    });

    it('adds the parent for a child agent and says Restricted when permissions are set', () => {
        expect(form({ record: { Type: 'Flow', Parent: 'Skip' }, IsOpenToEveryone: false }).HeroSummary).toBe('Flow agent · Child of Skip · Restricted');
    });

    it('leaves out a missing type', () => {
        expect(form({ record: { Type: null, Parent: null } }).HeroSummary).toBe('Open to everyone');
    });
});

describe('AI Agents phone section picker', () => {
    it('lists the form tabs in order with a numeric badge as the count', () => {
        expect(form().SectionPickerItems).toEqual([
            { Key: 'designer', Title: 'Designer', Icon: 'fa-solid fa-diagram-project', Count: null },
            { Key: 'details', Title: 'Details', Icon: 'fa-solid fa-circle-info', Count: null },
            { Key: 'invocations', Title: 'Invocations', Icon: 'fa-solid fa-bolt', Count: 4 },
            { Key: 'notes', Title: 'Notes', Icon: undefined, Count: null },
        ]);
    });

    it('routes a known pick through OnFormTabChange and ignores an unknown key', () => {
        const f = form();
        const spy = vi.spyOn(f, 'OnFormTabChange').mockImplementation(() => undefined);
        f.OnSectionPicked('details');
        f.OnSectionPicked('nope');
        expect(spy.mock.calls).toEqual([['details']]);
    });
});

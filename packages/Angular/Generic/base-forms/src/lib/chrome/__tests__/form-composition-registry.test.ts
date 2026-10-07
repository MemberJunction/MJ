import { describe, it, expect } from 'vitest';
import { FormCompositionRegistry } from '../form-composition-registry';
import type { FormCompositionSnapshot } from '../form-composition-snapshot';

/** The registry holds the full snapshot of each open form, so the apply flow can read it without it going into agent prompts. */

function snapshot(entity: string, record: string | null, chromeRuleCount = 0): FormCompositionSnapshot {
    return {
        Entity: entity, RecordPrimaryKey: record,
        FormChoice: { FullCustomForm: false, OverrideID: null, Label: 'Default form' },
        Layout: 'accordion', Sections: [], Related: [], Contributions: [], Rail: [], SlotsPresent: [], ChromeRuleCount: chromeRuleCount,
    };
}

describe('FormCompositionRegistry', () => {
    it('finds the snapshot an open form published, by entity and record', () => {
        const registry = new FormCompositionRegistry();
        const accounts = snapshot('Accounts', 'ID|7');
        registry.Publish({}, accounts);
        registry.Publish({}, snapshot('Contacts', 'ID|7'));
        expect(registry.Get('accounts ', 'ID|7')).toBe(accounts);
        expect(registry.Find({ Entity: 'Accounts', RecordPrimaryKey: 'ID|7' })).toBe(accounts);
        expect(registry.Get('Accounts', 'ID|8')).toBeNull();
    });

    it('keeps one snapshot per form, the latest', () => {
        const registry = new FormCompositionRegistry();
        const form = {};
        registry.Publish(form, snapshot('Accounts', 'ID|7', 1));
        const latest = snapshot('Accounts', 'ID|7', 2);
        registry.Publish(form, latest);
        expect(registry.Get('Accounts', 'ID|7')).toBe(latest);
    });

    it('drops the old record when a new record is saved and its form publishes the new key', () => {
        const registry = new FormCompositionRegistry();
        const form = {};
        registry.Publish(form, snapshot('Accounts', null));
        registry.Publish(form, snapshot('Accounts', 'ID|9'));
        expect(registry.Get('Accounts', null)).toBeNull();
        expect(registry.Get('Accounts', 'ID|9')).not.toBeNull();
    });

    it('treats a blank record key as an unsaved record', () => {
        const registry = new FormCompositionRegistry();
        const unsaved = snapshot('Accounts', null);
        registry.Publish({}, unsaved);
        expect(registry.Get('Accounts', '')).toBe(unsaved);
    });

    it('answers with the newest of two forms on the same record', () => {
        const registry = new FormCompositionRegistry();
        registry.Publish({}, snapshot('Accounts', 'ID|7', 1));
        const newer = snapshot('Accounts', 'ID|7', 2);
        registry.Publish({}, newer);
        expect(registry.Get('Accounts', 'ID|7')).toBe(newer);
    });

    it('forgets a form that went away', () => {
        const registry = new FormCompositionRegistry();
        const form = {};
        registry.Publish(form, snapshot('Accounts', 'ID|7'));
        registry.Remove(form);
        expect(registry.Get('Accounts', 'ID|7')).toBeNull();
        expect(registry.Find(null)).toBeNull();
    });
});

import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { CloneScopeControlsComponent, type CloneScopeValues } from './clone-scope-controls.component';

const CONFIGURED: CloneScopeValues = {
    MaxDepth: 2, MaxRecords: 500, Subtypes: 'include', Hierarchy: 'subtree', SoftLinks: 'skip', EntityActions: 'suppress',
};

describe('CloneScopeControlsComponent (DOM)', () => {
    it('renders the preset dropdown only when presets are provided', () => {
        expect(query(renderComponentFixture(CloneScopeControlsComponent, { inputs: { Presets: [] } }), '#preset-select')).toBeNull();

        const f = renderComponentFixture(CloneScopeControlsComponent, { inputs: { Presets: ['Standard', 'DeepCopy'] } });
        const options = queryAll(f, '#preset-select option');
        expect(options.map((o) => o.textContent?.trim())).toEqual(['Default (Custom)', 'Standard', 'DeepCopy']);
    });

    it('summarizes the effective scope for everyone, with no override controls for a regular user', () => {
        const f = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { ...CONFIGURED, ConfiguredScope: CONFIGURED, EntityName: 'MJ: Users' },
        });
        expect(queryAll(f, '.fact').map((e) => e.textContent?.trim())).toEqual([
            'Depth 2', 'Up to 500 records', 'Soft links off', 'Subtypes included', 'Hierarchy subtree', 'Entity actions suppressed',
        ]);
        expect(text(f, '.summary-source')).toBe('Set by the MJ: Users clone configuration');
        expect(query(f, '.dev-overrides')).toBeNull();
        expect(query(f, '#max-depth-input')).toBeNull();
    });

    it('highlights values that differ from the configuration', () => {
        const f = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { ...CONFIGURED, MaxDepth: 5, ConfiguredScope: CONFIGURED, CanOverrideScope: true },
        });
        expect(queryAll(f, '.fact.changed').map((e) => e.textContent?.trim())).toEqual(['Depth 5']);
        expect(text(f, '.dev-count')).toBe('1 active');
    });

    it('offers depth, cap and scope toggles only to an Override Scope holder, and emits changes', () => {
        const f = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { ...CONFIGURED, ConfiguredScope: CONFIGURED, CanOverrideScope: true },
        });
        const out = capture(f.componentInstance.ScopeChanged);
        f.componentInstance.OnMaxDepthChange('4');
        f.componentInstance.OnSoftLinksToggle(true);
        expect(query(f, '#max-depth-input')).not.toBeNull();
        expect(out.at(-1)).toMatchObject({ MaxDepth: 4, SoftLinks: 'include' });
    });

    it('shows the Run Entity Actions toggle only with CanFireHooks', () => {
        const without = renderComponentFixture(CloneScopeControlsComponent, { inputs: { CanOverrideScope: true } });
        expect(queryAll(without, '.toggle-label').some((l) => l.textContent?.includes('Run Entity Actions'))).toBe(false);

        const withHooks = renderComponentFixture(CloneScopeControlsComponent, { inputs: { CanFireHooks: true } });
        expect(query(withHooks, '.dev-overrides')).not.toBeNull();
        expect(query(withHooks, '#max-depth-input')).toBeNull();
        expect(queryAll(withHooks, '.toggle-label').some((l) => l.textContent?.includes('Run Entity Actions'))).toBe(true);
    });

    it('shows each preset by its label, falling back to the key', () => {
        const f = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { Presets: ['with-settings', 'bare'], PresetLabels: { 'with-settings': { Label: 'Include personal settings' } } },
        });
        const options = queryAll(f, '#preset-select option').map((o) => o.textContent?.trim());
        expect(options).toEqual(['Default (Custom)', 'Include personal settings', 'bare']);
    });

    it('asks to reset to the entity defaults', () => {
        const f = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { ...CONFIGURED, MaxDepth: 5, ConfiguredScope: CONFIGURED, CanOverrideScope: true },
        });
        const out = capture(f.componentInstance.ResetToDefaults);
        (query(f, '.link-btn') as HTMLButtonElement).click();
        expect(out.length).toBe(1);
    });
});

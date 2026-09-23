import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { CloneScopeControlsComponent } from './clone-scope-controls.component';

describe('CloneScopeControlsComponent (DOM)', () => {
    it('renders preset dropdown only when presets are provided', () => {
        const fixtureWithoutPresets = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { Presets: [] },
        });
        expect(query(fixtureWithoutPresets, '#preset-select')).toBeNull();

        const fixtureWithPresets = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { Presets: ['Standard', 'DeepCopy'] },
        });
        expect(query(fixtureWithPresets, '#preset-select')).not.toBeNull();
        const options = queryAll(fixtureWithPresets, '#preset-select option');
        expect(options.length).toBe(3); // 1 Default (Custom) + 2 Presets
        expect(options[1].textContent?.trim()).toBe('Standard');
        expect(options[2].textContent?.trim()).toBe('DeepCopy');
    });

    it('renders depth slider and reflects current depth', () => {
        const fixture = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { MaxDepth: 4 },
        });

        const depthValue = text(fixture, '.depth-value');
        expect(depthValue).toBe('4');
    });

    it('emits ScopeChanged when depth or toggles are updated', () => {
        const fixture = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { MaxDepth: 3, Subtypes: 'include', Hierarchy: 'subtree', SoftLinks: 'skip' },
        });

        let emittedScope: unknown = null;
        fixture.componentInstance.ScopeChanged.subscribe((scope) => {
            emittedScope = scope;
        });

        fixture.componentInstance.OnMaxDepthChange(5);
        expect(emittedScope).toEqual({
            Preset: undefined,
            MaxDepth: 5,
            Subtypes: 'include',
            Hierarchy: 'subtree',
            SoftLinks: 'skip',
            EntityActions: 'suppress',
            MaxRecords: 500,
        });

        fixture.componentInstance.OnSoftLinksToggle(true);
        expect(emittedScope).toEqual({
            Preset: undefined,
            MaxDepth: 5,
            Subtypes: 'include',
            Hierarchy: 'subtree',
            SoftLinks: 'include',
            EntityActions: 'suppress',
            MaxRecords: 500,
        });
    });

    it('shows hook action toggle only when CanFireHooks is true', () => {
        const fixtureWithoutHooks = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { CanFireHooks: false },
        });
        expect(fixtureWithoutHooks.nativeElement.textContent).not.toContain('Fire Entity Actions');

        const fixtureWithHooks = renderComponentFixture(CloneScopeControlsComponent, {
            inputs: { CanFireHooks: true },
        });
        expect(fixtureWithHooks.nativeElement.textContent).toContain('Fire Entity Actions');
    });
});

import { describe, it, expect } from 'vitest';
import type { ComponentFixture } from '@angular/core/testing';
import { EntityInfo } from '@memberjunction/core';
import type { FieldRuleSet } from '@memberjunction/global';
import { renderComponentFixture, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { FieldRulesBuilderComponent } from './field-rules-builder.component';

/**
 * The field pickers of a saved rule show the rule's stored fields. Their options come from `@for`, so a `[value]` on
 * the `<select>` is applied before the options exist and the browser shows the first option instead (the F15 bug
 * class); each option marks itself `[selected]`.
 */

const MEMBERS = new EntityInfo({
    ID: 'ent-members', Name: 'Members', DisplayName: 'Members',
    Fields: [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'FirstName', Type: 'nvarchar', AllowUpdateAPI: true },
        { Name: 'Tier', Type: 'nvarchar', AllowUpdateAPI: true },
        { Name: 'Nickname', Type: 'nvarchar', AllowUpdateAPI: true },
    ],
});

function render(value: FieldRuleSet): ComponentFixture<FieldRulesBuilderComponent> {
    const provider = createFakeProvider({ entities: [MEMBERS], entityByName: (n: string) => (n === 'Members' ? MEMBERS : undefined) });
    const f = renderComponentFixture(FieldRulesBuilderComponent, { inputs: { Provider: provider, EntityName: 'Members', Value: value } });
    f.detectChanges();
    return f;
}

const selectedText = (select: Element | undefined): string | undefined => {
    const el = select as HTMLSelectElement | undefined;
    return el ? el.options[el.selectedIndex]?.textContent?.trim() : undefined;
};

describe('FieldRulesBuilderComponent field pickers (DOM)', () => {
    it('shows a saved rule\'s target field and source field, not the first option', () => {
        const f = render({ Rules: [{ TargetField: 'Nickname', Source: { Kind: 'field', Field: 'Tier' } }] });

        expect(selectedText(queryAll(f, '.frb-target')[0])).toBe('Nickname');
        expect(selectedText(queryAll(f, '.frb-source-field')[0])).toBe('Tier');
    });

    it('shows each rule\'s own target', () => {
        const f = render({ Rules: [
            { TargetField: 'Tier', Source: { Kind: 'static', Value: 'Gold' } },
            { TargetField: 'Nickname', Source: { Kind: 'static', Value: 'x' } },
        ] });

        expect(queryAll(f, '.frb-target').map((s) => selectedText(s))).toEqual(['Tier', 'Nickname']);
    });

    it('shows the placeholder for a field the entity does not list', () => {
        const f = render({ Rules: [{ TargetField: 'Gone', Source: { Kind: 'field', Field: 'AlsoGone' } }] });

        expect(selectedText(queryAll(f, '.frb-target')[0])).toBe('— field —');
        expect(selectedText(queryAll(f, '.frb-source-field')[0])).toBe('— source field —');
    });
});

import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { FieldRulesBuilderComponent } from './field-rules-builder.component';

const MEMBERS = new EntityInfo({
    ID: 'ent-members', Name: 'Members', DisplayName: 'Members',
    Fields: [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'FirstName', Type: 'nvarchar', AllowUpdateAPI: true },
        { Name: 'Tier', Type: 'nvarchar', AllowUpdateAPI: true },
        { Name: 'Nickname', Type: 'nvarchar', AllowUpdateAPI: true },
    ],
});

const selectedText = (select: Element | undefined): string | undefined => {
    const el = select as HTMLSelectElement | undefined;
    return el ? el.options[el.selectedIndex]?.textContent?.trim() : undefined;
};

describe('FieldRulesBuilderComponent field pickers (DOM)', () => {
    it('shows a saved rule\'s target field and source field, not the first option', () => {
        const provider = createFakeProvider({ entities: [MEMBERS], entityByName: (n: string) => (n === 'Members' ? MEMBERS : undefined) });
        const f = renderComponentFixture(FieldRulesBuilderComponent, {
            inputs: { Provider: provider, EntityName: 'Members', Value: { Rules: [{ TargetField: 'Nickname', Source: { Kind: 'field', Field: 'Tier' } }] } },
        });
        f.detectChanges();

        expect(selectedText(queryAll(f, '.frb-target')[0])).toBe('Nickname');
        expect(selectedText(queryAll(f, '.frb-source-field')[0])).toBe('Tier');
    });
});

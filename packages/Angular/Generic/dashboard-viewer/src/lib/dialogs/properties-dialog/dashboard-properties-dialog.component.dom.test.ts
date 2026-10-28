import { describe, expect, it } from 'vitest';
import { ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Query, QueryAll, Click, Capture, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import type { DashboardPanel } from '../../models/dashboard-types';
import type { DashboardProperty, DashboardWire } from '../../models/dashboard-properties';
import { PropertyDefaultEditorComponent } from '../property-default-editor/property-default-editor.component';
import { DashboardPropertiesDialogComponent, type DashboardPropertiesDialogResult } from './dashboard-properties-dialog.component';

/**
 * DOM coverage for the dashboard designer's Properties panel and Wires list. The parts are a Web URL
 * part (inputs from its placeholders, no provider needed) and a Component part whose spec the fake
 * provider returns (an `onPick` event with a string `chapter` and a number `rank`).
 */

const SPEC = {
    name: 'ChapterPicker',
    properties: [],
    events: [{ name: 'onPick', description: 'd', parameters: [{ name: 'chapter', type: 'string', description: 'd' }, { name: 'rank', type: 'number', description: 'd' }] }],
};
const PICKER: DashboardPanel = { id: 'picker', title: 'Picker', partTypeId: 'pt-c', config: { type: 'Component', componentName: 'ChapterPicker' } };
const PAGE: DashboardPanel = { id: 'page', title: 'Chapter page', partTypeId: 'pt-url',
    config: { type: 'WebURL', url: 'https://example.com/{Chapter}', inputMappings: [{ Input: 'Chapter', Property: 'Chapter' }] } };
const CHAPTER: DashboardProperty = { Name: 'Chapter', Type: 'string' };

function render(properties: DashboardProperty[], wires: DashboardWire[] = []): ComponentFixture<DashboardPropertiesDialogComponent> {
    const provider = CreateFakeProvider({ runViewResults: [{ ID: 'c1', Name: 'ChapterPicker', Specification: JSON.stringify(SPEC) }] });
    return RenderComponentFixture(DashboardPropertiesDialogComponent, {
        imports: [FormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective, StubLoadingComponent],
        declarations: [DashboardPropertiesDialogComponent, PropertyDefaultEditorComponent],
        inputs: { Visible: true, Properties: properties, Wires: wires, Panels: [PICKER, PAGE], Provider: provider },
    });
}

/**
 * Lets the dialog open and load, then renders. Marks the dialog for check first: a test that calls its
 * methods directly makes changes no event marked, which the zoneless scheduler's targeted pass skips.
 */
async function settle(f: ComponentFixture<DashboardPropertiesDialogComponent>): Promise<void> {
    f.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
        await f.whenStable();
        f.detectChanges();
    }
}

const applyButton = (f: ComponentFixture<DashboardPropertiesDialogComponent>) => QueryAll(f, '.mj-dialog-actions button')[0] as HTMLButtonElement;
const problems = (f: ComponentFixture<DashboardPropertiesDialogComponent>) => QueryAll(f, '.dpd__problems li').map(li => li.textContent?.trim());

describe('DashboardPropertiesDialogComponent (DOM)', () => {
    it('lists the properties and applies a wire from a part event to a property', async () => {
        const f = render([CHAPTER]);
        await settle(f);
        expect((Query(f, '#dpd-name-0') as HTMLInputElement).value).toBe('Chapter');
        const saved = Capture<DashboardPropertiesDialogResult>(f.componentInstance.Saved);

        Click(f, 'section:nth-of-type(2) > button');
        await settle(f);
        expect(problems(f)).toEqual([]);
        Click(f, '.mj-dialog-actions button');

        expect(saved[0]).toEqual({ Properties: [CHAPTER], Wires: [{ Panel: 'picker', Event: 'onPick', Value: 'chapter', Property: 'Chapter' }] });
    });

    it("refuses Apply when a renamed property leaves a part's mapping without its property", async () => {
        const f = render([CHAPTER]);
        await settle(f);
        f.componentInstance.UpdateProperty(0, { Name: 'Branch' });
        await settle(f);
        expect(problems(f)).toEqual(['Part "Chapter page": Input "Chapter" is mapped from "Chapter", which the dashboard doesn\'t have.']);
        expect(applyButton(f).disabled).toBe(true);
    });

    it("refuses a wire whose value type doesn't fit the property", async () => {
        const f = render([CHAPTER], [{ Panel: 'picker', Event: 'onPick', Value: 'rank', Property: 'Chapter' }]);
        await settle(f);
        expect(problems(f)).toEqual(['Wire 1: "rank" (number) can\'t set "Chapter" (string).']);
        expect(applyButton(f).disabled).toBe(true);
    });

    it('adds a property with a token default and removes empty optional keys', async () => {
        const f = render([CHAPTER]);
        await settle(f);
        f.componentInstance.AddProperty();
        f.componentInstance.SetPropertyType(1, 'date');
        f.componentInstance.SetPropertyDefault(1, { Token: 'Context.StartOfMonth' });
        f.componentInstance.UpdateProperty(1, { Description: '' });
        await settle(f);
        const saved = Capture<DashboardPropertiesDialogResult>(f.componentInstance.Saved);
        Click(f, '.mj-dialog-actions button');
        expect(saved[0].Properties).toEqual([CHAPTER, { Name: 'Property2', Type: 'date', Default: { Token: 'Context.StartOfMonth' } }]);
    });
});

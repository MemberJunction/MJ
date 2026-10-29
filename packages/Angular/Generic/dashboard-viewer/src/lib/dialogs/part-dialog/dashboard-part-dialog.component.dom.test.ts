import { describe, it, expect, vi } from 'vitest';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MJGlobal } from '@memberjunction/global';
import { MJDialogComponent, MJDialogActionsComponent, MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Query, QueryAll, Text, Click, TypeInto, Capture, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import type { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { DashboardPartDialogComponent, type DashboardPartDialogResult } from './dashboard-part-dialog.component';
import { WebURLConfigPanelComponent } from '../../config-panels/weburl-config-panel.component';
import { PropertyDefaultEditorComponent } from '../property-default-editor/property-default-editor.component';
import type { DashboardPanel } from '../../models/dashboard-types';

/**
 * DOM coverage for <mj-dashboard-part-dialog>, the one dialog that adds and edits a dashboard part.
 * Most part type doubles have no ConfigDialogClass, so they have no settings panel. The "Web page"
 * double names the real WebURL settings panel, which the dialog loads through ClassFactory.
 */

/** A part type double. A type without a config dialog class has no settings panel. */
function partType(id: string, name: string, icon: string, sortOrder: number, isActive = true, configDialogClass: string | null = null): MJDashboardPartTypeEntity {
  return { ID: id, Name: name, Icon: icon, Description: `${name} long metadata description`, ConfigDialogClass: configDialogClass, SortOrder: sortOrder, IsActive: isActive } as unknown as MJDashboardPartTypeEntity;
}
const PART_TYPES = [
  partType('pt-query', 'Query', 'fa-solid fa-flask', 2),
  partType('pt-view', 'View', 'fa-solid fa-table', 1),
  partType('pt-artifact', 'Artifact', 'fa-solid fa-palette', 3),
  partType('pt-url', 'WebURL', 'fa-solid fa-globe', 4),
  partType('pt-old', 'Legacy', 'fa-solid fa-box', 5, false),
];
const QUERY_TYPE = PART_TYPES[0];
const VIEW_TYPE = PART_TYPES[1];
/** A WebURL part type whose settings panel is the real WebURLConfigPanelComponent. */
const WEB_PAGE_TYPE = partType('pt-url', 'WebURL', 'fa-solid fa-globe', 4, true, 'WebURLPanelConfigDialog');
/** Another part type with the same settings panel. */
const INTRANET_TYPE = partType('pt-intranet', 'Intranet', 'fa-solid fa-building', 3, true, 'WebURLPanelConfigDialog');
const REVENUE: DashboardPanel = { id: 'panel-1', title: 'Revenue', icon: 'fa-solid fa-flask', partTypeId: 'pt-query',
  config: { type: 'Query', queryId: 'q-1', showParameterControls: false, autoRefreshSeconds: 300 } };

function render(inputs: Record<string, unknown>): ComponentFixture<DashboardPartDialogComponent> {
  return RenderComponentFixture(DashboardPartDialogComponent, {
    imports: [FormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective, MJEmptyStateComponent, StubLoadingComponent],
    declarations: [DashboardPartDialogComponent, WebURLConfigPanelComponent, PropertyDefaultEditorComponent],
    inputs: { PartTypes: PART_TYPES, Visible: true, ...inputs },
  });
}
/** Lets the dialog open (it resets after the input pass) and load, then renders. */
async function settle(f: ComponentFixture<DashboardPartDialogComponent>): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
  await f.whenStable();
  f.detectChanges();
}
const tileLabels = (f: ComponentFixture<DashboardPartDialogComponent>, selector = '.part-dialog__type') =>
  QueryAll(f, `${selector} .part-dialog__type-label`).map(e => e.textContent?.trim());
/** A class list as a sorted array. Angular adds the classes of a [class] binding in its own order. */
const classSet = (classes: string) => classes.split(/\s+/).filter(Boolean).sort();
const submitButton = (f: ComponentFixture<DashboardPartDialogComponent>) => QueryAll(f, '.mj-dialog-actions button')[0] as HTMLButtonElement;
const queryOptionBoxes = (f: ComponentFixture<DashboardPartDialogComponent>) => QueryAll(f, '.part-dialog__options input[type="checkbox"]') as HTMLInputElement[];
const refreshSelect = (f: ComponentFixture<DashboardPartDialogComponent>) => Query(f, '.part-dialog__refresh') as HTMLSelectElement;
/** The settings panel the dialog created, if any. */
const webUrlPanel = (f: ComponentFixture<DashboardPartDialogComponent>) =>
  f.debugElement.query(By.directive(WebURLConfigPanelComponent))?.componentInstance as WebURLConfigPanelComponent | undefined;

describe('DashboardPartDialogComponent (DOM)', () => {
  it('opens as "Add a part" with the active part types in sort order, the first chosen, and Add part before Cancel', async () => {
    const f = render({ Mode: 'add' });
    await settle(f);
    expect(Text(f, '.mj-dialog-title')).toBe('Add a part');
    expect(tileLabels(f)).toEqual(['View', 'Query', 'Artifact', 'Web page']);
    expect(tileLabels(f, '.part-dialog__type--selected')).toEqual(['View']);
    expect(QueryAll(f, '.part-dialog__type i').map(i => classSet(i.className)))
      .toEqual(['fa-solid fa-table', 'fa-solid fa-flask', 'fa-solid fa-palette', 'fa-solid fa-globe'].map(classSet));
    const buttons = QueryAll(f, '.mj-dialog-actions button');
    expect(buttons.map(b => b.textContent?.trim())).toEqual(['Add part', 'Cancel']);
    expect(buttons[0].querySelector('i')?.className).toContain('fa-plus');
  });

  it('opens as "Edit part" with the part\'s type, title and query options, other types locked, and Apply', async () => {
    const f = render({ Mode: 'edit', Panel: REVENUE });
    await settle(f);
    expect(Text(f, '.mj-dialog-title')).toBe('Edit part');
    expect(tileLabels(f, '.part-dialog__type--selected')).toEqual(['Query']);
    expect(QueryAll(f, '.part-dialog__type:disabled')).toHaveLength(3);
    expect((Query(f, '#part-dialog-title') as HTMLInputElement).value).toBe('Revenue');
    const apply = QueryAll(f, '.mj-dialog-actions button')[0] as HTMLButtonElement;
    expect(apply.textContent?.trim()).toBe('Apply');
    expect(apply.querySelector('i')?.className).toContain('fa-check');
    expect(apply.disabled).toBe(false);
  });

  it("keeps the edited part's type: a disabled tile and SelectPartType do not change it", async () => {
    const f = render({ Mode: 'edit', Panel: REVENUE });
    await settle(f);
    Click(f, '.part-dialog__type:nth-child(1)');               // View, disabled
    f.componentInstance.SelectPartType(VIEW_TYPE);
    await settle(f);
    expect(f.componentInstance.SelectedPartType).toBe(QUERY_TYPE);
    expect(tileLabels(f, '.part-dialog__type--selected')).toEqual(['Query']);
  });

  it('uses the source name as the default title, and a typed title instead', async () => {
    const f = render({ Mode: 'add' });
    await settle(f);
    const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);
    expect(Query(f, '#part-dialog-title')?.getAttribute('placeholder')).toBe('Default: View');
    Click(f, '.mj-dialog-actions button');
    TypeInto(f, '#part-dialog-title', 'Sales');
    await settle(f);
    Click(f, '.mj-dialog-actions button');
    expect(saved.map(r => r.Title)).toEqual(['View', 'Sales']);
    expect(saved[0]).toMatchObject({ Config: { type: 'View' }, Icon: 'fa-solid fa-table' });
  });

  it('shows the query options only for a Query part, and puts them in its config', async () => {
    const f = render({ Mode: 'add' });
    await settle(f);
    expect(Query(f, '.part-dialog__options')).toBeNull();
    Click(f, '.part-dialog__type:nth-child(2)');               // Query
    await settle(f);
    const [showParams, refresh] = queryOptionBoxes(f);
    expect([showParams.checked, refresh.checked]).toEqual([true, false]);
    const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);
    Click(f, '.mj-dialog-actions button');
    expect(saved[0].Config).toEqual({ type: 'Query', showParameterControls: true, autoRefreshSeconds: 0 });
    Click(f, '.part-dialog__type:nth-child(1)');               // View
    await settle(f);
    expect(Query(f, '.part-dialog__options')).toBeNull();
  });

  it('cancels from Cancel and from the dialog close button', async () => {
    const f = render({ Mode: 'add' });
    await settle(f);
    const cancelled = Capture<void>(f.componentInstance.Cancelled);
    Click(f, '.mj-dialog-actions button:nth-child(2)');
    Click(f, '.mj-dialog-close');
    expect(cancelled).toHaveLength(2);
  });

  it('renders nothing while Visible is false', async () => {
    const f = render({ Mode: 'add', Visible: false });
    await settle(f);
    expect(Query(f, 'mj-dialog')).toBeNull();
    expect(Query(f, '.part-dialog')).toBeNull();
  });

  it('starts again from the first part type and an empty title each time it opens', async () => {
    const f = render({ Mode: 'add' });
    await settle(f);
    Click(f, '.part-dialog__type:nth-child(2)');               // Query
    TypeInto(f, '#part-dialog-title', 'Sales');
    await settle(f);

    f.componentRef.setInput('Visible', false);
    await settle(f);
    expect(Query(f, 'mj-dialog')).toBeNull();

    f.componentRef.setInput('Visible', true);
    await settle(f);
    expect(tileLabels(f, '.part-dialog__type--selected')).toEqual(['View']);
    expect((Query(f, '#part-dialog-title') as HTMLInputElement).value).toBe('');
  });

  it('shows the query options of the edited part, and keeps its config and options on Apply', async () => {
    const f = render({ Mode: 'edit', Panel: REVENUE });
    await settle(f);
    const [showParams, refresh] = queryOptionBoxes(f);
    expect([showParams.checked, refresh.checked]).toEqual([false, true]);
    expect(Array.from(refreshSelect(f).options).map(o => o.textContent?.trim())).toEqual(['30', '60', '300', '600']);
    expect(refreshSelect(f).selectedIndex).toBe(2);
    const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);

    TypeInto(f, '#part-dialog-title', 'Revenue by month');
    await settle(f);
    Click(f, '.mj-dialog-actions button');

    expect(saved).toEqual([{
      PartType: QUERY_TYPE,
      Config: { type: 'Query', queryId: 'q-1', showParameterControls: false, autoRefreshSeconds: 300 },
      Title: 'Revenue by month',
      Icon: 'fa-solid fa-flask',
    }]);
  });

  it('adds a refresh interval the list does not offer to the choices when a part already uses it', async () => {
    const legacy: DashboardPanel = { ...REVENUE, config: { ...REVENUE.config, autoRefreshSeconds: 45 } };
    const f = render({ Mode: 'edit', Panel: legacy });
    await settle(f);
    const select = refreshSelect(f);
    expect(Array.from(select.options).map(o => o.textContent?.trim())).toEqual(['30', '45', '60', '300', '600']);
    expect(select.selectedIndex).toBe(1);
    const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);

    select.value = select.options[4].value;                     // 600
    select.dispatchEvent(new Event('change'));
    await settle(f);
    Click(f, '.mj-dialog-actions button');

    expect(saved[0].Config['autoRefreshSeconds']).toBe(600);
  });

  describe('with a settings panel', () => {
    it("loads the part type's settings panel with the dialog's Provider and without the panel's own title field", async () => {
      const provider = CreateFakeProvider();
      const f = render({ Mode: 'add', PartTypes: [WEB_PAGE_TYPE], Provider: provider });
      await settle(f);
      expect(webUrlPanel(f)?.Provider).toBe(provider);
      expect(webUrlPanel(f)?.ShowCommonFields).toBe(false);
      expect(Query(f, '.part-dialog mj-weburl-config-panel #webUrl')).not.toBeNull();
      expect(Query(f, '.part-dialog #partTitle')).toBeNull();
      expect(Query(f, '#part-dialog-title')).not.toBeNull();
    });

    it("enables Add part once the panel has a valid source, then adds the part with the panel's config and source name", async () => {
      const f = render({ Mode: 'add', PartTypes: [WEB_PAGE_TYPE] });
      await settle(f);
      expect(submitButton(f).disabled).toBe(true);

      TypeInto(f, '#webUrl', 'https://example.com/report');
      await settle(f);
      expect(submitButton(f).disabled).toBe(false);
      expect(Query(f, '#part-dialog-title')?.getAttribute('placeholder')).toBe('Default: example.com');

      const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);
      Click(f, '.mj-dialog-actions button');
      expect(saved).toEqual([{
        PartType: WEB_PAGE_TYPE,
        Config: { type: 'WebURL', url: 'https://example.com/report', sandboxMode: 'standard', allowFullscreen: true, refreshOnResize: false },
        Title: 'example.com',
        Icon: 'fa-solid fa-globe',
      }]);
    });

    it('enables Apply at once when editing a part with a settings panel, so a title change alone applies', async () => {
      const docs: DashboardPanel = { id: 'panel-2', title: 'Docs', partTypeId: 'pt-url',
        config: { type: 'WebURL', url: 'https://docs.example.com', sandboxMode: 'strict', allowFullscreen: false, refreshOnResize: true } };
      const f = render({ Mode: 'edit', PartTypes: [VIEW_TYPE, WEB_PAGE_TYPE], Panel: docs });
      await settle(f);
      expect(submitButton(f).disabled).toBe(false);
      expect((Query(f, '#webUrl') as HTMLInputElement).value).toBe('https://docs.example.com');
      const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);

      TypeInto(f, '#part-dialog-title', 'Product docs');
      await settle(f);
      Click(f, '.mj-dialog-actions button');

      expect(saved).toEqual([{
        PartType: WEB_PAGE_TYPE,
        Config: { type: 'WebURL', url: 'https://docs.example.com', sandboxMode: 'strict', allowFullscreen: false, refreshOnResize: true },
        Title: 'Product docs',
        Icon: 'fa-solid fa-globe',
      }]);
    });

    it('keeps a title that is the source name in step with the source, and leaves a title the user changed', async () => {
      const docs: DashboardPanel = { id: 'panel-3', title: 'docs.example.com', partTypeId: 'pt-url', config: { type: 'WebURL', url: 'https://docs.example.com' } };
      const f = render({ Mode: 'edit', PartTypes: [WEB_PAGE_TYPE], Panel: docs });
      await settle(f);
      const title = () => (Query(f, '#part-dialog-title') as HTMLInputElement).value;
      expect(title()).toBe('docs.example.com');

      TypeInto(f, '#webUrl', 'https://wiki.example.com');
      await settle(f);
      expect(title()).toBe('wiki.example.com');

      TypeInto(f, '#part-dialog-title', 'Team wiki');
      TypeInto(f, '#webUrl', 'https://intranet.example.com');
      await settle(f);
      expect(title()).toBe('Team wiki');
      expect(Query(f, '#part-dialog-title')?.getAttribute('placeholder')).toBe('Default: intranet.example.com');
    });

    it('removes the settings panel when the user picks a part type without one', async () => {
      const f = render({ Mode: 'add', PartTypes: [VIEW_TYPE, WEB_PAGE_TYPE] });
      await settle(f);
      Click(f, '.part-dialog__type:nth-child(2)');             // Web page
      await settle(f);
      expect(Query(f, 'mj-weburl-config-panel')).not.toBeNull();

      Click(f, '.part-dialog__type:nth-child(1)');             // View
      await settle(f);
      expect(tileLabels(f, '.part-dialog__type--selected')).toEqual(['View']);
      expect(Query(f, 'mj-weburl-config-panel')).toBeNull();
      expect(submitButton(f).disabled).toBe(false);
    });

    it('drops a settings panel that finishes loading after the user picked another part type', async () => {
      const factory = MJGlobal.Instance.ClassFactory;
      const lookUp = factory.GetRegistrationAsync.bind(factory);
      let releaseFirstLookUp: () => void = () => undefined;
      const firstLookUpHeld = new Promise<void>(resolve => { releaseFirstLookUp = resolve; });
      let lookUps = 0;
      vi.spyOn(factory, 'GetRegistrationAsync').mockImplementation(async (baseClass, key) => {
        if (++lookUps === 1) await firstLookUpHeld;
        return lookUp(baseClass, key);
      });
      const f = render({ Mode: 'add', PartTypes: [VIEW_TYPE, INTRANET_TYPE, WEB_PAGE_TYPE] });
      await settle(f);
      Click(f, '.part-dialog__type:nth-child(2)');             // Intranet: its panel lookup is held
      Click(f, '.part-dialog__type:nth-child(3)');             // Web page: its panel loads at once
      await settle(f);
      expect(webUrlPanel(f)?.partType).toBe(WEB_PAGE_TYPE);

      releaseFirstLookUp();                                    // the Intranet load ends last
      await settle(f);
      expect(tileLabels(f, '.part-dialog__type--selected')).toEqual(['Web page']);
      expect(QueryAll(f, 'mj-weburl-config-panel')).toHaveLength(1);
      expect(webUrlPanel(f)?.partType).toBe(WEB_PAGE_TYPE);
    });

    it('says why a settings panel could not load, and still adds the part with default settings', async () => {
      const custom = partType('pt-custom', 'Custom', 'fa-solid fa-cube', 1, true, 'NoSuchPanelConfigDialog');
      const f = render({ Mode: 'add', PartTypes: [custom] });
      await settle(f);
      expect(Text(f, '.part-dialog__warning')).toBe('The settings panel "NoSuchPanelConfigDialog" is not registered. The part is added with default settings.');
      expect(submitButton(f).disabled).toBe(false);
      const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);

      Click(f, '.mj-dialog-actions button');

      expect(saved).toEqual([{ PartType: custom, Config: { type: 'Custom' }, Title: 'Custom', Icon: 'fa-solid fa-cube' }]);
    });
  });
});

describe('DashboardPartDialogComponent Inputs list (DOM)', () => {
  const PROPERTIES = [{ Name: 'Chapter', Type: 'string' }, { Name: 'Count', Type: 'number' }];
  const chooseProperty = async (f: ComponentFixture<DashboardPartDialogComponent>, name: string) => {
    const select = Query(f, '.part-dialog__input select') as HTMLSelectElement;
    select.value = name;
    select.dispatchEvent(new Event('change'));
    await settle(f);
  };

  it("lists a URL's placeholders as the part's inputs, and saves an input mapped to a dashboard property", async () => {
    const f = render({ Mode: 'add', PartTypes: [WEB_PAGE_TYPE], DashboardProperties: PROPERTIES });
    await settle(f);
    TypeInto(f, '#webUrl', 'https://example.com/chapters/{Chapter}');
    await settle(f);
    await settle(f);

    expect(QueryAll(f, '.part-dialog__input-name').map(e => e.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Chapter any*']);
    expect(Array.from((Query(f, '.part-dialog__input select') as HTMLSelectElement).options).map(o => o.textContent?.trim()))
      .toEqual(['No dashboard property', 'Chapter', 'Count']);
    await chooseProperty(f, 'Chapter');
    const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);
    Click(f, '.mj-dialog-actions button');

    expect(saved[0].Config['inputMappings']).toEqual([{ Input: 'Chapter', Property: 'Chapter' }]);
  });

  it('saves no inputMappings key when no input is mapped', async () => {
    const f = render({ Mode: 'add', PartTypes: [WEB_PAGE_TYPE], DashboardProperties: PROPERTIES });
    await settle(f);
    TypeInto(f, '#webUrl', 'https://example.com/chapters/{Chapter}');
    await settle(f);
    await settle(f);
    const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);
    Click(f, '.mj-dialog-actions button');
    expect('inputMappings' in saved[0].Config).toBe(false);
  });

  it('shows a mapping to an input the part no longer declares, and refuses Apply until it is removed', async () => {
    const page: DashboardPanel = { id: 'panel-3', title: 'Chapter page', partTypeId: 'pt-url',
      config: { type: 'WebURL', url: 'https://example.com/{Chapter}', inputMappings: [{ Input: 'Chapter', Property: 'Chapter' }, { Input: 'OldName', Property: 'Chapter' }] } };
    const f = render({ Mode: 'edit', PartTypes: [WEB_PAGE_TYPE], Panel: page, DashboardProperties: PROPERTIES });
    await settle(f);
    await settle(f);
    expect(Text(f, '.part-dialog__input--broken')).toContain('"OldName" is mapped but is not an input of this part');
    const saved = Capture<DashboardPartDialogResult>(f.componentInstance.Saved);

    Click(f, '.mj-dialog-actions button');
    await settle(f);
    expect(saved).toHaveLength(0);
    expect(Text(f, '.part-dialog__error')).toContain('Input "OldName" is not one the part declares.');

    Click(f, '.part-dialog__input--broken button');
    await settle(f);
    Click(f, '.mj-dialog-actions button');
    expect(saved[0].Config['inputMappings']).toEqual([{ Input: 'Chapter', Property: 'Chapter' }]);
  });
});

import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { SharedService } from '@memberjunction/ng-shared';
import { EntitySelectorDialogComponent, EntitySelectorConfig } from './entity-selector-dialog.component';

/**
 * DOM coverage for <mj-entity-selector-dialog> — a data-bound picker that loads its list through
 * `RunView.FromMetadataProvider(this.ProviderToUse)` (so a `createFakeProvider` passed via the
 * `Provider` input feeds it canned rows — no backend). Covers: the loading→list flip, the
 * config-driven title, one `.entity-item` per row + its display/description/status fields, the
 * empty state, selection (`.selected` + Select-button enablement), and the DialogClosed emissions
 * for Cancel / Create New / Select.
 *
 * SharedService is injected but unused on the tested paths; a bare stub satisfies DI.
 *
 * ngOnInit's async `loadEntities()` flips `isLoading` off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

const CONFIG: EntitySelectorConfig = {
  entityName: 'AI Prompts',
  title: 'Pick a Prompt',
  displayField: 'Name',
  descriptionField: 'Description',
  statusField: 'Status',
  icon: 'fa-solid fa-comment',
};

const ROWS = [
  { ID: 'a1', Name: 'Alpha Prompt', Description: 'first prompt', Status: 'Active' },
  { ID: 'b2', Name: 'Beta Prompt', Description: 'second prompt', Status: 'Disabled' },
];

interface RenderOpts {
  config?: EntitySelectorConfig;
  rows?: Array<Record<string, unknown>>;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<EntitySelectorDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [FormsModule, MJButtonDirective, MJEmptyStateComponent],
    declarations: [EntitySelectorDialogComponent],
    providers: [{ provide: SharedService, useValue: {} }],
  });
  const fixture = TestBed.createComponent(EntitySelectorDialogComponent);
  const ref = fixture.componentRef;
  ref.setInput('config', opts.config ?? CONFIG);
  ref.setInput('Provider', createFakeProvider({ runViewResults: opts.rows ?? ROWS }));
  fixture.detectChanges(false); // renders the loading state; ngOnInit kicks off async loadEntities()
  await new Promise((r) => setTimeout(r, 0)); // let loadEntities() settle (isLoading -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<EntitySelectorDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<EntitySelectorDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('EntitySelectorDialogComponent (DOM)', () => {
  it('renders the config-driven title and one entity-item per loaded row', async () => {
    const fixture = await render();
    expect(query(fixture, '.dialog-header h3')?.textContent).toContain('Pick a Prompt');
    const items = queryAll(fixture, '.entity-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Alpha Prompt');
    expect(items[0].textContent).toContain('first prompt');
  });

  it('renders the status badge from the configured status field', async () => {
    const fixture = await render();
    const badges = queryAll(fixture, '.status-badge').map((b) => b.textContent?.trim());
    expect(badges).toContain('Active');
    expect(badges).toContain('Disabled');
  });

  it('shows the empty state when no rows load', async () => {
    const fixture = await render({ rows: [] });
    expect(queryAll(fixture, '.entity-item').length).toBe(0);
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('disables the Select button until an entity is selected, then enables it', async () => {
    const fixture = await render();
    expect(buttonByText(fixture, 'Select').disabled).toBe(true);
    (queryAll(fixture, '.entity-item')[0] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(buttonByText(fixture, 'Select').disabled).toBe(false);
    expect(queryAll(fixture, '.entity-item')[0].classList.contains('selected')).toBe(true);
  });

  it('emits the selected entity on Select', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.DialogClosed);
    (queryAll(fixture, '.entity-item')[1] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    buttonByText(fixture, 'Select').click();
    expect(closed.length).toBe(1);
    expect((closed[0] as { entity: { ID: string } }).entity.ID).toBe('b2');
  });

  it('emits null on Cancel', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.DialogClosed);
    buttonByText(fixture, 'Cancel').click();
    expect(closed).toEqual([null]);
  });

  it('emits { createNew: true } on Create New', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.DialogClosed);
    buttonByText(fixture, 'Create New').click();
    expect(closed).toEqual([{ createNew: true }]);
  });
});

import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { TemplateSelectorDialogComponent, TemplateSelectorConfig } from './template-selector-dialog.component';

/**
 * DOM coverage for <mj-template-selector-dialog> — a standalone data-bound picker that loads
 * templates + categories through `RunView.FromMetadataProvider(this.ProviderToUse)`. A
 * `createFakeProvider` passed via the `Provider` input feeds it canned rows (server-side filtering
 * is mocked away, so whatever rows are supplied render). Covers: the config-driven title, the
 * loading→list flip, one `.template-item` per row + its name/description/status text, the empty
 * state (`@empty`), single-select (`.selected` + Select-button enablement), the Create-New gating,
 * and the `DialogClose` emissions for Cancel / Create New / Select (Select also pushes a result).
 *
 * standalone:true → imported via `imports:[C]`. `config` is a plain instance property.
 * MJNotificationService.Instance is touched only in error/warning paths we don't exercise.
 *
 * ngOnInit's async loadData() flips isLoading$ off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

const ROWS = [
  { ID: 't1', Name: 'Welcome Template', Description: 'greets the user', IsActive: true },
  { ID: 't2', Name: 'Farewell Template', Description: 'says goodbye', IsActive: true },
];

interface RenderOpts {
  config?: TemplateSelectorConfig;
  rows?: Array<Record<string, unknown>>;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<TemplateSelectorDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [TemplateSelectorDialogComponent],
  });
  const fixture = TestBed.createComponent(TemplateSelectorDialogComponent);
  fixture.componentInstance.config = opts.config ?? { title: 'Pick a Template' };
  // loadData() issues two independent RunView calls (templates, then categories). The fake provider
  // returns the same canned set for each; only the template rows drive the visible list assertions.
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: opts.rows ?? ROWS }));
  fixture.detectChanges(false); // renders loading; ngOnInit kicks off async loadData()
  await new Promise((r) => setTimeout(r, 0)); // let loadData() settle (isLoading$ -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<TemplateSelectorDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<TemplateSelectorDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('TemplateSelectorDialogComponent (DOM)', () => {
  it('renders the config-driven title and one template-item per loaded row', async () => {
    const fixture = await render();
    expect(query(fixture, '.dialog-header h3')?.textContent).toContain('Pick a Template');
    const items = queryAll(fixture, '.template-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Welcome Template');
    expect(items[0].textContent).toContain('greets the user');
  });

  it('renders the derived Active status text for active templates', async () => {
    const fixture = await render();
    const badges = queryAll(fixture, '.status-badge').map((b) => b.textContent?.trim());
    expect(badges).toContain('Active');
  });

  it('shows the @empty no-templates block when no rows load', async () => {
    const fixture = await render({ rows: [] });
    expect(queryAll(fixture, '.template-item').length).toBe(0);
    expect(query(fixture, '.no-templates')?.textContent).toContain('No templates found');
  });

  it('disables Select until a template is selected, then enables it and marks the item', async () => {
    const fixture = await render();
    expect(buttonByText(fixture, 'Select').disabled).toBe(true);
    (queryAll(fixture, '.template-item')[0] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(buttonByText(fixture, 'Select').disabled).toBe(false);
    expect(queryAll(fixture, '.template-item')[0].classList.contains('selected')).toBe(true);
  });

  it('emits DialogClose and pushes a result on Select', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.DialogClose);
    const results: Array<unknown> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    (queryAll(fixture, '.template-item')[1] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    buttonByText(fixture, 'Select').click();
    expect(closed.length).toBe(1);
    expect((results[0] as { selectedTemplates: Array<{ ID: string }> }).selectedTemplates[0].ID).toBe('t2');
  });

  it('emits DialogClose and a null result on Cancel', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.DialogClose);
    const results: Array<unknown> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    buttonByText(fixture, 'Cancel').click();
    expect(closed.length).toBe(1);
    expect(results).toEqual([null]);
  });

  it('renders Create New when config.showCreateNew is true', async () => {
    const shown = await render({ config: { title: 'Pick', showCreateNew: true } });
    expect(buttons(shown).some((b) => b.textContent?.includes('Create New'))).toBe(true);
  });

  it('hides Create New when config.showCreateNew is false', async () => {
    const hidden = await render({ config: { title: 'Pick', showCreateNew: false } });
    expect(buttons(hidden).some((b) => b.textContent?.includes('Create New'))).toBe(false);
  });
});

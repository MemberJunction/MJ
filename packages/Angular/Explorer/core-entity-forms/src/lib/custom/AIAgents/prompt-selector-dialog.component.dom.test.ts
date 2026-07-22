import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MJButtonDirective, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { PromptSelectorDialogComponent, PromptSelectorConfig } from './prompt-selector-dialog.component';

/**
 * DOM coverage for <mj-prompt-selector-dialog> — a data-bound picker that loads its list through
 * `RunView.FromMetadataProvider(this.ProviderToUse)` (so a `createFakeProvider` passed via the
 * `Provider` input feeds it canned rows — no backend). Covers: the loading→list flip, one
 * `.prompt-card` per loaded row + its name/description/status, the empty state, single-select
 * (`.selected` + Select-button enablement), the Create-New gating, and the `DialogClose` emissions
 * for Cancel / Create New / Select (Select also pushes onto the `result` Subject).
 *
 * `config` is a plain instance property (not an @Input), so it is assigned on the componentInstance
 * before the first detectChanges. MJNotificationService.Instance is touched only inside error /
 * warning handlers we don't exercise, so no DI stub is required for the tested paths.
 *
 * ngOnInit's async loadPrompts() flips isLoading$ off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

const ROWS = [
  { ID: 'a1', Name: 'Alpha Prompt', Description: 'first prompt', Status: 'Active' },
  { ID: 'b2', Name: 'Beta Prompt', Description: 'second prompt', Status: 'Active' },
];

interface RenderOpts {
  config?: PromptSelectorConfig;
  rows?: Array<Record<string, unknown>>;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<PromptSelectorDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [CommonModule, ReactiveFormsModule, MJButtonDirective, MJEmptyStateComponent],
    declarations: [PromptSelectorDialogComponent],
  });
  const fixture = TestBed.createComponent(PromptSelectorDialogComponent);
  fixture.componentInstance.config = opts.config ?? { title: 'Pick a Prompt' };
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: opts.rows ?? ROWS }));
  fixture.detectChanges(false); // renders loading; ngOnInit kicks off async loadPrompts()
  await new Promise((r) => setTimeout(r, 0)); // let loadPrompts() settle (isLoading$ -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<PromptSelectorDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<PromptSelectorDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('PromptSelectorDialogComponent (DOM)', () => {
  it('renders one prompt-card per loaded row, with name/description/status', async () => {
    const fixture = await render();
    const cards = queryAll(fixture, '.prompt-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Alpha Prompt');
    expect(cards[0].textContent).toContain('first prompt');
    const badges = queryAll(fixture, '.status-badge').map((b) => b.textContent?.trim());
    expect(badges).toContain('Active');
  });

  it('shows the results summary count', async () => {
    const fixture = await render();
    expect(query(fixture, '.results-count')?.textContent).toContain('2 prompt(s)');
  });

  it('shows the empty state when no rows load', async () => {
    const fixture = await render({ rows: [] });
    expect(queryAll(fixture, '.prompt-card').length).toBe(0);
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('disables Select until a prompt is selected, then enables it and marks the card', async () => {
    const fixture = await render();
    expect(buttonByText(fixture, 'Select Prompt').disabled).toBe(true);
    (queryAll(fixture, '.prompt-card')[0] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(buttonByText(fixture, 'Select Prompt').disabled).toBe(false);
    expect(queryAll(fixture, '.prompt-card')[0].classList.contains('selected')).toBe(true);
  });

  it('emits DialogClose and pushes a result on Select', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.DialogClose);
    const results: Array<unknown> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    (queryAll(fixture, '.prompt-card')[1] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    buttonByText(fixture, 'Select Prompt').click();
    expect(closed.length).toBe(1);
    expect((results[0] as { selectedPrompts: Array<{ ID: string }> }).selectedPrompts[0].ID).toBe('b2');
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

  it('only renders Create New when config.showCreateNew is set', async () => {
    const hidden = await render({ config: { title: 'Pick', showCreateNew: false } });
    expect(buttons(hidden).some((b) => b.textContent?.includes('Create New'))).toBe(false);
  });

  it('emits a createNew result when Create New is clicked', async () => {
    const fixture = await render({ config: { title: 'Pick', showCreateNew: true } });
    const closed = capture(fixture.componentInstance.DialogClose);
    const results: Array<unknown> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    buttonByText(fixture, 'Create New').click();
    expect(closed.length).toBe(1);
    expect((results[0] as { createNew: boolean }).createNew).toBe(true);
  });
});

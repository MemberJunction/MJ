import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MJButtonDirective, MJEmptyStateComponent, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { SubAgentSelectorDialogComponent, SubAgentSelectorConfig } from './sub-agent-selector-dialog.component';

/**
 * DOM coverage for <mj-sub-agent-selector-dialog> — a data-bound picker that batch-loads eligible
 * root agents + agent types through `RunView.FromMetadataProvider(this.ProviderToUse).RunViews([...])`.
 * The fake provider keys off `EntityName` so each of the two batch entries gets the right canned set;
 * agent rows carry `GetAll() { return this; }` because the component maps them via `agent.GetAll()`.
 * Covers: the config-driven title, the loading→grid flip, one `.agent-card` per loaded agent + its
 * name/description/status, the header count, single-select toggle (`.selected` + Add-button
 * enablement), the empty state, the Create-New gating, and the `DialogClose` emissions for
 * Cancel / Create New / Add (each pushes onto the `result` Subject).
 *
 * `config` is a plain instance property (no @Input). No static-singleton data dependency —
 * everything renders from the `Provider` input.
 *
 * initializeData()'s async RunViews flips isLoading$ off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

const AGENTS = [
  { ID: 'ag1', Name: 'Research Agent', Description: 'does research', Status: 'Active', Type: 'Loop', TypeID: 'tp1', ExecutionMode: 'Sequential', IconClass: '', LogoURL: null, GetAll() { return this; } },
  { ID: 'ag2', Name: 'Writer Agent', Description: 'writes copy', Status: 'Active', Type: 'Flow', TypeID: 'tp2', ExecutionMode: 'Sequential', IconClass: '', LogoURL: null, GetAll() { return this; } },
];
const TYPES = [
  { ID: 'tp1', Name: 'Loop', IsActive: true },
  { ID: 'tp2', Name: 'Flow', IsActive: true },
];

const CONFIG: SubAgentSelectorConfig = {
  title: 'Pick a Sub-Agent',
  multiSelect: false,
  selectedAgentIds: [],
  showCreateNew: false,
  parentAgentId: 'parent-1',
};

interface RenderOpts {
  config?: Partial<SubAgentSelectorConfig>;
  agents?: Array<Record<string, unknown>>;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<SubAgentSelectorDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [CommonModule, ReactiveFormsModule, FormsModule, MJButtonDirective, MJEmptyStateComponent, MJDropdownComponent],
    declarations: [SubAgentSelectorDialogComponent],
  });
  const fixture = TestBed.createComponent(SubAgentSelectorDialogComponent);
  fixture.componentInstance.config = { ...CONFIG, ...opts.config };
  const agents = opts.agents ?? AGENTS;
  // RunViews comes back ordered [agents, types]; the fake keys off EntityName so each entry resolves.
  fixture.componentRef.setInput(
    'Provider',
    createFakeProvider({ runViewResults: (params) => (params.EntityName === 'MJ: AI Agents' ? agents : TYPES) }),
  );
  fixture.detectChanges(false); // renders loading; ngOnInit kicks off async initializeData()
  await new Promise((r) => setTimeout(r, 0)); // let RunViews settle (isLoading$ -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<SubAgentSelectorDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<SubAgentSelectorDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('SubAgentSelectorDialogComponent (DOM)', () => {
  it('renders the config-driven title and one agent-card per loaded agent', async () => {
    const fixture = await render();
    expect(query(fixture, '.dialog-header h3')?.textContent).toContain('Pick a Sub-Agent');
    const cards = queryAll(fixture, '.agent-card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('Research Agent');
    expect(cards[0].textContent).toContain('does research');
  });

  it('renders the status badge and the header count', async () => {
    const fixture = await render();
    const badges = queryAll(fixture, '.status-badge').map((b) => b.textContent?.trim());
    expect(badges).toContain('Active');
    expect(query(fixture, '.total-count')?.textContent).toContain('2 of 2 agents');
  });

  it('shows the empty state when no agents load', async () => {
    const fixture = await render({ agents: [] });
    expect(queryAll(fixture, '.agent-card').length).toBe(0);
    expect(query(fixture, 'mj-empty-state')).not.toBeNull();
  });

  it('disables Add until an agent is selected, then enables it and marks the card', async () => {
    const fixture = await render();
    expect(buttonByText(fixture, 'Add Sub-Agent').disabled).toBe(true);
    (queryAll(fixture, '.agent-card')[0] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(buttonByText(fixture, 'Add Sub-Agent').disabled).toBe(false);
    expect(queryAll(fixture, '.agent-card')[0].classList.contains('selected')).toBe(true);
  });

  it('emits DialogClose and pushes the selected agent on Add', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.DialogClose);
    const results: Array<unknown> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    (queryAll(fixture, '.agent-card')[1] as HTMLElement).click();
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    buttonByText(fixture, 'Add Sub-Agent').click();
    expect(closed.length).toBe(1);
    const payload = results[0] as { selectedAgents: Array<{ ID: string }>; createNew: boolean };
    expect(payload.createNew).toBe(false);
    expect(payload.selectedAgents[0].ID).toBe('ag2');
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

  it('hides Create Sub-Agent unless config.showCreateNew is set', async () => {
    const fixture = await render({ config: { showCreateNew: false } });
    expect(buttons(fixture).some((b) => b.textContent?.includes('Create Sub-Agent'))).toBe(false);
  });

  it('emits a createNew result when Create Sub-Agent is clicked', async () => {
    const fixture = await render({ config: { showCreateNew: true } });
    const closed = capture(fixture.componentInstance.DialogClose);
    const results: Array<unknown> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    buttonByText(fixture, 'Create Sub-Agent').click();
    expect(closed.length).toBe(1);
    expect((results[0] as { createNew: boolean }).createNew).toBe(true);
  });
});

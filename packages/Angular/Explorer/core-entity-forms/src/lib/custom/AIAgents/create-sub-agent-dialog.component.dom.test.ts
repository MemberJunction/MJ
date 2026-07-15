import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { IMetadataProvider } from '@memberjunction/core';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { CreateSubAgentDialogComponent, CreateSubAgentConfig } from './create-sub-agent-dialog.component';
import { AIAgentManagementService } from './ai-agent-management.service';

/**
 * DOM coverage for <mj-create-sub-agent-dialog> — a data-bound form that loads its agent-type
 * dropdown through `RunView.FromMetadataProvider(this.ProviderToUse).RunViews([...])` and then
 * builds a working sub-agent entity via `provider.GetEntityObject('MJ: AI Agents')`. We pass a
 * `createFakeProvider` (via the `Provider` input) augmented with a lightweight `GetEntityObject`
 * so `loadInitialData()` runs its happy path — never hitting the `MJNotificationService.Instance`
 * error branch. `AIAgentManagementService` is stubbed (only used inside Add-Prompt/Add-Action
 * handlers we don't exercise). Covers: the loading→form flip, the title from config, the parent-info
 * line, the agent-type `<option>`s from the loaded rows, the empty states for the prompts + actions
 * sections, and the `result` + `DialogClose` emissions on Cancel and Save.
 *
 * ngOnInit's async `loadInitialData()` flips `isLoading$` off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

const AGENT_TYPES = [
  { ID: 't-standard', Name: 'Standard' },
  { ID: 't-loop', Name: 'Loop' },
];

/** Minimal entity double: NewRecord/Set no-ops + a settable field bag so update paths never throw. */
function makeEntityStub(): Record<string, unknown> {
  const bag: Record<string, unknown> = {
    ID: 'new-subagent-id',
    NewRecord: () => true,
    Set: () => undefined,
    Get: () => undefined,
  };
  return bag;
}

/** Fake provider that answers RunViews AND GetEntityObject('MJ: AI Agents'). */
function fakeProviderWithEntity(): IMetadataProvider {
  const base = createFakeProvider({
    runViewResults: (params) => (params.EntityName === 'MJ: AI Agent Types' ? AGENT_TYPES : []),
  }) as unknown as Record<string, unknown>;
  base['GetEntityObject'] = async () => makeEntityStub();
  return base as unknown as IMetadataProvider;
}

const CONFIG: CreateSubAgentConfig = {
  title: 'Create a Helper',
  parentAgentId: 'parent-1',
  parentAgentName: 'Coordinator Agent',
};

async function render(config: CreateSubAgentConfig = CONFIG): Promise<ComponentFixture<CreateSubAgentDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule, MJEmptyStateComponent],
    declarations: [CreateSubAgentDialogComponent],
    providers: [{ provide: AIAgentManagementService, useValue: {} }],
  });
  const fixture = TestBed.createComponent(CreateSubAgentDialogComponent);
  const inst = fixture.componentInstance;
  inst.Provider = fakeProviderWithEntity();
  inst.config = config;
  fixture.detectChanges(false); // renders loading; ngOnInit kicks off async loadInitialData()
  await new Promise((r) => setTimeout(r, 0)); // let RunViews + GetEntityObject settle (isLoading -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<CreateSubAgentDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<CreateSubAgentDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('CreateSubAgentDialogComponent (DOM)', () => {
  it('renders the config title and parent-agent info line', async () => {
    const fixture = await render();
    expect(query(fixture, '.dialog-title')?.textContent).toContain('Create a Helper');
    expect(query(fixture, '.parent-info')?.textContent).toContain('Coordinator Agent');
  });

  it('renders the form (not the loading state) after data loads', async () => {
    const fixture = await render();
    expect(query(fixture, '.loading-container')).toBeNull();
    expect(query(fixture, 'form.sub-agent-form')).not.toBeNull();
  });

  it('renders an <option> per loaded agent type in the Type dropdown', async () => {
    const fixture = await render();
    const typeSelect = query<HTMLSelectElement>(fixture, 'select#typeID')!;
    const optionText = Array.from(typeSelect.options).map((o) => o.textContent?.trim());
    expect(optionText).toContain('Standard');
    expect(optionText).toContain('Loop');
  });

  it('shows the empty states for prompts and actions when none are linked', async () => {
    const fixture = await render();
    const emptyStates = queryAll(fixture, 'mj-empty-state');
    expect(emptyStates.length).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('No prompts added yet');
    expect(fixture.nativeElement.textContent).toContain('No actions added yet');
  });

  it('emits null via result and fires DialogClose on Cancel', async () => {
    const fixture = await render();
    const results = capture(fixture.componentInstance.result);
    const closed = capture(fixture.componentInstance.DialogClose);
    buttonByText(fixture, 'Cancel').click();
    expect(results).toEqual([null]);
    expect(closed.length).toBe(1);
  });

  it('emits a result with the sub-agent entity and fires DialogClose on Save (valid form)', async () => {
    const fixture = await render();
    // Fill the required fields (name + typeID) so the form is valid.
    fixture.componentInstance.subAgentForm.patchValue({ name: 'My Helper', typeID: 't-standard' });
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    const results = capture(fixture.componentInstance.result);
    const closed = capture(fixture.componentInstance.DialogClose);
    buttonByText(fixture, 'Create Sub-Agent').click();
    expect(results.length).toBe(1);
    expect(results[0]).not.toBeNull();
    expect((results[0] as { subAgent: { ID: string } }).subAgent.ID).toBe('new-subagent-id');
    expect(closed.length).toBe(1);
  });
});

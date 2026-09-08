import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider, StubDropdownComponent, StubNumericInputComponent } from '@memberjunction/ng-test-utils';
import type { MJAIAgentPromptEntity } from '@memberjunction/core-entities';
import {
  AgentPromptAdvancedSettingsDialogComponent,
  AgentPromptAdvancedSettingsFormData,
} from './agent-prompt-advanced-settings-dialog.component';

/**
 * DOM coverage for <mj-agent-prompt-advanced-settings-dialog> — a reactive-form dialog that echoes an
 * injected `agentPrompt` model object into form controls and emits `AgentPromptAdvancedSettingsFormData`
 * (via the public `result` Subject) plus a `DialogClose` event on Save / Cancel.
 *
 * The component loads its AI-Configurations dropdown through `RunView.FromMetadataProvider(this.ProviderToUse)`,
 * so a `createFakeProvider` on the `Provider` input feeds it canned rows — no backend. `isLoading$` flips
 * true→false across that async load, gating the form behind the loading state, so every render does
 * detectChanges(false) → macrotask → markForCheck → detectChanges(false) (zoneless).
 *
 * The MJ form controls (mj-dropdown, mj-numeric-input) are replaced with lightweight CVA stubs so
 * formControlName binds cleanly without pulling the heavy real components. MJButtonDirective is the real one.
 */

// --- Lightweight ControlValueAccessor stubs for the MJ form controls -------------------------------

// A partial MJAIAgentPromptEntity — the dialog only reads these fields off the model.
function makePrompt(overrides: Partial<MJAIAgentPromptEntity> = {}): MJAIAgentPromptEntity {
  return {
    ID: 'prompt-1',
    ExecutionOrder: 7,
    Purpose: 'Summarize',
    ConfigurationID: null,
    ContextBehavior: 'Complete',
    ContextMessageCount: null,
    Status: 'Active',
    ...overrides,
  } as unknown as MJAIAgentPromptEntity;
}

const CONFIG_ROWS = [
  { ID: 'cfg-1', Name: 'Config One', Status: 'Active' },
  { ID: 'cfg-2', Name: 'Config Two', Status: 'Active' },
];

interface RenderOpts {
  prompt?: MJAIAgentPromptEntity;
  allPrompts?: MJAIAgentPromptEntity[];
  configRows?: Array<Record<string, unknown>>;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<AgentPromptAdvancedSettingsDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [CommonModule, FormsModule, ReactiveFormsModule, MJButtonDirective, StubNumericInputComponent, StubDropdownComponent],
    declarations: [AgentPromptAdvancedSettingsDialogComponent],
  });
  const fixture = TestBed.createComponent(AgentPromptAdvancedSettingsDialogComponent);
  const inst = fixture.componentInstance;
  inst.agentPrompt = opts.prompt ?? makePrompt();
  inst.allAgentPrompts = opts.allPrompts ?? [];
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: opts.configRows ?? CONFIG_ROWS }));
  fixture.detectChanges(false); // ngOnInit → initializeForm + loadDropdownData (async)
  await new Promise((r) => setTimeout(r, 0)); // let loadDropdownData settle (isLoading$ -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<AgentPromptAdvancedSettingsDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<AgentPromptAdvancedSettingsDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('AgentPromptAdvancedSettingsDialogComponent (DOM)', () => {
  it('renders the form (not the loading state) after dropdown data loads', async () => {
    const fixture = await render();
    expect(query(fixture, '.loading-state')).toBeNull();
    expect(query(fixture, 'form.advanced-form')).not.toBeNull();
    // Three sections: Execution Configuration, Context Behavior, AI Configuration Override
    expect(queryAll(fixture, '.form-section').length).toBe(3);
  });

  it('echoes the injected agentPrompt model into the form controls', async () => {
    const fixture = await render({ prompt: makePrompt({ ExecutionOrder: 42, Purpose: 'InitStep', Status: 'Preview' }) });
    const form = fixture.componentInstance.advancedForm;
    expect(form.get('executionOrder')?.value).toBe(42);
    expect(form.get('purpose')?.value).toBe('InitStep');
    expect(form.get('status')?.value).toBe('Preview');
    // The Purpose text input is a native input and should carry the model value in the DOM.
    const purposeInput = query(fixture, 'input[formControlName="purpose"]') as HTMLInputElement;
    expect(purposeInput.value).toBe('InitStep');
  });

  it('hides the conditional Message Count field until a message-count behavior is selected', async () => {
    const fixture = await render({ prompt: makePrompt({ ContextBehavior: 'Complete' }) });
    expect(fixture.componentInstance.requiresMessageCount()).toBe(false);
    expect(queryAll(fixture, 'mj-numeric-input').length).toBe(1); // only Execution Order

    // Flip context behavior to RecentMessages via the reactive control (drives requiresMessageCount()).
    fixture.componentInstance.advancedForm.get('contextBehavior')?.setValue('RecentMessages');
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.requiresMessageCount()).toBe(true);
    expect(queryAll(fixture, 'mj-numeric-input').length).toBe(2); // Execution Order + Message Count
  });

  it('shows an execution-order conflict error and disables Save', async () => {
    const conflicting = makePrompt({ ID: 'other', ExecutionOrder: 99 });
    const fixture = await render({
      prompt: makePrompt({ ID: 'prompt-1', ExecutionOrder: 7 }),
      allPrompts: [conflicting],
    });
    // Setting the order to a value already used by another prompt triggers the conflict validator.
    fixture.componentInstance.advancedForm.get('executionOrder')?.setValue(99);
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.hasExecutionOrderError()).toBe(true);
    const errText = queryAll(fixture, '.field-error').map((e) => e.textContent).join(' ');
    expect(errText).toContain('already used by another prompt');
    expect(buttonByText(fixture, 'Save Settings').disabled).toBe(true);
  });

  it('emits form data on Save and fires DialogClose', async () => {
    const fixture = await render({ prompt: makePrompt({ ExecutionOrder: 3, Purpose: 'Go', Status: 'Active' }) });
    const emitted: Array<AgentPromptAdvancedSettingsFormData | null> = [];
    fixture.componentInstance.result.subscribe((v) => emitted.push(v));
    const closed = capture(fixture.componentInstance.DialogClose);

    buttonByText(fixture, 'Save Settings').click();

    expect(closed.length).toBe(1);
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toMatchObject({ executionOrder: 3, purpose: 'Go', status: 'Active', contextBehavior: 'Complete' });
  });

  it('emits null on Cancel and fires DialogClose', async () => {
    const fixture = await render();
    const emitted: Array<AgentPromptAdvancedSettingsFormData | null> = [];
    fixture.componentInstance.result.subscribe((v) => emitted.push(v));
    const closed = capture(fixture.componentInstance.DialogClose);

    buttonByText(fixture, 'Cancel').click();

    expect(closed.length).toBe(1);
    expect(emitted).toEqual([null]);
  });
});

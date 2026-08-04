import { describe, it, expect } from 'vitest';
import { Component, forwardRef, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import {
  SubAgentAdvancedSettingsDialogComponent,
  SubAgentAdvancedSettingsFormData,
} from './sub-agent-advanced-settings-dialog.component';

/**
 * DOM coverage for <mj-sub-agent-advanced-settings-dialog> — a reactive-form dialog that echoes an injected
 * `subAgent` model into form controls and emits `SubAgentAdvancedSettingsFormData` (via the public `result`
 * Subject) + a `DialogClose` event on Save / Cancel. The "Expose As Action" checkbox is always disabled
 * (sub-agents can never be exposed as actions) and Save always emits `exposeAsAction: false`.
 *
 * The AgentTypes dropdown loads through `RunView.FromMetadataProvider(this.ProviderToUse)`, so a
 * `createFakeProvider` on the `Provider` input feeds canned rows — no backend. `isLoading$` flips true→false
 * across that async load, gating the form; so every render does detectChanges(false) → macrotask →
 * markForCheck → detectChanges(false) (zoneless). MJ form controls are lightweight CVA stubs;
 * MJButtonDirective is the real one.
 */

@Component({
  standalone: true,
  selector: 'mj-numeric-input',
  template: `<input type="number" class="mj-numeric-input" [value]="value ?? ''" (input)="onInput($event)" />`,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StubNumericInput), multi: true }],
})
class StubNumericInput implements ControlValueAccessor {
  @Input() Min = 0;
  @Input() Format = '0';
  value: number | null = null;
  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};
  writeValue(v: number | null): void { this.value = v; }
  registerOnChange(fn: (v: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  onInput(e: Event): void {
    const v = (e.target as HTMLInputElement).value;
    this.value = v === '' ? null : Number(v);
    this.onChange(this.value);
    this.onTouched();
  }
}

@Component({
  standalone: true,
  selector: 'mj-dropdown',
  template: `<select class="mj-dropdown" (change)="onSelect($event)"></select>`,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => StubDropdown), multi: true }],
})
class StubDropdown implements ControlValueAccessor {
  @Input() Data: unknown;
  @Input() TextField = '';
  @Input() ValueField = '';
  @Input() ValuePrimitive = true;
  @Input() DefaultItem: unknown;
  value: unknown;
  private onChange: (v: unknown) => void = () => {};
  private onTouched: () => void = () => {};
  writeValue(v: unknown): void { this.value = v; }
  registerOnChange(fn: (v: unknown) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  onSelect(e: Event): void {
    this.value = (e.target as HTMLSelectElement).value;
    this.onChange(this.value);
    this.onTouched();
  }
}

// A partial MJAIAgentEntityExtended — the dialog only reads these fields off the model.
function makeSubAgent(overrides: Partial<MJAIAgentEntityExtended> = {}): MJAIAgentEntityExtended {
  return {
    ID: 'sub-1',
    ParentID: 'parent-1',
    Name: 'Sub Agent One',
    ExecutionOrder: 2,
    ExecutionMode: 'Sequential',
    Status: 'Active',
    TypeID: null,
    ExposeAsAction: false,
    ...overrides,
  } as unknown as MJAIAgentEntityExtended;
}

const TYPE_ROWS = [
  { ID: 'type-1', Name: 'Loop Agent', IsActive: true },
  { ID: 'type-2', Name: 'Flow Agent', IsActive: true },
];

interface RenderOpts {
  subAgent?: MJAIAgentEntityExtended;
  allSubAgents?: MJAIAgentEntityExtended[];
  typeRows?: Array<Record<string, unknown>>;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<SubAgentAdvancedSettingsDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [CommonModule, FormsModule, ReactiveFormsModule, MJButtonDirective, StubNumericInput, StubDropdown],
    declarations: [SubAgentAdvancedSettingsDialogComponent],
  });
  const fixture = TestBed.createComponent(SubAgentAdvancedSettingsDialogComponent);
  const inst = fixture.componentInstance;
  inst.subAgent = opts.subAgent ?? makeSubAgent();
  inst.allSubAgents = opts.allSubAgents ?? [];
  fixture.componentRef.setInput('Provider', createFakeProvider({ runViewResults: opts.typeRows ?? TYPE_ROWS }));
  fixture.detectChanges(false); // ngOnInit → initializeForm + loadDropdownData (async)
  await new Promise((r) => setTimeout(r, 0)); // let loadDropdownData settle (isLoading$ -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<SubAgentAdvancedSettingsDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<SubAgentAdvancedSettingsDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('SubAgentAdvancedSettingsDialogComponent (DOM)', () => {
  it('renders the form (not the loading state) after dropdown data loads', async () => {
    const fixture = await render();
    expect(query(fixture, '.loading-state')).toBeNull();
    expect(query(fixture, 'form.advanced-form')).not.toBeNull();
    // Three sections: Execution Configuration, Agent Configuration, Capability Restrictions
    expect(queryAll(fixture, '.form-section').length).toBe(3);
  });

  it('echoes the injected subAgent model into the form controls', async () => {
    const fixture = await render({
      subAgent: makeSubAgent({ ExecutionOrder: 5, ExecutionMode: 'Parallel', Status: 'Disabled', TypeID: 'type-2' }),
    });
    const form = fixture.componentInstance.advancedForm;
    expect(form.get('executionOrder')?.value).toBe(5);
    expect(form.get('executionMode')?.value).toBe('Parallel');
    expect(form.get('status')?.value).toBe('Disabled');
    expect(form.get('typeID')?.value).toBe('type-2');
  });

  it('renders the Expose-As-Action checkbox inside the disabled-styled label', async () => {
    const fixture = await render();
    const checkbox = query(fixture, 'input[type="checkbox"][formControlName="exposeAsAction"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    // The checkbox lives in a label the template flags as visually disabled, and the section explains
    // sub-agents can never be exposed as actions.
    const label = query(fixture, 'label.checkbox-label') as HTMLElement;
    expect(label.classList.contains('disabled')).toBe(true);
    const hint = query(fixture, '.disabled-hint') as HTMLElement;
    expect(hint.textContent).toContain('Sub-agents cannot be exposed as actions');
  });

  it('shows an execution-order conflict error (naming the conflicting sibling) and disables Save', async () => {
    const sibling = makeSubAgent({ ID: 'sib', Name: 'Sibling Agent', ParentID: 'parent-1', ExecutionOrder: 9 });
    const fixture = await render({
      subAgent: makeSubAgent({ ID: 'sub-1', ParentID: 'parent-1', ExecutionOrder: 2 }),
      allSubAgents: [sibling],
    });
    fixture.componentInstance.advancedForm.get('executionOrder')?.setValue(9);
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(fixture.componentInstance.hasExecutionOrderError()).toBe(true);
    const errText = queryAll(fixture, '.field-error').map((e) => e.textContent).join(' ');
    expect(errText).toContain('Sibling Agent');
    expect(buttonByText(fixture, 'Save Settings').disabled).toBe(true);
  });

  it('emits form data on Save (exposeAsAction forced false) and fires DialogClose', async () => {
    const fixture = await render({
      subAgent: makeSubAgent({ ExecutionOrder: 4, ExecutionMode: 'Sequential', Status: 'Active', TypeID: 'type-1' }),
    });
    const emitted: Array<SubAgentAdvancedSettingsFormData | null> = [];
    fixture.componentInstance.result.subscribe((v) => emitted.push(v));
    const closed = capture(fixture.componentInstance.DialogClose);

    buttonByText(fixture, 'Save Settings').click();

    expect(closed.length).toBe(1);
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toMatchObject({
      executionOrder: 4,
      executionMode: 'Sequential',
      status: 'Active',
      typeID: 'type-1',
      exposeAsAction: false,
    });
  });

  it('emits null on Cancel and fires DialogClose', async () => {
    const fixture = await render();
    const emitted: Array<SubAgentAdvancedSettingsFormData | null> = [];
    fixture.componentInstance.result.subscribe((v) => emitted.push(v));
    const closed = capture(fixture.componentInstance.DialogClose);

    buttonByText(fixture, 'Cancel').click();

    expect(closed.length).toBe(1);
    expect(emitted).toEqual([null]);
  });
});

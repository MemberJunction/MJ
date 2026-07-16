import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJButtonDirective, MJAlertComponent, MJDropdownComponent, MJNumericInputComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { NewAgentDialogComponent, NewAgentConfig } from './new-agent-dialog.component';

/**
 * DOM coverage for <mj-new-agent-dialog> — a ReactiveForms dialog. It loads its model/agent-type
 * lists from the `AIEngineBase.Instance` singleton in `ngOnInit`, but that load is wrapped in a
 * try/catch that degrades gracefully (empty lists) when the singleton isn't configured in a test —
 * so the FORM still renders regardless, and we assert on the form gating / fields / emissions rather
 * than singleton-sourced list data. `NavigationService` (used only inside the Save redirect we don't
 * drive) is stubbed. Cancel closes via the `dialogRef` seam the service normally sets.
 *
 * Covers: the base form fields (name, description, system prompt, temperature slider, max-tokens,
 * streaming checkbox), the required-field validation gating the submit button, the parent-agent
 * alert shown only when `config.parentAgentId` is set, and the `dialogRef.Close({action:'cancelled'})`
 * emission on Cancel.
 *
 * ngOnInit's async `loadData()` flips `isLoading$` off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

interface Closed {
  action?: string;
}

async function render(config?: NewAgentConfig): Promise<{ fixture: ComponentFixture<NewAgentDialogComponent>; closed: Closed[] }> {
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule, MJButtonDirective, MJAlertComponent, MJDropdownComponent, MJNumericInputComponent],
    declarations: [NewAgentDialogComponent],
    providers: [{ provide: NavigationService, useValue: { OpenEntityRecord: () => undefined } }],
  });
  const fixture = TestBed.createComponent(NewAgentDialogComponent);
  const inst = fixture.componentInstance;
  if (config) {
    inst.config = config;
  }
  // Capture the dialogRef.Close calls the component makes (the service normally sets dialogRef).
  const closed: Closed[] = [];
  inst.dialogRef = { Close: (v?: Closed) => closed.push(v ?? {}) } as unknown as NewAgentDialogComponent['dialogRef'];
  fixture.detectChanges(false); // ngOnInit kicks off async loadData() (AIEngineBase singleton, degrades on failure)
  await new Promise((r) => setTimeout(r, 0)); // let loadData() settle (isLoading -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return { fixture, closed };
}

const buttons = (f: ComponentFixture<NewAgentDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<NewAgentDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('NewAgentDialogComponent (DOM)', () => {
  it('renders the core form fields', async () => {
    const { fixture } = await render();
    expect(query(fixture, 'input[formControlName="name"]')).not.toBeNull();
    expect(query(fixture, 'textarea[formControlName="description"]')).not.toBeNull();
    expect(query(fixture, 'textarea[formControlName="systemPrompt"]')).not.toBeNull();
    expect(query(fixture, 'input[formControlName="temperature"]')).not.toBeNull();
    expect(query(fixture, 'input[formControlName="enableStreaming"]')).not.toBeNull();
  });

  it('renders the Advanced Settings section with temperature + max tokens controls', async () => {
    const { fixture } = await render();
    expect(fixture.nativeElement.textContent).toContain('Advanced Settings');
    // temperature slider value mirror
    expect(query(fixture, '.slider-value')?.textContent?.trim()).toBe('0.7');
    expect(query(fixture, 'mj-numeric-input')).not.toBeNull();
  });

  it('disables Create Agent while the required name field is empty, enables it once filled', async () => {
    const { fixture } = await render();
    // Name required + modelId required; modelId is empty (no models loaded) so form stays invalid.
    expect(buttonByText(fixture, 'Create Agent').disabled).toBe(true);
    fixture.componentInstance.form.patchValue({ name: 'My Agent', modelId: 'm1' });
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(buttonByText(fixture, 'Create Agent').disabled).toBe(false);
  });

  it('does NOT show the parent-agent alert when no parentAgentId is set', async () => {
    const { fixture } = await render();
    expect(query(fixture, 'mj-alert')).toBeNull();
  });

  it('shows the parent-agent alert with the parent name when parentAgentId is set', async () => {
    const { fixture } = await render({ parentAgentId: 'p1', parentAgentName: 'Boss Agent' });
    const alert = query(fixture, 'mj-alert');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Boss Agent');
  });

  it('closes with a cancelled action when Cancel is clicked', async () => {
    const { fixture, closed } = await render();
    buttonByText(fixture, 'Cancel').click();
    expect(closed).toEqual([{ action: 'cancelled' }]);
  });
});

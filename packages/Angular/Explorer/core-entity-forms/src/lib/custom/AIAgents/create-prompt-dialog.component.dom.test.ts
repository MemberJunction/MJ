import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { IMetadataProvider } from '@memberjunction/core';
import { MJButtonDirective, MJDropdownComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { CreatePromptDialogComponent, CreatePromptConfig, CreatePromptResult } from './create-prompt-dialog.component';
import { AIPromptManagementService } from '../AIPrompts/ai-prompt-management.service';

/**
 * DOM coverage for <mj-create-prompt-dialog> — a data-bound form that loads its prompt-type
 * dropdown through `RunView.FromMetadataProvider(this.ProviderToUse)` and builds prompt + template
 * entities via `provider.GetEntityObject(...)`. We pass a `createFakeProvider` (via `Provider`)
 * augmented with a lightweight `GetEntityObject` + `CurrentUser` so `loadInitialData()` +
 * `createNewTemplate()` run their happy path — never hitting the `MJNotificationService.Instance`
 * error branch. The heavy `mj-template-editor` child (which loads its own data) is replaced by a
 * lightweight stub matching its selector/@Inputs/@Outputs. `AIPromptManagementService` is stubbed
 * (only used by the "Link Existing Template" path we don't drive). Covers: the loading→form flip,
 * the required Name field, the two template-mode radios, the created-template info panel (new mode),
 * and the `result` + `DialogClose` emissions on Cancel / Save.
 *
 * ngOnInit's async `loadInitialData()` flips `isLoading$` off after a microtask, so every render does
 * detectChanges(false) → await a macrotask → markForCheck → detectChanges(false) (zoneless).
 */

const PROMPT_TYPES = [
  { ID: 'pt-chat', Name: 'Chat' },
  { ID: 'pt-completion', Name: 'Completion' },
];

/** Minimal entity double: settable field bag + NewRecord/Set no-ops so create paths never throw. */
function makeEntityStub(name: string): Record<string, unknown> {
  return {
    ID: `${name}-id`,
    Name: name === 'template' ? 'New Prompt Template' : '',
    Description: name === 'template' ? 'Template for New Prompt' : '',
    NewRecord: () => true,
    Set: () => undefined,
    Get: () => undefined,
  };
}

function fakeProviderWithEntity(): IMetadataProvider {
  const base = createFakeProvider({
    runViewResults: (params) => (params.EntityName === 'MJ: AI Prompt Types' ? PROMPT_TYPES : []),
    currentUser: { ID: 'test-user-id' },
  }) as unknown as Record<string, unknown>;
  base['GetEntityObject'] = async (entityName: string) =>
    makeEntityStub(entityName === 'MJ: Templates' ? 'template' : 'prompt');
  return base as unknown as IMetadataProvider;
}

/** Lightweight stand-in for <mj-template-editor> — avoids its own data-loading ngOnInit. */
@Component({ standalone: true, selector: 'mj-template-editor', template: '' })
class TemplateEditorStubComponent {
  @Input() template: unknown = null;
  @Input() config: unknown = null;
  @Output() contentChange = new EventEmitter<unknown>();
  @Output() runTemplate = new EventEmitter<unknown>();
  public templateContents: unknown[] = [];
}

// `config` is a plain property the service sets AFTER construction; the form is built in the
// constructor, so `initialName` is not seeded via a post-construction assignment. Tests drive the
// form controls directly rather than relying on config seeding.
const CONFIG: CreatePromptConfig = { title: 'New Prompt' };

async function render(config: CreatePromptConfig = CONFIG): Promise<ComponentFixture<CreatePromptDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [ReactiveFormsModule, MJButtonDirective, MJDropdownComponent, TemplateEditorStubComponent],
    declarations: [CreatePromptDialogComponent],
    providers: [{ provide: AIPromptManagementService, useValue: {} }],
  });
  const fixture = TestBed.createComponent(CreatePromptDialogComponent);
  const inst = fixture.componentInstance;
  inst.Provider = fakeProviderWithEntity();
  inst.config = config;
  fixture.detectChanges(false); // renders loading; ngOnInit kicks off async loadInitialData()
  await new Promise((r) => setTimeout(r, 0)); // let RunView + GetEntityObject settle (isLoading -> false)
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

const buttons = (f: ComponentFixture<CreatePromptDialogComponent>) => queryAll(f, 'button');
const buttonByText = (f: ComponentFixture<CreatePromptDialogComponent>, t: string) =>
  buttons(f).find((b) => b.textContent?.includes(t)) as HTMLButtonElement;

describe('CreatePromptDialogComponent (DOM)', () => {
  it('renders the form (not the loading state) after data loads', async () => {
    const fixture = await render();
    expect(query(fixture, '.loading-state')).toBeNull();
    expect(query(fixture, 'form.dialog-content')).not.toBeNull();
  });

  it('renders the required Name field bound to the form control', async () => {
    const fixture = await render();
    const nameInput = query(fixture, 'input#promptName') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    // Drive the control and confirm the DOM reflects it (two-way binding via formControlName).
    fixture.componentInstance.promptForm.patchValue({ name: 'Greeting' });
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    expect(nameInput.value).toBe('Greeting');
  });

  it('renders both template-mode radio options', async () => {
    const fixture = await render();
    const radios = queryAll(fixture, 'input.radio-input') as HTMLInputElement[];
    const values = radios.map((r) => r.value);
    expect(values).toContain('new');
    expect(values).toContain('existing');
  });

  it('shows the new-template editor panel with the created template name (new mode default)', async () => {
    const fixture = await render();
    expect(query(fixture, '.template-editor-section')).not.toBeNull();
    expect(query(fixture, '.template-name')?.textContent).toContain('New Prompt Template');
    expect(query(fixture, 'mj-template-editor')).not.toBeNull();
  });

  it('emits null via result and fires DialogClose on Cancel', async () => {
    const fixture = await render();
    const results: Array<CreatePromptResult | null> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    const closed = capture(fixture.componentInstance.DialogClose);
    buttonByText(fixture, 'Cancel').click();
    expect(results).toEqual([null]);
    expect(closed.length).toBe(1);
  });

  it('emits a result with the prompt entity and fires DialogClose on Save (valid form)', async () => {
    const fixture = await render();
    fixture.componentInstance.promptForm.patchValue({ name: 'My Prompt', typeID: 'pt-chat' });
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges(false);
    const results: Array<CreatePromptResult | null> = [];
    fixture.componentInstance.result.subscribe((r) => results.push(r));
    const closed = capture(fixture.componentInstance.DialogClose);
    buttonByText(fixture, 'Create Prompt').click();
    expect(results.length).toBe(1);
    expect(results[0]).not.toBeNull();
    expect((results[0] as { prompt: { ID: string } }).prompt.ID).toBe('prompt-id');
    expect(closed.length).toBe(1);
  });
});

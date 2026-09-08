import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseEntity, TransactionGroupBase } from '@memberjunction/core';
import { renderComponentFixture, query, attr, StubEmptyStateComponent } from '@memberjunction/ng-test-utils';
import { FlowAgentFormSectionComponent } from './flow-agent-form-section.component';

/**
 * DOM coverage for <mj-flow-agent-form-section> — a thin BaseFormSectionComponent (standalone:false)
 * that wraps the flow editor. It's cheaply unit-DOM-testable: `record`/`EditMode` are plain properties
 * (not @Input, so set them in `setup`, not via setInput), and the template just branches on the
 * `AgentID` getter (record.ID):
 *   - AgentID present  → renders <mj-flow-agent-editor> with AgentID/EditMode/FullScreen bound;
 *   - AgentID absent    → renders the "save first" <mj-empty-state>.
 * The two children are replaced with light standalone stubs exposing the bound inputs/outputs, so we
 * assert THIS component's branching + binding, and its OnFullScreenToggled handler flipping IsFullScreen.
 * No async init, no entity metadata, no form host — a single synchronous render per test.
 */

@Component({
  selector: 'mj-flow-agent-editor',
  standalone: true,
  template: '<span class="stub-editor">editor</span>',
})
class StubFlowEditor {
  @Input() AgentID: string | null = null;
  @Input() EditMode = false;
  @Input() FullScreen = false;
  /** Defaults mirror the real editor's, so an unbound input is asserted as OFF rather than as absent. */
  @Input() ShowSaveControls = false;
  @Input() CanvasTitle: string | null = 'Flow Configuration';
  @Output() FlowSaved = new EventEmitter<void>();
  @Output() FullScreenToggled = new EventEmitter<boolean>();
}

/** Minimal record fake — the getter only reads `'ID' in record` + record.ID. */
const recordWithId = (id: string) => ({ ID: id }) as unknown as BaseEntity;

const render = (setup: (i: FlowAgentFormSectionComponent) => void) =>
  renderComponentFixture(FlowAgentFormSectionComponent, {
    imports: [CommonModule, StubFlowEditor, StubEmptyStateComponent],
    declarations: [FlowAgentFormSectionComponent],
    setup,
  });

describe('FlowAgentFormSectionComponent (DOM)', () => {
  it('renders the flow editor once a record with an ID is present', () => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
      i.EditMode = true;
    });
    expect(query(fixture, 'mj-flow-agent-editor')).not.toBeNull();
    expect(query(fixture, 'mj-empty-state')).toBeNull();
  });

  it('binds AgentID and EditMode through to the flow editor', () => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
      i.EditMode = true;
    });
    const editor = query(fixture, 'mj-flow-agent-editor')!;
    const editorInstance = fixture.debugElement.query((el) => el.name === 'mj-flow-agent-editor')?.componentInstance as StubFlowEditor;
    expect(editorInstance.AgentID).toBe('agent-123');
    expect(editorInstance.EditMode).toBe(true);
    expect(editor).not.toBeNull();
  });

  it('does NOT let the editor show its own save controls', () => {
    // The agent form owns this record's save and contributes the flow to it. A Save button inside
    // the canvas would be a second save button for the same record, with its own idea of what
    // "saved" means — which is exactly the state this section exists to avoid.
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
      i.EditMode = true;
    });
    const editor = fixture.debugElement.query((el) => el.name === 'mj-flow-agent-editor')
      ?.componentInstance as StubFlowEditor;
    expect(editor.ShowSaveControls).toBe(false);
  });

  it('suppresses the canvas title, because the form chrome already names the record', () => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
    });
    const editor = fixture.debugElement.query((el) => el.name === 'mj-flow-agent-editor')
      ?.componentInstance as StubFlowEditor;
    expect(editor.CanvasTitle).toBeNull();
  });

  it('renders the "save first" empty-state when there is no record', () => {
    const fixture = render(() => {
      /* no record → AgentID getter returns null */
    });
    expect(query(fixture, 'mj-flow-agent-editor')).toBeNull();
    const empty = query(fixture, 'mj-empty-state');
    expect(empty).not.toBeNull();
    expect(query(fixture, '.stub-empty-title')?.textContent).toContain('Save the agent first');
  });

  it('exposes the empty-state class on the host element for the no-record branch', () => {
    const fixture = render(() => {});
    expect(attr(fixture, 'mj-empty-state', 'class')).toContain('flow-empty-state');
  });

  it('OnFullScreenToggled flips IsFullScreen and re-binds FullScreen to the editor', () => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
    });
    expect(fixture.componentInstance.IsFullScreen).toBe(false);
    fixture.componentInstance.OnFullScreenToggled(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.IsFullScreen).toBe(true);
    const editorInstance = fixture.debugElement.query((el) => el.name === 'mj-flow-agent-editor')?.componentInstance as StubFlowEditor;
    expect(editorInstance.FullScreen).toBe(true);
  });
});

/**
 * The save-contribution contract.
 *
 * This is the highest-consequence code in the section: the editor's own Save button is hidden, so
 * the ONLY path from a canvas edit to the database now runs through here. A silent failure loses the
 * user's steps with no error — which is why each rule below is pinned rather than assumed.
 *
 * The ViewChild queries the real FlowAgentEditorComponent type, which a stub cannot satisfy, so the
 * editor is injected directly. That tests the contract logic, which is the part that can be wrong.
 */
describe('FlowAgentFormSectionComponent — contributing the flow to the form\'s save', () => {
  type EditorDouble = {
    HasUnsavedChanges: boolean;
    QueueSaveInto: (tg: unknown) => Promise<void>;
    MarkSaved: () => void;
  };

  const withEditor = (editor: EditorDouble | undefined) => {
    const fixture = render((i) => {
      i.record = recordWithId('agent-123');
    });
    (fixture.componentInstance as unknown as { flowEditor: EditorDouble | undefined }).flowEditor = editor;
    return fixture.componentInstance;
  };

  const editorDouble = (over: Partial<EditorDouble> = {}): EditorDouble & { queued: unknown[]; marked: number } => {
    const state = {
      HasUnsavedChanges: true,
      queued: [] as unknown[],
      marked: 0,
      QueueSaveInto: async (tg: unknown) => { state.queued.push(tg); },
      MarkSaved: () => { state.marked++; },
      ...over,
    };
    return state as EditorDouble & { queued: unknown[]; marked: number };
  };

  /**
   * Minimal transaction-group fake — ContributeToSave only hands the group through to the
   * editor's QueueSaveInto, never reading a member of it, so an identity-marker object is the
   * honest double. Same seam-cast shape as `recordWithId` above; `as never` is banned because
   * it erases type-checking of the call entirely.
   */
  const fakeTransactionGroup = (marker?: string): TransactionGroupBase =>
    (marker ? { marker } : {}) as unknown as TransactionGroupBase;

  it('reports the canvas as dirty so the form does not call itself clean', () => {
    // Without this, a flow-only edit leaves record.Dirty false and the navigate-away guard
    // discards the user's steps without asking. One fixture per test — TestBed configures once.
    const editor = editorDouble({ HasUnsavedChanges: true });
    const section = withEditor(editor);
    expect(section.HasPendingChanges).toBe(true);

    editor.HasUnsavedChanges = false;
    expect(section.HasPendingChanges).toBe(false);
  });

  it('reports clean when there is no editor mounted at all', () => {
    expect(withEditor(undefined).HasPendingChanges).toBe(false);
  });

  it('queues the flow onto the transaction the form is about to submit', async () => {
    const editor = editorDouble();
    const section = withEditor(editor);
    const tg = fakeTransactionGroup('the form transaction');

    await expect(section.ContributeToSave(tg)).resolves.toBe(true);
    // The SAME group the form will submit — a group of its own would be a second save with its own
    // failure mode, which is the whole thing this contract exists to prevent.
    expect(editor.queued).toEqual([tg]);
  });

  it('contributes nothing when the canvas is untouched, without blocking the save', async () => {
    const editor = editorDouble({ HasUnsavedChanges: false });
    const section = withEditor(editor);

    await expect(section.ContributeToSave(fakeTransactionGroup())).resolves.toBe(true);
    expect(editor.queued).toHaveLength(0);
  });

  it('lets the record save when no editor is mounted', async () => {
    await expect(withEditor(undefined).ContributeToSave(fakeTransactionGroup())).resolves.toBe(true);
  });

  it('aborts the save rather than letting it commit a half-queued flow', async () => {
    const editor = editorDouble({
      QueueSaveInto: async () => { throw new Error('step could not be queued'); },
    });
    const section = withEditor(editor);

    // False, not a throw: the form turns this into "nothing was saved" and stops, which beats
    // submitting a transaction carrying only part of the flow.
    await expect(section.ContributeToSave(fakeTransactionGroup())).resolves.toBe(false);
  });

  it('clears the canvas dirty state only when the host says the save committed', () => {
    const editor = editorDouble();
    const section = withEditor(editor);

    section.ContributeToSave(fakeTransactionGroup());
    // Still dirty — contributing is not committing. Clearing here would mark edits saved that a
    // failed submit had just discarded.
    expect(editor.marked).toBe(0);

    section.OnHostSaveCompleted();
    expect(editor.marked).toBe(1);
  });

  it('survives a completed save with no editor mounted', () => {
    expect(() => withEditor(undefined).OnHostSaveCompleted()).not.toThrow();
  });
});

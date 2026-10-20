/**
 * Class-level specs for FlowAgentEditorComponent: what a step dropped from the palette starts as, and
 * the Decision model type the prompt picker filters on.
 *
 * The editor is built directly rather than rendered, since its template needs the whole canvas. Its
 * collaborators are real: a renderer from TestBed, a detached element, a change detector that does
 * nothing, and real step entities from the spec's entity helper.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChangeDetectorRef, ElementRef, RendererFactory2 } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { RunViewParams } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIAgentStepEntity } from '@memberjunction/core-entities';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { AgentFlowTransformerService, AGENT_STEP_TYPE_CONFIGS } from '../lib/agent-editor/agent-flow-transformer.service';
import { FlowAgentEditorComponent } from '../lib/agent-editor/flow-agent-editor.component';
import type { FlowNode, FlowNodeAddedEvent } from '../lib/interfaces/flow-types';
import { AGENT_STEP_ENTITY_INFO } from './agent-step-entities';

/** Change detection is not under test, and the editor is not attached to a view. */
class NoopChangeDetectorRef extends ChangeDetectorRef {
  markForCheck(): void {}
  detach(): void {}
  detectChanges(): void {}
  checkNoChanges(): void {}
  reattach(): void {}
}

/** The editor, with its step factory and a few protected members opened up to the spec. */
class TestFlowAgentEditor extends FlowAgentEditorComponent {
  protected override async CreateStepEntity(): Promise<MJAIAgentStepEntity> {
    return new MJAIAgentStepEntity(AGENT_STEP_ENTITY_INFO);
  }

  public AddNode(event: FlowNodeAddedEvent): Promise<void> {
    return this.onNodeAdded(event);
  }

  public get Steps(): MJAIAgentStepEntity[] {
    return this.steps;
  }

  public get Nodes(): FlowNode[] {
    return this.nodes;
  }

  public get DecisionModelTypeID(): string | null {
    return this.decisionModelTypeID;
  }
}

function makeEditor(): TestFlowAgentEditor {
  const renderer = TestBed.inject(RendererFactory2).createRenderer(null, null);
  return new TestFlowAgentEditor(
    new NoopChangeDetectorRef(),
    new AgentFlowTransformerService(),
    new ElementRef<HTMLElement>(document.createElement('div')),
    renderer
  );
}

/** A node of `type` dropped from the palette at (120, 80). */
function dropped(type: string): FlowNodeAddedEvent {
  const config = AGENT_STEP_TYPE_CONFIGS.find(c => c.Type === type);
  return {
    Node: { ID: 'palette-node', Type: type, Label: config?.Label ?? type, Status: 'default', Position: { X: 0, Y: 0 }, Ports: [] },
    DropPosition: { X: 120.4, Y: 80.6 }
  };
}

describe('FlowAgentEditorComponent — onNodeAdded', () => {
  let editor: TestFlowAgentEditor;

  beforeEach(() => {
    vi.useFakeTimers();
    editor = makeEditor();
    editor.AgentID = 'agent-1';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('gives a new Decision step the first free key, the default decision prompt, and an empty configuration', async () => {
    await editor.AddNode(dropped('Decision'));

    const [step] = editor.Steps;
    expect(step.StepType).toBe('Decision');
    expect(step.PromptID).toBeNull();
    expect(JSON.parse(step.Configuration ?? 'null')).toEqual({ key: 'decision', state: 'payload', questions: {} });
    expect(step.AgentID).toBe('agent-1');
    expect(step.StartingStep).toBe(true);
    expect([step.PositionX, step.PositionY]).toEqual([120, 81]);
  });

  it('gives each further Decision step a key no other step has', async () => {
    await editor.AddNode(dropped('Decision'));
    await editor.AddNode(dropped('Decision'));
    await editor.AddNode(dropped('Decision'));

    const keys = editor.Steps.map(s => JSON.parse(s.Configuration ?? '{}').key);
    expect(keys).toEqual(['decision', 'decision_2', 'decision_3']);
    expect(editor.Steps.map(s => s.StartingStep)).toEqual([true, false, false]);
  });

  it('leaves the configuration of a step of another type alone', async () => {
    await editor.AddNode(dropped('Action'));
    const [step] = editor.Steps;
    expect(step.StepType).toBe('Action');
    expect(step.Configuration).toBeNull();
  });

  it('shows the new Decision step as unfinished on the canvas and in the run check', async () => {
    await editor.AddNode(dropped('Decision'));
    const [step] = editor.Steps;

    const node = editor.Nodes.find(n => UUIDsEqual(n.ID, step.ID));
    expect(node?.Status).toBe('warning');
    expect(node?.StatusMessage).toBe('it asks no questions');
    expect(editor.RunProblems).toEqual([expect.objectContaining({ Code: 'InvalidDecisionStep', StepID: step.ID })]);
  });
});

describe('FlowAgentEditorComponent — loading the Decision model type', () => {
  it('reads the Decision model type\'s ID through the editor\'s provider, for the prompt picker', async () => {
    const requested: RunViewParams[] = [];
    const editor = makeEditor();
    editor.AgentID = 'agent-1';
    editor.Provider = CreateFakeProvider<{ ID: string }>({
      runViewResults: (params) => {
        requested.push(params);
        return params.EntityName === 'MJ: AI Model Types' ? [{ ID: 'decision-type-id' }] : [];
      }
    });

    editor.ngOnInit();
    await vi.waitFor(() => expect(editor.DecisionModelTypeID).toBe('decision-type-id'));

    const modelTypes = requested.find(p => p.EntityName === 'MJ: AI Model Types');
    expect(modelTypes?.ExtraFilter).toBe("Name='Decision'");
    expect(requested.find(p => p.EntityName === 'MJ: AI Prompts')?.Fields).toEqual(['ID', 'Name', 'AIModelType', 'AIModelTypeID']);
  });
});

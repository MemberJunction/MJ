import { describe, it, expect } from 'vitest';
import { FlowNodeComponent } from '../lib/components/flow-node.component';
import { FlowLayoutService } from '../lib/services/flow-layout.service';
import {
  ComputeCappedFitViewport,
  FLOW_VIEWPORTS_SETTING_KEY,
  FlowViewportStore,
  MAX_FIT_SCALE,
} from '../lib/services/flow-viewport.util';
import { AgentStepListComponent } from '../lib/agent-editor/agent-step-list.component';
import { AgentPropertiesPanelComponent } from '../lib/agent-editor/agent-properties-panel.component';
import type { FlowNode, FlowConnection } from '../lib/interfaces/flow-types';
import type { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';

describe('ng-flow-editor spatial-first hybrid upgrades', () => {
  it('recognizes both Flow and TaskGraph loop node types in FlowNodeComponent.isLoopNode', () => {
    const cmp = new FlowNodeComponent();
    for (const loopType of ['ForEach', 'While', 'ForEachTask', 'WhileTask']) {
      cmp.Node = {
        ID: 'n1',
        Type: loopType,
        Label: 'Loop Step',
        Status: 'default',
        Position: { X: 0, Y: 0 },
        Ports: [],
      };
      expect(cmp.isLoopNode).toBe(true);
    }
    cmp.Node = {
      ID: 'n2',
      Type: 'ActionTask',
      Label: 'Action Step',
      Status: 'default',
      Position: { X: 0, Y: 0 },
      Ports: [],
    };
    expect(cmp.isLoopNode).toBe(false);
  });

  it('exposes multi-output ports and X-Ray telemetry flags on FlowNodeComponent', () => {
    const cmp = new FlowNodeComponent();
    cmp.XRayEnabled = true;
    cmp.Node = {
      ID: 'd1',
      Type: 'Decision',
      Label: 'Risk Decision',
      Status: 'running',
      Position: { X: 0, Y: 0 },
      ProgressMessage: 'Scoring 2 of 5...',
      ProgressPercent: 40,
      Confidence: { Score: 86, Threshold: 80 },
      TaintState: 'verified',
      Ports: [
        { ID: 'd1-in', Direction: 'input', Side: 'left' },
        { ID: 'd1-out-yes', Direction: 'output', Side: 'right', Label: 'Approve' },
        { ID: 'd1-out-no', Direction: 'output', Side: 'right', Label: 'Escalate' },
      ],
    };
    expect(cmp.OutputPorts.map(p => p.Label)).toEqual(['Approve', 'Escalate']);
    expect(cmp.HasLiveProgress).toBe(true);
    expect(cmp.ShowXRayPanel).toBe(true);
  });

  it('computes LR and TB layouts with static ESM dagre import', () => {
    const svc = new FlowLayoutService();
    const nodes: FlowNode[] = [
      { ID: 'a', Type: 'Action', Label: 'A', Status: 'default', Position: { X: 0, Y: 0 }, Ports: [] },
      { ID: 'b', Type: 'Action', Label: 'B', Status: 'default', Position: { X: 0, Y: 0 }, Ports: [] },
    ];
    const conns: FlowConnection[] = [
      { ID: 'c1', SourceNodeID: 'a', SourcePortID: 'a-out', TargetNodeID: 'b', TargetPortID: 'b-in' },
    ];

    const lr = svc.CalculateLayout(nodes, conns, 'horizontal');
    expect(lr.Positions.get('b')!.X).toBeGreaterThan(lr.Positions.get('a')!.X);

    const tb = svc.CalculateLayout(nodes, conns, 'vertical');
    expect(tb.Positions.get('b')!.Y).toBeGreaterThan(tb.Positions.get('a')!.Y);
  });

  it('orders Playbook steps topologically from StartingStep and labels Human as Person', () => {
    const list = new AgentStepListComponent();
    const s2 = { ID: '00000000-0000-0000-0000-000000000002', Name: 'Approve', StepType: 'Human', Status: 'Active', StartingStep: false } as unknown as MJAIAgentStepEntity;
    const s1 = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Fetch', StepType: 'Action', Status: 'Active', StartingStep: true } as unknown as MJAIAgentStepEntity;
    const p1 = { ID: '00000000-0000-0000-0000-000000000010', OriginStepID: s1.ID, DestinationStepID: s2.ID } as unknown as MJAIAgentStepPathEntity;

    list.Steps = [s2, s1];
    list.Paths = [p1];
    expect(list.OrderedSteps.map(s => s.Name)).toEqual(['Fetch', 'Approve']);
    expect(list.GetStepTypeLabel(s2)).toBe('Person');
  });

  it('filters pickers, inserts upstream variable pills, and stores Saga rollback config in AgentPropertiesPanelComponent', () => {
    const panel = new AgentPropertiesPanelComponent();
    const step = {
      ID: '00000000-0000-0000-0000-000000000001',
      Name: 'Post Invoice',
      StepType: 'Action',
      ActionID: 'act-1',
      ActionInputMapping: '{}',
      Configuration: '{}',
    } as unknown as MJAIAgentStepEntity;
    const prev = {
      ID: '00000000-0000-0000-0000-000000000002',
      Name: 'Fetch Invoice',
      StepType: 'Action',
    } as unknown as MJAIAgentStepEntity;

    panel.Step = step;
    panel.AllSteps = [prev, step];
    panel.Actions = [
      { ID: 'act-1', Name: 'Post to ERP' },
      { ID: 'act-2', Name: 'Void ERP Draft' },
      { ID: 'act-3', Name: 'Send Email' },
    ];
    panel.ActionSearchQuery = 'void';
    // Keeps selected item + matching search item
    expect(panel.FilteredActions.map(a => a.ID)).toEqual(['act-1', 'act-2']);

    const pills = panel.UpstreamVariablePills;
    expect(pills.some(p => p.Token === '{{ Fetch_Invoice.output }}')).toBe(true);
    panel.OnInsertVariablePill(pills[0]);
    expect(JSON.parse(step.ActionInputMapping!)).toEqual({ trigger: '{{ trigger.input }}' });

    panel.OnSagaCompensationActionChange('act-2');
    panel.OnSagaFailurePolicyChange('EscalateToHumanTask');
    const cfg = JSON.parse(step.Configuration!);
    expect(cfg.compensationActionId).toBe('act-2');
    expect(cfg.compensationFailurePolicy).toBe('EscalateToHumanTask');
  });

  it('caps fit-to-screen zoom at MAX_FIT_SCALE (0.95) for small workflows and centers them', () => {
    const singleNode: FlowNode[] = [
      {
        ID: 'n1',
        Type: 'Action',
        Label: 'Single Step',
        Status: 'default',
        Position: { X: 100, Y: 80 },
        Size: { Width: 220, Height: 90 },
        Ports: [],
      },
    ];
    const fit = ComputeCappedFitViewport(singleNode, 1200, 700);
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBe(MAX_FIT_SCALE);
    const renderedCenterX = fit!.x + (100 + 110) * fit!.scale;
    expect(Math.abs(renderedCenterX - 600)).toBeLessThanOrEqual(2);
  });

  it('scales down below MAX_FIT_SCALE when a large workflow exceeds the viewport', () => {
    const wideNodes: FlowNode[] = [
      { ID: 'n1', Type: 'Action', Label: 'Start', Status: 'default', Position: { X: 0, Y: 0 }, Size: { Width: 220, Height: 90 }, Ports: [] },
      { ID: 'n2', Type: 'Action', Label: 'Far Right', Status: 'default', Position: { X: 2400, Y: 0 }, Size: { Width: 220, Height: 90 }, Ports: [] },
    ];
    const fit = ComputeCappedFitViewport(wideNodes, 1000, 600);
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBeLessThan(MAX_FIT_SCALE);
    expect(fit!.scale).toBeGreaterThanOrEqual(0.15);
  });

  it('persists and restores per-workflow pan and zoom in a bounded dictionary', () => {
    const backing = new Map<string, string>();
    const store = new FlowViewportStore(
      {
        Get: (k) => backing.get(k),
        Set: (k, v) => { backing.set(k, v); },
      },
      3,
    );

    store.Save('agent:wf-1', { x: 120, y: -40, scale: 0.85 });
    store.Save('agent:wf-2', { x: 10, y: 20, scale: 0.95 });

    const reloaded = new FlowViewportStore({ Get: (k) => backing.get(k), Set: (k, v) => { backing.set(k, v); } }, 3);
    expect(reloaded.Load('agent:wf-1')).toMatchObject({ x: 120, y: -40, scale: 0.85 });
    expect(reloaded.Load('agent:wf-2')).toMatchObject({ x: 10, y: 20, scale: 0.95 });
    expect(backing.has(FLOW_VIEWPORTS_SETTING_KEY)).toBe(true);

    store.Save('agent:wf-3', { x: 0, y: 0, scale: 0.9 });
    store.Save('agent:wf-4', { x: 5, y: 5, scale: 0.75 });
    const parsed = JSON.parse(backing.get(FLOW_VIEWPORTS_SETTING_KEY)!) as Record<string, unknown>;
    expect(Object.keys(parsed).length).toBe(3);
  });
});

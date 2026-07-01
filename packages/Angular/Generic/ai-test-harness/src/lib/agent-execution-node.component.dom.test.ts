import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, attr, capture } from '@memberjunction/ng-test-utils';
import { ExecutionNodeComponent } from './agent-execution-node.component';

/**
 * DOM-level spec for <mj-execution-node> — a module-declared (standalone:false), pure
 * @Input/@Output presentational tree node with no child-component or provider deps.
 *
 * We drive it via a plain `step` object shaped to only the fields the template/logic
 * reads (StepType, StepName, Status, InputData/OutputData, ErrorMessage, timestamps,
 * SubAgentRun, PromptRun). The component's `step` input is typed as an entity, but the
 * toolkit's `inputs` seam accepts the value structurally, so no `any`/entity construction
 * is needed. We exercise: status @switch icon, type @switch icon + class, has-children
 * gating (chevron + dblclick), details toggle + section gating, metrics/duration
 * rendering, name truncation, and all three @Outputs.
 */

/** Minimal structural shape the component reads off `step`. */
interface StepShape {
  StepType: string;
  StepName: string;
  Status: string;
  InputData?: string | null;
  OutputData?: string | null;
  ErrorMessage?: string | null;
  StartedAt?: Date | null;
  CompletedAt?: Date | null;
  SubAgentRun?: { Agent?: string; Steps?: unknown[] } | null;
  PromptRun?: { TokensUsed?: number; TotalCost?: number } | null;
  ActionExecutionLog?: { Action?: string } | null;
}

const baseStep = (overrides: Partial<StepShape> = {}): StepShape => ({
  StepType: 'Prompt',
  StepName: 'Generate response',
  Status: 'Completed',
  InputData: null,
  OutputData: null,
  ErrorMessage: null,
  StartedAt: null,
  CompletedAt: null,
  SubAgentRun: null,
  PromptRun: null,
  ActionExecutionLog: null,
  ...overrides,
});

// No `declarations` needed: TestBed auto-declares the component under test, which also
// lets a single it() render more than once (passing declarations re-runs
// configureTestingModule, which throws after the module is instantiated).
const render = (step: StepShape, inputs: Record<string, unknown> = {}): ComponentFixture<ExecutionNodeComponent> =>
  renderComponentFixture(ExecutionNodeComponent, {
    inputs: { step, ...inputs },
  });

describe('ExecutionNodeComponent (DOM)', () => {
  it('renders the (first-line) step name', () => {
    const f = render(baseStep({ StepName: 'Validate input' }));
    expect(text(f, '.node-name').trim()).toContain('Validate input');
  });

  it('maps StepType to the type class on the tree-node', () => {
    const f = render(baseStep({ StepType: 'Actions', Status: 'Completed' }));
    expect(query(f, '.tree-node.type-action')).not.toBeNull();
  });

  it('renders the completed status icon (status @switch)', () => {
    const f = render(baseStep({ Status: 'Completed' }));
    expect(query(f, '.status-icon.status-completed .fa-check-circle')).not.toBeNull();
  });

  it('renders the failed status icon and honors overrideDisplayStatus', () => {
    // actual Status is Completed, but the parent override forces a failed display
    const f = render(baseStep({ Status: 'Completed' }), { overrideDisplayStatus: 'Failed' });
    expect(query(f, '.status-icon.status-failed .fa-times-circle')).not.toBeNull();
  });

  it('hides the expand chevron when the node has no children', () => {
    const f = render(baseStep({ StepType: 'Prompt' }));
    expect(query(f, '.expand-icon')).toBeNull();
  });

  it('shows the expand chevron for a Sub-Agent with sub-steps, and reflects expanded state', () => {
    const step = baseStep({ StepType: 'Sub-Agent', SubAgentRun: { Agent: 'Helper', Steps: [{}, {}] } });
    const f = render(step, { expanded: true });
    const chevron = query(f, '.expand-icon');
    expect(chevron).not.toBeNull();
    expect(chevron!.classList.contains('fa-chevron-down')).toBe(true); // expanded
    expect(query(f, '.tree-node.expanded')).not.toBeNull();
    expect(query(f, '.tree-node.has-children')).not.toBeNull();
  });

  it('emits toggleNode + userInteracted when the chevron is clicked', () => {
    const step = baseStep({ StepType: 'Sub-Agent', SubAgentRun: { Agent: 'Helper', Steps: [{}] } });
    const f = render(step);
    const toggles = capture(f.componentInstance.toggleNode);
    const interactions = capture(f.componentInstance.userInteracted);
    (query(f, '.expand-icon') as HTMLElement).click();
    expect(toggles).toHaveLength(1);
    expect(interactions).toHaveLength(1);
  });

  it('hides the details-toggle button when the node has no details', () => {
    // Note: one render per it() — the toolkit calls configureTestingModule on each render
    // (we pass `declarations`), which throws if invoked twice in the same test.
    const f = render(baseStep({ StepType: 'Prompt' }));
    expect(query(f, '.details-toggle-btn')).toBeNull();
  });

  it('shows the details-toggle button and emits toggleDetails + userInteracted on click', () => {
    const f = render(baseStep({ InputData: '{"message":"hi"}' }));
    const btn = query(f, '.details-toggle-btn');
    expect(btn).not.toBeNull();

    const details = capture(f.componentInstance.toggleDetails);
    const interactions = capture(f.componentInstance.userInteracted);
    (btn as HTMLElement).click();
    expect(details).toHaveLength(1);
    expect(interactions).toHaveLength(1);
  });

  it('renders the input/output detail sections when detailsExpanded is true', () => {
    const step = baseStep({
      InputData: '{"userMessage":"do the thing"}',
      OutputData: '{"promptResult":{"success":true,"content":"done"}}',
    });
    const f = render(step, { detailsExpanded: true });
    const sections = queryAll(f, '.node-details .detail-section .detail-content');
    const combined = sections.map((s) => s.textContent ?? '').join(' | ');
    expect(combined).toContain('do the thing');
    expect(combined).toContain('done');
  });

  it('renders an error detail section when the step has an ErrorMessage', () => {
    const f = render(baseStep({ ErrorMessage: 'boom failed', InputData: '{}' }), { detailsExpanded: true });
    const err = query(f, '.detail-section.error .detail-content');
    expect(err?.textContent).toContain('boom failed');
  });

  it('renders duration and token/cost metrics for a completed prompt step', () => {
    const step = baseStep({
      StepType: 'Prompt',
      StartedAt: new Date('2024-01-01T00:00:00Z'),
      CompletedAt: new Date('2024-01-01T00:00:02Z'), // 2s
      PromptRun: { TokensUsed: 1234, TotalCost: 0.005 },
    });
    const f = render(step);
    expect(text(f, '.node-duration')).toContain('2.0s');
    expect(text(f, '.node-metrics .tokens')).toContain('1234 tokens');
    expect(text(f, '.node-metrics .cost')).toContain('0.0050');
  });

  it('truncates an over-long name and shows a [Level N] tag for nested sub-agents', () => {
    const longName = 'x'.repeat(200);
    const step = baseStep({ StepType: 'Sub-Agent', StepName: longName, SubAgentRun: { Agent: 'A', Steps: [] } });
    const f = render(step, { depth: 2 });
    const name = text(f, '.node-name');
    expect(name).toContain('...');
    expect(name).toContain('[Level 2]');
  });

  it('sets the type-icon title from getNodeTitle for a sub-agent', () => {
    const step = baseStep({ StepType: 'Sub-Agent', SubAgentRun: { Agent: 'Researcher', Steps: [] } });
    const f = render(step);
    expect(attr(f, '.type-icon', 'title')).toBe('Sub-agent: Researcher');
  });
});

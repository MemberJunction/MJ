import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, attr, capture } from '@memberjunction/ng-test-utils';
import { AIAgentRunStepNodeComponent } from './ai-agent-run-step-node.component';
import type { TimelineItem } from './ai-agent-run-timeline.component';

/**
 * DOM coverage for <mj-ai-agent-run-step-node> — one row in the agent-run timeline. It is purely
 * presentational: everything derives from the `item` TimelineItem input (title/subtitle/status,
 * expand affordance for sub-agents & parent steps, a navigate link for target-bearing steps, and
 * skill chips parsed from `item.data.Skills`). No services, no async — a single synchronous render.
 * CommonModule supplies the `date` pipe + `ngClass` the template uses.
 */

const baseItem = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 's1',
  type: 'step',
  title: 'Execute Agent Prompt',
  subtitle: 'Prompt step',
  status: 'Completed',
  startTime: new Date('2026-01-01T10:00:00Z'),
  icon: 'fa-brain',
  color: '#3b82f6',
  data: {},
  level: 0,
  ...over,
});

const render = (item: TimelineItem, isSelected = false) =>
  renderComponentFixture(AIAgentRunStepNodeComponent, {
    imports: [CommonModule],
    declarations: [AIAgentRunStepNodeComponent],
    inputs: { item, isSelected },
  });

describe('AIAgentRunStepNodeComponent (DOM)', () => {
  it('renders the item title and subtitle', () => {
    const fixture = render(baseItem());
    expect(text(fixture, '.timeline-header h4')).toBe('Execute Agent Prompt');
    expect(text(fixture, '.timeline-subtitle')).toBe('Prompt step');
  });

  it('reflects status and type on the row via data-attributes', () => {
    const fixture = render(baseItem({ status: 'Failed' }));
    expect(attr(fixture, '.timeline-item', 'data-status')).toBe('Failed');
    expect(attr(fixture, '.timeline-item', 'data-type')).toBe('step');
  });

  it('does not show the expand toggle for a plain leaf step', () => {
    expect(query(render(baseItem()), '.expand-toggle')).toBeNull();
  });

  it('shows the expand toggle for a sub-agent step and emits expandToggle when clicked', () => {
    const fixture = render(baseItem({ data: { StepType: 'Sub-Agent' }, children: [baseItem({ id: 'c1' })] }));
    const toggle = query(fixture, '.expand-toggle') as HTMLElement;
    expect(toggle).not.toBeNull();
    const toggles = capture(fixture.componentInstance.expandToggle);
    toggle.click();
    expect(toggles.length).toBe(1);
  });

  it('shows a navigate link for a target-bearing step and emits navigateToEntity with the mapped entity', () => {
    const fixture = render(baseItem({ data: { StepType: 'Prompt', TargetLogID: 'log-42' } }));
    const link = query(fixture, '.timeline-actions .btn-link') as HTMLElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('View Prompt Run');
    const nav = capture(fixture.componentInstance.navigateToEntity);
    link.click();
    expect(nav).toEqual([{ entityName: 'MJ: AI Prompt Runs', recordId: 'log-42' }]);
  });

  it('renders one skill chip per invocation parsed from item.data.Skills', () => {
    const skills = JSON.stringify([
      { SkillID: 'k1', SkillName: 'Research', ActivationType: 'requested' },
      { SkillID: 'k2', SkillName: 'Summarize', ActivationType: 'auto' },
    ]);
    const fixture = render(baseItem({ data: { StepType: 'Prompt', Skills: skills } }));
    const chips = queryAll(fixture, '.skill-chip');
    expect(chips.length).toBe(2);
    expect(chips.map((c) => c.textContent).join(' ')).toContain('Research');
    expect(attr(fixture, '.skill-chip', 'data-activation')).toBe('requested');
  });
});

/**
 * Workflow rows, which reach this component through the run-tree projection rather than from real
 * `AIAgentRunStep` entities. Everything here failed silently before: an unmatched attribute selector
 * is not an error, a `var()` that resolves to nothing is not an error, and a row with no children
 * simply renders no chevron.
 */
describe('AIAgentRunStepNodeComponent (DOM) — workflow rows', () => {
  /** A loop pass, as the projection now hands it over: a step view pointing at its action log. */
  const pass = (over: Partial<TimelineItem> = {}): TimelineItem => baseItem({
    id: 'graph-task:0',
    title: '1: Google Custom Search',
    subtitle: undefined,
    provenance: 'workflow',
    color: 'info',
    data: {
      ID: 'graph-task:0',
      StepType: 'Actions',
      TargetLogID: 'log-1',
      TargetEntity: 'MJ: Action Execution Logs',
      IsWorkflowStep: true,
    },
    ...over,
  });

  it('offers the action-log link on a loop pass', () => {
    // Five passes each ran a real action and none offered a way to open it: the projection only
    // translated `Task` nodes into the step shape, so a pass kept a raw tree node whose fields the
    // navigation gate (StepType + TargetLogID) does not exist on.
    const fixture = render(pass());
    expect(query(fixture, '.timeline-actions .btn-link')).toBeTruthy();
    expect(text(fixture, '.timeline-actions .btn-link')).toContain('View Action Log');
  });

  it('offers NO link on a pass that produced no record', () => {
    // A pass with nothing to point at must not offer a dead link — absence is the honest rendering.
    const fixture = render(pass({ data: { ID: 'x', StepType: 'Actions', TargetLogID: null, IsWorkflowStep: true } }));
    expect(query(fixture, '.timeline-actions .btn-link')).toBeNull();
  });

  it('sends a sub-agent pass to the agent run, not the action log', () => {
    // `Sub-Agent` is absent from the task-kind map, so running a pass's kind through it dropped to
    // the `Actions` default — labelling the link "View Action Log" and pointing it at the wrong
    // entity for every sub-agent iteration.
    const fixture = render(pass({
      data: { ID: 'p', StepType: 'Sub-Agent', TargetLogID: 'run-9', IsWorkflowStep: true },
    }));
    expect(text(fixture, '.timeline-actions .btn-link')).toContain('View Agent Run');
  });

  it('shows the expand chevron on any row that has children', () => {
    // The projection used to flatten, setting `children: []` on every row, so a workflow's graph and
    // its loops rendered permanently open with no way to collapse them — while an agent's own
    // sub-agent steps a few rows above collapsed normally.
    const fixture = render(baseItem({
      title: 'Step 3: ForEach Loop Demo',
      data: { ID: 'loop', StepType: 'ForEach', IsWorkflowStep: true },
      children: [pass(), pass({ id: 'graph-task:1', title: '2: Google Custom Search' })],
    }));
    expect(query(fixture, '.expand-toggle')).toBeTruthy();
  });

  it('shows no chevron on a leaf', () => {
    expect(query(render(pass()), '.expand-toggle')).toBeNull();
  });

  it('paints a filled marker from a colour NAME the stylesheet matches', () => {
    // `data-color` is matched by `.timeline-marker[data-color="info"]`. A CSS value here — the
    // shape this used to emit — matches no rule, so no circle is drawn at all and the bare glyph
    // inherits `--mj-text-inverse`: invisible in dark mode, and silent, because neither an unmatched
    // selector nor an unresolvable variable is an error.
    expect(attr(render(pass()), '.timeline-marker', 'data-color')).toBe('info');
  });
});

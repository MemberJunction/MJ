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

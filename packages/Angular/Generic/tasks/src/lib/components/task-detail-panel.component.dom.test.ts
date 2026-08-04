import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { TaskDetailPanelComponent } from './task-detail-panel.component';

/**
 * DOM-level spec for <mj-task-detail-panel>. The @Input() task is typed as MJTaskEntity,
 * but the template only reads plain fields (Name, Description, Status, PercentComplete,
 * dates, User) — a plain object via `inputs` is enough (see slot specs in conversations).
 *
 * IMPORTANT: ngOnInit/ngOnChanges call loadAgentInfo(), which only touches AIEngineBase
 * when task.AgentID is set. Every task fixture here OMITS AgentID, so loadAgentInfo
 * returns early and no engine/backend call happens — the agent section stays hidden.
 */
describe('TaskDetailPanelComponent (DOM)', () => {
  const baseTask = { Name: 'Build report', Status: 'In Progress' };

  it('renders the task name and status', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, { inputs: { task: baseTask } });
    expect(text(f, '.detail-header h3')).toBe('Build report');
    // Status is always shown (no @if gate); find the field whose label is "Status".
    const fields = queryAll(f, '.detail-field');
    const statusField = fields.find((el) => el.querySelector('label')?.textContent?.trim() === 'Status');
    expect(statusField?.querySelector('p')?.textContent?.trim()).toBe('In Progress');
  });

  it('hides the Description field when task has no description', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, { inputs: { task: baseTask } });
    const labels = queryAll(f, '.detail-field label').map((el) => el.textContent?.trim());
    expect(labels).not.toContain('Description');
  });

  it('shows the Description field when task has a description', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, {
      inputs: { task: { ...baseTask, Description: 'Quarterly numbers' } },
    });
    const labels = queryAll(f, '.detail-field label').map((el) => el.textContent?.trim());
    expect(labels).toContain('Description');
    const descField = queryAll(f, '.detail-field').find((el) => el.querySelector('label')?.textContent?.trim() === 'Description');
    expect(descField?.querySelector('p')?.textContent?.trim()).toBe('Quarterly numbers');
  });

  it('renders the progress fill width from PercentComplete', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, {
      inputs: { task: { ...baseTask, PercentComplete: 42 } },
    });
    const fill = query(f, '.progress-fill-detail') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.width).toBe('42%');
    expect(text(f, '.detail-progress span')).toBe('42%');
  });

  it('hides the progress field when PercentComplete is null', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, {
      inputs: { task: { ...baseTask, PercentComplete: null } },
    });
    expect(query(f, '.detail-progress')).toBeNull();
  });

  it('does not render the agent section when there is no agent', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, { inputs: { task: baseTask } });
    expect(query(f, '.agent-info')).toBeNull();
  });

  it('shows the agent-run link when agentRunId is set, and emits openEntityRecord on click', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, {
      inputs: { task: baseTask, agentRunId: 'run-123' },
    });
    const link = query(f, '.agent-run-link');
    expect(link).not.toBeNull();

    const emitted = capture(f.componentInstance.openEntityRecord);
    click(f, '.agent-run-link');
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ entityName: 'MJ: AI Agent Runs', recordId: 'run-123' });
  });

  it('hides the agent-run link when agentRunId is null', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, {
      inputs: { task: baseTask, agentRunId: null },
    });
    expect(query(f, '.agent-run-link')).toBeNull();
  });

  it('emits closePanel when the close button is clicked', () => {
    const f = renderComponentFixture(TaskDetailPanelComponent, { inputs: { task: baseTask } });
    const closed = capture(f.componentInstance.closePanel);
    click(f, '.close-detail-btn');
    expect(closed).toHaveLength(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { of } from 'rxjs';
import { CommonModule } from '@angular/common';
import type { UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { AgentProcessPanelComponent } from './agent-process-panel.component';
import { AgentStateService, AgentStatus, AgentWithStatus } from '../../services/agent-state.service';
import { DialogService } from '../../services/dialog.service';

/**
 * DOM spec for <mj-agent-process-panel> — the floating detail panel of active agent
 * runs. ngOnInit starts polling and subscribes via AgentStateService, so a stub
 * service (startPolling no-op + fixed getActiveAgents observable) drives the render.
 * DialogService is only touched in the cancel flow, where it is stubbed per-test.
 * Runs carry fixed StartedAt/CompletedAt so getElapsedTime is wall-clock-free.
 */
describe('AgentProcessPanelComponent (DOM)', () => {
  const currentUser = { ID: 'u1' } as unknown as UserInfo;

  const makeRun = (overrides: Record<string, unknown> = {}): MJAIAgentRunEntity =>
    // Test seam: the template reads only scalar run fields (ID/Agent/Status/StartedAt/CompletedAt).
    ({
      ID: 'r1',
      Agent: 'Sage',
      Status: 'Running',
      StartedAt: new Date('2026-01-01T10:00:00Z'),
      CompletedAt: new Date('2026-01-01T10:01:15Z'),
      ...overrides,
    }) as unknown as MJAIAgentRunEntity;

  const makeProcess = (status: AgentStatus, runOverrides: Record<string, unknown> = {}, confidence: number | null = null): AgentWithStatus => ({
    run: makeRun(runOverrides),
    status,
    confidence,
  });

  const render = (agents: AgentWithStatus[], dialog: Partial<DialogService> = {}) =>
    renderComponentFixture(AgentProcessPanelComponent, {
      imports: [CommonModule],
      declarations: [AgentProcessPanelComponent],
      providers: [
        { provide: AgentStateService, useValue: { startPolling: vi.fn(), getActiveAgents: () => of(agents), cancelAgent: vi.fn() } },
        { provide: DialogService, useValue: dialog },
      ],
      inputs: { currentUser, conversationId: 'c1' },
    });

  const expand = (f: ReturnType<typeof render>) => {
    (query(f, '.process-header') as HTMLElement).click();
    f.detectChanges();
  };

  it('renders nothing when there are no active processes', () => {
    const f = render([]);
    expect(query(f, '.agent-panel')).toBeNull();
  });

  it('renders the header count and one item per process', () => {
    const f = render([makeProcess('working'), makeProcess('completing', { ID: 'r2', Agent: 'Scout' })]);
    expect(text(f, '.panel-header h3')).toContain('Active Agents (2)');
    expect(queryAll(f, '.process-item').length).toBe(2);
  });

  it('shows the agent name and human status text with the status class', () => {
    const f = render([makeProcess('acknowledging')]);
    expect(text(f, '.process-name')).toBe('Sage');
    const status = query(f, '.process-status');
    expect(status?.textContent?.trim()).toBe('Acknowledging');
    expect(status?.classList.contains('status-acknowledging')).toBe(true);
  });

  it('shows a pulse dot for in-flight processes but not completed ones', () => {
    const f = render([makeProcess('working'), makeProcess('completed', { ID: 'r2' })]);
    const avatars = queryAll(f, '.agent-avatar-small');
    expect(avatars[0].querySelector('.pulse-dot')).not.toBeNull();
    expect(avatars[1].querySelector('.pulse-dot')).toBeNull();
  });

  // One render per test: TestBed is single-use, so the two states are separate specs.
  it('renders the confidence indicator when confidence is set', () => {
    const f = render([makeProcess('working', {}, 0.42)]);
    expect(text(f, '.confidence-indicator')).toContain('42%');
  });

  it('omits the confidence indicator when confidence is not set', () => {
    const f = render([makeProcess('working')]);
    expect(query(f, '.confidence-indicator')).toBeNull();
  });

  it('minimizes the panel content via the header button', () => {
    const f = render([makeProcess('working')]);
    expect(query(f, '.panel-content')).not.toBeNull();
    (query(f, '.header-btn') as HTMLButtonElement).click();
    f.detectChanges();
    expect(query(f, '.panel-content')).toBeNull();
    expect(query(f, '.agent-panel')?.classList.contains('minimized')).toBe(true);
  });

  it('expands a process to show Started and Duration details when the header row is clicked', () => {
    const f = render([makeProcess('working')]);
    expect(query(f, '.process-details')).toBeNull();
    expand(f);
    const details = text(f, '.process-details');
    expect(details).toContain('Started:');
    expect(details).toContain('Duration: 1m 15s'); // fixed StartedAt→CompletedAt span
  });

  it('formats hour-scale durations as Xh Ym', () => {
    const f = render([makeProcess('working', { CompletedAt: new Date('2026-01-01T12:30:00Z') })]);
    expect(f.componentInstance.getElapsedTime(f.componentInstance.activeProcesses[0].run)).toBe('2h 30m');
  });

  it('returns null elapsed time when the run has not started', () => {
    const f = render([makeProcess('working', { StartedAt: null })]);
    expect(f.componentInstance.getElapsedTime(f.componentInstance.activeProcesses[0].run)).toBeNull();
  });

  it('shows the Cancel action for a Running run', () => {
    const f = render([makeProcess('working', { Status: 'Running' })]);
    expand(f);
    expect(query(f, '.btn-cancel')).not.toBeNull();
  });

  it('hides the Cancel action for a non-Running/Paused run', () => {
    const f = render([makeProcess('completed', { Status: 'Complete' })]);
    (query(f, '.process-header') as HTMLElement).click();
    f.detectChanges();
    expect(query(f, '.btn-cancel')).toBeNull();
  });

  it('does not cancel the agent when the confirmation is declined', async () => {
    const cancelAgent = vi.fn();
    const f = renderComponentFixture(AgentProcessPanelComponent, {
      imports: [CommonModule],
      declarations: [AgentProcessPanelComponent],
      providers: [
        { provide: AgentStateService, useValue: { startPolling: vi.fn(), getActiveAgents: () => of([makeProcess('working')]), cancelAgent } },
        { provide: DialogService, useValue: { confirm: vi.fn(() => Promise.resolve(false)) } },
      ],
      inputs: { currentUser },
    });
    expand(f);
    await f.componentInstance.onCancelProcess(f.componentInstance.activeProcesses[0]);
    expect(cancelAgent).not.toHaveBeenCalled();
  });
});

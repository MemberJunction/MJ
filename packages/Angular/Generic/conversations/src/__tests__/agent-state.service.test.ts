import { describe, it, expect, afterEach, vi } from 'vitest';
import { RunView, UserInfo } from '@memberjunction/core';
import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { AgentStateService, AgentWithStatus } from '../lib/services/agent-state.service';

/**
 * AgentStateService maps each polled AI Agent Run to a display status and a confidence score.
 *
 * BaseAgent writes the run payload to `FinalPayload`; some older rows have only `Result`. It also
 * fills `FinalPayload` while the run executes, so a payload does not show that a run has finished.
 * Only a Status other than `Running` does.
 */

type RunRow = Pick<MJAIAgentRunEntity, 'ID' | 'Status' | 'StartedAt' | 'FinalPayload' | 'Result'>;

const RUN_ID = 'A1B2C3D4-0000-4000-8000-000000000001';

/** A run started long enough ago to be past the 'acknowledging' window. */
function runRow(overrides: Partial<RunRow>): RunRow {
  return {
    ID: RUN_ID,
    Status: 'Running',
    StartedAt: new Date(Date.now() - 60_000),
    FinalPayload: null,
    Result: null,
    ...overrides
  };
}

/** Loads `row` through one poll and returns how the service maps it. */
async function mapRun(row: RunRow): Promise<AgentWithStatus | undefined> {
  vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({
    Success: true,
    Results: [row],
    RowCount: 1,
    TotalRowCount: 1,
    ExecutionTime: 0,
    ErrorMessage: ''
  });
  const service = new AgentStateService();
  service.StartPolling({} as UserInfo);
  service.StopPolling();
  await service.Refresh();
  return service.GetAgent(RUN_ID);
}

describe('AgentStateService run mapping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('status', () => {
    it('shows a run that is no longer Running as completing, with no Result written', async () => {
      const agent = await mapRun(runRow({ Status: 'Paused', FinalPayload: '{"started":"workflow"}' }));
      expect(agent?.status).toBe('completing');
    });

    it('shows a Running run as working even when FinalPayload already holds a mid-run payload', async () => {
      const agent = await mapRun(runRow({ Status: 'Running', FinalPayload: '{"partial":true}' }));
      expect(agent?.status).toBe('working');
    });
  });

  describe('confidence', () => {
    it('reads confidence from FinalPayload', async () => {
      const agent = await mapRun(runRow({ FinalPayload: '{"confidence":0.8}' }));
      expect(agent?.confidence).toBe(0.8);
    });

    it('falls back to Result on an older row that has no FinalPayload', async () => {
      const agent = await mapRun(runRow({ Status: 'Paused', Result: '{"confidence":0.6}' }));
      expect(agent?.confidence).toBe(0.6);
    });

    it('prefers FinalPayload over Result when a row has both', async () => {
      const agent = await mapRun(runRow({ FinalPayload: '{"confidence":0.8}', Result: '{"confidence":0.6}' }));
      expect(agent?.confidence).toBe(0.8);
    });

    it('is null when the run has no payload', async () => {
      const agent = await mapRun(runRow({}));
      expect(agent?.confidence).toBeNull();
    });
  });
});

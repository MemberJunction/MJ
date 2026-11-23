import { describe, it, expect, beforeEach, vi } from 'vitest';

interface CapturedParams {
  ExtraFilter?: string;
}

const captured: { filters: string[]; loadResult: boolean; loads: number } = { filters: [], loadResult: false, loads: 0 };

vi.mock('@memberjunction/core', () => {
  const okResult = { Success: true, Results: [], RowCount: 0 };
  return {
    Metadata: vi.fn().mockImplementation(() => ({
      GetEntityObject: vi.fn().mockResolvedValue({
        Load: vi.fn().mockImplementation(async () => {
          captured.loads++;
          return captured.loadResult;
        }),
        Save: vi.fn().mockResolvedValue(false),
        Delete: vi.fn().mockResolvedValue(false),
        NewRecord: vi.fn(),
        Validate: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
        LatestResult: { CompleteMessage: 'not saved' },
      }),
    })),
    RunView: Object.assign(
      vi.fn().mockImplementation(() => ({
        RunView: vi.fn().mockImplementation(async (p: CapturedParams) => {
          captured.filters.push(p.ExtraFilter ?? '');
          return okResult;
        }),
        RunViews: vi.fn().mockImplementation(async (ps: CapturedParams[]) => {
          ps.forEach((p) => captured.filters.push(p.ExtraFilter ?? ''));
          return ps.map(() => okResult);
        }),
      })),
      {
        FromMetadataProvider: vi.fn().mockImplementation(() => ({
          RunView: vi.fn().mockImplementation(async (p: CapturedParams) => {
            captured.filters.push(p.ExtraFilter ?? '');
            return okResult;
          }),
          RunViews: vi.fn().mockImplementation(async (ps: CapturedParams[]) => {
            ps.forEach((p) => captured.filters.push(p.ExtraFilter ?? ''));
            return ps.map(() => okResult);
          }),
        })),
      },
    ),
    UserInfo: vi.fn(),
    LogError: vi.fn(),
  };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJAIAgentEntity: vi.fn(),
  MJAIAgentActionEntity: vi.fn(),
  MJAIAgentRelationshipEntity: vi.fn(),
  MJAIAgentStepEntity: vi.fn(),
  MJAIAgentStepPathEntity: vi.fn(),
}));

vi.mock('@memberjunction/ai-core-plus', () => ({
  AgentSpec: vi.fn(),
  AgentActionSpec: vi.fn(),
  SubAgentSpec: vi.fn(),
}));

import { AgentSpecSync } from '../agent-spec-sync';

const MARKER = "' OR '1'='1";
const NOT_A_UUID = `11111111-2222-3333-4444-555555555555${MARKER}`;

describe('AgentSpecSync agent ID filters', () => {
  const mockUser = { ID: 'user-1', Email: 'test@test.com' } as never;

  beforeEach(() => {
    captured.filters = [];
    captured.loadResult = false;
    captured.loads = 0;
  });

  it('does not put an agent ID that is not a UUID into a filter when saving a loaded spec', async () => {
    const sync = new AgentSpecSync({ ID: NOT_A_UUID, Name: 'n' }, mockUser);
    sync.markDirty();
    sync.markLoaded();

    await sync.SaveToDatabase().catch(() => undefined);

    expect(captured.filters.filter((f) => f.includes(MARKER))).toEqual([]);
  });

  it('refuses an agent ID that is not a UUID before loading it', async () => {
    captured.loadResult = true;
    const provider = {
      GetEntityObject: async () => ({
        Load: async () => {
          captured.loads++;
          return captured.loadResult;
        },
      }),
    };

    const refused = await AgentSpecSync.LoadFromDatabase(NOT_A_UUID, mockUser, true, provider as never).then(() => false, () => true);

    expect(captured.filters.filter((f) => f.includes(MARKER))).toEqual([]);
    expect(captured.loads).toBe(0);
    expect(refused).toBe(true);
  });
});

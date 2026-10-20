import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  Metadata: vi.fn().mockImplementation(() => ({
    GetEntityObject: vi.fn().mockResolvedValue({
      Load: vi.fn().mockResolvedValue(true),
      Save: vi.fn().mockResolvedValue(true),
      Delete: vi.fn().mockResolvedValue(true),
      NewRecord: vi.fn(),
      Validate: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
      ID: 'saved-id-1',
      Name: '',
      Description: null,
      IconClass: null,
      LogoURL: null,
      ParentID: null,
      DriverClass: null,
      ModelSelectionMode: 'Agent Type',
      TypeID: null,
      Status: 'Active',
      PayloadDownstreamPaths: null,
      PayloadUpstreamPaths: null,
      PayloadSelfReadPaths: null,
      PayloadSelfWritePaths: null,
      PayloadScope: null,
      FinalPayloadValidation: null,
      FinalPayloadValidationMode: 'Retry',
      FinalPayloadValidationMaxRetries: 3,
      StartingPayloadValidation: null,
      StartingPayloadValidationMode: 'Fail',
      MaxCostPerRun: null,
      MaxTokensPerRun: null,
      MaxIterationsPerRun: null,
      MaxTimePerRun: null,
      MinExecutionsPerRun: null,
      MaxExecutionsPerRun: null,
      DefaultPromptEffortLevel: null,
      ChatHandlingOption: null,
      DefaultArtifactTypeID: null,
      OwnerUserID: null,
      InvocationMode: 'Any',
      FunctionalRequirements: null,
      TechnicalDesign: null,
    }),
  })),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({
      Success: true,
      Results: [],
      RowCount: 0,
    }),
    RunViews: vi.fn().mockResolvedValue([
      { Success: true, Results: [], RowCount: 0 },
      { Success: true, Results: [], RowCount: 0 },
      { Success: true, Results: [], RowCount: 0 },
      { Success: true, Results: [], RowCount: 0 },
      { Success: true, Results: [], RowCount: 0 },
    ]),
  })),
  UserInfo: vi.fn(),
  LogError: vi.fn(),
}));

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

describe('AgentSpecSync', () => {
  const mockUser = { ID: 'user-1', Email: 'test@test.com' } as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create empty spec when no args provided', () => {
      const sync = new AgentSpecSync();
      expect(sync.spec).toBeDefined();
      expect(sync.spec.ID).toBe('');
      expect(sync.spec.Name).toBe('');
      expect(sync.spec.Actions).toEqual([]);
      expect(sync.spec.SubAgents).toEqual([]);
    });

    it('should initialize with partial spec', () => {
      const sync = new AgentSpecSync({
        Name: 'Test Agent',
        Description: 'A test agent',
      });
      expect(sync.spec.Name).toBe('Test Agent');
      expect(sync.spec.Description).toBe('A test agent');
      expect(sync.isDirty).toBe(true);
    });

    it('should store context user', () => {
      const sync = new AgentSpecSync({ Name: 'Test' }, mockUser);
      expect(sync.isDirty).toBe(true);
    });
  });

  describe('isDirty / isLoaded', () => {
    it('should be dirty when created with spec', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.isDirty).toBe(true);
      expect(sync.isLoaded).toBe(false);
    });

    it('should not be dirty when created empty', () => {
      const sync = new AgentSpecSync();
      expect(sync.isDirty).toBe(false);
    });
  });

  describe('markDirty', () => {
    it('should set dirty flag', () => {
      const sync = new AgentSpecSync();
      expect(sync.isDirty).toBe(false);
      sync.markDirty();
      expect(sync.isDirty).toBe(true);
    });
  });

  describe('markLoaded', () => {
    it('should set loaded flag', () => {
      const sync = new AgentSpecSync();
      expect(sync.isLoaded).toBe(false);
      sync.markLoaded();
      expect(sync.isLoaded).toBe(true);
    });
  });

  describe('toJSON', () => {
    it('should return a copy of the spec', () => {
      const sync = new AgentSpecSync({
        Name: 'Test Agent',
        Description: 'Description',
      });
      const json = sync.toJSON();
      expect(json.Name).toBe('Test Agent');
      expect(json.Description).toBe('Description');
    });

    it('should return a new object (not the same reference)', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      const json = sync.toJSON();
      json.Name = 'Modified';
      expect(sync.spec.Name).toBe('Test');
    });
  });

  describe('FromRawSpec', () => {
    it('should create instance from raw spec', () => {
      const rawSpec = {
        ID: 'raw-1',
        Name: 'Raw Agent',
        StartingPayloadValidationMode: 'Fail' as const,
        Actions: [],
        SubAgents: [],
      };
      const sync = AgentSpecSync.FromRawSpec(rawSpec, mockUser);
      expect(sync.spec.Name).toBe('Raw Agent');
      expect(sync.isDirty).toBe(true);
    });
  });

  describe('mutation tracking', () => {
    it('should start with no mutations', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.getMutations()).toEqual([]);
    });

    it('should clear mutations', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      sync.clearMutations();
      expect(sync.getMutations()).toEqual([]);
    });
  });

  describe('initializeSpec defaults', () => {
    it('should set default StartingPayloadValidationMode to Fail', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.spec.StartingPayloadValidationMode).toBe('Fail');
    });

    it('should set default FinalPayloadValidationMode to Retry', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.spec.FinalPayloadValidationMode).toBe('Retry');
    });

    it('should set default InvocationMode to Any', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.spec.InvocationMode).toBe('Any');
    });

    it('should set default ModelSelectionMode to Agent Type', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.spec.ModelSelectionMode).toBe('Agent Type');
    });

    it('should default Actions and SubAgents to empty arrays', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.spec.Actions).toEqual([]);
      expect(sync.spec.SubAgents).toEqual([]);
    });

    it('should default Steps and Paths to empty arrays', () => {
      const sync = new AgentSpecSync({ Name: 'Test' });
      expect(sync.spec.Steps).toEqual([]);
      expect(sync.spec.Paths).toEqual([]);
    });

    it('should preserve provided values', () => {
      const sync = new AgentSpecSync({
        Name: 'Test',
        MaxCostPerRun: 10.0,
        MaxTokensPerRun: 5000,
        InvocationMode: 'Chat',
      });
      expect(sync.spec.MaxCostPerRun).toBe(10.0);
      expect(sync.spec.MaxTokensPerRun).toBe(5000);
      expect(sync.spec.InvocationMode).toBe('Chat');
    });
  });

  describe('SaveToDatabase', () => {
    it('should skip save when not dirty and loaded', async () => {
      const sync = new AgentSpecSync();
      // Mark as loaded but not dirty
      sync.markLoaded();
      sync.spec.ID = 'existing-id';
      // isDirty is false by default for empty constructor
      const result = await sync.SaveToDatabase();
      expect(result.success).toBe(true);
      expect(result.mutations).toEqual([]);
    });

    it('should attempt save when dirty and return result', async () => {
      const sync = new AgentSpecSync({ Name: 'New Agent' }, mockUser);
      const result = await sync.SaveToDatabase();
      // SaveToDatabase returns a result object with agentId, success, and mutations
      expect(result.agentId).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.mutations)).toBe(true);
    });

    it('creates agent, steps, and paths when spec carries synthetic correlation IDs (e.g. from ConvertTaskGraphToAgentSpec)', async () => {
      const createdEntities: Array<{ entityName: string; entity: Record<string, unknown> }> = [];
      let uuidSeq = 0;
      const customProvider = {
        GetEntityObject: vi.fn().mockImplementation(async (entityName: string) => {
          const id = `00000000-0000-0000-0000-00000000000${++uuidSeq}`;
          const entity: Record<string, unknown> = {
            ID: id,
            Load: vi.fn().mockRejectedValue(new Error('Load must not be called for synthetic non-UUID IDs')),
            NewRecord: vi.fn(),
            Validate: vi.fn().mockReturnValue({ Success: true, Errors: [] }),
            Save: vi.fn().mockResolvedValue(true),
          };
          createdEntities.push({ entityName, entity });
          return entity;
        }),
      };

      const sync = AgentSpecSync.FromRawSpec(
        {
          ID: 'workflow-1792442000-0',
          Name: 'Revenue Concentration Analysis',
          Status: 'Disabled',
          StartingPayloadValidationMode: 'Warn',
          Steps: [
            {
              ID: 'wf-node-1',
              Name: 'Top 5 Products',
              StepType: 'Sub-Agent',
              SubAgentID: '204FF1D6-A6E9-4B54-B3D8-2B7F82B8D3A2',
              StartingStep: true,
              PositionX: 120.4,
              PositionY: 40.6,
            },
            {
              ID: 'wf-node-2',
              Name: 'Render Chart',
              StepType: 'Sub-Agent',
              SubAgentID: '304FF1D6-A6E9-4B54-B3D8-2B7F82B8D3A2',
              StartingStep: false,
            },
          ],
          Paths: [
            {
              ID: 'wf-node-3',
              OriginStepID: 'wf-node-1',
              DestinationStepID: 'wf-node-2',
              Priority: 0,
            },
          ],
        },
        mockUser,
        customProvider as never,
      );

      const result = await sync.SaveToDatabase();
      expect(result.success).toBe(true);
      expect(result.agentId).toBe('00000000-0000-0000-0000-000000000001');

      const step1 = createdEntities[1].entity;
      const step2 = createdEntities[2].entity;
      const path1 = createdEntities[3].entity;

      expect(step1.PositionX).toBe(120);
      expect(step1.PositionY).toBe(41);
      expect(path1.OriginStepID).toBe(step1.ID);
      expect(path1.DestinationStepID).toBe(step2.ID);
    });
  });

  describe('spec with actions', () => {
    it('should initialize actions from partial spec', () => {
      const sync = new AgentSpecSync({
        Name: 'Test Agent',
        Actions: [
          {
            AgentActionID: 'aa-1',
            ActionID: 'action-1',
            Status: 'Active',
          },
        ],
      });
      expect(sync.spec.Actions).toHaveLength(1);
      expect(sync.spec.Actions![0].ActionID).toBe('action-1');
    });
  });

  describe('spec with sub-agents', () => {
    it('should initialize sub-agents from partial spec', () => {
      const sync = new AgentSpecSync({
        Name: 'Parent Agent',
        SubAgents: [
          {
            Type: 'child',
            SubAgent: {
              ID: 'child-1',
              Name: 'Child Agent',
              StartingPayloadValidationMode: 'Fail',
            },
          },
        ],
      });
      expect(sync.spec.SubAgents).toHaveLength(1);
      expect(sync.spec.SubAgents![0].Type).toBe('child');
    });
  });

  describe('spec with prompts', () => {
    it('should initialize prompts from partial spec', () => {
      const sync = new AgentSpecSync({
        Name: 'Test Agent',
        Prompts: [
          { PromptID: 'p-1', PromptText: 'Hello', PromptRole: 'System', PromptPosition: 'First' },
        ],
      });
      expect(sync.spec.Prompts).toHaveLength(1);
    });
  });

  describe('spec with steps and paths', () => {
    it('should initialize steps from partial spec', () => {
      const sync = new AgentSpecSync({
        Name: 'Flow Agent',
        Steps: [
          { ID: 'step-1', Name: 'Start', StepType: 'Action', StartingStep: true },
        ],
        Paths: [
          { ID: 'path-1', OriginStepID: 'step-1', DestinationStepID: 'step-2', Priority: 1 },
        ],
      });
      expect(sync.spec.Steps).toHaveLength(1);
      expect(sync.spec.Paths).toHaveLength(1);
    });
  });
});

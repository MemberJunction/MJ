/**
 * Real `MJAIAgentStepEntity` and `MJAIAgentStepPathEntity` instances for class-level specs.
 *
 * Built on a hand-made `EntityInfo` that lists only the columns the editor reads, so no metadata
 * provider or database is needed, and the objects are the real generated classes rather than
 * look-alikes cast to them: their setters run, and `NewRecord()` gives them an ID the way the
 * editor's own new steps get one.
 */
import { EntityInfo } from '@memberjunction/core';
import { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';

type FieldSpec = { Name: string; Type: string };

const STEP_FIELDS: readonly FieldSpec[] = [
  { Name: 'ID', Type: 'uniqueidentifier' },
  { Name: 'AgentID', Type: 'uniqueidentifier' },
  { Name: 'Name', Type: 'nvarchar' },
  { Name: 'Description', Type: 'nvarchar' },
  { Name: 'StepType', Type: 'nvarchar' },
  { Name: 'StartingStep', Type: 'bit' },
  { Name: 'TimeoutSeconds', Type: 'int' },
  { Name: 'RetryCount', Type: 'int' },
  { Name: 'OnErrorBehavior', Type: 'nvarchar' },
  { Name: 'ActionID', Type: 'uniqueidentifier' },
  { Name: 'SubAgentID', Type: 'uniqueidentifier' },
  { Name: 'PromptID', Type: 'uniqueidentifier' },
  { Name: 'ActionOutputMapping', Type: 'nvarchar' },
  { Name: 'PositionX', Type: 'int' },
  { Name: 'PositionY', Type: 'int' },
  { Name: 'Width', Type: 'int' },
  { Name: 'Height', Type: 'int' },
  { Name: 'Status', Type: 'nvarchar' },
  { Name: 'ActionInputMapping', Type: 'nvarchar' },
  { Name: 'LoopBodyType', Type: 'nvarchar' },
  { Name: 'Configuration', Type: 'nvarchar' }
];

const PATH_FIELDS: readonly FieldSpec[] = [
  { Name: 'ID', Type: 'uniqueidentifier' },
  { Name: 'OriginStepID', Type: 'uniqueidentifier' },
  { Name: 'DestinationStepID', Type: 'uniqueidentifier' },
  { Name: 'Condition', Type: 'nvarchar' },
  { Name: 'Priority', Type: 'int' },
  { Name: 'Description', Type: 'nvarchar' },
  { Name: 'PathPoints', Type: 'nvarchar' }
];

function entityInfo(name: string, fields: readonly FieldSpec[]): EntityInfo {
  return new EntityInfo({
    ID: name,
    Name: name,
    Status: 'Active',
    EntityFields: fields.map((field, index) => ({
      Name: field.Name,
      Type: field.Type,
      Sequence: index + 1,
      IsPrimaryKey: field.Name === 'ID',
      AllowsNull: field.Name !== 'ID',
      AllowUpdateAPI: true
    }))
  });
}

/** The `EntityInfo` a test step is built on, for a fake provider's `GetEntityObject`. */
export const AGENT_STEP_ENTITY_INFO = entityInfo('MJ: AI Agent Steps', STEP_FIELDS);

const AGENT_STEP_PATH_ENTITY_INFO = entityInfo('MJ: AI Agent Step Paths', PATH_FIELDS);

/** The step columns a spec may set. */
export type TestStepFields = Partial<Pick<MJAIAgentStepEntity,
  'Name' | 'StepType' | 'Configuration' | 'PromptID' | 'Status' | 'StartingStep' | 'SubAgentID' | 'ActionID'>>;

/** The path columns a spec may set. */
export type TestPathFields = Partial<Pick<MJAIAgentStepPathEntity, 'DestinationStepID' | 'Condition' | 'Description' | 'Priority'>>;

/** A new, unsaved step with the given ID; a Decision step named "Test Step" unless the fields say otherwise. */
export function MakeStep(id: string, fields: TestStepFields = {}): MJAIAgentStepEntity {
  const step = new MJAIAgentStepEntity(AGENT_STEP_ENTITY_INFO);
  step.NewRecord();
  step.ID = id;
  step.Name = 'Test Step';
  step.StepType = 'Decision';
  step.Status = 'Active';
  step.StartingStep = false;
  step.PromptID = null;
  step.Configuration = null;
  return Object.assign(step, fields);
}

/** A new, unsaved path from `originStepID`; to `dest-id` unless the fields say otherwise. */
export function MakePath(id: string, originStepID: string, fields: TestPathFields = {}): MJAIAgentStepPathEntity {
  const path = new MJAIAgentStepPathEntity(AGENT_STEP_PATH_ENTITY_INFO);
  path.NewRecord();
  path.ID = id;
  path.OriginStepID = originStepID;
  path.DestinationStepID = 'dest-id';
  path.Condition = null;
  path.Priority = 0;
  return Object.assign(path, fields);
}

/** A Decision step whose configuration is `config`, serialized as the editor stores it. */
export function MakeDecisionStep(id: string, config: object, fields: TestStepFields = {}): MJAIAgentStepEntity {
  return MakeStep(id, { ...fields, StepType: 'Decision', Configuration: JSON.stringify(config) });
}

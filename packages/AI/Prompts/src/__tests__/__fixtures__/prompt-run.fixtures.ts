/**
 * Test doubles for driving the real `AIPromptRunner.ExecutePrompt` without a database. Build the entities while the
 * test file is collected: the AIPromptRunner tests replace `ClassFactory.CreateInstance` in `beforeEach`.
 */
import { AIPromptParams, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { AIPromptRunner } from '../../AIPromptRunner';

type RealEntityValue = string | number | boolean | null;

/** A real entity object whose metadata holds only the named fields, hydrated with `values`. */
function BuildRealEntity<T extends BaseEntity>(ctor: new (info: EntityInfo) => T, name: string, values: Record<string, RealEntityValue>): T {
  const entityId = `entity-${name}`;
  const info = new EntityInfo({
    ID: entityId, Name: name,
    Fields: Object.entries(values).map(([field, value], index) => ({
      ID: `${entityId}-${field}`, EntityID: entityId, Entity: name, Sequence: index + 1, Name: field, IsPrimaryKey: field === 'ID', AllowUpdateAPI: true,
      Type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bit' : field.endsWith('ID') ? 'uniqueidentifier' : 'nvarchar',
    })),
  });
  const record = new ctor(info);
  record.Hydrate(values);
  return record;
}

class UnsavedPromptRun extends MJAIPromptRunEntityExtended {
  public override async Save(): Promise<boolean> {
    return true;
  }
}

/** A `Running` prompt run that is never written, carrying the fields a run's finalize sets. */
export function BuildPromptRunRecord(id: string): MJAIPromptRunEntityExtended {
  return BuildRealEntity(UnsavedPromptRun, 'MJ: AI Prompt Runs', {
    ID: id, Status: 'Running', Success: false, ErrorMessage: null, ErrorDetails: null, Result: null,
  });
}

/** An active LLM prompt with no template, no retries and no failover; `values` overrides or adds fields. */
export function BuildPrompt(modelTypeID: string, values: Record<string, RealEntityValue> = {}): MJAIPromptEntityExtended {
  return BuildRealEntity(MJAIPromptEntityExtended, 'MJ: AI Prompts', {
    ID: 'prompt-1', Name: 'Test Prompt', Status: 'Active', SelectionStrategy: 'Default', AIModelTypeID: modelTypeID,
    OutputType: 'string', ValidationBehavior: 'Warn', MaxRetries: 0, ParallelizationMode: 'None', FailoverStrategy: 'None',
    ...values,
  });
}

/** Execution parameters for `prompt`: one user message, no template message, a context user. */
export function BuildPromptParams(prompt: MJAIPromptEntityExtended): AIPromptParams {
  const params = new AIPromptParams();
  params.prompt = prompt;
  params.contextUser = new UserInfo();
  params.conversationMessages = [{ role: 'user', content: 'Hello' }];
  params.templateMessageRole = 'none';
  params.verbose = false;
  return params;
}

/** The runner with its run record kept in memory and its retry delays counted instead of waited. */
export class InMemoryRunRecordRunner extends AIPromptRunner {
  public RetryDelays = 0;

  constructor(private readonly runRecord: MJAIPromptRunEntityExtended) {
    super();
  }

  protected override async CreateRunRecord(): Promise<MJAIPromptRunEntityExtended> {
    return this.runRecord;
  }
  protected override async ApplyRetryDelay(): Promise<void> {
    this.RetryDelays++;
  }
}

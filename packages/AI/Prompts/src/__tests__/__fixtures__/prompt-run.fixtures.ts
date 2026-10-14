/**
 * Typed test doubles for driving the real `AIPromptRunner.ExecutePrompt` without a database: real entity objects
 * (whose metadata holds only the fields a test names), a prompt run that is never written, and a runner that hands
 * back a given run record instead of creating one.
 *
 * Build the entities while the test file is being collected: an entity's fields are created through
 * `ClassFactory.CreateInstance`, which the AIPromptRunner tests replace in `beforeEach` to return their test driver.
 */
import { AIPromptParams, MJAIPromptEntityExtended, MJAIPromptRunEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { AIPromptRunner } from '../../AIPromptRunner';

/** A field value a test double's metadata is inferred from. */
export type RealEntityValue = string | number | boolean | null;

/** A real entity object of the given class, whose metadata holds only the named (updatable) fields, hydrated with `values`. */
export function BuildRealEntity<T extends BaseEntity>(ctor: new (info: EntityInfo) => T, name: string, values: Record<string, RealEntityValue>): T {
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

/** A prompt run that is never written: the runner's queued INSERT/UPDATE land here. */
export class UnsavedPromptRun extends MJAIPromptRunEntityExtended {
  public override async Save(): Promise<boolean> {
    return true;
  }
}

/** A `Running` prompt run carrying the fields a run's finalize writes, so a test can read them back. */
export function BuildPromptRunRecord(id: string): UnsavedPromptRun {
  return BuildRealEntity(UnsavedPromptRun, 'MJ: AI Prompt Runs', {
    ID: id, Status: 'Running', Success: false, Cancelled: false, CancellationReason: null,
    ErrorMessage: null, ErrorDetails: null, Result: null,
    TokensPrompt: 0, TokensCompletion: 0, TokensUsed: 0, Cost: 0, TotalCost: 0,
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

/**
 * The runner with its run record kept in memory: creating a run hands back the given record (after `OnRunCreated`).
 * Retry delays are counted instead of waited, so a test that retries does not sleep.
 */
export class InMemoryRunRecordRunner extends AIPromptRunner {
  /** Called when the runner creates its run, before the record is returned. */
  public OnRunCreated: (() => void) | undefined;
  /** How many retry delays the runner would have waited. */
  public RetryDelays = 0;

  constructor(private readonly runRecord: MJAIPromptRunEntityExtended) {
    super();
  }

  protected override async CreateRunRecord(): Promise<MJAIPromptRunEntityExtended> {
    this.OnRunCreated?.();
    return this.runRecord;
  }
  protected override async ApplyRetryDelay(): Promise<void> {
    this.RetryDelays++;
  }
}

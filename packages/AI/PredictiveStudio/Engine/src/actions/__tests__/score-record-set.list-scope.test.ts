import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { AsOfStrategy, FeatureSchemaEntry, FeatureStepGraph, PredictRequest, PredictResponse, SourceBinding } from '@memberjunction/predictive-studio-core';
import type { RecordRef } from '@memberjunction/record-set-processor-base';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import type { IMLModelLoader, ISidecarPredictor } from '../../scoring/types';

/**
 * The list scope loads its members as full entity objects, like the view and filter scopes, so scoring works for
 * an entity whose key is not called `ID` (feature columns are on the preloaded rows; nothing is re-read by an
 * assumed `ID` column). NO live DB, NO live sidecar.
 */

/** A minimal entity-info double exposing only the members the list scope reads. */
function fakeEntity(name: string, primaryKeys: string[]): EntityInfo {
  const pks = primaryKeys.map((n) => ({ Name: n }));
  return { ID: `${name}-id`, Name: name, PrimaryKeys: pks, FirstPrimaryKey: pks[0] } as unknown as EntityInfo;
}

/** A row keyed by field name. */
type Row = Record<string, string | number>;

/** A loaded entity object as the runner and processor read it: PrimaryKey, EntityInfo and GetAll(). */
class FakeLoadedRow {
  constructor(private readonly entity: EntityInfo, private readonly row: Row) {}
  public get EntityInfo(): EntityInfo {
    return this.entity;
  }
  public get PrimaryKey(): { ToString(): string } {
    const key = this.entity.PrimaryKeys.map((pk) => `${pk.Name}=${this.row[pk.Name]}`).join(' AND ');
    return { ToString: () => key };
  }
  public GetAll(): Row {
    return { ...this.row };
  }
}

/** A real list id: the runner refuses anything that is not a UUID. */
const LIST_ID = '7d3f6c1e-2b4a-4e8f-9c5d-1a2b3c4d5e6f';

/** The row cap RunView applies when a read does not pass `IgnoreMaxRows` (the entity's UserViewMaxRows default). */
const DEFAULT_MAX_ROWS = 1000;

/**
 * Provider fake serving one list, its member ids, and the member rows. Like the real provider it stops every read at
 * {@link DEFAULT_MAX_ROWS} unless the read passes `IgnoreMaxRows: true`, so dropping that flag loses members.
 */
class ListProvider {
  public readonly ViewParams: RunViewParams[] = [];
  public readonly BatchParams: RunViewParams[] = [];
  constructor(
    private readonly entity: EntityInfo,
    private readonly memberIds: string[],
    private readonly rowFor: (memberId: string) => Row,
    /** Index of a `RunViews` chunk that fails, to prove a failed chunk is not silently dropped. */
    private readonly failingChunk: number | null = null,
  ) {}
  public EntityByID(id: string): EntityInfo | undefined {
    return id === this.entity.ID ? this.entity : undefined;
  }
  public EntityByName(name: string): EntityInfo | undefined {
    return name === this.entity.Name ? this.entity : undefined;
  }
  async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.ViewParams.push(params);
    const matched: Row[] =
      params.EntityName === 'MJ: Lists'
        ? [{ EntityID: this.entity.ID }]
        : params.EntityName === 'MJ: List Details'
          ? this.memberIds.map((id) => ({ RecordID: id }))
          : []; // any other read (e.g. a feature-column re-read by an assumed ID column) finds nothing
    const rows = capped(params, matched);
    // Test double: the list scope reads EntityID from MJ: Lists and RecordID from MJ: List Details.
    return { Success: true, Results: rows as unknown as T[], RowCount: rows.length, TotalRowCount: matched.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
  }
  private serve(params: RunViewParams, row: Row): FakeLoadedRow | Row {
    return shapeRow(this.entity, params, row);
  }
  async RunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
    this.BatchParams.push(...params);
    let served = 0;
    return params.map((chunkParams, index) => {
      const ids = this.memberIds.slice(served, served + 100);
      served += ids.length;
      if (index === this.failingChunk) {
        return { Success: false, Results: [] as T[], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: 'chunk read timed out' } as RunViewResult<T>;
      }
      const chunk = capped(chunkParams, ids).map((id) => this.serve(chunkParams, this.rowFor(id)));
      // Test double: each chunk serves the next 100 members, shaped as the request's ResultType/Fields ask.
      return { Success: true, Results: chunk as unknown as T[], RowCount: chunk.length, TotalRowCount: ids.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    });
  }
}

/** The rows a read returns: all of them with `IgnoreMaxRows`, else at most `MaxRows` (default {@link DEFAULT_MAX_ROWS}). */
function capped<T>(params: RunViewParams, rows: T[]): T[] {
  return params.IgnoreMaxRows === true ? rows : rows.slice(0, params.MaxRows ?? DEFAULT_MAX_ROWS);
}

/** Shape a row as RunView would: a loaded entity object, or a plain row narrowed to `Fields`. */
function shapeRow(entity: EntityInfo, params: RunViewParams, row: Row): FakeLoadedRow | Row {
  if (params.ResultType === 'entity_object') {
    return new FakeLoadedRow(entity, row);
  }
  const fields = params.Fields;
  return fields && fields.length > 0 ? Object.fromEntries(fields.map((f) => [f, row[f]])) : { ...row };
}

class TestableRunner extends ProductionScoreRecordSetRunner {
  public Resolve(provider: ListProvider, listId: string = LIST_ID): Promise<RecordRef[]> {
    // Test doubles: resolveList reads only the provider's RunView/RunViews/EntityByID.
    return this.resolveList(listId, { ID: 'u1' } as unknown as UserInfo, provider as unknown as IMetadataProvider);
  }
}

describe('ProductionScoreRecordSetRunner.resolveList', () => {
  it('loads members as full entity objects (no narrowed Fields) keyed by the entity\'s real key', async () => {
    const entity = fakeEntity('Individuals', ['individual_id']);
    const provider = new ListProvider(entity, ['42', '43'], (id) => ({ individual_id: id, tenure: 3 }));
    const refs = await new TestableRunner().Resolve(provider);

    expect(provider.BatchParams).toHaveLength(1);
    expect(provider.BatchParams[0].ResultType).toBe('entity_object');
    expect(provider.BatchParams[0].Fields).toBeUndefined();
    expect(provider.BatchParams[0].ExtraFilter).toBe("individual_id IN ('42', '43')");
    expect(refs.map((r) => r.EntityID)).toEqual(['Individuals-id', 'Individuals-id']);
    expect(refs[0].Record).toBeInstanceOf(FakeLoadedRow);
  });

  it('filters a composite-key list by every key column', async () => {
    const entity = fakeEntity('OrderLines', ['OrderID', 'LineNo']);
    const provider = new ListProvider(entity, ['OrderID|11055||LineNo|3'], () => ({ OrderID: '11055', LineNo: '3' }));
    await new TestableRunner().Resolve(provider);

    expect(provider.BatchParams[0].ExtraFilter).toBe("(OrderID='11055' AND LineNo='3')");
  });

  it('batches more than 100 members into one RunViews call of 100-member chunks', async () => {
    const entity = fakeEntity('Members', ['ID']);
    const ids = Array.from({ length: 250 }, (_v, i) => `m${i}`);
    const provider = new ListProvider(entity, ids, (id) => ({ ID: id }));
    const refs = await new TestableRunner().Resolve(provider);

    expect(provider.BatchParams).toHaveLength(3);
    expect(refs).toHaveLength(250);
  });

  it('resolves every member of a 1,500-member list, past the 1,000-row default cap', async () => {
    const entity = fakeEntity('Members', ['ID']);
    const ids = Array.from({ length: 1500 }, (_v, i) => `m${i}`);
    const provider = new ListProvider(entity, ids, (id) => ({ ID: id }));
    const refs = await new TestableRunner().Resolve(provider);

    expect(refs).toHaveLength(1500);
    expect(refs[1499].RecordID).toBe('ID=m1499');
    const memberRead = provider.ViewParams.find((p) => p.EntityName === 'MJ: List Details');
    expect(memberRead?.IgnoreMaxRows).toBe(true);
    expect(provider.BatchParams).toHaveLength(15);
    expect(provider.BatchParams.every((p) => p.IgnoreMaxRows === true)).toBe(true);
  });

  it('throws when one member chunk fails instead of dropping its members', async () => {
    const entity = fakeEntity('Members', ['ID']);
    const ids = Array.from({ length: 250 }, (_v, i) => `m${i}`);
    const provider = new ListProvider(entity, ids, (id) => ({ ID: id }), 1);

    await expect(new TestableRunner().Resolve(provider)).rejects.toThrow(/failed to resolve scope for entity 'Members': chunk read timed out/);
  });

  it('refuses a listId that is not a UUID before reading anything', async () => {
    const entity = fakeEntity('Members', ['ID']);
    const provider = new ListProvider(entity, ['m1'], (id) => ({ ID: id }));

    await expect(new TestableRunner().Resolve(provider, "x' OR 1=1 --")).rejects.toThrow(/is not a valid UUID/);
    expect(provider.ViewParams).toHaveLength(0);
    expect(provider.BatchParams).toHaveLength(0);
  });
});

// ----- end-to-end scoring over a list whose entity is keyed by `individual_id` -----

const SCHEMA: FeatureSchemaEntry[] = [
  { Name: 'tenure', Kind: 'numeric' },
  { Name: 'events', Kind: 'numeric' },
];

/** A Published model over `Individuals`, exposing exactly the fields the processor reads. */
class IndividualsModel {
  public ID = 'model-1';
  public Status: MJMLModelEntity['Status'] = 'Published';
  public ArtifactFileID: string | null = 'file-1';
  public FittedPreprocessing: string | null = '{}';
  public FeatureSchema = JSON.stringify(SCHEMA);
  public ProblemType: 'classification' | 'regression' = 'classification';
  public TargetVariable = 'Renewed';
  public PipelineID: string | null = null;
  public Lineage: string | null = JSON.stringify({
    targetEntityName: 'Individuals',
    sourceBindings: [{ Kind: 'Entity', Ref: 'Individuals' }] satisfies SourceBinding[],
    featureSteps: { Steps: [{ Id: 's1', Kind: 'select', Columns: ['tenure', 'events'] }] } satisfies FeatureStepGraph,
    asOfStrategy: { Mode: 'none' } satisfies AsOfStrategy,
  });
}

class ModelLoader implements IMLModelLoader {
  async loadModel(): Promise<MJMLModelEntity | null> {
    // Test double: the processor reads only the IndividualsModel fields.
    return new IndividualsModel() as unknown as MJMLModelEntity;
  }
}

class RecordingSidecar implements ISidecarPredictor {
  public Requests: PredictRequest[] = [];
  async predict(req: PredictRequest): Promise<PredictResponse> {
    this.Requests.push(req);
    return { predictions: (req.rows ?? []).map((_r, i) => ({ score: 0.25 + i * 0.5, class: i === 0 ? 'lapse' : 'renew' })) };
  }
}

describe('ProductionScoreRecordSetRunner — scoring a list over a non-ID key', () => {
  it('scores every member of a list whose entity is keyed by individual_id', async () => {
    const entity = fakeEntity('Individuals', ['individual_id']);
    const provider = new ListProvider(entity, ['42', '43'], (id) => ({ individual_id: id, tenure: Number(id) - 40, events: 7 }));
    const artifacts = new InMemoryArtifactLoader();
    artifacts.set('file-1', new TextEncoder().encode('bytes'));
    const sidecar = new RecordingSidecar();
    const runner = new ProductionScoreRecordSetRunner({ deps: { modelLoader: new ModelLoader(), artifactLoader: artifacts, sidecar } });

    const result = await runner.run({
      modelId: 'model-1',
      scope: { listId: LIST_ID },
      contextUser: { ID: 'u1' } as unknown as UserInfo,
      provider: provider as unknown as IMetadataProvider, // test double: serves the list, its members and entity lookups
    });

    expect(result.failedCount).toBe(0);
    expect(result.scoredCount).toBe(2);
    expect(result.predictions?.map((p) => p.score)).toEqual([0.25, 0.75]);
    expect(sidecar.Requests).toHaveLength(1);
    expect(sidecar.Requests[0].rows).toEqual([
      { tenure: 2, events: 7 },
      { tenure: 3, events: 7 },
    ]);
  });

  it('scores all 1,500 members of a list larger than the 1,000-row default cap', async () => {
    const entity = fakeEntity('Individuals', ['individual_id']);
    const ids = Array.from({ length: 1500 }, (_v, i) => String(1000 + i));
    const provider = new ListProvider(entity, ids, (id) => ({ individual_id: id, tenure: 1, events: 2 }));
    const artifacts = new InMemoryArtifactLoader();
    artifacts.set('file-1', new TextEncoder().encode('bytes'));
    const sidecar = new RecordingSidecar();
    const runner = new ProductionScoreRecordSetRunner({ deps: { modelLoader: new ModelLoader(), artifactLoader: artifacts, sidecar } });

    const result = await runner.run({
      modelId: 'model-1',
      scope: { listId: LIST_ID },
      contextUser: { ID: 'u1' } as unknown as UserInfo,
      provider: provider as unknown as IMetadataProvider, // test double: serves the list, its members and entity lookups
    });

    expect(result.scoredCount).toBe(1500);
    expect(result.failedCount).toBe(0);
    expect(sidecar.Requests[0].rows).toHaveLength(1500);
    expect(provider.ViewParams.find((p) => p.EntityName === 'MJ: List Details')?.IgnoreMaxRows).toBe(true);
    expect(provider.BatchParams.every((p) => p.IgnoreMaxRows === true)).toBe(true);
  });
});

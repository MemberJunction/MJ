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

/** Provider fake serving one list, its member ids, and the member rows. */
class ListProvider {
  public readonly BatchParams: RunViewParams[] = [];
  constructor(
    private readonly entity: EntityInfo,
    private readonly memberIds: string[],
    private readonly rowFor: (memberId: string) => Row,
  ) {}
  public EntityByID(id: string): EntityInfo | undefined {
    return id === this.entity.ID ? this.entity : undefined;
  }
  public EntityByName(name: string): EntityInfo | undefined {
    return name === this.entity.Name ? this.entity : undefined;
  }
  async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    const rows: Row[] =
      params.EntityName === 'MJ: Lists'
        ? [{ EntityID: this.entity.ID }]
        : params.EntityName === 'MJ: List Details'
          ? this.memberIds.map((id) => ({ RecordID: id }))
          : []; // any other read (e.g. a feature-column re-read by an assumed ID column) finds nothing
    // Test double: the list scope reads EntityID from MJ: Lists and RecordID from MJ: List Details.
    return { Success: true, Results: rows as unknown as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
  }
  private serve(params: RunViewParams, row: Row): FakeLoadedRow | Row {
    return shapeRow(this.entity, params, row);
  }
  async RunViews<T>(params: RunViewParams[]): Promise<RunViewResult<T>[]> {
    this.BatchParams.push(...params);
    let served = 0;
    return params.map(() => {
      const ids = this.memberIds.slice(served, served + 100);
      served += ids.length;
      const chunk = ids.map((id) => this.serve(params[0], this.rowFor(id)));
      // Test double: each chunk serves the next 100 members, shaped as the request's ResultType/Fields ask.
      return { Success: true, Results: chunk as unknown as T[], RowCount: chunk.length, TotalRowCount: chunk.length, ExecutionTime: 0, ErrorMessage: '' } as RunViewResult<T>;
    });
  }
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
  public Resolve(provider: ListProvider): Promise<RecordRef[]> {
    // Test doubles: resolveList reads only the provider's RunView/RunViews/EntityByID.
    return this.resolveList('list-1', { ID: 'u1' } as unknown as UserInfo, provider as unknown as IMetadataProvider);
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
      scope: { listId: 'list-1' },
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
});

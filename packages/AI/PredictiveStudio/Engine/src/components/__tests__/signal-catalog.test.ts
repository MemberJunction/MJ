import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MJMLComponentTypeEntity } from '@memberjunction/core-entities';

import { SignalCatalog } from '../signal-catalog';
import type { MLComponentEngine } from '../ml-component-engine';
import type { ReuseFinder } from '../../stories/reuse-finder';

/**
 * The catalogue is the browsable half of the callable signal layer, and the field that carries the
 * weight is `Rebindable`. A caller building a UI or an agent planning a step uses it to decide
 * whether to offer a population at all — so getting it from the component TYPE's driver, rather
 * than from the instance or from a guess, is the behaviour these tests pin.
 *
 * The other thing pinned here is that a search's result set is the search's, not the listing's: a
 * ranked read must not silently widen back to the whole catalogue.
 */

const RECENCY_TYPE = { ID: 't-recency', Name: 'As-Of Recency', Kind: 'Input', DriverClass: 'asof_recency' };
const COLUMN_TYPE = { ID: 't-column', Name: 'Column', Kind: 'Input', DriverClass: 'select' };
const EMBEDDING_TYPE = { ID: 't-embedding', Name: 'Embedding', Kind: 'Input', DriverClass: 'embedding' };
const ALGO_TYPE = { ID: 't-xgb', Name: 'XGBoost', Kind: 'Model', DriverClass: 'xgboost' };

const ALL_TYPES = [RECENCY_TYPE, COLUMN_TYPE, EMBEDDING_TYPE, ALGO_TYPE];

function fakeEngine(): MLComponentEngine {
  return {
    TypesByKind: (kind: string) =>
      ALL_TYPES.filter((t) => t.Kind === kind) as unknown as MJMLComponentTypeEntity[],
    FindTypeByID: (id: string) => ALL_TYPES.find((t) => t.ID === id) as unknown as MJMLComponentTypeEntity,
  } as unknown as MLComponentEngine;
}

const ROWS = [
  {
    ID: 's-recency',
    Name: 'Renewal Risk › Days Since Last Activity',
    ComponentTypeID: RECENCY_TYPE.ID,
    ComponentType: RECENCY_TYPE.Name,
    Story: 'How long ago someone last did anything.',
    PromotionState: 'Approved',
    IsTrained: true,
  },
  {
    ID: 's-embedding',
    Name: 'Renewal Risk › Bio Embedding',
    ComponentTypeID: EMBEDDING_TYPE.ID,
    ComponentType: EMBEDDING_TYPE.Name,
    Story: 'What the biography says, as a vector.',
    PromotionState: 'Draft',
    IsTrained: false,
  },
  {
    ID: 's-column',
    Name: 'Alpha Model › Tenure Years',
    ComponentTypeID: COLUMN_TYPE.ID,
    ComponentType: COLUMN_TYPE.Name,
    Story: null,
    PromotionState: 'Approved',
    IsTrained: true,
  },
];

const mockRunView = vi.fn();
vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/core')>();
  return {
    ...actual,
    RunView: Object.assign(
      class {
        RunView = (...args: unknown[]) => mockRunView(...args);
      },
      { FromMetadataProvider: () => ({ RunView: (...args: unknown[]) => mockRunView(...args) }) },
    ),
  };
});

/** A catalogue whose finder is controllable, so ranking can be exercised without embeddings. */
class TestableCatalog extends SignalCatalog {
  public LastRequest: Parameters<ReuseFinder['find']>[0] | null = null;
  constructor(private readonly matches: Array<{ InstanceID: string; Similarity: number }> = []) {
    super();
  }
  protected override createFinder(): ReuseFinder {
    return {
      find: async (request) => {
        this.LastRequest = request;
        return {
          Matches: this.matches.map((m) => ({
            InstanceID: m.InstanceID,
            Name: '',
            ComponentTypeID: '',
            ComponentTypeName: '',
            Similarity: m.Similarity,
            Story: null,
            PromotionState: 'Approved',
          })),
          CandidatesConsidered: this.matches.length,
          Warnings: [],
        };
      },
    } as unknown as ReuseFinder;
  }
}

describe('SignalCatalog', () => {
  beforeEach(() => {
    mockRunView.mockReset();
  });

  it('lists Input components, strips the owning model from the name, and resolves rebindability from the type', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });

    const result = await new TestableCatalog().list({}, undefined, undefined, fakeEngine());

    // Only Input types are asked for — a Model leaf is not a measure anyone can compute.
    const filter = mockRunView.mock.calls[0][0].ExtraFilter as string;
    expect(filter).toContain(RECENCY_TYPE.ID);
    expect(filter).toContain(COLUMN_TYPE.ID);
    expect(filter).not.toContain(ALGO_TYPE.ID);
    // The story vector is large and nothing here ranks against it.
    expect(mockRunView.mock.calls[0][0].Fields).not.toContain('StoryVector');

    expect(result.Signals.map((s) => s.Name)).toEqual([
      'Bio Embedding',
      'Days Since Last Activity',
      'Tenure Years',
    ]);
    const byName = new Map(result.Signals.map((s) => [s.Name, s]));
    expect(byName.get('Days Since Last Activity')!.Rebindable).toBe(true);
    expect(byName.get('Tenure Years')!.Rebindable).toBe(true);
    // An embedding carries its own execution path — offering it with a population picker cannot work.
    expect(byName.get('Bio Embedding')!.Rebindable).toBe(false);
  });

  it('rebindableOnly excludes what cannot be pointed elsewhere, and says how many it dropped', async () => {
    mockRunView.mockResolvedValue({ Success: true, Results: ROWS });

    const result = await new TestableCatalog().list({ RebindableOnly: true }, undefined, undefined, fakeEngine());

    expect(result.Signals.map((s) => s.ID)).toEqual(['s-recency', 's-column']);
    expect(result.Warnings.join(' ')).toContain('1 measure(s) matched but cannot be pointed');
  });

  it('a ranked search reads only the matched ids and orders by similarity', async () => {
    mockRunView.mockResolvedValue({
      Success: true,
      Results: ROWS.filter((r) => r.ID !== 's-embedding'),
    });
    const catalog = new TestableCatalog([
      { InstanceID: 's-column', Similarity: 0.62 },
      { InstanceID: 's-recency', Similarity: 0.94 },
    ]);

    const result = await catalog.list(
      { SearchVector: [0.1, 0.2], MaxRows: 10, MinSimilarity: 0.5 },
      undefined,
      undefined,
      fakeEngine(),
    );

    // The finder is narrowed to Input BEFORE ranking, so TopK is never spent on other kinds.
    expect(catalog.LastRequest?.OfKind).toBe('Input');
    // A catalogue lists what exists; an untrained measure is still one someone defined.
    expect(catalog.LastRequest?.TrainedOnly).toBe(false);

    // The listing must not widen the search back out to every Input component.
    const filter = mockRunView.mock.calls[0][0].ExtraFilter as string;
    expect(filter).toBe("ID IN ('s-column','s-recency')");

    expect(result.Signals.map((s) => s.ID)).toEqual(['s-recency', 's-column']);
    expect(result.Signals[0].Similarity).toBe(0.94);
  });

  it('a search that matched nothing reads nothing, rather than falling back to the whole catalogue', async () => {
    const result = await new TestableCatalog([]).list(
      { SearchVector: [0.1] },
      undefined,
      undefined,
      fakeEngine(),
    );

    expect(mockRunView).not.toHaveBeenCalled();
    expect(result.Signals).toEqual([]);
  });

  it('reports a failed read as a warning rather than as an empty catalogue', async () => {
    mockRunView.mockResolvedValue({ Success: false, ErrorMessage: 'permission denied' });

    const result = await new TestableCatalog().list({}, undefined, undefined, fakeEngine());

    expect(result.Signals).toEqual([]);
    expect(result.Warnings.join(' ')).toContain('permission denied');
  });

  it('says plainly when the tree carries no Input types at all', async () => {
    const emptyEngine = { TypesByKind: () => [] } as unknown as MLComponentEngine;

    const result = await new TestableCatalog().list({}, undefined, undefined, emptyEngine);

    expect(mockRunView).not.toHaveBeenCalled();
    expect(result.Warnings[0]).toContain('no Input types');
  });
});

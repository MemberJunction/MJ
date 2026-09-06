/**
 * @module components/signal-catalog
 *
 * **What can I measure?** — the browsable half of the callable signal layer.
 *
 * {@link SignalComputer} answers *"compute this measure over these records"*, but a caller needs an
 * id before it can ask, and it has no way to guess one. This is where that id comes from: the list
 * of measures that have already proven themselves inside a model, each with the prose describing
 * what it measures and a flag saying whether it can be pointed somewhere new.
 *
 * `Rebindable` is computed here, from the component TYPE's driver, rather than left to each caller
 * to infer. A browser cannot see the type tree — and a caller that guessed would eventually offer a
 * user an embedding signal with an entity picker beside it, which cannot work. One definition,
 * server-side, next to the resolver that enforces it.
 *
 * With a `SearchVector`, ranking is delegated to {@link ReuseFinder} — the same cosine-over-story-
 * vectors path the Components panel already uses, narrowed to `Input` before ranking. Two search
 * paths over one corpus would drift, and the one that drifted would be the one nobody tested. The
 * vector is the caller's to supply for the same reason it is there: it must come from the model
 * that wrote the stories, and embedding here would hide that requirement rather than enforce it.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';

import { MLComponentEngine } from './ml-component-engine';
import { isRebindable, signalLeafName } from './signal-binding';
import { ReuseFinder } from '../stories/reuse-finder';

/** One measure in the catalogue. */
export interface SignalCatalogEntry {
  /** `MJ: ML Components` id — what {@link ComputeSignalRequest.SignalID} takes. */
  ID: string;
  /** The measure's own name, without the model that produced it. */
  Name: string;
  /** The component type's name — `As-Of Count`, `As-Of Recency`, `Column`, `Embedding`, … */
  TypeName: string;
  /** What it measures, in business language, written when its model was published. */
  Story: string | null;
  /** Whether it can be pointed at a different population. False for kinds that carry their own execution path. */
  Rebindable: boolean;
  /** Review state of the signal — a caller may want to show or hide unapproved work. */
  PromotionState: string;
  /** Whether the signal carries fitted state from training. */
  IsTrained: boolean;
  /** Cosine similarity to the query, present only on a `Search`. */
  Similarity?: number;
}

/** What to list. */
export interface SignalCatalogRequest {
  /**
   * Query embedding of the measure wanted, made with the SAME model that wrote the stories.
   * Supplied, results are ranked by meaning; omitted, the whole catalogue comes back in name order.
   */
  SearchVector?: number[];
  /** Hide measures that cannot be pointed at a different population. */
  RebindableOnly?: boolean;
  /** Cap on entries returned. */
  MaxRows?: number;
  /** Minimum similarity for a `Search`. Below it, a "match" is noise wearing a recommendation's shape. */
  MinSimilarity?: number;
  /** Review states to include. Defaults to every state — this is a catalogue, not a reuse proposal. */
  PromotionStates?: string[];
}

/** The catalogue, plus anything that was excluded and why. */
export interface SignalCatalogResult {
  Signals: SignalCatalogEntry[];
  Warnings: string[];
}

/** Default cap — a catalogue read should never become an unbounded table scan. */
const DEFAULT_MAX_ROWS = 200;

/** Row shape read from `MJ: ML Components`. `StoryVector` is deliberately not among the fields. */
interface SignalRow {
  ID: string;
  Name: string;
  ComponentTypeID: string;
  ComponentType: string;
  Story: string | null;
  PromotionState: string;
  IsTrained: boolean;
}

/**
 * Lists the signal catalogue. Stateless; construct once and reuse.
 */
export class SignalCatalog {
  public async list(
    request: SignalCatalogRequest,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    engine: MLComponentEngine = MLComponentEngine.Instance,
  ): Promise<SignalCatalogResult> {
    const warnings: string[] = [];
    const inputTypes = engine.TypesByKind('Input');
    if (inputTypes.length === 0) {
      return {
        Signals: [],
        Warnings: ['The component tree carries no Input types, so there is no signal catalogue to read.'],
      };
    }
    // Rebindability is a property of the TYPE, so it is resolved once per type rather than per row.
    const rebindableByType = new Map(inputTypes.map((t) => [t.ID, isRebindable(t.DriverClass)]));

    const searched = request.SearchVector
      ? await this.rank(request, contextUser, provider, engine, warnings)
      : null;

    const rows = await this.load(request, inputTypes.map((t) => t.ID), searched, contextUser, provider, warnings);
    const entries = rows.map((row) => this.toEntry(row, rebindableByType, searched));

    const filtered = request.RebindableOnly ? entries.filter((e) => e.Rebindable) : entries;
    if (request.RebindableOnly && filtered.length < entries.length) {
      warnings.push(
        `${entries.length - filtered.length} measure(s) matched but cannot be pointed at another population, and were excluded.`,
      );
    }

    // A search's ordering IS the answer; without one, name order is the only stable presentation.
    const ordered = searched
      ? filtered.sort((a, b) => (b.Similarity ?? 0) - (a.Similarity ?? 0))
      : filtered.sort((a, b) => a.Name.localeCompare(b.Name));

    return { Signals: ordered.slice(0, request.MaxRows ?? DEFAULT_MAX_ROWS), Warnings: warnings };
  }

  /** Rank by meaning, returning id → similarity. */
  protected async rank(
    request: SignalCatalogRequest,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    engine: MLComponentEngine,
    warnings: string[],
  ): Promise<Map<string, number>> {
    const result = await this.createFinder().find(
      {
        QueryVector: request.SearchVector ?? [],
        TopK: request.MaxRows ?? DEFAULT_MAX_ROWS,
        MinSimilarity: request.MinSimilarity,
        OfKind: 'Input',
        PromotionStates: request.PromotionStates,
        // A catalogue lists what exists; an untrained measure is still a measure someone defined.
        TrainedOnly: false,
      },
      contextUser,
      provider,
      engine,
    );
    warnings.push(...result.Warnings);
    return new Map(result.Matches.map((m) => [m.InstanceID, m.Similarity]));
  }

  /**
   * Read the catalogue rows. After a search this reads only the matched ids, so the search's own
   * promotion and vector filters are not silently widened by the listing query.
   */
  protected async load(
    request: SignalCatalogRequest,
    inputTypeIds: string[],
    searched: Map<string, number> | null,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    warnings: string[],
  ): Promise<SignalRow[]> {
    if (searched && searched.size === 0) {
      return [];
    }
    const quote = (v: string): string => `'${v.replace(/'/g, "''")}'`;
    const filters = searched
      ? [`ID IN (${[...searched.keys()].map(quote).join(',')})`]
      : [`ComponentTypeID IN (${inputTypeIds.map(quote).join(',')})`];
    if (!searched && request.PromotionStates && request.PromotionStates.length > 0) {
      filters.push(`PromotionState IN (${request.PromotionStates.map(quote).join(',')})`);
    }

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<SignalRow>(
      {
        EntityName: 'MJ: ML Components',
        ExtraFilter: filters.join(' AND '),
        // StoryVector is excluded on purpose — it is large, and nothing here ranks against it.
        Fields: ['ID', 'Name', 'ComponentTypeID', 'ComponentType', 'Story', 'PromotionState', 'IsTrained'],
        MaxRows: request.MaxRows ?? DEFAULT_MAX_ROWS,
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      warnings.push(`The signal catalogue could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
      return [];
    }
    return result.Results ?? [];
  }

  /** Project one row, attaching its similarity when the listing came from a search. */
  protected toEntry(
    row: SignalRow,
    rebindableByType: Map<string, boolean>,
    searched: Map<string, number> | null,
  ): SignalCatalogEntry {
    const entry: SignalCatalogEntry = {
      ID: row.ID,
      Name: signalLeafName(row.Name),
      TypeName: row.ComponentType,
      Story: row.Story,
      Rebindable: rebindableByType.get(row.ComponentTypeID) === true,
      PromotionState: row.PromotionState,
      IsTrained: row.IsTrained === true,
    };
    const similarity = searched?.get(row.ID);
    if (similarity !== undefined) {
      entry.Similarity = similarity;
    }
    return entry;
  }

  /** Finder seam — overridden in tests. */
  protected createFinder(): ReuseFinder {
    return new ReuseFinder();
  }
}

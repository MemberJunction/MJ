/**
 * @module stories/reuse-finder
 *
 * **Reuse by meaning** — find an already-trained component worth putting into a new model, by what
 * it MEANS rather than by what it is called.
 *
 * This is what the stories were for. A component's `StoryVector` embeds the prose describing what it
 * measures and when someone else would want it, so "something that already measures engagement
 * recency" is a query. But a semantically perfect match is useless if it cannot legally go where the
 * caller wants to put it — so similarity is only half the answer, and the structural filter is the
 * other half:
 *
 *  - **Slot compatibility** — when the caller names a slot they want to fill, only components whose
 *    type is the slot's `Accepts` type or a descendant survive. The same rule
 *    `validateComponentGraph` enforces, applied as a filter rather than as an error.
 *  - **Promotion state** — an unapproved component is not offered for reuse by default. Reusing a
 *    `Draft` component silently propagates unreviewed work into a new model.
 *
 * Ranking is cosine over the stored vectors via the platform's `SimpleVectorService` — the same
 * primitive the rest of MJ uses, rather than a private reimplementation.
 */

import { RunView, LogError } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';
import type { ReusableComponentMatch } from '@memberjunction/predictive-studio-core';

import { MLComponentEngine } from '../components/ml-component-engine';

/** What to look for, and where it has to fit. */
export interface ReuseSearchRequest {
  /**
   * The query embedding — the caller embeds their description ("measures engagement recency") with
   * the SAME model the stories were embedded with. Mismatched models produce meaningless distances,
   * which is why this is the caller's responsibility and not inferred here.
   */
  QueryVector: number[];
  /** Max matches to return. */
  TopK?: number;
  /** Minimum cosine similarity, 0–1. Below this a "match" is noise dressed as a recommendation. */
  MinSimilarity?: number;
  /**
   * The component type whose slot is being filled, plus the slot name. When both are given, only
   * components the slot would legally accept are returned.
   */
  ForSlot?: { ComponentTypeID: string; SlotName: string };
  /**
   * Promotion states to consider. Defaults to `['Approved']` — reusing unreviewed work by default
   * would silently propagate it into a new model.
   */
  PromotionStates?: string[];
  /** Only consider components that are trained (have fitted state worth reusing). Defaults to true. */
  TrainedOnly?: boolean;
}

/** The outcome of a reuse search, with the reasons anything was excluded. */
export interface ReuseSearchResult {
  Matches: ReusableComponentMatch[];
  /** How many candidates carried a usable story vector before ranking. */
  CandidatesConsidered: number;
  /** Non-fatal notes — an unresolvable slot, components skipped for a malformed vector. */
  Warnings: string[];
}

/** One candidate row as read from the database. */
interface CandidateRow {
  ID: string;
  Name: string;
  ComponentTypeID: string;
  ComponentType: string;
  Story: string | null;
  StoryVector: string | null;
  PromotionState: string;
  IsTrained: boolean;
}

/** Metadata carried alongside each vector, so a match can be rendered without a second read. */
interface CandidateMetadata {
  ID: string;
  Name: string;
  ComponentTypeID: string;
  ComponentTypeName: string;
  Story: string | null;
  PromotionState: string;
}

/**
 * Finds reusable components. Stateless; construct once and reuse.
 */
export class ReuseFinder {
  /**
   * Search for components whose stories are close to the query AND which can legally fill the
   * requested slot.
   *
   * @param request the query vector + structural constraints
   * @param contextUser request user
   * @param provider optional provider for multi-provider correctness
   * @param engine a `Config`-ed component engine, needed only when `ForSlot` is supplied
   */
  public async find(
    request: ReuseSearchRequest,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    engine: MLComponentEngine = MLComponentEngine.Instance,
  ): Promise<ReuseSearchResult> {
    const warnings: string[] = [];
    if (!request.QueryVector || request.QueryVector.length === 0) {
      return { Matches: [], CandidatesConsidered: 0, Warnings: ['No query vector was supplied, so nothing could be ranked.'] };
    }

    const accepts = this.resolveSlotAccepts(request, engine, warnings);
    if (request.ForSlot && !accepts) {
      // The caller asked for a specific position and we could not determine what it takes. Returning
      // unfiltered matches would offer components that cannot legally go there.
      return { Matches: [], CandidatesConsidered: 0, Warnings: warnings };
    }

    const rows = await this.loadCandidates(request, contextUser, provider, warnings);
    const entries = this.toVectorEntries(rows, accepts, engine, warnings);
    if (entries.length === 0) {
      return { Matches: [], CandidatesConsidered: 0, Warnings: warnings };
    }

    const service = new SimpleVectorService<CandidateMetadata>();
    service.LoadVectors(entries);
    const results = service.FindNearest(request.QueryVector, request.TopK ?? 10, request.MinSimilarity, 'cosine');

    return {
      Matches: results.map((r) => ({
        InstanceID: r.metadata?.ID ?? r.key,
        Name: r.metadata?.Name ?? '',
        ComponentTypeID: r.metadata?.ComponentTypeID ?? '',
        ComponentTypeName: r.metadata?.ComponentTypeName ?? '',
        Similarity: r.score,
        Story: r.metadata?.Story ?? null,
        PromotionState: r.metadata?.PromotionState ?? '',
      })),
      CandidatesConsidered: entries.length,
      Warnings: warnings,
    };
  }

  /** The type a requested slot accepts, or `null` when it cannot be resolved (a recorded warning). */
  private resolveSlotAccepts(request: ReuseSearchRequest, engine: MLComponentEngine, warnings: string[]): string | null {
    if (!request.ForSlot) {
      return null;
    }
    try {
      const slots = engine.ResolveProfile(request.ForSlot.ComponentTypeID).Slots;
      const slot = slots.find((s) => s.Name === request.ForSlot?.SlotName);
      if (!slot) {
        warnings.push(
          `There is no slot called '${request.ForSlot.SlotName}' on that component type` +
            `${slots.length > 0 ? `. Its slots are: ${slots.map((s) => s.Name).join(', ')}.` : ' — it declares no slots at all.'}`,
        );
        return null;
      }
      return slot.AcceptsComponentTypeID;
    } catch (err) {
      warnings.push(`The component tree could not be read, so the slot filter was not applied: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /** Read candidate components, narrowed by promotion state and trained-ness before ranking. */
  private async loadCandidates(
    request: ReuseSearchRequest,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    warnings: string[],
  ): Promise<CandidateRow[]> {
    const states = request.PromotionStates ?? ['Approved'];
    const filters = [
      `StoryVector IS NOT NULL`,
      `PromotionState IN (${states.map((s) => `'${s.replace(/'/g, "''")}'`).join(',')})`,
    ];
    if (request.TrainedOnly !== false) {
      filters.push('IsTrained = 1');
    }

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<CandidateRow>(
      {
        EntityName: 'MJ: ML Components',
        ExtraFilter: filters.join(' AND '),
        // StoryVector IS the payload here, so it is deliberately included — unlike every other read
        // of this entity, which excludes it precisely because it is large.
        Fields: ['ID', 'Name', 'ComponentTypeID', 'ComponentType', 'Story', 'StoryVector', 'PromotionState', 'IsTrained'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      warnings.push(`Reusable components could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
      return [];
    }
    return result.Results ?? [];
  }

  /** Parse vectors and apply the structural filter. A malformed vector is skipped, never guessed at. */
  private toVectorEntries(
    rows: CandidateRow[],
    accepts: string | null,
    engine: MLComponentEngine,
    warnings: string[],
  ): Array<{ key: string; vector: number[]; metadata: CandidateMetadata }> {
    const entries: Array<{ key: string; vector: number[]; metadata: CandidateMetadata }> = [];
    let skippedForVector = 0;
    let skippedForSlot = 0;

    for (const row of rows) {
      if (accepts && !engine.IsDescendantOf(row.ComponentTypeID, accepts)) {
        skippedForSlot++;
        continue;
      }
      const vector = parseVector(row.StoryVector);
      if (!vector) {
        skippedForVector++;
        continue;
      }
      entries.push({
        key: row.ID,
        vector,
        metadata: {
          ID: row.ID,
          Name: row.Name,
          ComponentTypeID: row.ComponentTypeID,
          ComponentTypeName: row.ComponentType,
          Story: row.Story,
          PromotionState: row.PromotionState,
        },
      });
    }

    if (skippedForVector > 0) {
      warnings.push(`${skippedForVector} component(s) had an unreadable story vector and were skipped.`);
    }
    if (skippedForSlot > 0) {
      warnings.push(`${skippedForSlot} component(s) matched by meaning but cannot legally fill that slot, and were excluded.`);
    }
    return entries;
  }
}

/**
 * Parse a stored `StoryVector`. Returns `null` for anything that is not a non-empty array of finite
 * numbers — a vector we cannot read is skipped, never coerced into one that would rank wrongly.
 */
export function parseVector(raw: string | null | undefined): number[] | null {
  if (raw == null || raw.trim().length === 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const vector: number[] = [];
    for (const v of parsed) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return null;
      }
      vector.push(v);
    }
    return vector;
  } catch (err) {
    LogError(`ReuseFinder: could not parse a story vector: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

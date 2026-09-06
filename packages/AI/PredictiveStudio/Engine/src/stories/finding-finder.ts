/**
 * @module stories/finding-finder
 *
 * **What have we learned about this?** — searching the organization's own measured facts.
 *
 * The counterpart to {@link ReuseFinder}. That one finds a measure you can RUN; this one finds a
 * fact you can CITE. Both rank by meaning over stored story vectors, because a person asking
 * *"what do we know about why members lapse?"* does not know a table name and should not have to.
 *
 * Two filters exist that the component search has no equivalent of, and both are about not
 * over-claiming:
 *
 *  - **`MinEvidence`** ranks the epistemic ladder — Asserted < Descriptive < Observed Association <
 *    Predictive Contribution < Tested Intervention — so an agent answering a question about what to
 *    *do* can demand tested interventions and get nothing rather than get associations dressed up
 *    as advice.
 *  - **`IncludeSuperseded`** is off by default. The historical chain is the point of keeping old
 *    findings, but a caller looking for the current state of knowledge must not be handed a 2024
 *    measurement beside its 2026 replacement with no way to tell them apart.
 */
import { RunView, LogError } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';

/** The epistemic ladder, weakest first. A caller filters by naming a floor. */
export const EVIDENCE_STRENGTH: readonly string[] = [
  'Asserted',
  'Descriptive',
  'Observed Association',
  'Predictive Contribution',
  'Tested Intervention',
];

/** What to look for. */
export interface FindingSearchRequest {
  /**
   * The query embedding — made with the SAME model that embedded the finding stories. A vector from
   * another model yields distances that look like numbers and mean nothing, which is why this is
   * the caller's responsibility rather than something inferred here.
   */
  QueryVector: number[];
  TopK?: number;
  MinSimilarity?: number;
  /** Weakest evidence type to accept, from {@link EVIDENCE_STRENGTH}. */
  MinEvidence?: string;
  /** Restrict to findings about one outcome. */
  TargetVariable?: string;
  /** Include superseded measurements — the historical chain. Off by default. */
  IncludeSuperseded?: boolean;
}

/** One finding, ranked. */
export interface FindingMatch {
  ID: string;
  Name: string;
  Statement: string;
  EvidenceType: string;
  Direction: string;
  Magnitude: number | null;
  MagnitudeUnit: string | null;
  Confidence: string | null;
  MeasuredAt: Date | string;
  PopulationSize: number | null;
  HoldoutMetric: string | null;
  HoldoutMetricValue: number | null;
  TargetVariable: string | null;
  Status: string;
  Similarity: number;
  Story: string | null;
}

/** The outcome, with the reasons anything was excluded. */
export interface FindingSearchResult {
  Matches: FindingMatch[];
  /** How many findings carried a usable story vector before ranking. */
  CandidatesConsidered: number;
  Warnings: string[];
}

/** A candidate row as read from the database. */
interface FindingRow {
  ID: string;
  Name: string;
  Statement: string;
  EvidenceType: string;
  Direction: string;
  Magnitude: number | null;
  MagnitudeUnit: string | null;
  Confidence: string | null;
  MeasuredAt: Date | string;
  PopulationSize: number | null;
  HoldoutMetric: string | null;
  HoldoutMetricValue: number | null;
  TargetVariable: string | null;
  Status: string;
  Story: string | null;
  StoryVector: string | null;
}

/**
 * Finds findings by meaning. Stateless; construct once and reuse.
 */
export class FindingFinder {
  public async find(
    request: FindingSearchRequest,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<FindingSearchResult> {
    const warnings: string[] = [];
    if (!request.QueryVector || request.QueryVector.length === 0) {
      return { Matches: [], CandidatesConsidered: 0, Warnings: ['No query vector was supplied, so nothing could be ranked.'] };
    }

    const rows = await this.load(request, contextUser, provider, warnings);
    const entries: Array<{ key: string; vector: number[]; metadata: FindingRow }> = [];
    let unreadable = 0;
    for (const row of rows) {
      const vector = parseVector(row.StoryVector);
      if (!vector) {
        unreadable++;
        continue;
      }
      entries.push({ key: row.ID, vector, metadata: row });
    }
    if (unreadable > 0) {
      warnings.push(`${unreadable} finding(s) had an unreadable story vector and were skipped.`);
    }
    if (entries.length === 0) {
      return { Matches: [], CandidatesConsidered: 0, Warnings: warnings };
    }

    const service = new SimpleVectorService<FindingRow>();
    service.LoadVectors(entries);
    const ranked = service.FindNearest(request.QueryVector, request.TopK ?? 10, request.MinSimilarity, 'cosine');

    return {
      Matches: ranked.map((r) => this.toMatch(r.metadata, r.score, r.key)),
      CandidatesConsidered: entries.length,
      Warnings: warnings,
    };
  }

  /** Read candidates, narrowed by evidence strength and status BEFORE ranking. */
  protected async load(
    request: FindingSearchRequest,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    warnings: string[],
  ): Promise<FindingRow[]> {
    const quote = (v: string): string => `'${v.replace(/'/g, "''")}'`;
    const filters = ['StoryVector IS NOT NULL'];

    // A retracted finding was found to be WRONG. It is kept deliberately — someone may have acted
    // on it — but it is never offered as an answer.
    filters.push(request.IncludeSuperseded ? `Status <> 'Retracted'` : `Status = 'Active'`);

    if (request.MinEvidence) {
      const floor = EVIDENCE_STRENGTH.indexOf(request.MinEvidence);
      if (floor < 0) {
        warnings.push(
          `'${request.MinEvidence}' is not an evidence type, so the evidence floor was not applied. Valid: ${EVIDENCE_STRENGTH.join(', ')}.`,
        );
      } else {
        filters.push(`EvidenceType IN (${EVIDENCE_STRENGTH.slice(floor).map(quote).join(',')})`);
      }
    }
    if (request.TargetVariable) {
      filters.push(`TargetVariable = ${quote(request.TargetVariable)}`);
    }

    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<FindingRow>(
      {
        EntityName: 'MJ: ML Findings',
        ExtraFilter: filters.join(' AND '),
        // StoryVector IS the payload here, unlike every other read of this entity.
        Fields: [
          'ID', 'Name', 'Statement', 'EvidenceType', 'Direction', 'Magnitude', 'MagnitudeUnit',
          'Confidence', 'MeasuredAt', 'PopulationSize', 'HoldoutMetric', 'HoldoutMetricValue',
          'TargetVariable', 'Status', 'Story', 'StoryVector',
        ],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      warnings.push(`Findings could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
      return [];
    }
    return result.Results ?? [];
  }

  /** Project one ranked row. Everything a citation needs travels with the match. */
  protected toMatch(row: FindingRow | undefined, similarity: number, key: string): FindingMatch {
    return {
      ID: row?.ID ?? key,
      Name: row?.Name ?? '',
      Statement: row?.Statement ?? '',
      EvidenceType: row?.EvidenceType ?? '',
      Direction: row?.Direction ?? '',
      Magnitude: row?.Magnitude ?? null,
      MagnitudeUnit: row?.MagnitudeUnit ?? null,
      Confidence: row?.Confidence ?? null,
      MeasuredAt: row?.MeasuredAt ?? '',
      PopulationSize: row?.PopulationSize ?? null,
      HoldoutMetric: row?.HoldoutMetric ?? null,
      HoldoutMetricValue: row?.HoldoutMetricValue ?? null,
      TargetVariable: row?.TargetVariable ?? null,
      Status: row?.Status ?? '',
      Similarity: similarity,
      Story: row?.Story ?? null,
    };
  }
}

/** Parse a stored JSON float array; `null` for anything malformed — never a guess. */
function parseVector(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const vector: number[] = [];
    for (const v of parsed) {
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      vector.push(v);
    }
    return vector;
  } catch (err) {
    LogError(`FindingFinder: could not parse a story vector: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

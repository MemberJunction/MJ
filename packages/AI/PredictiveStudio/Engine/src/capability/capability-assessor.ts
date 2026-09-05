/**
 * @module capability/capability-assessor
 *
 * **The capability diagnosis** — point it at a client's own strategy document and report what they
 * can and cannot currently evidence.
 *
 * Not a feature demo. The output is a read of *their* organization, produced in about a minute,
 * where every gap is a piece of work someone can schedule. It is the artefact that makes signals
 * and findings legible to people who will never open a model.
 *
 * ## Coverage is two-dimensional, and collapsing it loses the answer
 *
 * A one-axis "covered / not covered" verdict hides the distinction that actually drives what to do
 * next:
 *
 *  - **Measurable** — a proven signal already computes this. You can put a number on it today.
 *  - **Evidenced** — a dated finding says something about it. You have *learned* something.
 *
 * They come apart constantly, and each combination has a different next step. *"Improve member
 * engagement"* is usually measurable and un-evidenced: five signals compute engagement, and nothing
 * on record says what moves it — so the work is a study, not instrumentation. *"Reduce lapse among
 * first-year members"* may be evidenced and not directly measurable, meaning the fact is known but
 * nothing recomputes it as the population changes. Reporting one number for both would send the
 * client to the wrong work.
 *
 * ## Absence is the output that matters, and it is the easiest to misread
 *
 * A `Gap` means **nothing on record describes this** — which, early in a deployment, is at least as
 * likely to mean nobody has written the description as that the capability is missing. Every result
 * carries the size of the corpus it was matched against so the reader can tell those apart, and the
 * action says so in as many words. A diagnosis that quietly implies "you cannot do this" when the
 * truth is "we have not catalogued it yet" is worse than no diagnosis.
 *
 * ## Why similarity retrieves but does not decide
 *
 * The obvious build — embed each objective, threshold the cosine similarity, call anything below it
 * a gap — was implemented, measured against the live corpus, and **rejected**. On a 42-signal corpus
 * the numbers do not separate:
 *
 * | Objective | best | corpus mean | z(best) |
 * |---|---|---|---|
 * | *"increase how recently and often members engage"* | 0.745 | 0.664 | 1.80 |
 * | *"complete the seismic retrofit of the headquarters"* | 0.638 | 0.565 | 1.73 |
 * | *"negotiate a renewal of the parking structure lease"* | 0.673 | 0.590 | **2.14** |
 *
 * The parking lease — which nothing in the catalogue can measure — scored the HIGHEST relative
 * prominence of any objective, and its best raw match (0.673) sat inside the band of genuinely
 * covered ones. The whole distribution simply shifts with the objective's vocabulary; the gap
 * between best and second-best was ~0.005 throughout. Neither an absolute threshold nor a z-score
 * can be made to work on that, and a version that "tuned" its way to a passing demo would have been
 * calibrated to one document and wrong on the next client's.
 *
 * So similarity does what it is good at — **shortlisting** — and the covered/gap call is a judgment
 * made against the candidates' own prose, behind {@link ICapabilityJudge}. With no judge wired, every
 * objective comes back `Undetermined` **with its shortlist**, which is an honest "here is what looks
 * closest, a human should decide" rather than a fabricated verdict.
 */
import { RunView, LogError } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { SimpleVectorService } from '@memberjunction/ai-vectors-memory';

import { chunkObjectives, type Objective } from './objective-chunker';
import { MLComponentEngine } from '../components/ml-component-engine';
import { signalLeafName } from '../components/signal-binding';

/**
 * How many candidates to shortlist per objective. Enough for a judge to see the real options
 * without paying for a long prompt.
 */
export const DEFAULT_TOP_K = 5;

/** How well one objective is served. */
export type CoverageVerdict =
  /** A signal computes it AND a finding says something about it. */
  | 'Covered'
  /** A signal computes it, but nothing has been learned yet — the next step is a study. */
  | 'Measurable'
  /** Something is known about it, but nothing recomputes it — the next step is instrumentation. */
  | 'Evidenced'
  /** Something is near, but not clearly this. Usually a naming mismatch worth a human glance. */
  | 'Partial'
  /** Nothing on record describes this — which may mean the description is missing, not the capability. */
  | 'Gap'
  /** Candidates were retrieved but no judge was available to decide. A human should look. */
  | 'Undetermined';

/** One matched signal or finding, with enough to render it. */
export interface CoverageMatch {
  ID: string;
  Name: string;
  /** The signal's type, or the finding's evidence type. */
  Kind: string;
  Similarity: number;
  Description: string | null;
}

/** One objective, diagnosed. */
export interface ObjectiveCoverage {
  Objective: Objective;
  Verdict: CoverageVerdict;
  /** Proven measures shortlisted for this objective, best first. Retrieval, not a verdict. */
  Signals: CoverageMatch[];
  /** Dated facts shortlisted for this objective, best first. Retrieval, not a verdict. */
  Findings: CoverageMatch[];
  /** What to do about it, in one sentence — derived from the verdict, not written by a model. */
  NextStep: string;
  /** Why the judge landed on this verdict, in its own words. Absent when nothing judged it. */
  Rationale?: string;
}

/** The whole diagnosis. */
export interface CapabilityAssessment {
  Objectives: ObjectiveCoverage[];
  /** Counts per verdict, for a summary line. */
  Summary: Record<CoverageVerdict, number>;
  /** How many signals carried a usable story vector — the denominator behind every gap. */
  SignalsConsidered: number;
  /** How many findings carried a usable story vector. */
  FindingsConsidered: number;
  Warnings: string[];
}

/** What to assess. */
export interface CapabilityAssessmentRequest {
  /** The pasted document — a strategic plan, a funder report, a board paper. */
  Text: string;
  /** Cap on objectives extracted, so a 90-page plan cannot become a thousand embedding calls. */
  MaxObjectives?: number;
  /** How many candidates of each kind to shortlist per objective. Defaults to {@link DEFAULT_TOP_K}. */
  TopK?: number;
}

/**
 * Embeds objective text.
 *
 * A seam because the model must be the SAME one that wrote every story vector — a vector from
 * another model produces distances that look like numbers and mean nothing — and because a test
 * must be able to assess a document without loading an embedding model.
 */
export interface IObjectiveEmbedder {
  embed(text: string): Promise<number[] | null>;
}

/** One objective plus the candidates retrieval put in front of the judge. */
export interface JudgeCandidateSet {
  Objective: Objective;
  Signals: CoverageMatch[];
  Findings: CoverageMatch[];
}

/** What the judge decides for one objective. */
export interface JudgedObjective {
  Index: number;
  Verdict: Exclude<CoverageVerdict, 'Undetermined'>;
  /** One sentence saying why — shown to the reader, so it must be about THIS objective. */
  Rationale: string;
}

/**
 * Decides coverage from the candidates' own prose.
 *
 * A seam rather than a hard dependency for the reason the story runner is one: the judge needs a
 * model, the engine package does not depend on the prompt runner, and a deployment with no judge
 * must still get a useful (if undecided) shortlist rather than a fabricated verdict.
 */
export interface ICapabilityJudge {
  judge(candidates: JudgeCandidateSet[], contextUser?: UserInfo, provider?: IMetadataProvider): Promise<JudgedObjective[]>;
}

/** Corpus row shape shared by both reads. */
interface CorpusRow {
  ID: string;
  Name: string;
  Kind: string;
  Description: string | null;
  StoryVector: string | null;
}

/** The one-sentence next step per verdict. Derived, never written by a model. */
const NEXT_STEP: Record<CoverageVerdict, string> = {
  Undetermined:
    'Candidates were found but nothing was available to judge whether they actually cover this. The shortlist below is a starting point for a human, not a verdict.',
  Covered: 'Nothing to build — this can be measured today and something is already known about it.',
  Measurable:
    'This can be measured today, but nothing has been learned about what moves it. The next step is a study, not instrumentation.',
  Evidenced:
    'Something is known about this, but no proven measure recomputes it as the population changes. The next step is instrumentation.',
  Partial:
    'Something on record is close but not clearly this. Worth a human glance — it is usually a naming mismatch rather than a real gap.',
  Gap: 'Nothing on record describes this. That may mean the capability is missing, or only that nobody has described it yet.',
};

/**
 * Diagnoses a document against what the organization can measure and has learned.
 *
 * Stateless; construct once and reuse.
 */
export class CapabilityAssessor {
  public async assess(
    request: CapabilityAssessmentRequest,
    embedder: IObjectiveEmbedder,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
    engine: MLComponentEngine = MLComponentEngine.Instance,
    judge?: ICapabilityJudge,
  ): Promise<CapabilityAssessment> {
    const warnings: string[] = [];
    const topK = request.TopK ?? DEFAULT_TOP_K;

    const objectives = chunkObjectives(request.Text, request.MaxObjectives);
    if (objectives.length === 0) {
      return this.empty(['No objectives could be read from that text — it may be too short, or all headings.']);
    }

    // Both corpora are loaded ONCE and ranked in memory. Searching per objective would re-read the
    // whole corpus for every line of the document.
    const [signals, findings] = await Promise.all([
      this.loadSignals(contextUser, provider, engine, warnings),
      this.loadFindings(contextUser, provider, warnings),
    ]);
    const signalIndex = this.index(signals);
    const findingIndex = this.index(findings);

    // Retrieval only. No verdict comes out of a similarity number — see the module note.
    const candidates: JudgeCandidateSet[] = [];
    for (const objective of objectives) {
      const vector = await embedder.embed(objective.Text);
      if (!vector) {
        warnings.push(`Objective ${objective.Index + 1} could not be embedded and was skipped.`);
        continue;
      }
      candidates.push({
        Objective: objective,
        Signals: this.rank(signalIndex, vector, topK),
        Findings: this.rank(findingIndex, vector, topK),
      });
    }

    const verdicts = await this.adjudicate(candidates, judge, contextUser, provider, warnings);
    const results: ObjectiveCoverage[] = candidates.map((c) => {
      const judged = verdicts.get(c.Objective.Index);
      const verdict: CoverageVerdict = judged?.Verdict ?? 'Undetermined';
      return {
        Objective: c.Objective,
        Verdict: verdict,
        Signals: c.Signals,
        Findings: c.Findings,
        NextStep: NEXT_STEP[verdict],
        ...(judged?.Rationale ? { Rationale: judged.Rationale } : {}),
      };
    });

    return {
      Objectives: results,
      Summary: this.summarize(results),
      SignalsConsidered: signalIndex?.count ?? 0,
      FindingsConsidered: findingIndex?.count ?? 0,
      Warnings: warnings,
    };
  }

  /**
   * Hand the shortlists to a judge, and degrade honestly when there is none.
   *
   * An objective with NO candidates at all needs no judgment — an empty corpus is a gap by
   * construction, and asking a model about it would only invite one to be invented.
   */
  protected async adjudicate(
    candidates: JudgeCandidateSet[],
    judge: ICapabilityJudge | undefined,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    warnings: string[],
  ): Promise<Map<number, JudgedObjective>> {
    const verdicts = new Map<number, JudgedObjective>();
    const empty = candidates.filter((c) => c.Signals.length === 0 && c.Findings.length === 0);
    for (const c of empty) {
      verdicts.set(c.Objective.Index, {
        Index: c.Objective.Index,
        Verdict: 'Gap',
        Rationale: 'Nothing in the catalogue was close enough to shortlist.',
      });
    }

    const judgeable = candidates.filter((c) => c.Signals.length > 0 || c.Findings.length > 0);
    if (judgeable.length === 0) {
      return verdicts;
    }
    if (!judge) {
      warnings.push(
        'No capability judge is available, so coverage was not decided. Similarity retrieves candidates but cannot ' +
          'tell coverage from coincidence — the shortlists below are for a human to read, not verdicts.',
      );
      return verdicts;
    }

    const byIndex = new Map(judgeable.map((c) => [c.Objective.Index, c]));
    try {
      for (const judged of await judge.judge(judgeable, contextUser, provider)) {
        const candidate = byIndex.get(judged.Index);
        if (!candidate) {
          warnings.push(`The judge returned a verdict for objective ${judged.Index}, which it was not asked about. Discarded.`);
          continue;
        }
        verdicts.set(judged.Index, { ...judged, Verdict: this.constrain(judged.Verdict, candidate) });
      }
    } catch (err) {
      warnings.push(`The capability judge failed, so coverage was not decided: ${err instanceof Error ? err.message : String(err)}`);
    }
    return verdicts;
  }

  /** Signals = Input-kind components carrying a story vector. */
  protected async loadSignals(
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    engine: MLComponentEngine,
    warnings: string[],
  ): Promise<CorpusRow[]> {
    const inputTypes = engine.TypesByKind('Input');
    if (inputTypes.length === 0) {
      warnings.push('The component tree carries no Input types, so no signal could be matched.');
      return [];
    }
    const ids = inputTypes.map((t) => `'${t.ID.replace(/'/g, "''")}'`).join(',');
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<{ ID: string; Name: string; ComponentType: string; Story: string | null; StoryVector: string | null }>(
      {
        EntityName: 'MJ: ML Components',
        ExtraFilter: `ComponentTypeID IN (${ids}) AND StoryVector IS NOT NULL`,
        Fields: ['ID', 'Name', 'ComponentType', 'Story', 'StoryVector'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      warnings.push(`Signals could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
      return [];
    }
    return (result.Results ?? []).map((r) => ({
      ID: r.ID,
      Name: signalLeafName(r.Name),
      Kind: r.ComponentType,
      Description: r.Story,
      StoryVector: r.StoryVector,
    }));
  }

  /** Findings = active, non-retracted facts carrying a story vector. */
  protected async loadFindings(
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    warnings: string[],
  ): Promise<CorpusRow[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<{ ID: string; Name: string; EvidenceType: string; Statement: string; StoryVector: string | null }>(
      {
        EntityName: 'MJ: ML Findings',
        ExtraFilter: `Status='Active' AND StoryVector IS NOT NULL`,
        Fields: ['ID', 'Name', 'EvidenceType', 'Statement', 'StoryVector'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!result.Success) {
      warnings.push(`Findings could not be read: ${result.ErrorMessage ?? 'unknown error'}`);
      return [];
    }
    return (result.Results ?? []).map((r) => ({
      ID: r.ID,
      Name: r.Name,
      Kind: r.EvidenceType,
      Description: r.Statement,
      StoryVector: r.StoryVector,
    }));
  }

  /** Build a searchable index once, skipping anything whose vector cannot be read. */
  protected index(rows: CorpusRow[]): { service: SimpleVectorService<CorpusRow>; count: number } | null {
    const entries: Array<{ key: string; vector: number[]; metadata: CorpusRow }> = [];
    for (const row of rows) {
      const vector = parseVector(row.StoryVector);
      if (vector) {
        entries.push({ key: row.ID, vector, metadata: row });
      }
    }
    if (entries.length === 0) return null;
    const service = new SimpleVectorService<CorpusRow>();
    service.LoadVectors(entries);
    return { service, count: entries.length };
  }

  /**
   * Enforce the structural half of the verdict, over EVERY judge.
   *
   * Whether a signal exists and whether a finding exists are facts about the shortlist, not matters
   * of opinion — so no judge, however persuasive, may return `Covered` for an objective with no
   * finding in front of it. The judge decides RELEVANCE; the shape of the verdict stays here, which
   * is what keeps the two axes from collapsing into one reassuring word.
   */
  protected constrain(
    verdict: Exclude<CoverageVerdict, 'Undetermined'>,
    candidate: JudgeCandidateSet,
  ): Exclude<CoverageVerdict, 'Undetermined'> {
    const hasFindings = candidate.Findings.length > 0;
    const hasSignals = candidate.Signals.length > 0;
    if (verdict === 'Covered' && !hasFindings) return hasSignals ? 'Measurable' : 'Gap';
    if (verdict === 'Covered' && !hasSignals) return 'Evidenced';
    if (verdict === 'Measurable' && !hasSignals) return 'Gap';
    if (verdict === 'Evidenced' && !hasFindings) return 'Gap';
    return verdict;
  }

  /**
   * Shortlist against one corpus.
   *
   * No similarity floor: the measured distributions overlap so heavily that any floor either admits
   * everything or hides the real match. Ranking picks the best K and the judge decides.
   */
  protected rank(
    index: { service: SimpleVectorService<CorpusRow>; count: number } | null,
    vector: number[],
    topK: number,
  ): CoverageMatch[] {
    if (!index) return [];
    return index.service.FindNearest(vector, topK, undefined, 'cosine').map((r) => ({
      ID: r.metadata?.ID ?? r.key,
      Name: r.metadata?.Name ?? '',
      Kind: r.metadata?.Kind ?? '',
      Similarity: r.score,
      Description: r.metadata?.Description ?? null,
    }));
  }

  /** Verdict counts, always carrying every key so a caller can render a stable summary. */
  protected summarize(results: ObjectiveCoverage[]): Record<CoverageVerdict, number> {
    const summary: Record<CoverageVerdict, number> = { Covered: 0, Measurable: 0, Evidenced: 0, Partial: 0, Gap: 0, Undetermined: 0 };
    for (const r of results) {
      summary[r.Verdict]++;
    }
    return summary;
  }

  /** An assessment that ran but found nothing to assess. */
  protected empty(warnings: string[]): CapabilityAssessment {
    return {
      Objectives: [],
      Summary: { Covered: 0, Measurable: 0, Evidenced: 0, Partial: 0, Gap: 0, Undetermined: 0 },
      SignalsConsidered: 0,
      FindingsConsidered: 0,
      Warnings: warnings,
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
    LogError(`CapabilityAssessor: could not parse a story vector: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

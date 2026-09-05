/**
 * @module PredictiveStudio/ask.view-models
 *
 * Pure projections for the **Ask** panel — no Angular, no provider, no network.
 *
 * Every other Predictive Studio surface is shaped like the object model: a tree of component types,
 * a registry of models, a list of pipelines. That is the right shape for someone building a model
 * and the wrong shape for everyone else, who arrives with a question rather than an object to
 * inspect.
 *
 * So this panel is shaped like an **answer**. A question in plain English comes back as two blocks,
 * because they are genuinely different things and a reader acts on them differently:
 *
 *  - **What we can measure** — proven measures that already compute, today, over any population.
 *  - **What we've learned** — dated facts, each carrying how it was established.
 *
 * Two rules run through all of it.
 *
 * **The customer's word is "measure", never "component".** "Component" is our word for a node in an
 * inheritance tree; nobody outside this codebase has ever wanted one. The database keeps its
 * vocabulary and the screen keeps the reader's.
 *
 * **An empty answer is a real answer, and must say what it means.** Nothing found means nothing has
 * been *described* — which, early on, is far more likely to mean the catalogue is thin than that the
 * organization cannot do the thing. A panel that renders silence invites the opposite reading.
 */

/** One signal as the `List Signals` action returns it. Loosely typed: it crosses GraphQL. */
export interface AskSignalRaw {
  ID?: unknown;
  Name?: unknown;
  TypeName?: unknown;
  Story?: unknown;
  Rebindable?: unknown;
  Similarity?: unknown;
}

/** One finding as the `Find Relevant Findings` action returns it. */
export interface AskFindingRaw {
  ID?: unknown;
  Name?: unknown;
  Statement?: unknown;
  EvidenceType?: unknown;
  Direction?: unknown;
  Magnitude?: unknown;
  MagnitudeUnit?: unknown;
  Confidence?: unknown;
  MeasuredAt?: unknown;
  PopulationSize?: unknown;
  HoldoutMetric?: unknown;
  HoldoutMetricValue?: unknown;
  Similarity?: unknown;
}

/** A measure the organization can compute today. */
export interface AskMeasureVM {
  id: string;
  /** What it measures, in its own name — never prefixed with the model it was born in. */
  name: string;
  /** The kind of measure, in the reader's words rather than the tree's. */
  kind: string;
  /** What it measures, in business language. */
  describes: string | null;
  /** Whether it can be pointed at a different group of records. */
  reusable: boolean;
  matchPercent: number;
}

/** A dated fact the organization has established. */
export interface AskFactVM {
  id: string;
  statement: string;
  /** How it was established, in the reader's words. */
  basis: string;
  /** Whether that basis supports acting on it, or only noticing it. */
  supportsAction: boolean;
  /** e.g. "12.3% importance share", or null when the fact is directional only. */
  size: string | null;
  /** e.g. "2,180 records · auc 0.741" — the evidence line under the statement. */
  evidence: string | null;
  measuredAt: string | null;
  confidence: string | null;
  matchPercent: number;
}

/** The whole answer to one question. */
export interface AskAnswerVM {
  measures: AskMeasureVM[];
  facts: AskFactVM[];
  /** The one-line answer, shown above both blocks. */
  headline: string;
  /** Present only when there is nothing to show — says what the absence means. */
  emptyNote: string | null;
}

/**
 * How an evidence type reads to someone who is not going to look it up, and whether it supports
 * *doing* something.
 *
 * The distinction is the whole reason findings record an evidence type: only a tested intervention
 * supports "if we do X, Y follows". Everything else supports noticing, targeting, or prioritising —
 * which is genuinely useful and is not the same claim.
 */
const EVIDENCE_READING: Readonly<Record<string, { basis: string; supportsAction: boolean }>> = {
  'Tested Intervention': { basis: 'Tested — we changed something and measured the effect', supportsAction: true },
  'Predictive Contribution': { basis: 'Predictive — it improved forecasts on data never seen before', supportsAction: false },
  'Observed Association': { basis: 'Observed — the two move together', supportsAction: false },
  Descriptive: { basis: 'Descriptive — a property of the group, no relationship claimed', supportsAction: false },
  Asserted: { basis: 'Asserted — recorded by a person, not measured here', supportsAction: false },
};

/** Kinds as the tree names them → what the reader would call them. */
const KIND_READING: Readonly<Record<string, string>> = {
  'As-Of Count': 'How many, in a time window',
  'As-Of Sum': 'How much, in a time window',
  'As-Of Avg': 'Average, in a time window',
  'As-Of Recency': 'How long since it last happened',
  'As-Of Exists': 'Whether it ever happened',
  'As-Of Distinct Count': 'How many different kinds, in a time window',
  'As-Of Trend Slope': 'Which way it is heading',
  'As-Of Rate Per Period': 'How often, per period',
  Column: 'A value already on the record',
  Embedding: 'The meaning of some text',
  Forecast: 'A projection of what comes next',
  'LLM-Derived': 'Something read out of text by a model',
};

/** Read a value that crossed GraphQL as a trimmed string, or `null`. */
function str(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Read a finite number, or `null`. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Similarity → a 0..100 bar width, clamped. Absent similarity reads as a full bar, not an empty one. */
export function matchPercent(similarity: unknown): number {
  const value = num(similarity);
  if (value === null) return 100;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

/** Format a magnitude with its unit, or `null` when either is missing — never a bare number. */
export function formatSize(magnitude: unknown, unit: unknown): string | null {
  const value = num(magnitude);
  const units = str(unit);
  if (value === null || !units) return null;
  // Shares read as percentages; everything else keeps its own unit, which is what makes it readable.
  return /share|probability|percent|ratio/i.test(units)
    ? `${(value * 100).toFixed(1)}% ${units}`
    : `${value} ${units}`;
}

/** The evidence line under a statement — population and the out-of-sample metric, when there are any. */
export function formatEvidence(populationSize: unknown, metric: unknown, metricValue: unknown): string | null {
  const parts: string[] = [];
  const n = num(populationSize);
  if (n !== null) parts.push(`${n.toLocaleString()} records`);
  const metricName = str(metric);
  const value = num(metricValue);
  if (metricName && value !== null) parts.push(`${metricName} ${value.toFixed(3)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Shape one signal for the panel. */
export function toMeasure(raw: AskSignalRaw): AskMeasureVM {
  const kind = str(raw.TypeName) ?? '';
  return {
    id: str(raw.ID) ?? '',
    name: str(raw.Name) ?? '(unnamed)',
    kind: KIND_READING[kind] ?? kind,
    describes: str(raw.Story),
    reusable: raw.Rebindable === true,
    matchPercent: matchPercent(raw.Similarity),
  };
}

/** Shape one finding for the panel. */
export function toFact(raw: AskFindingRaw): AskFactVM {
  const evidenceType = str(raw.EvidenceType) ?? '';
  const reading = EVIDENCE_READING[evidenceType] ?? { basis: evidenceType || 'Recorded', supportsAction: false };
  const measured = str(raw.MeasuredAt);
  return {
    id: str(raw.ID) ?? '',
    statement: str(raw.Statement) ?? str(raw.Name) ?? '(no statement)',
    basis: reading.basis,
    supportsAction: reading.supportsAction,
    size: formatSize(raw.Magnitude, raw.MagnitudeUnit),
    evidence: formatEvidence(raw.PopulationSize, raw.HoldoutMetric, raw.HoldoutMetricValue),
    measuredAt: measured ? measured.slice(0, 10) : null,
    confidence: str(raw.Confidence),
    matchPercent: matchPercent(raw.Similarity),
  };
}

/**
 * Build the whole answer.
 *
 * Deliberately does NOT re-sort: the server ranked by meaning, and re-ordering here would silently
 * disagree with the ranking a caller can see in the numbers.
 */
export function buildAskAnswer(question: string, signals: AskSignalRaw[], findings: AskFindingRaw[]): AskAnswerVM {
  const measures = signals.map(toMeasure);
  const facts = findings.map(toFact);
  return {
    measures,
    facts,
    headline: askHeadline(question, measures.length, facts.length),
    emptyNote: measures.length === 0 && facts.length === 0 ? emptyNote(question) : null,
  };
}

/** The one-line answer. Leads with what the reader can DO, not with how many rows came back. */
export function askHeadline(question: string, measureCount: number, factCount: number): string {
  if (measureCount === 0 && factCount === 0) {
    return `Nothing on record answers that yet.`;
  }
  if (factCount === 0) {
    return `You can measure this today — but nothing has been established about what moves it.`;
  }
  if (measureCount === 0) {
    return `Something is known about this, but no measure currently recomputes it.`;
  }
  return `You can measure this today, and ${factCount === 1 ? 'one fact has' : `${factCount} facts have`} been established about it.`;
}

/**
 * What an empty answer means.
 *
 * The sentence matters more than it looks. A reader shown a blank panel concludes "we cannot do
 * this"; the true statement is almost always "nothing here has been described that way yet", and
 * the two lead to completely different next steps.
 */
export function emptyNote(question: string): string {
  const trimmed = question.trim();
  const subject = trimmed.length > 0 ? `"${trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed}"` : 'that';
  return (
    `Nothing in the catalogue describes ${subject}. That usually means it has not been described yet, ` +
    `rather than that it cannot be measured — a model built on this data would add measures here.`
  );
}

// ─────────────────────────── Document diagnosis ───────────────────────────

/** One objective as `Assess Capability Coverage` returns it. */
export interface AskObjectiveRaw {
  Objective?: { Index?: unknown; Section?: unknown; Text?: unknown };
  Verdict?: unknown;
  NextStep?: unknown;
  Rationale?: unknown;
  Signals?: unknown;
  Findings?: unknown;
}

/** One diagnosed objective, shaped for the panel. */
export interface AskObjectiveVM {
  index: number;
  section: string | null;
  text: string;
  verdict: string;
  /** The verdict in the reader's words. */
  verdictLabel: string;
  /** Which of the four states it renders as, for colour. */
  tone: 'good' | 'partial' | 'gap' | 'unknown';
  nextStep: string;
  rationale: string | null;
  measureCount: number;
  factCount: number;
}

/** Verdict → how it reads and how it renders. */
const VERDICT_READING: Readonly<Record<string, { label: string; tone: AskObjectiveVM['tone'] }>> = {
  Covered: { label: 'Measurable, and we have learned something', tone: 'good' },
  Measurable: { label: 'Measurable — nothing learned yet', tone: 'good' },
  Evidenced: { label: 'Known — but not measured', tone: 'partial' },
  Partial: { label: 'Close, but not this', tone: 'partial' },
  Gap: { label: 'Nothing on record', tone: 'gap' },
  Undetermined: { label: 'Needs a human look', tone: 'unknown' },
};

/** Shape one diagnosed objective. */
export function toObjective(raw: AskObjectiveRaw): AskObjectiveVM {
  const verdict = str(raw.Verdict) ?? 'Undetermined';
  const reading = VERDICT_READING[verdict] ?? VERDICT_READING['Undetermined'];
  return {
    index: num(raw.Objective?.Index) ?? 0,
    section: str(raw.Objective?.Section),
    text: str(raw.Objective?.Text) ?? '',
    verdict,
    verdictLabel: reading.label,
    tone: reading.tone,
    nextStep: str(raw.NextStep) ?? '',
    rationale: str(raw.Rationale),
    measureCount: Array.isArray(raw.Signals) ? raw.Signals.length : 0,
    factCount: Array.isArray(raw.Findings) ? raw.Findings.length : 0,
  };
}

/** Group diagnosed objectives under their document sections, preserving document order. */
export function groupBySection(objectives: AskObjectiveVM[]): Array<{ section: string; objectives: AskObjectiveVM[] }> {
  const groups: Array<{ section: string; objectives: AskObjectiveVM[] }> = [];
  for (const objective of objectives) {
    const section = objective.section ?? '';
    const last = groups[groups.length - 1];
    if (last && last.section === section) {
      last.objectives.push(objective);
    } else {
      groups.push({ section, objectives: [objective] });
    }
  }
  return groups;
}

/**
 * The diagnosis headline.
 *
 * Leads with gaps, because a gap is the only line in the whole report someone can act on — and
 * names what a gap actually means, so it is not read as "you cannot do this".
 */
export function diagnosisHeadline(objectives: AskObjectiveVM[], signalsConsidered: number): string {
  if (objectives.length === 0) {
    return 'No objectives could be read from that document.';
  }
  const gaps = objectives.filter((o) => o.tone === 'gap').length;
  const good = objectives.filter((o) => o.tone === 'good').length;
  const lead =
    gaps === 0
      ? `Every objective has something behind it.`
      : `${gaps} of ${objectives.length} objectives have nothing on record.`;
  return (
    `${lead} ${good} can be measured today, checked against ${signalsConsidered} measure(s). ` +
    `"Nothing on record" means nothing has been described that way — not that it cannot be measured.`
  );
}

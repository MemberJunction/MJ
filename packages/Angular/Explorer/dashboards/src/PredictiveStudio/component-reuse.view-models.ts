/**
 * @module PredictiveStudio/component-reuse.view-models
 *
 * Pure projections for reuse-by-meaning search — no Angular, no provider, no network, so the
 * shaping rules are unit-testable on their own.
 *
 * The panel searches a catalogue of components whose names are qualified by the model that built
 * them (`"<model> › acts_90d"`), because that is what makes a row identifiable in the database.
 * On screen the model prefix is noise repeated down every row: what the reader is choosing between
 * is the PART, so the leaf name leads and the model it came from becomes provenance.
 */

/** One match as the `Find Reusable Components` action returns it. Loosely typed: it crosses GraphQL. */
export interface ReuseMatchRaw {
  ID?: unknown;
  Name?: unknown;
  ComponentTypeName?: unknown;
  ComponentType?: unknown;
  Story?: unknown;
  Similarity?: unknown;
  PromotionState?: unknown;
}

/** One match, shaped for the panel. */
export interface ReuseMatchVM {
  id: string;
  /** The part itself — `acts_90d__present`. */
  name: string;
  /** The model it was built in, or null when the component is standalone. */
  fromModel: string | null;
  /** The tree leaf it is an instance of — `As-Of Exists`. */
  typeName: string;
  story: string | null;
  /** Cosine similarity 0..1, or null when the action did not report one. */
  similarity: number | null;
  /** `similarity` as a 0..100 bar width, clamped. */
  matchPercent: number;
  promotionState: string | null;
}

/** The separator the materializer uses between a model name and the feature it built. */
const NAME_SEPARATOR = ' › ';

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Split `"<model> › <part>"` into the part and its provenance.
 *
 * Uses the LAST separator so a model whose own name contains one still resolves to the right part.
 */
export function splitQualifiedName(raw: string): { name: string; fromModel: string | null } {
  const at = raw.lastIndexOf(NAME_SEPARATOR);
  if (at < 0) return { name: raw, fromModel: null };
  return { name: raw.slice(at + NAME_SEPARATOR.length).trim(), fromModel: raw.slice(0, at).trim() || null };
}

/** Project one raw match. Returns null when it carries no usable identity. */
export function toReuseMatch(raw: ReuseMatchRaw): ReuseMatchVM | null {
  const id = text(raw.ID);
  const fullName = text(raw.Name);
  if (!id || !fullName) return null;
  const { name, fromModel } = splitQualifiedName(fullName);
  const similarity = typeof raw.Similarity === 'number' && Number.isFinite(raw.Similarity) ? raw.Similarity : null;
  return {
    id,
    name,
    fromModel,
    typeName: text(raw.ComponentTypeName) ?? text(raw.ComponentType) ?? 'Component',
    story: text(raw.Story),
    similarity,
    // Clamped rather than trusted: a similarity outside 0..1 would render as a bar wider than its
    // track, and silently mis-drawing a confidence is worse than showing none.
    matchPercent: similarity === null ? 0 : Math.max(0, Math.min(100, Math.round(similarity * 100))),
    promotionState: text(raw.PromotionState),
  };
}

/**
 * Project a result set, dropping unusable rows.
 *
 * Deliberately does NOT re-sort: the ranking is the server's, computed over the full candidate set,
 * and re-ordering here on a truncated top-K would quietly disagree with it.
 */
export function toReuseMatches(raw: readonly ReuseMatchRaw[] | null | undefined): ReuseMatchVM[] {
  if (!raw) return [];
  const out: ReuseMatchVM[] = [];
  for (const m of raw) {
    const vm = toReuseMatch(m);
    if (vm) out.push(vm);
  }
  return out;
}

/**
 * The line shown when a search returns nothing.
 *
 * Distinguishes "nothing was close enough" from "there was nothing to search", because they call
 * for opposite responses from the reader: reword the query, versus go publish a model first.
 */
export function emptyReuseMessage(candidatesConsidered: number): string {
  return candidatesConsidered > 0
    ? `Nothing matched closely enough among ${candidatesConsidered} component${candidatesConsidered === 1 ? '' : 's'} with a story. Try describing what it MEASURES rather than what it is called.`
    : 'No component carries a story vector yet. Stories are written when a model is published, and it is the story that makes a component findable by meaning.';
}

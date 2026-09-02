/**
 * @module PredictiveStudio/model-story.view-models
 *
 * Pure view-models for the **model story** — the prose half of a model's identity.
 *
 * A trained model already carries its formal identity: type, spec, bindings, fitted state, metrics.
 * The story is the other half — what it decides, what each part contributes, and when that part is
 * worth reusing. The Model Story Tagger writes it at promotion onto the root `MJ: ML Components`
 * row (`Story`) and each component's own row (`Story` + `StoryContribution`).
 *
 * Until this existed the tagger wrote all of that and nothing displayed any of it.
 *
 * Everything here is pure: rows in, view-model out. The panel renders; nothing here fetches.
 */

import type { ReusePotential, StoryContributionRole } from '@memberjunction/predictive-studio-core';

/** The `MJ: ML Components` fields a story needs — a narrowed view of the row. */
export interface StoryComponentRow {
  ID: string;
  Name: string | null;
  ComponentType?: string | null;
  MLModelID?: string | null;
  ParentComponentID?: string | null;
  SlotName?: string | null;
  Story?: string | null;
  /** JSON `ComponentStoryContribution`, written by the tagger. */
  StoryContribution?: string | null;
}

/** One component's contribution, parsed and made safe to render. */
export interface PSStoryContributionVM {
  Role: StoryContributionRole | null;
  /** Whole percent, or `null` when the tagger was given no weight to report. */
  WeightPercent: number | null;
  Evidence: string | null;
  ReusePotential: ReusePotential | null;
  ReuseWhen: string | null;
}

/** One component's story row. */
export interface PSStoryComponentVM {
  ID: string;
  Name: string;
  TypeName: string | null;
  SlotName: string | null;
  Story: string | null;
  Contribution: PSStoryContributionVM | null;
}

/** The whole model story, as the registry card renders it. */
export interface PSModelStoryVM {
  /** Prose from the ROOT component — the model-level story a similarity search reads. */
  ModelStory: string | null;
  /** Component stories, most-explanatory first. */
  Components: PSStoryComponentVM[];
  /** How many components carry `high` reuse potential — the reason to browse this story at all. */
  HighReuseCount: number;
  /** True when the tagger has not run (or was turned off), so the card can say so plainly. */
  IsEmpty: boolean;
}

const ROLES: readonly string[] = ['primary-driver', 'supporting', 'modifier', 'structural', 'marginal'];
const POTENTIALS: readonly string[] = ['high', 'medium', 'low'];

/**
 * Build the story view-model for one model from its component rows.
 *
 * @param rows every `MJ: ML Components` row for the model (root + children)
 * @param rootComponentID the model's `RootComponentID`, whose `Story` is the model-level prose
 */
export function buildModelStoryVM(
  rows: readonly StoryComponentRow[],
  rootComponentID: string | null | undefined,
): PSModelStoryVM {
  const root = rootComponentID ? rows.find((r) => r.ID === rootComponentID) : rows.find((r) => !r.ParentComponentID);
  const modelStory = nonEmpty(root?.Story);

  const components = rows
    .filter((r) => r.ID !== root?.ID)
    .map((r) => ({
      ID: r.ID,
      Name: r.Name?.trim() || r.ComponentType?.trim() || 'Component',
      TypeName: nonEmpty(r.ComponentType),
      SlotName: nonEmpty(r.SlotName),
      Story: nonEmpty(r.Story),
      Contribution: parseContribution(r.StoryContribution),
    }))
    // Most-explanatory first; a component with no measured weight sorts after ones that have it,
    // rather than being silently promoted to the top by a default of zero.
    .sort((a, b) => (b.Contribution?.WeightPercent ?? -1) - (a.Contribution?.WeightPercent ?? -1));

  return {
    ModelStory: modelStory,
    Components: components,
    HighReuseCount: components.filter((c) => c.Contribution?.ReusePotential === 'high').length,
    IsEmpty: !modelStory && components.every((c) => !c.Story),
  };
}

/**
 * Parse a `StoryContribution` JSON blob into something safe to render.
 *
 * Written by an LLM through a validated schema, but read here defensively anyway: a malformed or
 * partial blob yields nulls for the parts it cannot vouch for rather than rendering a guess. An
 * unrecognized role or reuse potential is DROPPED, not displayed — showing an invented role beside
 * measured evidence would lend it the same authority.
 */
export function parseContribution(json: string | null | undefined): PSStoryContributionVM | null {
  if (!json || !json.trim()) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  // An array is `typeof 'object'` but is not a contribution; letting it through would produce an
  // all-null object that renders as an empty block instead of being absent.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const c = parsed as Record<string, unknown>;
  const weight = typeof c.Weight === 'number' && Number.isFinite(c.Weight) ? c.Weight : null;

  const vm: PSStoryContributionVM = {
    Role: typeof c.Role === 'string' && ROLES.includes(c.Role) ? (c.Role as StoryContributionRole) : null,
    WeightPercent: weight === null ? null : Math.round(Math.max(0, Math.min(1, weight)) * 100),
    Evidence: nonEmpty(typeof c.Evidence === 'string' ? c.Evidence : null),
    ReusePotential:
      typeof c.ReusePotential === 'string' && POTENTIALS.includes(c.ReusePotential)
        ? (c.ReusePotential as ReusePotential)
        : null,
    ReuseWhen: nonEmpty(typeof c.ReuseWhen === 'string' ? c.ReuseWhen : null),
  };
  // Nothing survived validation — report ABSENT rather than an empty block that looks like a
  // contribution the tagger declined to describe.
  const anything = vm.Role || vm.WeightPercent !== null || vm.Evidence || vm.ReusePotential || vm.ReuseWhen;
  return anything ? vm : null;
}

/** Human phrasing for a contribution role — the template should not carry a lookup table. */
export function describeRole(role: StoryContributionRole | null): string {
  switch (role) {
    case 'primary-driver':
      return 'Primary driver';
    case 'supporting':
      return 'Supporting';
    case 'modifier':
      return 'Modifier';
    case 'structural':
      return 'Structural';
    case 'marginal':
      return 'Marginal';
    default:
      return '';
  }
}

/** Trimmed string, or `null` when there is nothing to show. */
function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

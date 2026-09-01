/**
 * @module stories/story-context-loader
 *
 * Assembles the **facts** a story is written about — deterministically, before any model is called.
 *
 * This is the half that makes the tagger honest. The LLM is handed the metrics, the trust verdict,
 * the feature importance, and each materialized component with its real entity/field bindings; it
 * narrates those. It is never asked to recall, infer, or estimate a number, which is why the story
 * can be trusted as a description even though it is generated text.
 */

import { RunView } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { TrustVerdict } from '@memberjunction/predictive-studio-core';

/** One component, reduced to what a story writer needs to describe it. */
export interface StoryComponentFacts {
  InstanceID: string;
  Name: string;
  ComponentTypeName: string;
  /** The component type's own archetype story — what this KIND of thing means. */
  TypeStory: string | null;
  /** Its inputs/outputs bound to real MJ fields, which is what gives it business meaning. */
  Bindings: Array<{
    Role: string;
    Name: string;
    Entity: string | null;
    EntityField: string | null;
    Meaning: string | null;
  }>;
  /**
   * This component's share of the model's explanation, when its name matches a feature in the
   * model's `FeatureImportance`. Absent when it cannot be attributed — the tagger is told the number
   * or told nothing, never asked to guess one.
   */
  ImportanceShare?: number;
}

/** Everything the story prompt is given. Entirely computed; nothing inferred. */
export interface ModelStoryContext {
  ModelID: string;
  ModelName: string;
  TargetEntityName: string;
  TargetVariable: string;
  ProblemType: string;
  /** The deterministic trust verdict — the tagger reports it, never grades it. */
  Trust: TrustVerdict;
  /** Honest holdout metrics when present, else the train/validation metrics. */
  Metrics: Record<string, number>;
  /** Whether `Metrics` came from the locked holdout (the honest number) or from validation. */
  MetricsAreHoldout: boolean;
  /** Per-feature importance, normalized to shares summing to ~1. */
  FeatureImportance: Array<{ Feature: string; Share: number }>;
  /** Rows the model trained on. */
  TrainingRowCount: number | null;
  /** The materialized components, root first. */
  Components: StoryComponentFacts[];
  /** Non-fatal notes — a component whose bindings could not be read, an absent metric. */
  Warnings: string[];
}

/** Read seam for the story context, so the tagger can be tested with canned facts. */
export interface IStoryContextLoader {
  load(model: MJMLModelEntity, trust: TrustVerdict, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<ModelStoryContext>;
}

/**
 * `RunView`-backed context loader. Reads the model's components + their bindings and joins the
 * model's own `FeatureImportance` onto them by binding name.
 */
export class RunViewStoryContextLoader implements IStoryContextLoader {
  /** @inheritdoc */
  public async load(
    model: MJMLModelEntity,
    trust: TrustVerdict,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<ModelStoryContext> {
    const warnings: string[] = [];
    const { metrics, areHoldout } = readMetrics(model, warnings);
    const importance = readImportance(model, warnings);
    const components = await this.loadComponents(model, importance, contextUser, provider, warnings);

    return {
      ModelID: model.ID,
      ModelName: `${model.Pipeline ?? 'Model'} v${model.Version}`,
      TargetEntityName: model.Pipeline ?? '',
      TargetVariable: model.TargetVariable,
      ProblemType: String(model.ProblemType),
      Trust: trust,
      Metrics: metrics,
      MetricsAreHoldout: areHoldout,
      FeatureImportance: importance,
      TrainingRowCount: model.TrainingRowCount ?? null,
      Components: components,
      Warnings: warnings,
    };
  }

  /** Load the model's components + their bindings, attributing importance where a name matches. */
  private async loadComponents(
    model: MJMLModelEntity,
    importance: Array<{ Feature: string; Share: number }>,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider | undefined,
    warnings: string[],
  ): Promise<StoryComponentFacts[]> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const componentRows = await rv.RunView<{
      ID: string;
      Name: string;
      ComponentTypeID: string;
      ComponentType: string;
      ParentComponentID: string | null;
    }>(
      {
        EntityName: 'MJ: ML Components',
        ExtraFilter: `MLModelID='${model.ID}'`,
        // StoryVector is deliberately excluded — it is large and useless to a story writer.
        Fields: ['ID', 'Name', 'ComponentTypeID', 'ComponentType', 'ParentComponentID'],
        OrderBy: 'Sequence',
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!componentRows.Success) {
      warnings.push(`Could not read the model's components: ${componentRows.ErrorMessage ?? 'unknown error'}`);
      return [];
    }
    const components = componentRows.Results ?? [];
    if (components.length === 0) {
      return [];
    }

    const ids = components.map((c) => `'${c.ID}'`).join(',');
    const bindingRows = await rv.RunView<{
      ComponentID: string;
      Role: string;
      Name: string;
      Entity: string | null;
      EntityField: string | null;
      Meaning: string | null;
    }>(
      {
        EntityName: 'MJ: ML Component Bindings',
        ExtraFilter: `ComponentID IN (${ids})`,
        Fields: ['ComponentID', 'Role', 'Name', 'Entity', 'EntityField', 'Meaning'],
        ResultType: 'simple',
      },
      contextUser,
    );
    if (!bindingRows.Success) {
      warnings.push(`Could not read component bindings: ${bindingRows.ErrorMessage ?? 'unknown error'}`);
    }

    const typeStories = await this.loadTypeStories(components.map((c) => c.ComponentTypeID), contextUser, provider);
    const shareByFeature = new Map(importance.map((i) => [i.Feature.toLowerCase(), i.Share]));

    return components.map((c) => {
      const bindings = (bindingRows.Results ?? []).filter((b) => b.ComponentID === c.ID);
      return {
        InstanceID: c.ID,
        Name: c.Name,
        ComponentTypeName: c.ComponentType,
        TypeStory: typeStories.get(c.ComponentTypeID) ?? null,
        Bindings: bindings.map((b) => ({ Role: b.Role, Name: b.Name, Entity: b.Entity, EntityField: b.EntityField, Meaning: b.Meaning })),
        ImportanceShare: attributeImportance(bindings, shareByFeature),
      };
    });
  }

  /** The archetype stories of the types involved — what each KIND of component means. */
  private async loadTypeStories(
    typeIds: string[],
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<Map<string, string | null>> {
    const unique = [...new Set(typeIds)];
    if (unique.length === 0) {
      return new Map();
    }
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<{ ID: string; Story: string | null }>(
      {
        EntityName: 'MJ: ML Component Types',
        ExtraFilter: `ID IN (${unique.map((id) => `'${id}'`).join(',')})`,
        Fields: ['ID', 'Story'],
        ResultType: 'simple',
      },
      contextUser,
    );
    return new Map((result.Results ?? []).map((r) => [r.ID, r.Story]));
  }
}

// region: pure helpers --------------------------------------------------------

/**
 * Prefer the LOCKED HOLDOUT metrics — the number scored exactly once on the final model. Falling
 * back to validation metrics is fine, but the story must say which it is, because the two mean
 * different things and only one of them is honest about a search's optimism.
 */
export function readMetrics(model: MJMLModelEntity, warnings: string[]): { metrics: Record<string, number>; areHoldout: boolean } {
  const holdout = parseNumericMap(model.HoldoutMetrics);
  if (Object.keys(holdout).length > 0) {
    return { metrics: holdout, areHoldout: true };
  }
  const train = parseNumericMap(model.Metrics);
  if (Object.keys(train).length === 0) {
    warnings.push('The model carries no usable metrics, so the story cannot describe how well it performs.');
  }
  return { metrics: train, areHoldout: false };
}

/** Feature importance as normalized shares, descending. Empty when the model reports none. */
export function readImportance(model: MJMLModelEntity, warnings: string[]): Array<{ Feature: string; Share: number }> {
  const raw = parseNumericMap(model.FeatureImportance);
  const entries = Object.entries(raw).filter(([, v]) => Number.isFinite(v) && v > 0);
  if (entries.length === 0) {
    warnings.push('The model reports no feature importance, so component contributions cannot be attributed.');
    return [];
  }
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  return entries
    .map(([Feature, v]) => ({ Feature, Share: total > 0 ? v / total : 0 }))
    .sort((a, b) => b.Share - a.Share);
}

/**
 * The share of the model's explanation attributable to a component, summed over its INPUT bindings.
 * Returns `undefined` — not 0 — when nothing matched, so the tagger can tell "contributes nothing"
 * from "we could not attribute this".
 */
export function attributeImportance(
  bindings: Array<{ Role: string; Name: string }>,
  shareByFeature: Map<string, number>,
): number | undefined {
  let total = 0;
  let matched = false;
  for (const b of bindings) {
    if (b.Role !== 'Input') continue;
    const share = shareByFeature.get(b.Name.toLowerCase());
    if (share != null) {
      total += share;
      matched = true;
    }
  }
  return matched ? total : undefined;
}

/** Parse a JSON column into a numeric map, tolerating null/blank/garbage. */
function parseNumericMap(raw: string | null | undefined): Record<string, number> {
  if (raw == null || raw.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

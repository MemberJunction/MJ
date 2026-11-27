/**
 * @module agent/catalog-renderer
 *
 * `CatalogRenderer` — the compact entity catalog the Data Scout and the Goal Analyst read (PR 5, A3; F-AG-3, DD-2).
 * Every entity gets one line — name, schema, base view and its description truncated to a fixed length — and the
 * entities within two hops of the target (foreign keys either way) also list their fields. The full metadata JSON
 * (200,946 characters for 583 entities) is refused by design; the compact form has a token budget, and a catalog over
 * it shortens the descriptions (to names only at the last) and never drops an entity, so every entity name is listed.
 */
import type { EntityInfo } from '@memberjunction/core';
import { UUIDMap, UUIDSet } from '@memberjunction/global';

import { PredictiveStudioPipelineBuilder } from './pipeline-builder';

/** The hop depth the catalog lists fields for (DD-2). */
export type CatalogHops = 2;

/** Renders the compact catalog. */
export class CatalogRenderer {
  /** The marker line the catalog starts with; the templates and the G4.2 check look for it. */
  public static readonly MARKER = '[PS ENTITY CATALOG]';
  /** The prompt data key the orchestrator injects the catalog under (the templates render `{{ PS_ENTITY_CATALOG }}`). */
  public static readonly DATA_KEY = 'PS_ENTITY_CATALOG';
  /** Characters a description keeps at most (DD-2: one line per entity). */
  public static readonly DESCRIPTION_LENGTH = 60; // DD-2: a one-line gist
  /** The shorter description lengths tried, in order, when the catalog is over its budget (0 = names only). */
  public static readonly SHORTER_DESCRIPTION_LENGTHS: readonly number[] = [40, 20, 0];
  /**
   * The catalog's token budget (DD-2), estimated at {@link CHARS_PER_TOKEN} characters per token. Measured on
   * `MJ_PS_PR5_claude1` (A3, 2026-11-27, Data Scout prompt run A0B03D69): 30,116 input tokens with a 537-entity
   * catalog of 57,721 characters at 60-character descriptions, so the rest of the prompt is ~16,300 tokens.
   */
  public static readonly TOKEN_BUDGET = 12_000; // DD-2: 30,000-token Data Scout prompt minus the ~16,300 measured outside the catalog, with ~1,700 to spare
  /** The whole Data Scout prompt's budget (DD-2). */
  public static readonly DATA_SCOUT_PROMPT_TOKENS = 30_000; // DD-2 default, recorded at the tier upgrade
  /** The characters-per-token estimate the budget is measured with. */
  public static readonly CHARS_PER_TOKEN = 4; // the usual English-text ratio of the BPE tokenizers the agent's models use

  /**
   * The compact catalog of `entities`: fields for the entities within `hops` of `target` (by name, view or table, as the
   * builder resolves it), one line for every other entity. With no target, every entity is one line.
   */
  public static Compact(entities: readonly EntityInfo[], target: string | null, hops: CatalogHops): string {
    const root = target ? PredictiveStudioPipelineBuilder.ResolveEntity(target, { EntityByName: (n: string) => entities.find((e) => e.Name.toLowerCase() === n.trim().toLowerCase()), Entities: [...entities] }) : undefined;
    const near = root ? CatalogRenderer.Reachable(root, entities, hops) : [];
    const sorted = [...entities].sort((a, b) => a.Name.localeCompare(b.Name));
    let out = CatalogRenderer.render(root || null, near, sorted, CatalogRenderer.DESCRIPTION_LENGTH);
    for (const length of CatalogRenderer.SHORTER_DESCRIPTION_LENGTHS) {
      if (CatalogRenderer.EstimateTokens(out) <= CatalogRenderer.TOKEN_BUDGET) break;
      out = CatalogRenderer.render(root || null, near, sorted, length);
    }
    return out;
  }

  /** The estimated tokens of `text` ({@link CHARS_PER_TOKEN} characters per token, rounded up). */
  public static EstimateTokens(text: string): number {
    return Math.ceil(text.length / CatalogRenderer.CHARS_PER_TOKEN);
  }

  /** The entities within `hops` foreign-key hops of `root` (either direction), `root` first, then by distance. */
  public static Reachable(root: EntityInfo, entities: readonly EntityInfo[], hops: number): EntityInfo[] {
    const byId = new UUIDMap<EntityInfo>(entities.map((e) => [e.ID, e] as const));
    const links = CatalogRenderer.adjacency(entities);
    const seen = new UUIDSet([root.ID]);
    const found: EntityInfo[] = [root];
    let frontier: string[] = [root.ID];
    for (let depth = 0; depth < hops; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const neighbour of links.Get(id) || []) {
          if (seen.Has(neighbour)) continue;
          seen.Add(neighbour);
          next.push(neighbour);
        }
      }
      found.push(...next.flatMap((id) => byId.Get(id) || []));
      frontier = next;
    }
    return found;
  }

  /** Each entity's foreign-key neighbours, both directions (an entity's own foreign keys and the keys that point at it). */
  private static adjacency(entities: readonly EntityInfo[]): UUIDMap<string[]> {
    const links = new UUIDMap<string[]>();
    const link = (a: string, b: string): void => {
      links.Set(a, [...(links.Get(a) || []), b]);
    };
    for (const e of entities) {
      for (const f of e.Fields) {
        if (!f.RelatedEntityID) continue;
        link(e.ID, f.RelatedEntityID);
        link(f.RelatedEntityID, e.ID);
      }
    }
    return links;
  }

  /** The catalog text: the marker, the field sections of the near entities, then one line per entity. */
  private static render(root: EntityInfo | null, near: readonly EntityInfo[], all: readonly EntityInfo[], descriptionLength: number): string {
    const lines = [`${CatalogRenderer.MARKER} ${all.length} entities${root ? `; fields within 2 hops of ${root.Name}` : ''}.`];
    for (const e of near) lines.push(`### ${e.Name}`, `fields: ${e.Fields.map((f) => `${f.Name} (${f.Type})`).join(', ')}`);
    if (near.length > 0) lines.push('', 'All entities:');
    for (const e of all) lines.push(CatalogRenderer.entityLine(e, descriptionLength));
    return lines.join('\n');
  }

  /** One entity's line: `- Name (schema.view): description…`. */
  private static entityLine(e: EntityInfo, descriptionLength: number): string {
    const where = `${e.SchemaName || ''}.${e.BaseView || e.BaseTable || ''}`;
    const text = (e.Description || '').replace(/\s+/g, ' ').trim();
    const gist = descriptionLength === 0 || text.length === 0 ? '' : `: ${text.length > descriptionLength ? `${text.slice(0, descriptionLength).trimEnd()}…` : text}`;
    return `- ${e.Name} (${where})${gist}`;
  }
}

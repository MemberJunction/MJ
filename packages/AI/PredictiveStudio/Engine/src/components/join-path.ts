/**
 * @module components/join-path
 *
 * Design-time auto-resolution of the FK path from an anchor entity to a related (leaf) entity —
 * ported near-verbatim from Sonar's `FactorCompiler.findAutoPathHops` (donation item 4). Used to
 * fill `MJ: ML Component Bindings.RelationshipPath` and to validate/propose `DatedSourceSpec`s
 * without asking the author to hand-write join paths.
 *
 * Pure over a structural entity list (satisfied by `EntityInfo`/`EntityFieldInfo` or any fixture),
 * BFS outward from the anchor over reverse-FK (parent→child) edges, failing LOUD on an
 * unreachable leaf (> maxDepth hops) or an ambiguous one (≥2 equally-short paths) — a guessed
 * join is a silently-wrong feature.
 */

/** The slice of entity metadata the resolver needs (structurally satisfied by `EntityInfo`). */
export interface FkGraphEntity {
  ID: string;
  Name: string;
  Fields: { Name: string; RelatedEntityID: string | null }[];
}

/** One hop of a leaf→anchor relationship path. A COMPOSITE FK names all its columns in `fks`. */
export interface RelationshipHop {
  fks: string[];
  entity?: string;
}

/** Max hops the auto-resolver searches before giving up (bounds pathological graphs). */
const MAX_AUTO_PATH_DEPTH = 5;

/**
 * Auto-resolve the FK path from a leaf entity back to the anchor by BFS *outward from the anchor*
 * over reverse-FK (parent→child, one-to-many) edges — "what data hangs off the anchor." Returns
 * the leaf→anchor hops a join-walker consumes (the final anchor-adjacent→anchor FK is the
 * caller's to resolve). Because every edge followed is a single child→parent FK on the return
 * trip, each leaf row maps to exactly one anchor → no fan-out. Guards:
 *   - unreachable (no descendant FK chain within maxDepth) → throw, suggest an explicit path;
 *   - ambiguous (≥2 shortest paths) → throw, require an explicit path.
 */
export function findAutoPathHops(
  entities: FkGraphEntity[],
  anchorEntityID: string,
  leafEntityID: string,
  maxDepth: number = MAX_AUTO_PATH_DEPTH,
): RelationshipHop[] {
  // Reverse-FK adjacency: parentID → [{ childID, fks }]. A COMPOSITE FK is several fields on the
  // child all pointing at one parent — bundled into ONE edge so it never reads as a false fork.
  const childrenOf = new Map<string, { childID: string; fks: string[] }[]>();
  for (const e of entities) {
    const fksByParent = new Map<string, string[]>();
    for (const f of e.Fields) {
      if (!f.RelatedEntityID) continue;
      const list = fksByParent.get(f.RelatedEntityID) ?? [];
      list.push(f.Name);
      fksByParent.set(f.RelatedEntityID, list);
    }
    for (const [parentID, fks] of fksByParent) {
      const list = childrenOf.get(parentID) ?? [];
      list.push({ childID: e.ID, fks });
      childrenOf.set(parentID, list);
    }
  }

  // Level-order BFS from the anchor; track distance, shortest-path count (ambiguity), and one
  // predecessor edge (valid to follow because the path is unique when pathCount === 1).
  const dist = new Map<string, number>([[anchorEntityID, 0]]);
  const pathCount = new Map<string, number>([[anchorEntityID, 1]]);
  const pred = new Map<string, { fromID: string; fks: string[] }>();
  const queue: string[] = [anchorEntityID];
  while (queue.length) {
    const cur = queue.shift() as string;
    const d = dist.get(cur) as number;
    if (d >= maxDepth) continue;
    for (const edge of childrenOf.get(cur) ?? []) {
      if (!dist.has(edge.childID)) {
        dist.set(edge.childID, d + 1);
        pathCount.set(edge.childID, pathCount.get(cur) as number);
        pred.set(edge.childID, { fromID: cur, fks: edge.fks });
        queue.push(edge.childID);
      } else if (dist.get(edge.childID) === d + 1) {
        // Another equally-short route into this node → accumulate (the ambiguity signal).
        pathCount.set(edge.childID, (pathCount.get(edge.childID) as number) + (pathCount.get(cur) as number));
      }
    }
  }

  const nameOf = (id: string) => entities.find((e) => e.ID === id)?.Name ?? id;
  if (!dist.has(leafEntityID)) {
    throw new Error(
      `join-path: no foreign-key path from the anchor to '${nameOf(leafEntityID)}' within ${maxDepth} hops — ` +
        `add a relationship or set an explicit RelationshipPath.`,
    );
  }
  if ((pathCount.get(leafEntityID) ?? 0) > 1) {
    throw new Error(
      `join-path: multiple foreign-key paths from the anchor to '${nameOf(leafEntityID)}' — ` +
        `set an explicit RelationshipPath to disambiguate.`,
    );
  }

  // Walk predecessors leaf → anchor, building the anchor→leaf FK list; drop the anchor-adjacent
  // FK (the caller's) and reverse into leaf→anchor order.
  const anchorToLeafFks: string[][] = [];
  let node = leafEntityID;
  while (node !== anchorEntityID) {
    const step = pred.get(node) as { fromID: string; fks: string[] };
    anchorToLeafFks.unshift(step.fks);
    node = step.fromID;
  }
  return anchorToLeafFks
    .slice(1)
    .reverse()
    .map((fks) => ({ fks }));
}

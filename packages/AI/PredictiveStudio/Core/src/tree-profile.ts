/**
 * @module tree-profile
 *
 * Pure resolution of a leaf's inherited **profile** from the model tree (Doc 4 §2):
 * walk from the tree root down to a leaf, union the bank entries at each node
 * (a same-`Name` child entry overrides its parent), and combine gates conjunctively.
 * Produces the positioned priority multiset the agent/strategist selects from.
 *
 * Kept in Core (entity-free): engines map `MJ: ML Model Tree Node` /
 * `MJ: ML Model Tree Node Bank Entry` rows into these plain shapes. No DB here.
 */

/** Bank category (mirrors the seeded MLModelTreeNodeBankEntry.BankType). */
export type BankType = 'Preprocessing' | 'GatingRule' | 'HyperparameterPrior' | 'LossFunction';

/** A plain-data tree node (mirror of MLModelTreeNode). */
export interface TreeNode {
  Id: string;
  ParentId: string | null;
  Name: string;
  /** Non-null on a leaf that binds a component. */
  ComponentId?: string | null;
}

/** A plain-data bank entry attached to a node (mirror of MLModelTreeNodeBankEntry). */
export interface TreeBankEntry {
  NodeId: string;
  BankType: BankType;
  /** Unique key within a (node, BankType) — a same-Name child entry overrides the parent's. */
  Name: string;
  /** The bank payload (a preprocessing op, a gate rule, a prior, a loss). */
  Payload: unknown;
  /** Selection priority (lower = higher priority within a position). */
  Priority: number;
}

/** The resolved profile a leaf inherits from its ancestry. */
export interface LeafProfile {
  leafId: string;
  /** Bank entries by type, after walk-up union + override + priority sort. */
  banks: Record<BankType, ResolvedBankEntry[]>;
  /** The ancestry path root→leaf (node ids), for provenance. */
  path: string[];
}

/** A bank entry after resolution — carries which node contributed it. */
export interface ResolvedBankEntry {
  Name: string;
  Payload: unknown;
  Priority: number;
  /** The node whose entry won (nearest-to-leaf on override). */
  fromNodeId: string;
}

const BANK_TYPES: BankType[] = ['Preprocessing', 'GatingRule', 'HyperparameterPrior', 'LossFunction'];

/**
 * Resolve the profile for `leafId`. Walks root→leaf; at each node, a bank entry
 * overrides an ancestor entry of the same (BankType, Name); entries are then sorted
 * by Priority within each BankType. GatingRules are NOT overridden — they accumulate
 * (combine conjunctively), so every gate on the path applies.
 */
export function resolveLeafProfile(
  nodes: TreeNode[],
  bankEntries: TreeBankEntry[],
  leafId: string,
): LeafProfile {
  const byId = new Map(nodes.map((n) => [n.Id, n]));
  // build the root→leaf path
  const path: string[] = [];
  let cur: TreeNode | undefined = byId.get(leafId);
  if (!cur) throw new Error(`resolveLeafProfile: leaf '${leafId}' not in the tree`);
  while (cur) {
    path.unshift(cur.Id);
    cur = cur.ParentId ? byId.get(cur.ParentId) : undefined;
  }

  const entriesByNode = new Map<string, TreeBankEntry[]>();
  for (const e of bankEntries) {
    const list = entriesByNode.get(e.NodeId) ?? [];
    list.push(e);
    entriesByNode.set(e.NodeId, list);
  }

  const banks = Object.fromEntries(BANK_TYPES.map((t) => [t, []])) as Record<BankType, ResolvedBankEntry[]>;
  // per BankType: walk root→leaf; override by Name EXCEPT GatingRule which accumulates
  for (const type of BANK_TYPES) {
    const winners = new Map<string, ResolvedBankEntry>(); // by Name (override)
    const accumulated: ResolvedBankEntry[] = []; // gates (no override)
    for (const nodeId of path) {
      for (const e of entriesByNode.get(nodeId) ?? []) {
        if (e.BankType !== type) continue;
        const resolved: ResolvedBankEntry = { Name: e.Name, Payload: e.Payload, Priority: e.Priority, fromNodeId: nodeId };
        if (type === 'GatingRule') {
          accumulated.push(resolved); // every gate applies (conjunctive)
        } else {
          winners.set(e.Name, resolved); // nearer-to-leaf overrides
        }
      }
    }
    const merged = type === 'GatingRule' ? accumulated : [...winners.values()];
    merged.sort((a, b) => a.Priority - b.Priority);
    banks[type] = merged;
  }

  return { leafId, banks, path };
}

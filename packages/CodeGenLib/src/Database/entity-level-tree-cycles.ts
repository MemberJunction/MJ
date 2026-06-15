/**
 * Pure graph helpers used by `SQLUtilityBase.buildEntityLevelsTree` to produce a focused
 * cyclical-dependency diagnostic. Kept free of any CodeGen/config imports so the logic is
 * trivially unit-testable with plain `Map` fixtures.
 */

/**
 * Finds the true cyclical groups within a dependency graph by computing the strongly
 * connected components (Tarjan's algorithm) and returning only those with more than one
 * member. Self-loops are expected to be excluded by the caller (buildEntityLevelsTree
 * never records self-referencing foreign keys), so single-node SCCs are never cycles here.
 *
 * The result is deterministic regardless of Map insertion order: members within each SCC
 * are sorted alphabetically, and the SCCs themselves are sorted by their first member.
 *
 * @param dependencyMap graph as adjacency sets — key depends on each entry in its Set.
 *                      Edges pointing at nodes not present as keys are ignored (those
 *                      nodes were already resolved into earlier levels).
 * @returns one string[] per cycle, each listing the entity names participating in it
 */
export function FindTrueCycles(dependencyMap: Map<string, Set<string>>): string[][] {
   return computeStronglyConnectedComponents(dependencyMap)
      .filter(component => component.length > 1)
      .map(component => [...component].sort((a, b) => a.localeCompare(b)))
      .sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Tarjan's strongly connected components over the given adjacency map.
 * Returns every SCC including trivial single-node ones — callers filter as needed.
 */
function computeStronglyConnectedComponents(dependencyMap: Map<string, Set<string>>): string[][] {
   const indices = new Map<string, number>();
   const lowLinks = new Map<string, number>();
   const onStack = new Set<string>();
   const stack: string[] = [];
   const components: string[][] = [];
   let nextIndex = 0;

   const strongConnect = (node: string): void => {
      indices.set(node, nextIndex);
      lowLinks.set(node, nextIndex);
      nextIndex++;
      stack.push(node);
      onStack.add(node);

      for (const neighbor of dependencyMap.get(node) ?? []) {
         if (!dependencyMap.has(neighbor)) {
            continue; // edge points outside the remaining graph — ignore
         }
         if (!indices.has(neighbor)) {
            strongConnect(neighbor);
            lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(neighbor)!));
         }
         else if (onStack.has(neighbor)) {
            lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(neighbor)!));
         }
      }

      // If node is a root of an SCC, pop the stack down to (and including) node
      if (lowLinks.get(node) === indices.get(node)) {
         const component: string[] = [];
         let member: string;
         do {
            member = stack.pop()!;
            onStack.delete(member);
            component.push(member);
         } while (member !== node);
         components.push(component);
      }
   };

   for (const node of dependencyMap.keys()) {
      if (!indices.has(node)) {
         strongConnect(node);
      }
   }

   return components;
}

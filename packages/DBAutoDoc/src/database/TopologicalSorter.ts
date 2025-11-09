/**
 * Topological sorting of database tables based on foreign key dependencies
 * Implements Kahn's algorithm
 */

import { SchemaDefinition, TableDefinition } from '../types/state.js';
import { DependencyGraph, TableNode } from '../types/analysis.js';

export class TopologicalSorter {
  /**
   * Build dependency graph and sort topologically
   */
  public buildAndSort(schemas: SchemaDefinition[]): DependencyGraph {
    // Build graph from schemas
    const nodes = this.buildGraph(schemas);

    // Perform topological sort
    const levels = this.sort(nodes);

    return { nodes, levels };
  }

  /**
   * Build dependency graph from schemas
   */
  private buildGraph(schemas: SchemaDefinition[]): Map<string, TableNode> {
    const nodes = new Map<string, TableNode>();

    // Create all nodes first
    for (const schema of schemas) {
      for (const table of schema.tables) {
        const fullName = `${schema.name}.${table.name}`;
        nodes.set(fullName, {
          schema: schema.name,
          table: table.name,
          fullName,
          dependsOn: [],
          dependents: [],
          level: -1,
          tableDefinition: table
        });
      }
    }

    // Wire up dependencies
    for (const schema of schemas) {
      for (const table of schema.tables) {
        const fullName = `${schema.name}.${table.name}`;
        const node = nodes.get(fullName)!;

        // Add dependencies
        for (const dep of table.dependsOn) {
          const depFullName = `${dep.schema}.${dep.table}`;
          const depNode = nodes.get(depFullName);

          if (depNode) {
            node.dependsOn.push(depNode);
            depNode.dependents.push(node);
          }
        }
      }
    }

    return nodes;
  }

  /**
   * Perform topological sort using Kahn's algorithm
   */
  private sort(nodes: Map<string, TableNode>): TableNode[][] {
    const levels: TableNode[][] = [];
    const inDegree = new Map<string, number>();
    const processed = new Set<string>();

    // Calculate in-degrees
    for (const [fullName, node] of nodes) {
      inDegree.set(fullName, node.dependsOn.length);
    }

    let currentLevel = 0;

    while (processed.size < nodes.size) {
      // Find all nodes with in-degree 0 (no unprocessed dependencies)
      const currentLevelNodes: TableNode[] = [];

      for (const [fullName, node] of nodes) {
        if (!processed.has(fullName) && inDegree.get(fullName) === 0) {
          currentLevelNodes.push(node);
          node.level = currentLevel;
        }
      }

      // Check for cycles
      if (currentLevelNodes.length === 0 && processed.size < nodes.size) {
        // We have a cycle - find remaining nodes and assign them to current level
        const remaining: TableNode[] = [];
        for (const [fullName, node] of nodes) {
          if (!processed.has(fullName)) {
            node.level = currentLevel;
            remaining.push(node);
          }
        }

        if (remaining.length > 0) {
          levels.push(remaining);
        }

        break;
      }

      // Add current level to results
      if (currentLevelNodes.length > 0) {
        levels.push(currentLevelNodes);

        // Mark nodes as processed
        for (const node of currentLevelNodes) {
          processed.add(node.fullName);

          // Decrement in-degree for dependents
          for (const dependent of node.dependents) {
            const currentInDegree = inDegree.get(dependent.fullName)!;
            inDegree.set(dependent.fullName, currentInDegree - 1);
          }
        }
      }

      currentLevel++;
    }

    // Update table definitions with dependency level
    for (const [fullName, node] of nodes) {
      if (node.tableDefinition) {
        node.tableDefinition.dependencyLevel = node.level;
      }
    }

    return levels;
  }

  /**
   * Detect cycles in the dependency graph
   */
  public detectCycles(nodes: Map<string, TableNode>): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: TableNode, path: string[]): void => {
      visited.add(node.fullName);
      recursionStack.add(node.fullName);
      path.push(node.fullName);

      for (const dep of node.dependsOn) {
        if (!visited.has(dep.fullName)) {
          dfs(dep, [...path]);
        } else if (recursionStack.has(dep.fullName)) {
          // Found a cycle
          const cycleStart = path.indexOf(dep.fullName);
          const cycle = path.slice(cycleStart);
          cycle.push(dep.fullName);
          cycles.push(cycle);
        }
      }

      recursionStack.delete(node.fullName);
    };

    for (const [fullName, node] of nodes) {
      if (!visited.has(fullName)) {
        dfs(node, []);
      }
    }

    return cycles;
  }
}

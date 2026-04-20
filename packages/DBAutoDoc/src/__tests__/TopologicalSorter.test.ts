import { describe, it, expect, beforeEach } from 'vitest';
import { TopologicalSorter } from '../database/TopologicalSorter';
import { SchemaDefinition } from '../types/state';

function makeTable(name: string, dependsOn: Array<{ schema: string; table: string; column: string; referencedColumn: string }> = []) {
  return {
    name,
    rowCount: 100,
    dependsOn,
    dependents: [],
    columns: [],
    descriptionIterations: []
  };
}

function makeSchema(name: string, tables: ReturnType<typeof makeTable>[]): SchemaDefinition {
  return {
    name,
    tables,
    descriptionIterations: []
  };
}

describe('TopologicalSorter', () => {
  let sorter: TopologicalSorter;

  beforeEach(() => {
    sorter = new TopologicalSorter();
  });

  describe('buildAndSort', () => {
    it('should handle a single table with no dependencies', () => {
      const schemas = [makeSchema('dbo', [makeTable('Users')])];
      const result = sorter.buildAndSort(schemas);

      expect(result.levels).toHaveLength(1);
      expect(result.levels[0]).toHaveLength(1);
      expect(result.levels[0][0].table).toBe('Users');
      expect(result.levels[0][0].level).toBe(0);
    });

    it('should sort tables into correct dependency levels', () => {
      const schemas = [
        makeSchema('dbo', [
          makeTable('Users'),
          makeTable('Orders', [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }]),
          makeTable('OrderItems', [{ schema: 'dbo', table: 'Orders', column: 'OrderID', referencedColumn: 'ID' }])
        ])
      ];

      const result = sorter.buildAndSort(schemas);

      expect(result.levels.length).toBeGreaterThanOrEqual(3);
      expect(result.levels[0].some(n => n.table === 'Users')).toBe(true);
      expect(result.levels[1].some(n => n.table === 'Orders')).toBe(true);
      expect(result.levels[2].some(n => n.table === 'OrderItems')).toBe(true);
    });

    it('should place independent tables at level 0', () => {
      const schemas = [
        makeSchema('dbo', [
          makeTable('Users'),
          makeTable('Products'),
          makeTable('Categories')
        ])
      ];

      const result = sorter.buildAndSort(schemas);

      expect(result.levels).toHaveLength(1);
      expect(result.levels[0]).toHaveLength(3);
      for (const node of result.levels[0]) {
        expect(node.level).toBe(0);
      }
    });

    it('should handle multiple schemas', () => {
      const schemas = [
        makeSchema('dbo', [makeTable('Users')]),
        makeSchema('sales', [
          makeTable('Orders', [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }])
        ])
      ];

      const result = sorter.buildAndSort(schemas);

      expect(result.nodes.size).toBe(2);
      expect(result.nodes.has('dbo.Users')).toBe(true);
      expect(result.nodes.has('sales.Orders')).toBe(true);
    });

    it('should handle an empty schema list', () => {
      const result = sorter.buildAndSort([]);

      expect(result.nodes.size).toBe(0);
      expect(result.levels).toHaveLength(0);
    });

    it('should correctly wire up dependents (reverse relationships)', () => {
      const schemas = [
        makeSchema('dbo', [
          makeTable('Users'),
          makeTable('Orders', [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }])
        ])
      ];

      const result = sorter.buildAndSort(schemas);
      const usersNode = result.nodes.get('dbo.Users')!;
      const ordersNode = result.nodes.get('dbo.Orders')!;

      expect(usersNode.dependents).toContain(ordersNode);
      expect(ordersNode.dependsOn).toContain(usersNode);
    });

    it('should handle references to non-existent tables gracefully', () => {
      const schemas = [
        makeSchema('dbo', [
          makeTable('Orders', [{ schema: 'dbo', table: 'NonExistent', column: 'ID', referencedColumn: 'ID' }])
        ])
      ];

      const result = sorter.buildAndSort(schemas);

      expect(result.levels).toHaveLength(1);
      expect(result.levels[0][0].table).toBe('Orders');
    });

    it('should update tableDefinition dependency levels', () => {
      const table1 = makeTable('Users');
      const table2 = makeTable('Orders', [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }]);
      const schemas = [makeSchema('dbo', [table1, table2])];

      sorter.buildAndSort(schemas);

      expect(table1.dependencyLevel).toBe(0);
      expect(table2.dependencyLevel).toBe(1);
    });
  });

  describe('detectCycles', () => {
    it('should return empty array when no cycles exist', () => {
      const schemas = [
        makeSchema('dbo', [
          makeTable('Users'),
          makeTable('Orders', [{ schema: 'dbo', table: 'Users', column: 'UserID', referencedColumn: 'ID' }])
        ])
      ];

      const graph = sorter.buildAndSort(schemas);
      const cycles = sorter.detectCycles(graph.nodes);

      expect(cycles).toHaveLength(0);
    });

    it('should detect a simple cycle', () => {
      // Create a circular dependency manually: A -> B -> A
      const schemas = [
        makeSchema('dbo', [
          makeTable('A', [{ schema: 'dbo', table: 'B', column: 'BID', referencedColumn: 'ID' }]),
          makeTable('B', [{ schema: 'dbo', table: 'A', column: 'AID', referencedColumn: 'ID' }])
        ])
      ];

      const graph = sorter.buildAndSort(schemas);
      const cycles = sorter.detectCycles(graph.nodes);

      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should handle a graph with no nodes', () => {
      const emptyNodes = new Map();
      const cycles = sorter.detectCycles(emptyNodes);

      expect(cycles).toHaveLength(0);
    });
  });
});

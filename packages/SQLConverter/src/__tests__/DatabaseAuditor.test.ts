import { describe, it, expect, vi } from 'vitest';
import { DatabaseAuditRunner } from '../DatabaseAuditor.js';
import type { IDatabaseAuditor, DatabaseInventory } from '../types.js';

function mockAuditor(
  inventory: DatabaseInventory,
  rowCounts: Map<string, number>
): IDatabaseAuditor {
  return {
    GetInventory: vi.fn().mockResolvedValue(inventory),
    GetRowCounts: vi.fn().mockResolvedValue(rowCounts),
    Close: vi.fn().mockResolvedValue(undefined),
  };
}

describe('DatabaseAuditRunner', () => {
  const runner = new DatabaseAuditRunner();

  describe('RunAudit', () => {
    it('should report matching databases as clean', async () => {
      const inventory: DatabaseInventory = {
        tables: ['Users', 'Orders'],
        views: ['vwUsers'],
        functions: ['fn_GetUser'],
        triggers: ['trg_Users'],
        indexes: ['IX_Users_Email'],
      };
      const rowCounts = new Map([['Users', 100], ['Orders', 50]]);

      const source = mockAuditor(inventory, rowCounts);
      const target = mockAuditor(inventory, rowCounts);

      const report = await runner.RunAudit(source, target);

      expect(report.missing).toHaveLength(0);
      expect(report.rowCountMismatches).toHaveLength(0);
      expect(report.source.tables).toHaveLength(2);
      expect(report.target.tables).toHaveLength(2);
    });

    it('should detect missing tables', async () => {
      const sourceInv: DatabaseInventory = {
        tables: ['Users', 'Orders', 'Products'],
        views: [], functions: [], triggers: [], indexes: [],
      };
      const targetInv: DatabaseInventory = {
        tables: ['Users', 'Orders'],
        views: [], functions: [], triggers: [], indexes: [],
      };

      const source = mockAuditor(sourceInv, new Map());
      const target = mockAuditor(targetInv, new Map());

      const report = await runner.RunAudit(source, target);

      expect(report.missing).toHaveLength(1);
      expect(report.missing[0]).toContain('Products');
    });

    it('should detect missing views', async () => {
      const sourceInv: DatabaseInventory = {
        tables: [], views: ['vwUsers', 'vwOrders'], functions: [], triggers: [], indexes: [],
      };
      const targetInv: DatabaseInventory = {
        tables: [], views: ['vwUsers'], functions: [], triggers: [], indexes: [],
      };

      const source = mockAuditor(sourceInv, new Map());
      const target = mockAuditor(targetInv, new Map());

      const report = await runner.RunAudit(source, target);

      expect(report.missing).toHaveLength(1);
      expect(report.missing[0]).toContain('VIEW');
      expect(report.missing[0]).toContain('vwOrders');
    });

    it('should detect missing functions', async () => {
      const sourceInv: DatabaseInventory = {
        tables: [], views: [], functions: ['fn_A', 'fn_B'], triggers: [], indexes: [],
      };
      const targetInv: DatabaseInventory = {
        tables: [], views: [], functions: ['fn_A'], triggers: [], indexes: [],
      };

      const source = mockAuditor(sourceInv, new Map());
      const target = mockAuditor(targetInv, new Map());

      const report = await runner.RunAudit(source, target);

      expect(report.missing).toHaveLength(1);
      expect(report.missing[0]).toContain('FUNCTION');
    });

    it('should detect missing triggers', async () => {
      const sourceInv: DatabaseInventory = {
        tables: [], views: [], functions: [], triggers: ['trg_A'], indexes: [],
      };
      const targetInv: DatabaseInventory = {
        tables: [], views: [], functions: [], triggers: [], indexes: [],
      };

      const source = mockAuditor(sourceInv, new Map());
      const target = mockAuditor(targetInv, new Map());

      const report = await runner.RunAudit(source, target);

      expect(report.missing).toHaveLength(1);
      expect(report.missing[0]).toContain('TRIGGER');
    });

    it('should detect row count mismatches', async () => {
      const inventory: DatabaseInventory = {
        tables: ['Users'], views: [], functions: [], triggers: [], indexes: [],
      };

      const source = mockAuditor(
        inventory,
        new Map([['Users', 100]])
      );
      const target = mockAuditor(
        inventory,
        new Map([['Users', 95]])
      );

      const report = await runner.RunAudit(source, target);

      expect(report.rowCountMismatches).toHaveLength(1);
      expect(report.rowCountMismatches[0].tableName).toBe('Users');
      expect(report.rowCountMismatches[0].sourceCount).toBe(100);
      expect(report.rowCountMismatches[0].targetCount).toBe(95);
    });

    it('should not report mismatches for missing tables', async () => {
      const sourceInv: DatabaseInventory = {
        tables: ['Users', 'Missing'], views: [], functions: [], triggers: [], indexes: [],
      };
      const targetInv: DatabaseInventory = {
        tables: ['Users'], views: [], functions: [], triggers: [], indexes: [],
      };

      const source = mockAuditor(sourceInv, new Map([['Users', 100], ['Missing', 50]]));
      const target = mockAuditor(targetInv, new Map([['Users', 100]]));

      const report = await runner.RunAudit(source, target);

      // Missing table should be in missing list, not in row count mismatches
      expect(report.missing).toHaveLength(1);
      expect(report.rowCountMismatches).toHaveLength(0);
    });

    it('should handle case-insensitive table name comparison', async () => {
      const sourceInv: DatabaseInventory = {
        tables: ['Users'], views: [], functions: [], triggers: [], indexes: [],
      };
      const targetInv: DatabaseInventory = {
        tables: ['users'], views: [], functions: [], triggers: [], indexes: [],
      };

      const source = mockAuditor(sourceInv, new Map());
      const target = mockAuditor(targetInv, new Map());

      const report = await runner.RunAudit(source, target);

      expect(report.missing).toHaveLength(0);
    });

    it('should handle empty databases', async () => {
      const emptyInv: DatabaseInventory = {
        tables: [], views: [], functions: [], triggers: [], indexes: [],
      };

      const source = mockAuditor(emptyInv, new Map());
      const target = mockAuditor(emptyInv, new Map());

      const report = await runner.RunAudit(source, target);

      expect(report.missing).toHaveLength(0);
      expect(report.rowCountMismatches).toHaveLength(0);
    });
  });

  describe('FormatReport', () => {
    it('should format a clean report', () => {
      const report = {
        source: { tables: ['A', 'B'], views: ['V1'], functions: ['F1'], triggers: ['T1'], indexes: ['I1'] },
        target: { tables: ['A', 'B'], views: ['V1'], functions: ['F1'], triggers: ['T1'], indexes: ['I1'] },
        missing: [],
        rowCountMismatches: [],
      };

      const formatted = runner.FormatReport(report);
      expect(formatted).toContain('Source Database');
      expect(formatted).toContain('Target Database');
      expect(formatted).toContain('Tables:    2');
      expect(formatted).toContain('No Missing Objects');
      expect(formatted).toContain('Row Counts Match');
    });

    it('should format missing objects', () => {
      const report = {
        source: { tables: ['A', 'B', 'C'], views: [], functions: [], triggers: [], indexes: [] },
        target: { tables: ['A'], views: [], functions: [], triggers: [], indexes: [] },
        missing: ['TABLE: B', 'TABLE: C'],
        rowCountMismatches: [],
      };

      const formatted = runner.FormatReport(report);
      expect(formatted).toContain('Missing from Target (2)');
      expect(formatted).toContain('TABLE: B');
      expect(formatted).toContain('TABLE: C');
    });

    it('should format row count mismatches', () => {
      const report = {
        source: { tables: ['Users'], views: [], functions: [], triggers: [], indexes: [] },
        target: { tables: ['Users'], views: [], functions: [], triggers: [], indexes: [] },
        missing: [],
        rowCountMismatches: [
          { tableName: 'Users', sourceCount: 100, targetCount: 95 },
        ],
      };

      const formatted = runner.FormatReport(report);
      expect(formatted).toContain('Row Count Mismatches (1)');
      expect(formatted).toContain('Users: source=100, target=95');
    });
  });
});

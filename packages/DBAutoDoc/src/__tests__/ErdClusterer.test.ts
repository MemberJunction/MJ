import { describe, it, expect } from 'vitest';
import { ErdClusterer } from '../generators/ErdClusterer';
import { DatabaseDocumentation, TableDefinition, ForeignKeyReference } from '../types/state';

/**
 * Synthetic schema: two hubs (Customer, Horse) each referenced by several detail tables, a status
 * lookup every detail table references, a bridge table between the hubs, an isolated table and a
 * two-table chain with no hub.
 */
function table(name: string, rowCount: number, refs: string[], extraColumns: string[] = [], schema = 'dbo'): TableDefinition {
  const dependsOn: ForeignKeyReference[] = refs.map(r => ({ schema, table: r, column: `${r}ID`, referencedColumn: 'ID' }));
  return {
    name, rowCount, dependsOn, dependents: [], descriptionIterations: [], description: `${name} description`,
    columns: [
      { name: 'ID', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] },
      ...refs.map(r => ({ name: `${r}ID`, dataType: 'int', isNullable: true, isPrimaryKey: false, isForeignKey: true, descriptionIterations: [] })),
      ...extraColumns.map(c => ({ name: c, dataType: 'nvarchar(50)', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] })),
    ],
  };
}

function state(): DatabaseDocumentation {
  const customerDetails = ['CustomerAddress', 'CustomerPhone', 'CustomerEmail', 'Membership', 'Invoice', 'Payment', 'Note', 'Suspension'];
  const horseDetails = ['HorseName', 'HorseColor', 'HorseOwner', 'HorseTest', 'Registration', 'Transfer', 'Breeding', 'Lease'];
  const tables: TableDefinition[] = [
    table('Customer', 100000, [], ['Name', 'Email']),
    table('Horse', 50000, [], ['Name']),
    table('Status', 5, []),
    ...customerDetails.map(n => table(n, 1000, ['Customer', 'Status'])),
    ...horseDetails.map(n => table(n, 1000, ['Horse', 'Status'])),
    table('CustomerHorse', 3000, ['Customer', 'Horse']),
    table('Orphan', 10, []),
    table('ChainA', 10, ['ChainB']),
    table('ChainB', 100000, []), // large enough not to count as a reference table
  ];
  return {
    version: '1.0.0',
    summary: { createdAt: '', lastModified: '', totalIterations: 0, totalPromptsRun: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0, totalSchemas: 1, totalTables: tables.length, totalColumns: 0 },
    database: { name: 'TestDB', server: 'localhost', analyzedAt: '' },
    phases: { descriptionGeneration: [] },
    schemas: [{ name: 'dbo', tables, descriptionIterations: [] }],
  };
}

describe('ErdClusterer', () => {
  it('finds the hubs and assigns every detail table to its nearest hub', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5 });
    expect(plan.Clusters.map(c => c.HubName).sort()).toEqual(['Customer', 'Horse']);
    const customer = plan.Clusters.find(c => c.HubName === 'Customer')!;
    expect(customer.Tables[0]).toBe('dbo.Customer');
    expect(customer.Tables).toContain('dbo.Invoice');
    expect(customer.Tables).not.toContain('dbo.HorseName');
    const horse = plan.Clusters.find(c => c.HubName === 'Horse')!;
    expect(horse.Tables).toContain('dbo.Registration');
    // the bridge table lands in exactly one cluster
    const owners = plan.Clusters.filter(c => c.Tables.includes('dbo.CustomerHorse'));
    expect(owners).toHaveLength(1);
  });

  it('sets the status lookup aside as a reference table instead of drawing it', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5 });
    expect(plan.ReferenceTables.map(r => r.Table)).toEqual(['Status']);
    expect(plan.ReferenceTables[0].ReferencedBy).toBe(16);
    for (const cluster of plan.Clusters) {
      expect(cluster.Tables).not.toContain('dbo.Status');
      expect(cluster.ReferenceTables.map(r => r.Table)).toEqual(['Status']);
    }
    expect(plan.IsolatedTables).toEqual(['Orphan']);
    expect(plan.UnassignedTables.sort()).toEqual(['ChainA', 'ChainB']);
  });

  it('paginates a cluster larger than the page size with the hub on every page', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5, pageSize: 4 });
    const customer = plan.Clusters.find(c => c.HubName === 'Customer')!;
    expect(customer.Pages.length).toBeGreaterThan(1);
    for (const page of customer.Pages) {
      expect(page.Tables[0]).toBe('dbo.Customer');
      expect(page.Tables.length).toBeLessThanOrEqual(5);
    }
    const everyMember = new Set(customer.Pages.flatMap(p => p.Tables));
    expect([...everyMember].sort()).toEqual([...customer.Tables].sort());
  });

  it('honours forced hubs, forced lookups and exclusions', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5, hubs: ['Invoice'], excludeTables: ['Suspension'], lookupTables: ['Note'], minClusterSize: 1 });
    expect(plan.Clusters.some(c => c.HubName === 'Invoice')).toBe(true);
    expect(plan.ExcludedTables).toEqual(['Suspension']);
    expect(plan.Clusters.every(c => !c.Tables.includes('dbo.Suspension'))).toBe(true);
    expect(plan.ReferenceTables.map(r => r.Table).sort()).toEqual(['Note', 'Status']);
  });

  it('folds a cluster below the minimum size into the neighbour it links to', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5, hubs: ['Invoice'], minClusterSize: 3 });
    // Invoice is forced, so it stays; CustomerHorse-style singletons do not appear as their own area
    expect(plan.Clusters.every(c => c.Tables.length >= 3 || c.HubName === 'Invoice')).toBe(true);
  });

  it('warns when two undersized areas link only to each other and cannot fold', () => {
    // Two small hubs (3 exclusive members each) joined by one bridge and nothing else
    const tables: TableDefinition[] = [
      table('Alpha', 100000, []), table('Beta', 100000, []),
      ...['A1', 'A2', 'A3'].map(n => table(n, 1000, ['Alpha'])),
      ...['B1', 'B2', 'B3'].map(n => table(n, 1000, ['Beta'])),
      table('AlphaBeta', 1000, ['Alpha', 'Beta']),
    ];
    const s = state();
    s.schemas = [{ name: 'dbo', tables, descriptionIterations: [] }];
    const plan = new ErdClusterer().Plan(s, { hubMinInbound: 3, minClusterSize: 6 });
    expect(plan.Clusters.map(c => c.HubName).sort()).toEqual(['Alpha', 'Beta']);
    expect(plan.Clusters.every(c => c.Tables.length < 6)).toBe(true);
    expect(plan.Warnings).toEqual([
      "minClusterSize: subject area 'Alpha' has 5 table(s), below the minimum of 6, and no larger neighbouring area to fold into",
      "minClusterSize: subject area 'Beta' has 4 table(s), below the minimum of 6, and no larger neighbouring area to fold into",
    ]);
  });

  it('keeps same-named tables in different schemas apart and resolves dotted table names', () => {
    const s = state();
    s.schemas.push({ name: 'crm', descriptionIterations: [], tables: [
      table('Customer', 5000, [], ['Name'], 'crm'),
      ...['Lead', 'Campaign', 'Contact', 'Ticket', 'Account', 'Call'].map(n => table(n, 100000, ['Customer'], [], 'crm')),
    ] });
    s.schemas[0].tables.push(table('Customer.bak', 100000, []));
    s.schemas[0].tables.push(table('BackupAudit', 100000, ['Customer.bak']));
    const plan = new ErdClusterer().Plan(s, { hubMinInbound: 5 });
    // only the ambiguous name is schema-qualified
    expect(plan.Clusters.map(c => c.HubName).sort()).toEqual(['Horse', 'crm.Customer', 'dbo.Customer']);
    const dbo = plan.Clusters.find(c => c.HubName === 'dbo.Customer')!;
    const crm = plan.Clusters.find(c => c.HubName === 'crm.Customer')!;
    expect(dbo.Tables).toContain('dbo.Invoice');
    expect(crm.Tables).toContain('crm.Lead');
    expect(dbo.Tables).not.toContain('crm.Lead');
    expect(plan.TotalEdges).toBe(16 * 2 + 2 + 1 + 6 + 1);
    expect(plan.NameOf('dbo.Customer.bak')).toBe('Customer.bak');
    // the dotted name resolved as an FK target: the pair is a hub-less chain, not two isolated tables
    expect(plan.UnassignedTables).toEqual(expect.arrayContaining(['BackupAudit', 'Customer.bak']));
    expect(plan.IsolatedTables).not.toContain('Customer.bak');
    expect(plan.Warnings).toEqual([]);
  });

  it('warns about configured names it cannot use', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5, hubs: ['Orphan', 'NoSuchTable'], excludeTables: ['Missing'] });
    expect(plan.Warnings).toEqual([
      "excludeTables: no table named 'Missing'",
      "hubs: no table named 'NoSuchTable'",
      "hubs: 'Orphan' has no foreign-key relationships to other drawn tables and cannot anchor a subject area",
    ]);
  });

  it('rejects settings below 1 instead of looping or degenerating', () => {
    expect(() => new ErdClusterer().Plan(state(), { pageSize: 0 })).toThrow(/pageSize must be a whole number of at least 1/);
    expect(() => new ErdClusterer().Plan(state(), { hubMinInbound: -3 })).toThrow(/hubMinInbound/);
  });

  it('gives every page a unique file name even when hub names sanitise alike', () => {
    const s = state();
    s.schemas[0].tables.push(table('Order-Item', 100000, []), table('Order_Item', 100000, []));
    for (let i = 0; i < 6; i++) {
      s.schemas[0].tables.push(table(`Dash${i}`, 100000, ['Order-Item']), table(`Under${i}`, 100000, ['Order_Item']));
    }
    const plan = new ErdClusterer().Plan(s, { hubMinInbound: 5 });
    const names = plan.Clusters.flatMap(c => c.Pages.map(p => p.BaseName));
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter(n => n.startsWith('cluster-Order_Item')).sort()).toEqual(['cluster-Order_Item', 'cluster-Order_Item~2']);
  });

  it('counts edges that cross between subject areas', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5 });
    const total = plan.Clusters.reduce((n, c) => n + c.OutboundEdges.length, 0);
    expect(total).toBeGreaterThanOrEqual(1); // CustomerHorse references the hub it was not assigned to
    expect(plan.TotalEdges).toBe(16 * 2 + 2 + 1);
  });
});

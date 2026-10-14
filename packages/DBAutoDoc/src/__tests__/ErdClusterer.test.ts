import { describe, it, expect } from 'vitest';
import { ErdClusterer } from '../generators/ErdClusterer';
import { ErdClusterGenerator } from '../generators/ErdClusterGenerator';
import { DatabaseDocumentation, TableDefinition, ForeignKeyReference } from '../types/state';

/**
 * Synthetic schema: two hubs (Customer, Horse) each referenced by several detail tables, a status
 * lookup every detail table references, a bridge table between the hubs, an isolated table and a
 * two-table chain with no hub.
 */
function table(name: string, rowCount: number, refs: string[], extraColumns: string[] = []): TableDefinition {
  const dependsOn: ForeignKeyReference[] = refs.map(r => ({ schema: 'dbo', table: r, column: `${r}ID`, referencedColumn: 'ID' }));
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
    expect(customer.Tables[0]).toBe('customer');
    expect(customer.Tables).toContain('invoice');
    expect(customer.Tables).not.toContain('horsename');
    const horse = plan.Clusters.find(c => c.HubName === 'Horse')!;
    expect(horse.Tables).toContain('registration');
    // the bridge table lands in exactly one cluster
    const owners = plan.Clusters.filter(c => c.Tables.includes('customerhorse'));
    expect(owners).toHaveLength(1);
  });

  it('sets the status lookup aside as a reference table instead of drawing it', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5 });
    expect(plan.ReferenceTables.map(r => r.Table)).toEqual(['Status']);
    expect(plan.ReferenceTables[0].ReferencedBy).toBe(16);
    for (const cluster of plan.Clusters) {
      expect(cluster.Tables).not.toContain('status');
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
      expect(page.Tables[0]).toBe('customer');
      expect(page.Tables.length).toBeLessThanOrEqual(5);
    }
    const everyMember = new Set(customer.Pages.flatMap(p => p.Tables));
    expect([...everyMember].sort()).toEqual([...customer.Tables].sort());
  });

  it('honours forced hubs, forced lookups and exclusions', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5, hubs: ['Invoice'], excludeTables: ['Suspension'], lookupTables: ['Note'], minClusterSize: 1 });
    expect(plan.Clusters.some(c => c.HubName === 'Invoice')).toBe(true);
    expect(plan.ExcludedTables).toEqual(['suspension']);
    expect(plan.Clusters.every(c => !c.Tables.includes('suspension'))).toBe(true);
    expect(plan.ReferenceTables.map(r => r.Table).sort()).toEqual(['Note', 'Status']);
  });

  it('folds a cluster below the minimum size into the neighbour it links to', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5, hubs: ['Invoice'], minClusterSize: 3 });
    // Invoice is forced, so it stays; CustomerHorse-style singletons do not appear as their own area
    expect(plan.Clusters.every(c => c.Tables.length >= 3 || c.HubName === 'Invoice')).toBe(true);
  });

  it('counts edges that cross between subject areas', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5 });
    const total = plan.Clusters.reduce((n, c) => n + c.OutboundEdges.length, 0);
    expect(total).toBeGreaterThanOrEqual(1); // CustomerHorse references the hub it was not assigned to
    expect(plan.TotalEdges).toBe(16 * 2 + 2 + 1);
  });
});

describe('ErdClusterGenerator', () => {
  it('renders one Mermaid page per cluster page with keys only, plus an index', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5, pageSize: 4 });
    const output = new ErdClusterGenerator().Generate(state(), plan);
    const totalPages = plan.Clusters.reduce((n, c) => n + c.Pages.length, 0);
    expect(output.Files).toHaveLength(totalPages);
    const first = output.Files[0];
    expect(first.Mermaid.startsWith('erDiagram')).toBe(true);
    expect(first.Mermaid).toContain('int ID "PK"');
    expect(first.Mermaid).not.toContain('nvarchar'); // non-key columns are not drawn in keys mode
    expect(first.Mermaid).toMatch(/\|\|--o\{/);
    expect(first.Mermaid).not.toMatch(/^\s+Status \{/m); // reference tables are listed, not drawn
    expect(first.Html).toContain('Reference tables used by this area');
    expect(first.Html).toContain('maxTextSize');
    expect(output.IndexHtml).toContain('cluster-Customer-1.html');
    expect(output.IndexMarkdown).toContain('# Subject areas — TestDB');
    expect(output.IndexMarkdown).toContain('Orphan');
  });

  it('draws every column in all mode and none in none mode', () => {
    const plan = new ErdClusterer().Plan(state(), { hubMinInbound: 5 });
    const gen = new ErdClusterGenerator();
    const customer = plan.Clusters.find(c => c.HubName === 'Customer')!;
    expect(gen.RenderPage(plan, customer, customer.Pages[0], 'all')).toContain('nvarchar(50) Name');
    expect(gen.RenderPage(plan, customer, customer.Pages[0], 'none')).not.toMatch(/^\s+int ID/m); // no attribute lines, relationships remain
  });

  it('sanitises names Mermaid cannot parse', () => {
    const s = state();
    s.schemas[0].tables.push(table('Customer.bak', 10, ['Customer']));
    const plan = new ErdClusterer().Plan(s, { hubMinInbound: 5 });
    const customer = plan.Clusters.find(c => c.HubName === 'Customer')!;
    const mmd = new ErdClusterGenerator().RenderPage(plan, customer, customer.Pages[0]);
    expect(mmd).toContain('Customer_bak');
    expect(mmd).not.toContain('Customer.bak');
  });
});

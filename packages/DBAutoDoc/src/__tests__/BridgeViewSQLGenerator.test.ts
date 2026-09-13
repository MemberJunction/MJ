/**
 * Bridge-view SQL is emitted in the analyzed database's dialect (#4409 follow-up).
 *
 * DBAutoDoc writes each detected transitive bridge into additionalSchemaInfo as an organic key's
 * `TransitiveView.SQL`, and CodeGen executes that body verbatim inside the platform's
 * create-or-replace view DDL. The body was always bracket-quoted — SQL Server syntax — so a
 * PostgreSQL analysis produced a config whose bridge view could never be created. Quoting also
 * has to be exact on PostgreSQL: an unquoted mixed-case identifier folds to lower case and stops
 * matching the catalog.
 */
import { describe, it, expect } from 'vitest';
import { generateBridgeView, BridgeViewProvider } from '../discovery/BridgeViewSQLGenerator';
import { BridgePath } from '../discovery/FKGraphWalker';
import { detectTransitiveBridges, collectFKEdgesFromState } from '../discovery/TransitiveBridgeDetector';
import { OrganicKeyCluster } from '../types/organic-keys';
import { ColumnDefinition, DatabaseDocumentation, ForeignKeyReference, TableDefinition } from '../types/state';

/** OrderLine → Order → Contact: the spoke reaches the hub's organic key in two hops. */
const path: BridgePath = {
  spokeSchema: 'sales',
  spokeTable: 'OrderLine',
  hubSchema: 'sales',
  hubTable: 'Contact',
  hubKeyField: 'emailAddress',
  hops: [
    { fromSchema: 'sales', fromTable: 'OrderLine', fromColumn: 'orderId', toSchema: 'sales', toTable: 'Order', toColumn: 'id', kind: 'hard' },
    { fromSchema: 'sales', fromTable: 'Order', fromColumn: 'contactId', toSchema: 'sales', toTable: 'Contact', toColumn: 'id', kind: 'hard' },
  ],
  pathLength: 2,
  pathConfidence: 1,
};

describe('generateBridgeView — identifier quoting per provider', () => {
  it('keeps the SQL Server bracket form by default', () => {
    const { sql } = generateBridgeView(path, 'id');
    expect(sql).toBe(
      [
        'SELECT',
        '    hub.[emailAddress] AS [emailAddress],',
        '    spoke.[id] AS [OrderLine_id]',
        'FROM [sales].[OrderLine] spoke',
        'INNER JOIN [sales].[Order] t1 ON spoke.[orderId] = t1.[id]',
        'INNER JOIN [sales].[Contact] hub ON t1.[contactId] = hub.[id]',
      ].join('\n'),
    );
  });

  it('double-quotes every identifier on PostgreSQL, preserving mixed case', () => {
    const { sql } = generateBridgeView(path, 'id', { provider: 'postgresql' });
    expect(sql).toBe(
      [
        'SELECT',
        '    hub."emailAddress" AS "emailAddress",',
        '    spoke."id" AS "OrderLine_id"',
        'FROM "sales"."OrderLine" spoke',
        'INNER JOIN "sales"."Order" t1 ON spoke."orderId" = t1."id"',
        'INNER JOIN "sales"."Contact" hub ON t1."contactId" = hub."id"',
      ].join('\n'),
    );
    expect(sql).not.toMatch(/[[\]]/);
  });

  it('treats an explicitly undefined provider as the SQL Server default', () => {
    // Callers thread an optional provider through as `{ provider }`; spreading that explicit
    // undefined over the defaults must not leave the quoter without a platform.
    expect(generateBridgeView(path, 'id', { provider: undefined }).sql).toContain('FROM [sales].[OrderLine] spoke');
  });

  it('uses backticks on MySQL', () => {
    const { sql } = generateBridgeView(path, 'id', { provider: 'mysql' });
    expect(sql).toContain('FROM `sales`.`OrderLine` spoke');
    expect(sql).toContain('hub.`emailAddress` AS `emailAddress`');
  });

  it('doubles the closing delimiter inside a name for each dialect', () => {
    const odd: BridgePath = { ...path, hubKeyField: 'e]"`mail' };
    expect(generateBridgeView(odd, 'id').sql).toContain('hub.[e]]"`mail]');
    expect(generateBridgeView(odd, 'id', { provider: 'postgresql' }).sql).toContain('hub."e]""`mail"');
    expect(generateBridgeView(odd, 'id', { provider: 'mysql' }).sql).toContain('hub.`e]"``mail`');
  });

  it('never includes a view header — CodeGen supplies the platform DDL', () => {
    const providers: BridgeViewProvider[] = ['sqlserver', 'postgresql', 'mysql'];
    for (const provider of providers) {
      expect(generateBridgeView(path, 'id', { provider }).sql).toMatch(/^SELECT\n/);
    }
  });
});

// ─── detectTransitiveBridges passes the provider through ─────────────────────

function column(name: string, isPrimaryKey: boolean): ColumnDefinition {
  return { name, dataType: 'int', isNullable: !isPrimaryKey, isPrimaryKey, isForeignKey: false, descriptionIterations: [] };
}

function table(name: string, columns: ColumnDefinition[], dependsOn: ForeignKeyReference[]): TableDefinition {
  return { name, rowCount: 10, dependsOn, dependents: [], columns, descriptionIterations: [] };
}

function createState(): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {
      createdAt: '2026-01-01',
      lastModified: '2026-01-01',
      totalIterations: 1,
      totalPromptsRun: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      totalSchemas: 1,
      totalTables: 3,
      totalColumns: 7,
    },
    database: { name: 'sales_db', server: 'localhost', analyzedAt: '2026-01-01' },
    phases: { descriptionGeneration: [] },
    schemas: [
      {
        name: 'sales',
        tables: [
          table('Contact', [column('id', true), column('emailAddress', false)], []),
          table(
            'Order',
            [column('id', true), column('contactId', false)],
            [{ schema: 'sales', table: 'Contact', column: 'contactId', referencedColumn: 'id' }],
          ),
          table('OrderLine', [column('id', true), column('orderId', false)], [{ schema: 'sales', table: 'Order', column: 'orderId', referencedColumn: 'id' }]),
        ],
        descriptionIterations: [],
      },
    ],
  };
}

const emailCluster: OrganicKeyCluster = {
  id: 'cluster-email',
  concept: 'email_address',
  normalization: 'LowerCaseTrim',
  members: [{ schema: 'sales', table: 'Contact', column: 'emailAddress', participatesInFK: false }],
  confidence: 0.95,
  reasoning: 'test fixture',
  maxIntraDistance: 0,
};

describe('detectTransitiveBridges — bridge SQL dialect', () => {
  const state = createState();
  const edges = collectFKEdgesFromState(state);

  function spokeSQL(provider?: BridgeViewProvider): string {
    const findings = detectTransitiveBridges([emailCluster], edges, state, { provider });
    const finding = findings.find((f) => f.spokeTable === 'OrderLine');
    expect(finding).toBeDefined();
    return finding!.view.sql;
  }

  it('writes the bridge body in PostgreSQL syntax when the analyzed database is PostgreSQL', () => {
    const sql = spokeSQL('postgresql');
    expect(sql).toContain('FROM "sales"."OrderLine" spoke');
    expect(sql).not.toMatch(/[[\]]/);
  });

  it('still defaults to SQL Server syntax when no provider is given', () => {
    expect(spokeSQL()).toContain('FROM [sales].[OrderLine] spoke');
  });
});

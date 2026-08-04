import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Recompute-trigger coverage for the MCP dashboard's tools-by-server index
 * precompute (PR #2841): `buildToolsByServerMap()` partitions `this.tools` into
 * `toolsByServerID`, keyed by NormalizeUUID(MCPServerID), once on data load — so
 * the server / connection card `@for` blocks read tools via an O(1) Map lookup
 * (`getToolsForServer` / `getToolsForConnection`) instead of re-filtering the
 * whole tools array on every change-detection pass.
 *
 * Pins:
 *  (1) buildToolsByServerMap groups tools by normalized server ID,
 *  (2) getToolsForServer is an O(1) lookup with UUID case variance,
 *  (3) getToolsForConnection resolves via the connection's server (case variant),
 *  (4) empty buckets / unknown ids return [] (never throw, never undefined),
 *  (5) the index is REBUILT on each load (a removed tool leaves its bucket).
 *
 * Uses the real NormalizeUUID / UUIDsEqual (`@memberjunction/global`); all heavy
 * imports the component file pulls in are stubbed so it can be imported + `new`'d.
 */

vi.mock('@angular/core', () => ({
  Component: () => (t: Function) => t,
  Input: () => () => {},
  Output: () => () => {},
  EventEmitter: class { emit() {} },
  ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
  ChangeDetectionStrategy: { OnPush: 1 },
  OnInit: class {},
  OnDestroy: class {},
  AfterViewInit: class {},
}));

vi.mock('@memberjunction/ng-shared', () => ({
  BaseDashboard: class {
    // The pure index methods under test don't touch base lifecycle; provide a
    // minimal stub so super() in the constructor doesn't explode.
  },
}));

vi.mock('@memberjunction/core', () => ({
  RunView: class {},
  Metadata: class {},
  CompositeKey: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
  ResourceData: class {},
  MJMCPServerEntity: class {},
  MJMCPServerConnectionEntity: class {},
  MJMCPServerToolEntity: class {},
  MJMCPToolExecutionLogEntity: class {},
  MJMCPToolFavoriteEntity: class {},
  MCPEngine: class {},
  UserInfoEngine: class {},
  MJOAuthAuthorizationStateEntity: class {},
  MJOAuthClientRegistrationEntity: class {},
  MJOAuthTokenEntity: class {},
  MJCredentialEntity: class {},
}));

vi.mock('@memberjunction/credentials', () => ({ CredentialEngine: class {} }));

vi.mock('@memberjunction/graphql-dataprovider', () => ({
  GraphQLDataProvider: class {},
  gql: (s: TemplateStringsArray) => s.join(''),
}));

// The component imports its tools service via a relative path ('./services/…');
// vitest resolves vi.mock paths relative to the file that imports them, so this
// mocks the service for the component file.
vi.mock('../MCP/services/mcp-tools.service', () => ({ MCPToolsService: class {} }));

import { MCPDashboardComponent } from '../MCP/mcp-dashboard.component';

interface Tool {
  ID: string;
  MCPServerID: string;
  ToolName: string;
}
interface Conn {
  ID: string;
  MCPServerID: string;
}

function makeComponent(): MCPDashboardComponent {
  const cdr = { detectChanges: vi.fn(), markForCheck: vi.fn() };
  const svc = {};
  // The constructor wires a debounced settings subject; that's harmless here.
  return new MCPDashboardComponent(cdr as never, svc as never);
}

function setData(component: MCPDashboardComponent, tools: Tool[], connections: Conn[] = []): void {
  (component as unknown as { tools: Tool[]; connections: Conn[] }).tools = tools;
  (component as unknown as { tools: Tool[]; connections: Conn[] }).connections = connections;
  (component as unknown as { buildToolsByServerMap: () => void }).buildToolsByServerMap();
}

describe('MCPDashboardComponent — tools-by-server index precompute', () => {
  let component: MCPDashboardComponent;

  const SERVER_A = 'AAAAAAAA-1111-1111-1111-111111111111';
  const SERVER_B = 'bbbbbbbb-2222-2222-2222-222222222222';

  const tools: Tool[] = [
    { ID: 't1', MCPServerID: SERVER_A, ToolName: 'a-one' },
    { ID: 't2', MCPServerID: SERVER_A, ToolName: 'a-two' },
    { ID: 't3', MCPServerID: SERVER_B, ToolName: 'b-one' },
  ];

  beforeEach(() => {
    component = makeComponent();
    setData(component, tools);
  });

  it('groups tools by server ID (getToolsForServer returns the right bucket)', () => {
    expect(component.getToolsForServer(SERVER_A).map((t) => t.ID)).toEqual(['t1', 't2']);
    expect(component.getToolsForServer(SERVER_B).map((t) => t.ID)).toEqual(['t3']);
  });

  it('getToolsForServer resolves across UUID case variance', () => {
    // stored uppercase, looked up lowercase
    expect(component.getToolsForServer('aaaaaaaa-1111-1111-1111-111111111111').map((t) => t.ID)).toEqual(['t1', 't2']);
    // stored lowercase, looked up uppercase
    expect(component.getToolsForServer('BBBBBBBB-2222-2222-2222-222222222222').map((t) => t.ID)).toEqual(['t3']);
  });

  it('returns [] for a server with no tools (empty bucket, never undefined)', () => {
    expect(component.getToolsForServer('FFFFFFFF-9999-9999-9999-999999999999')).toEqual([]);
  });

  it('getToolsForConnection resolves via the connection’s server (O(1), case variant)', () => {
    const connections: Conn[] = [
      { ID: 'c1', MCPServerID: 'aaaaaaaa-1111-1111-1111-111111111111' }, // lower-case ref to SERVER_A
    ];
    setData(component, tools, connections);
    expect(component.getToolsForConnection('c1').map((t) => t.ID)).toEqual(['t1', 't2']);
  });

  it('getToolsForConnection returns [] for an unknown connection', () => {
    setData(component, tools, [{ ID: 'c1', MCPServerID: SERVER_A }]);
    expect(component.getToolsForConnection('does-not-exist')).toEqual([]);
  });

  it('getToolsForConnection returns [] when the connection’s server has no tools', () => {
    setData(component, tools, [{ ID: 'c9', MCPServerID: 'FFFFFFFF-9999-9999-9999-999999999999' }]);
    expect(component.getToolsForConnection('c9')).toEqual([]);
  });

  it('rebuilds the index on each load — a removed tool leaves its bucket', () => {
    expect(component.getToolsForServer(SERVER_A)).toHaveLength(2);
    // reload with t1 removed
    setData(component, [
      { ID: 't2', MCPServerID: SERVER_A, ToolName: 'a-two' },
      { ID: 't3', MCPServerID: SERVER_B, ToolName: 'b-one' },
    ]);
    expect(component.getToolsForServer(SERVER_A).map((t) => t.ID)).toEqual(['t2']);
  });

  it('handles an empty tools list — every server lookup returns []', () => {
    setData(component, []);
    expect(component.getToolsForServer(SERVER_A)).toEqual([]);
    expect(component.getToolsForServer(SERVER_B)).toEqual([]);
  });
});

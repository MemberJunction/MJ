/**
 * The per-connection catalog answers correctly only when a read happens INSIDE a scope naming the
 * connection; an unscoped read falls back to the shared catalog by design. Every request-time entry
 * point enters the scope in the resolver. The one entry point that is NOT request-time is the
 * post-restart consumer in index.ts: after the RSU restarts the process it introspects the connector
 * to build the entity and field maps, and nothing upstream of it has entered a scope.
 *
 * Unscoped, that introspection sees only the declared fields, so every column this connection's own
 * discovery sampled gets a table column (the RSU built the schema in scope) but no field map, and its
 * values land in the overflow JSON instead of the column. On the sandbox that was 69 of 556 columns.
 *
 * Pinned from source: the call is a startup-time side effect on a live provider, and a test that
 * booted it would be testing the restart, not the scope.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8');

describe('post-restart entity map creation runs in the connection catalog scope', () => {
  it('imports RunInCatalogScope from the engine', () => {
    expect(SRC).toMatch(/import \{[^}]*\bRunInCatalogScope\b[^}]*\} from '@memberjunction\/integration-engine';/);
  });

  it('wraps the post-restart IntrospectSchema call in RunInCatalogScope for the item\'s connection', () => {
    // Whitespace-tolerant: formatters may wrap the call.
    expect(SRC).toMatch(
      /const schema = await RunInCatalogScope\(\s*item\.CompanyIntegrationID\s*,\s*\(\)\s*=>\s*introspect\(\s*companyIntegration\s*,\s*systemUser\s*\)\s*\)/,
    );
  });

  it('has no bare post-restart introspect call left', () => {
    expect(SRC).not.toMatch(/const schema = await introspect\(companyIntegration, systemUser\)/);
  });
});

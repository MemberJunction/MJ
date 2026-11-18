/**
 * The per-connection catalog rows carry a plain FK to the connection and nothing cascades, so a
 * connection that ever ran a discovery on it could not be deleted at all: the CompanyIntegration
 * delete violated the constraint and the whole cascade rolled back (MJ-CAT-18). The fix deletes
 * the field rows, then the object rows, inside the same transaction group, before the connection.
 *
 * Pinned from source, like PostRestartMapsInCatalogScope: the delete is a transaction over a live
 * provider, and the fact being pinned is ORDER inside one method body.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');
const start = SRC.indexOf('async IntegrationDeleteConnection(');
const end = SRC.indexOf('// ── SCHEMA EVOLUTION', start);
const BODY = SRC.slice(start, end);

describe('IntegrationDeleteConnection removes the per-connection catalog before the connection', () => {
  it('is scoped to the method body', () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
  });

  it('deletes per-connection fields, then objects, then the CompanyIntegration — in that order', () => {
    const fields = BODY.indexOf("EntityName: 'MJ: Company Integration Object Fields'");
    const objects = BODY.indexOf("EntityName: 'MJ: Company Integration Objects'");
    const fieldDelete = BODY.indexOf('field.TransactionGroup = tg;');
    const objectDelete = BODY.indexOf('object.TransactionGroup = tg;');
    const ciDelete = BODY.indexOf('ci.TransactionGroup = tg;');
    expect(objects).toBeGreaterThan(0);
    expect(fields).toBeGreaterThan(objects);
    expect(fieldDelete).toBeGreaterThan(fields);
    expect(objectDelete).toBeGreaterThan(fieldDelete);
    expect(ciDelete).toBeGreaterThan(objectDelete);
  });

  it('queues every catalog delete on the same transaction group as the cascade', () => {
    expect(BODY).toMatch(/field\.TransactionGroup = tg;\s*await field\.Delete\(\);/);
    expect(BODY).toMatch(/object\.TransactionGroup = tg;\s*await object\.Delete\(\);/);
  });

  it('is guarded on the catalog entities being registered, so an unmigrated workspace is untouched', () => {
    expect(BODY).toMatch(/md\.Entities\.some\(e => e\.Name === 'MJ: Company Integration Objects'\)/);
  });

  it('selects the fields by the objects of THIS connection only', () => {
    expect(BODY).toMatch(/ExtraFilter: `CompanyIntegrationID='\$\{companyIntegrationID\}'`,\s*ResultType: 'entity_object',\s*\}, sysUser\);\s*const perConnectionObjects/);
    expect(BODY).toMatch(/ExtraFilter: `CompanyIntegrationObjectID IN \(\$\{objectIDs\}\)`/);
  });
});

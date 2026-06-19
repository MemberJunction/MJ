#!/usr/bin/env node
// Phase B-1 — DiscoverObjects + DiscoverFields, exercised DIRECTLY against the connector class
// (no MJAPI / no DB), so it runs concurrently with the full ApplyAll. Boots the local mock vendor
// (replays fixtures.json), points the connector's LoginUrl at it, and asserts the discovery output:
//   - DiscoverObjects surfaces standard + CUSTOM (__c) + read-only objects with capability flags
//   - DiscoverFields surfaces the PK, custom-capable fields, and FK (referenceTo) edges
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildMock } from './connector-e2e-adapters.mjs';
import { SalesforceConnector } from '@memberjunction/integration-connectors';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, '../../connectors-registry/salesforce/fixtures');
const stubUser = { ID: 'cred-test-user', Email: 'test@example.com', Name: 'Cred Test' };

const out = { ok: false, phase: 'discover', steps: {} };
const mock = await buildMock({ mode: 'mock', fixturesDir });
try {
  const baseConfig = mock.manifest?.Configuration ?? {};
  const ci = {
    CredentialID: null,
    Configuration: JSON.stringify({
      ...baseConfig,
      authFlow: 'client_credentials',
      clientId: baseConfig.clientId ?? 'fixture-client-id',
      clientSecret: baseConfig.clientSecret ?? 'fixture-client-secret',
      apiVersion: baseConfig.apiVersion ?? '61.0',
      ...mock.configPatch, // { LoginUrl: <mock origin> }
    }),
  };
  const connector = new SalesforceConnector();

  const conn = await connector.TestConnection(ci, stubUser);
  out.steps.testConnection = { success: !!conn.Success, message: (conn.Message ?? '').slice(0, 160) };

  // ── DiscoverObjects ──
  const objects = await connector.DiscoverObjects(ci, stubUser);
  const byName = new Map(objects.map(o => [o.Name, o]));
  const widget = byName.get('Widget__c');
  const apexLog = byName.get('ApexLog');
  out.steps.discoverObjects = {
    count: objects.length,
    names: objects.map(o => o.Name),
    hasAccount: byName.has('Account'),
    hasContact: byName.has('Contact'),
    hasCustomObject_Widget__c: !!widget,
    widgetIsCustom: widget?.IsCustom ?? null,
    apexLog_readOnly: apexLog ? { SupportsCreate: apexLog.SupportsCreate ?? null, SupportsUpdate: apexLog.SupportsUpdate ?? null } : null,
  };

  // ── DiscoverFields: Account (PK + custom-capable) ──
  const acctFields = await connector.DiscoverFields(ci, 'Account', stubUser);
  out.steps.discoverFields_Account = {
    count: acctFields.length,
    pkFields: acctFields.filter(f => f.IsPrimaryKey).map(f => f.Name),
    names: acctFields.map(f => f.Name),
    systemModstampPresent: acctFields.some(f => f.Name === 'SystemModstamp'),
    isDeletedPresent: acctFields.some(f => f.Name === 'IsDeleted'),
  };

  // ── DiscoverFields: Contact (FK edge AccountId -> Account) ──
  const contactFields = await connector.DiscoverFields(ci, 'Contact', stubUser);
  const accountIdF = contactFields.find(f => f.Name === 'AccountId');
  out.steps.discoverFields_Contact = {
    count: contactFields.length,
    pkFields: contactFields.filter(f => f.IsPrimaryKey).map(f => f.Name),
    accountId_isFK: accountIdF?.IsForeignKey ?? null,
    accountId_fkTarget: accountIdF?.ForeignKeyTarget ?? null,
  };

  const d = out.steps;
  out.ok = !!conn.Success
    && d.discoverObjects.hasAccount && d.discoverObjects.hasContact
    && d.discoverObjects.hasCustomObject_Widget__c
    && d.discoverFields_Account.pkFields.includes('Id')
    && d.discoverFields_Contact.accountId_fkTarget === 'Account';
} catch (e) {
  out.error = e?.message ?? String(e);
} finally {
  await mock.close();
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);

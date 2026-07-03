#!/usr/bin/env node
// Post-regen fixture patch: give the access-path door routes a SINGLE-OBJECT body carrying the nested
// arrays the connector extracts via ResponseDataKey (appeals/campaigns/funds/additional_name_formats/
// gift_splits/gifts), and give the by-id lookups a record. NormalizeResponse reads body[rdk] for an
// object body, so these MUST be objects (not bare arrays). Run with E2E_REGEN_FIXTURES unset.
import { readFileSync, writeFileSync } from 'node:fs';
const FILE = process.argv[2] || 'packages/Integration/connectors/test/fixtures/blackbaud/fixtures/fixtures.json';
const d = JSON.parse(readFileSync(FILE, 'utf-8'));

// door path substring -> single-object body to serve
const DOOR = {
  'givingsummary/first': { id: 'gs-1', date: '2026-06-01',
    appeals: [{ id: 'ap-1', appeal_id: '3001', description: 'Annual', amount: 100 }, { id: 'ap-2', appeal_id: '3002', description: 'Schol', amount: 200 }],
    campaigns: [{ id: 'cm-1', campaign_id: '4001', description: 'Spring', amount: 100 }, { id: 'cm-2', campaign_id: '4002', description: 'Summer', amount: 200 }],
    funds: [{ id: 'fn-1', fund_id: '5001', description: 'General', amount: 100 }, { id: 'fn-2', fund_id: '5002', description: 'Endow', amount: 200 }] },
  'nameformats/summary': { id: 'nfs-1', additional_name_formats: [{ id: 'nf-1', name: 'Formal 1', format: 'formal' }, { id: 'nf-2', name: 'Informal 2', format: 'informal' }] },
  'constituentidmap/{constituent_id}': { id: 'cmap-1', constituent_id: '1001', lookup_id: 'LKP-1001' },
  'giftidmap/{giftlookupid}': { id: 'gmap-1', gift_id: '2001', lookup_id: 'GLKP-2001' },
};
// gift detail (single record) → gift_splits nested
const GIFT_DETAIL = { id: '2001', constituent_id: '1001', amount: 5000, gift_type: 'Donation',
  gift_splits: [{ id: 'gs-1', gift_id: '2001', amount: 2500, fund_id: '5001' }, { id: 'gs-2', gift_id: '2001', amount: 2500, fund_id: '5002' }] };
// giftbatch gifts door → gifts nested
const BATCH_DOOR = { id: 'batch-1', batch_id: 'batch-1',
  gifts: [{ id: 'bg-1', batch_id: 'batch-1', constituent_id: '1001', amount: 500 }, { id: 'bg-2', batch_id: 'batch-1', constituent_id: '1002', amount: 750 }] };
// constituentcodes list (for constituent_code_link) — default value[]
const CODES = { value: [{ id: 'cc-1', description: 'Board Member', constituent_id: '1001' }, { id: 'cc-2', description: 'Volunteer', constituent_id: '1002' }] };

let patched = 0;
for (const r of d.Routes || []) {
  const p = r.Path || '';
  for (const key of Object.keys(DOOR)) if (p.includes(key)) { r.Body = DOOR[key]; patched++; }
  if (/\/gift\/v1\/gifts\/\{gift_id\}$/.test(p)) { r.Body = GIFT_DETAIL; patched++; }
  if (p.includes('giftbatches/{batch_id}/gifts')) { r.Body = BATCH_DOOR; patched++; }
  if (p.includes('constituents/{constituent_id}/constituentcodes')) { r.Body = CODES; patched++; }
}
writeFileSync(FILE, JSON.stringify(d, null, 2));
process.stdout.write(JSON.stringify({ patched }) + '\n');

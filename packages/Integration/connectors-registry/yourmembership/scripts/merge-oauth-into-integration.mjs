#!/usr/bin/env node
/**
 * merge-oauth-into-integration.mjs
 *
 * Reads the structured stdout of extract-io-iof-oauth.mjs and merges the
 * single IO + its IOFs into the YourMembership integration metadata file,
 * idempotently (replaces any existing IO with the same Name).
 *
 * Append-only semantics for other IOs already in the file.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const METADATA_PATH = resolve(__dirname, '../../../../../metadata/integrations/yourmembership/.yourmembership.integration.json');
const EXTRACT_SCRIPT = resolve(__dirname, 'extract-io-iof-oauth.mjs');

// Re-execute the extractor as a child process so this script is a pure orchestrator
const extractStdout = execFileSync('node', [EXTRACT_SCRIPT], { encoding: 'utf8' });
const extracted = JSON.parse(extractStdout);

const integrationFile = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
if (!Array.isArray(integrationFile) || integrationFile.length === 0) {
  throw new Error('Integration metadata file is not in the expected single-record array shape.');
}

const integrationRecord = integrationFile[0];

if (!integrationRecord.relatedEntities) {
  integrationRecord.relatedEntities = {};
}
if (!Array.isArray(integrationRecord.relatedEntities['MJ: Integration Objects'])) {
  integrationRecord.relatedEntities['MJ: Integration Objects'] = [];
}

// Build the IO record in mj-sync shape (fields + nested relatedEntities for IOFs)
const obj = extracted.object;
const fieldRecords = extracted.fields.map((f) => ({
  fields: {
    Name: f.Name,
    DisplayName: f.DisplayName,
    Description: f.Description,
    Type: f.Type,
    Length: f.Length,
    AllowsNull: f.AllowsNull,
    IsRequired: f.IsRequired,
    IsReadOnly: f.IsReadOnly,
    IsUniqueKey: f.IsUniqueKey,
    IsPrimaryKey: f.IsPrimaryKey,
    Category: f.Category,
    Sequence: f.Sequence,
    Status: f.Status,
    MetadataSource: f.MetadataSource,
    Configuration: JSON.stringify(f.Configuration),
  },
}));

const ioRecord = {
  fields: {
    Name: obj.Name,
    DisplayName: obj.DisplayName,
    Description: obj.Description,
    Category: obj.Category,
    APIPath: obj.APIPath,
    ResponseDataKey: obj.ResponseDataKey,
    PaginationType: obj.PaginationType,
    SupportsPagination: obj.SupportsPagination,
    SupportsIncrementalSync: obj.SupportsIncrementalSync,
    IncrementalWatermarkField: obj.IncrementalWatermarkField,
    SupportsWrite: obj.SupportsWrite,
    CreateAPIPath: obj.CreateAPIPath,
    CreateMethod: obj.CreateMethod,
    CreateBodyShape: obj.CreateBodyShape,
    CreateBodyKey: obj.CreateBodyKey,
    CreateIDLocation: obj.CreateIDLocation,
    UpdateAPIPath: obj.UpdateAPIPath,
    UpdateMethod: obj.UpdateMethod,
    UpdateBodyShape: obj.UpdateBodyShape,
    UpdateBodyKey: obj.UpdateBodyKey,
    UpdateIDLocation: obj.UpdateIDLocation,
    DeleteAPIPath: obj.DeleteAPIPath,
    DeleteIDLocation: obj.DeleteIDLocation,
    MetadataSource: obj.MetadataSource,
    Status: obj.Status,
    Configuration: JSON.stringify(obj.Configuration),
  },
  relatedEntities: {
    'MJ: Integration Object Fields': fieldRecords,
  },
};

// Idempotency: replace existing IO with same Name; else append
const ios = integrationRecord.relatedEntities['MJ: Integration Objects'];
const existingIdx = ios.findIndex((r) => r && r.fields && r.fields.Name === obj.Name);
if (existingIdx >= 0) {
  ios[existingIdx] = ioRecord;
} else {
  ios.push(ioRecord);
}

writeFileSync(METADATA_PATH, JSON.stringify(integrationFile, null, 2) + '\n', 'utf8');

process.stdout.write(JSON.stringify({
  metadataFile: METADATA_PATH,
  IOName: obj.Name,
  IOAction: existingIdx >= 0 ? 'replaced' : 'appended',
  IOFCount: fieldRecords.length,
  IOTotalInFile: ios.length,
}, null, 2) + '\n');

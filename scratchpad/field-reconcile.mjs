#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const connectorDir = '/Users/bcladmin/Projects/MemberJunction/MJ/packages/Integration/connectors-registry/higherlogic-vanilla';
const metadataFile = '/Users/bcladmin/Projects/MemberJunction/MJ/metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json';

// Load the catalog enumeration directly (pre-computed field counts from the OpenAPI spec)
const catalogPath = path.join(connectorDir, 'sources', 'derived', 'enumerate-vanilla-catalog.output.json');
let catalog = null;
try {
    const content = fs.readFileSync(catalogPath, 'utf-8');
    catalog = JSON.parse(content);
} catch (e) {
    console.error(`Failed to load catalog: ${e.message}`);
    process.exit(1);
}

// Build object name -> field count map from the pre-computed catalog
const sdlFieldCounts = {};
if (catalog.coverable && Array.isArray(catalog.coverable)) {
    for (const obj of catalog.coverable) {
        if (obj.name && obj.fieldCount !== undefined) {
            sdlFieldCounts[obj.name] = obj.fieldCount;
        }
    }
}

// Now read the metadata file
let metadataContent = '';
try {
    metadataContent = fs.readFileSync(metadataFile, 'utf-8');
} catch (e) {
    console.error(`Failed to read metadata file: ${e.message}`);
    process.exit(1);
}

// Parse the metadata
let metadataArray = null;
try {
    metadataArray = JSON.parse(metadataContent);
} catch (e) {
    console.error(`Failed to parse metadata JSON: ${e.message}`);
    process.exit(1);
}

// Extract emitted field counts from metadata
const emittedFieldCounts = {};

// The metadata file is an array with 1 Integration row
// That row has relatedEntities['MJ: Integration Objects'] with IO rows
// Each IO row has relatedEntities['MJ: Integration Object Fields'] with IOF rows
if (metadataArray.length > 0 && metadataArray[0].relatedEntities) {
    const ioArray = metadataArray[0].relatedEntities['MJ: Integration Objects'];
    if (Array.isArray(ioArray)) {
        for (const io of ioArray) {
            if (io.fields && io.fields.Name) {
                const ioName = io.fields.Name;
                let fieldCount = 0;

                // Count nested IOF rows
                if (io.relatedEntities && Array.isArray(io.relatedEntities['MJ: Integration Object Fields'])) {
                    fieldCount = io.relatedEntities['MJ: Integration Object Fields'].length;
                }

                emittedFieldCounts[ioName] = fieldCount;
            }
        }
    }
}

// Expected emitted counts from the agent report
const expectedCounts = {
    "Session": 5,
    "Report": 27,
    "ReportReason": 12,
    "UserNote": 11,
    "OnlineUser": 10,
    "EventParticipant": 4,
    "GroupApplicant": 5,
    "GroupInvite": 4,
    "GroupMember": 4,
    "GroupTag": 5,
    "UserBadge": 5,
    "WebhookDelivery": 9,
    "RoleApplication": 15
};

// Now diff and report
// Include all objects that appear in SDL, emitted metadata, or expected list
const allObjectNames = new Set([...Object.keys(sdlFieldCounts), ...Object.keys(emittedFieldCounts), ...Object.keys(expectedCounts)]);
const results = [];

for (const objectName of Array.from(allObjectNames).sort()) {
    const sdlCount = sdlFieldCounts[objectName] || 0;
    const emittedCount = emittedFieldCounts[objectName] || 0;

    // Match logic from the spec:
    // match = (sdlFieldCount > 0 ? emittedFieldCount > 0 : true) AND emittedFieldCount reconciles with sdlFieldCount
    // In other words:
    // - If SDL has fields: emitted must have fields AND the counts should reconcile
    // - If SDL has no fields: always match (both zero)
    let match = false;
    let reason = '';

    if (sdlCount === 0 && emittedCount === 0) {
        match = true;
        reason = 'Both zero (object not found in schema)';
    } else if (sdlCount === 0) {
        // SDL has no fields but emitted has fields - problematic
        match = false;
        reason = `SDL has 0 fields but ${emittedCount} emitted (schema not found)`;
    } else if (emittedCount === 0) {
        // SDL has fields but nothing was emitted - parse defect
        match = false;
        reason = `SDL has ${sdlCount} fields but 0 emitted (emitter defect)`;
    } else if (emittedCount === sdlCount) {
        // Perfect match
        match = true;
        reason = `Perfect match: ${sdlCount} fields`;
    } else {
        // Field counts differ - reconciliation issue
        const diff = Math.abs(emittedCount - sdlCount);
        const pct = Math.round((diff / Math.max(sdlCount, emittedCount)) * 100);
        match = false;
        reason = `Field count mismatch: SDL=${sdlCount}, emitted=${emittedCount}, delta=${diff} (${pct}%)`;
    }

    results.push({
        object: objectName,
        sdlFieldCount: sdlCount,
        emittedFieldCount: emittedCount,
        match,
        reason
    });
}

// Output as JSON to stdout only (no reasoning text)
console.log(JSON.stringify({ perObject: results }, null, 2));

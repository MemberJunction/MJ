#!/usr/bin/env node
/**
 * Link existing boundary GeoJSON files to state-province metadata records
 * using @file: references in the BoundaryGeoJSON field.
 *
 * Scans each country's boundaries/ folder for .geojson files named by
 * ISO 3166-2 code (e.g., CA-AB.geojson) and sets BoundaryGeoJSON to
 * "@file:boundaries/CA-AB.geojson" on the matching record.
 *
 * Usage: node scripts/link-boundary-geojson.mjs
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const BASE_DIR = join(import.meta.dirname, '..', 'metadata', 'state-provinces', 'by-country');

async function main() {
    const countryDirs = await readdir(BASE_DIR, { withFileTypes: true });
    let totalLinked = 0;
    let totalFiles = 0;

    for (const entry of countryDirs) {
        if (!entry.isDirectory()) continue;

        const countryDir = join(BASE_DIR, entry.name);
        const boundariesDir = join(countryDir, 'boundaries');

        if (!existsSync(boundariesDir)) continue;

        // Get available boundary files
        const boundaryFiles = (await readdir(boundariesDir))
            .filter(f => f.endsWith('.geojson'));

        if (boundaryFiles.length === 0) continue;

        // Build lookup: ISO3166_2 code -> filename
        const boundaryMap = new Map();
        for (const f of boundaryFiles) {
            const code = f.replace('.geojson', '');
            boundaryMap.set(code, f);
        }

        // Find and update the JSON data file
        const jsonFiles = (await readdir(countryDir))
            .filter(f => f.endsWith('.json') && f !== '.mj-sync.json');

        for (const jsonFile of jsonFiles) {
            const filePath = join(countryDir, jsonFile);
            const raw = await readFile(filePath, 'utf-8');
            let records;
            try {
                records = JSON.parse(raw);
            } catch {
                continue;
            }

            if (!Array.isArray(records)) continue;

            let changed = 0;
            for (const record of records) {
                const fields = record.fields;
                if (!fields?.ISO3166_2) continue;

                const boundaryFile = boundaryMap.get(fields.ISO3166_2);
                if (boundaryFile) {
                    const fileRef = `@file:boundaries/${boundaryFile}`;
                    if (fields.BoundaryGeoJSON !== fileRef) {
                        fields.BoundaryGeoJSON = fileRef;
                        changed++;
                    }
                }
            }

            if (changed > 0) {
                await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', 'utf-8');
                console.log(`  ${entry.name}: linked ${changed} boundaries in ${jsonFile}`);
                totalLinked += changed;
                totalFiles++;
            }
        }
    }

    console.log(`\nDone: ${totalLinked} boundary references linked across ${totalFiles} files`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

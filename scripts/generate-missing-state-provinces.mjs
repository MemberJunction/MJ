#!/usr/bin/env node
/**
 * Generate state/province metadata files for countries missing from the
 * metadata/state-provinces/by-country/ directory.
 *
 * Data source: ISO 3166-2 subdivision data from
 * https://github.com/olahol/iso-3166-2.json
 *
 * Usage: node scripts/generate-missing-state-provinces.mjs
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const BASE_DIR = join(import.meta.dirname, '..', 'metadata', 'state-provinces', 'by-country');
const ISO_3166_2_URL = 'https://raw.githubusercontent.com/olahol/iso-3166-2.json/master/iso-3166-2.json';

/**
 * Fetch ISO 3166-2 data from GitHub
 */
async function fetchISO3166Data() {
    console.log('Fetching ISO 3166-2 data...');
    const response = await fetch(ISO_3166_2_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch ISO 3166-2 data: ${response.status}`);
    }
    return response.json();
}

/**
 * Get the set of country ISO2 codes that already have state/province data
 */
async function getExistingCountries() {
    const existing = new Set();
    const entries = await readdir(BASE_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            existing.add(entry.name.toUpperCase());
        }
    }
    return existing;
}

/**
 * Extract the subdivision code from an ISO 3166-2 code (e.g., "US-CA" -> "CA")
 */
function extractCode(iso3166_2Code) {
    const parts = iso3166_2Code.split('-');
    return parts.length > 1 ? parts.slice(1).join('-') : parts[0];
}

/**
 * Generate a state/province record in our metadata format
 */
function buildRecord(countryISO2, subdivisionCode, subdivisionName, iso3166_2Code) {
    return {
        fields: {
            Name: subdivisionName,
            Code: extractCode(iso3166_2Code),
            ISO3166_2: iso3166_2Code,
            Latitude: null,
            Longitude: null,
            BoundaryGeoJSON: null,
            CommonAliases: [subdivisionName],
            CountryID: `@lookup:MJ: Countries.ISO2=${countryISO2}`
        }
    };
}

/**
 * Countries/territories that are too small or have no meaningful subdivisions
 * (city-states, small islands, etc.) — skip these
 */
const SKIP_COUNTRIES = new Set([
    // Will be populated dynamically: any country with 0 divisions in ISO data
]);

async function main() {
    const isoData = await fetchISO3166Data();
    const existingCountries = await getExistingCountries();

    console.log(`Existing countries with state data: ${existingCountries.size}`);
    console.log(`Countries in ISO 3166-2 data: ${Object.keys(isoData).length}`);

    let created = 0;
    let skipped = 0;
    let totalRecords = 0;

    const sortedCodes = Object.keys(isoData).sort();

    for (const countryCode of sortedCodes) {
        // Skip countries that already have data
        if (existingCountries.has(countryCode)) {
            continue;
        }

        const country = isoData[countryCode];
        const divisions = country.divisions || {};
        const divisionEntries = Object.entries(divisions);

        // Skip countries with no subdivisions
        if (divisionEntries.length === 0) {
            skipped++;
            continue;
        }

        // Build records
        const records = divisionEntries
            .sort(([, nameA], [, nameB]) => nameA.localeCompare(nameB))
            .map(([isoCode, name]) => buildRecord(countryCode, extractCode(isoCode), name, isoCode));

        // Create directory
        const countryDir = join(BASE_DIR, countryCode);
        if (!existsSync(countryDir)) {
            await mkdir(countryDir, { recursive: true });
        }

        // Write file
        const fileName = `.${countryCode.toLowerCase()}-states.json`;
        const filePath = join(countryDir, fileName);
        await writeFile(filePath, JSON.stringify(records, null, 2) + '\n', 'utf-8');

        console.log(`  + ${countryCode} (${country.name}): ${records.length} subdivisions`);
        created++;
        totalRecords += records.length;
    }

    console.log(`\nDone:`);
    console.log(`  Created: ${created} new country files`);
    console.log(`  Skipped: ${skipped} countries with no subdivisions`);
    console.log(`  Total new records: ${totalRecords}`);
    console.log(`  Existing (untouched): ${existingCountries.size}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

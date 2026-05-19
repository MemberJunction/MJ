#!/usr/bin/env node
/**
 * Populate state/province metadata with boundaries, lat/lng from Natural Earth data.
 *
 * 1. Reads the Natural Earth 10m admin-1 GeoJSON (pre-converted from shapefile)
 * 2. For each feature, extracts the boundary GeoJSON and writes it to
 *    metadata/state-provinces/by-country/{ISO2}/boundaries/{ISO3166_2}.geojson
 * 3. Updates the corresponding metadata record with:
 *    - Latitude/Longitude (centroid from Natural Earth)
 *    - BoundaryGeoJSON: @file:boundaries/{ISO3166_2}.geojson
 *
 * Usage: node scripts/populate-boundaries-from-naturalearth.mjs
 *
 * Prerequisite: /tmp/ne_admin1.geojson must exist (converted from Natural Earth shapefile)
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const NE_GEOJSON = '/tmp/ne_admin1.geojson';
const BASE_DIR = join(import.meta.dirname, '..', 'metadata', 'state-provinces', 'by-country');

async function main() {
    console.log('Loading Natural Earth GeoJSON...');
    const raw = await readFile(NE_GEOJSON, 'utf-8');
    const neData = JSON.parse(raw);
    console.log(`Loaded ${neData.features.length} features`);

    // Index features by ISO 3166-2 code
    const featuresByCode = new Map();
    for (const feature of neData.features) {
        const iso3166_2 = feature.properties.iso_3166_2;
        if (iso3166_2 && iso3166_2 !== '-99') {
            featuresByCode.set(iso3166_2, feature);
        }
    }
    console.log(`Indexed ${featuresByCode.size} features by ISO 3166-2 code\n`);

    // Process each country directory
    const countryDirs = (await readdir(BASE_DIR, { withFileTypes: true }))
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();

    let totalBoundaries = 0;
    let totalLatLng = 0;
    let countriesUpdated = 0;

    for (const countryCode of countryDirs) {
        const countryDir = join(BASE_DIR, countryCode);

        // Find the data JSON file
        const files = (await readdir(countryDir))
            .filter(f => f.endsWith('.json') && f !== '.mj-sync.json');

        if (files.length === 0) continue;

        const dataFile = join(countryDir, files[0]);
        let records;
        try {
            records = JSON.parse(await readFile(dataFile, 'utf-8'));
        } catch {
            continue;
        }
        if (!Array.isArray(records)) continue;

        let boundaryCount = 0;
        let latLngCount = 0;

        for (const record of records) {
            const fields = record.fields;
            if (!fields?.ISO3166_2) continue;

            const feature = featuresByCode.get(fields.ISO3166_2);
            if (!feature) continue;

            const props = feature.properties;

            // Update lat/lng if not already set (don't overwrite existing good data)
            if (fields.Latitude == null && props.latitude != null) {
                fields.Latitude = Math.round(props.latitude * 10000) / 10000;
                latLngCount++;
            }
            if (fields.Longitude == null && props.longitude != null) {
                fields.Longitude = Math.round(props.longitude * 10000) / 10000;
            }

            // Write boundary GeoJSON file if not already linked
            if (!fields.BoundaryGeoJSON || fields.BoundaryGeoJSON === null) {
                const boundariesDir = join(countryDir, 'boundaries');
                if (!existsSync(boundariesDir)) {
                    await mkdir(boundariesDir, { recursive: true });
                }

                const boundaryFileName = `${fields.ISO3166_2}.geojson`;
                const boundaryPath = join(boundariesDir, boundaryFileName);

                // Write just the geometry as a GeoJSON Feature
                const geoFeature = {
                    type: 'Feature',
                    properties: {
                        name: fields.Name,
                        iso_3166_2: fields.ISO3166_2
                    },
                    geometry: feature.geometry
                };
                await writeFile(boundaryPath, JSON.stringify(geoFeature), 'utf-8');

                fields.BoundaryGeoJSON = `@file:boundaries/${boundaryFileName}`;
                boundaryCount++;
            }
        }

        if (boundaryCount > 0 || latLngCount > 0) {
            await writeFile(dataFile, JSON.stringify(records, null, 2) + '\n', 'utf-8');
            console.log(`  ${countryCode}: ${boundaryCount} boundaries, ${latLngCount} lat/lng updates`);
            totalBoundaries += boundaryCount;
            totalLatLng += latLngCount;
            countriesUpdated++;
        }
    }

    console.log(`\nDone:`);
    console.log(`  Countries updated: ${countriesUpdated}`);
    console.log(`  Boundary files created: ${totalBoundaries}`);
    console.log(`  Lat/lng values added: ${totalLatLng}`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

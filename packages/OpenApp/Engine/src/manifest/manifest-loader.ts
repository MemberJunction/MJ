/**
 * Manifest loading and validation.
 *
 * Loads mj-app.json files from disk or parsed JSON objects and validates
 * them against the Zod schema.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mjAppManifestSchema, type MJAppManifest } from './manifest-schema.js';

/**
 * Result of loading and validating a manifest.
 */
export interface ManifestLoadResult {
    /** Whether parsing and validation succeeded */
    Success: boolean;
    /** The validated manifest (if successful) */
    Manifest?: MJAppManifest;
    /** Validation errors (if failed) */
    Errors?: string[];
}

/**
 * Loads and validates a manifest from a file path.
 *
 * @param filePath - Absolute or relative path to mj-app.json
 * @returns Validated manifest or error details
 */
export function LoadManifestFromFile(filePath: string): ManifestLoadResult {
    const absolutePath = resolve(filePath);
    const rawContent = readFileSync(absolutePath, 'utf-8');
    return ParseAndValidateManifest(rawContent);
}

/**
 * Parses a raw JSON string and validates it against the manifest schema.
 *
 * @param jsonString - Raw JSON content of mj-app.json
 * @returns Validated manifest or error details
 */
export function ParseAndValidateManifest(jsonString: string): ManifestLoadResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    }
    catch {
        return { Success: false, Errors: ['Invalid JSON: failed to parse manifest file'] };
    }

    return ValidateManifestObject(parsed);
}

/**
 * Validates a parsed JavaScript object against the manifest schema.
 *
 * @param obj - Parsed manifest object
 * @returns Validated manifest or error details
 */
export function ValidateManifestObject(obj: unknown): ManifestLoadResult {
    const result = mjAppManifestSchema.safeParse(obj);

    if (result.success) {
        return { Success: true, Manifest: result.data };
    }

    const errors = result.error.issues.map(issue => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
    });

    return { Success: false, Errors: errors };
}

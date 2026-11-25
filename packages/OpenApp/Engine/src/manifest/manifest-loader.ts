/**
 * Manifest loading and validation.
 *
 * Loads mj-app.json files from disk or parsed JSON objects and validates
 * them against the Zod schema.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { ManifestDependenciesSchema, MjAppManifestSchema, type MJAppManifest } from './manifest-schema.js';

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
    const result = MjAppManifestSchema.safeParse(obj);

    if (result.success) {
        return { Success: true, Manifest: result.data };
    }

    return { Success: false, Errors: DescribeIssues(result.error) };
}

/** Result of reading only the dependencies of a manifest. */
export interface ManifestDependenciesResult {
    /** Whether the dependencies could be read */
    Success: boolean;
    /** The dependencies by app name; `{}` when the manifest declares none (if successful) */
    Dependencies?: NonNullable<MJAppManifest['dependencies']>;
    /** Why the dependencies could not be read (if failed) */
    Errors?: string[];
}

const manifestWithDependenciesSchema = z.object({ dependencies: ManifestDependenciesSchema.optional() });

/**
 * Reads the dependencies of a manifest and validates nothing else. For a manifest recorded at
 * install time: its other fields passed the rules of that time, and a rule added since then must
 * not make its dependencies unreadable.
 *
 * @param jsonString - JSON content of the manifest
 * @returns The normalized dependencies or error details
 */
export function ParseManifestDependencies(jsonString: string): ManifestDependenciesResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonString);
    }
    catch (error: unknown) {
        return { Success: false, Errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`] };
    }
    const result = manifestWithDependenciesSchema.safeParse(parsed);
    return result.success
        ? { Success: true, Dependencies: result.data.dependencies ?? {} }
        : { Success: false, Errors: DescribeIssues(result.error) };
}

/** One `path: message` line for each validation issue. */
function DescribeIssues(error: z.ZodError): string[] {
    return error.issues.map(issue => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
    });
}

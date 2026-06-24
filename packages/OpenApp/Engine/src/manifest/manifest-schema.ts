/**
 * Zod schema for the mj-app.json manifest file.
 *
 * An Open App **is** its manifest. The `mj-app.json` manifest is the single source of
 * truth for what an app is: it can stand entirely alone (a manifest-only app is valid),
 * it is what MJ persists (`MJ: Open Apps.ManifestJSON`), and it is what every lifecycle
 * operation re-reads. Every *capability* block — `schema`, `migrations`, `metadata`,
 * `packages`, `dependencies`, `code`, `configuration`, `hooks` — is **optional and
 * additive**; the manifest assumes nothing about which blocks are present. An app's
 * "form" is simply which blocks it declares (manifest-only, metadata-extending,
 * schema-backed, packages-only, or any combination). Only the identity fields (name,
 * version, publisher, repository, mjVersionRange, …) are required — they describe the
 * app, not its form.
 *
 * Validates all fields defined in the MJ Open App specification.
 * Used by the CLI to parse and validate app manifests before installation.
 */
import { z } from 'zod';

// ── Identity ──────────────────────────────────────────────

/** Semver regex supporting pre-release and build metadata */
const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;

/** App name: lowercase alphanumeric + hyphens, 3-64 chars */
const appNameRegex = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

/** SQL schema name: alphanumeric + underscores, 3-128 chars (SQL Server is case-insensitive) */
const schemaNameRegex = /^_{0,2}[a-zA-Z][a-zA-Z0-9_]{1,126}[a-zA-Z0-9]$/;

/** Hex color: #RRGGBB */
const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

/** GitHub repository URL */
const githubRepoRegex = /^https:\/\/github\.com\/.+\/.+$/;

/** Tag: lowercase alphanumeric + hyphens, max 50 chars */
const tagRegex = /^[a-z0-9-]{1,50}$/;

// ── Publisher ─────────────────────────────────────────────

const publisherSchema = z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
});

// ── Package Entries ───────────────────────────────────────

/** Valid roles for npm packages within an app */
const packageRoleSchema = z.enum([
    'bootstrap', 'actions', 'engine', 'provider', 'module', 'components', 'library'
]);

const packageEntrySchema = z.object({
    name: z.string().min(1).max(200),
    role: packageRoleSchema,
    startupExport: z.string().optional(),
}).refine(
    (pkg) => pkg.role !== 'bootstrap' || (pkg.startupExport != null && pkg.startupExport.length > 0),
    { message: 'startupExport is required for packages with the "bootstrap" role', path: ['startupExport'] }
);

const packagesSchema = z.object({
    registry: z.string().url().optional(),
    /**
     * npm package prefix for this app (e.g., '@bluecypress/bcsaas-').
     * When set, `mj app install --version` and `mj app upgrade --version` will
     * bump ALL dependencies matching this prefix across the workspace, not just
     * the packages declared in server/client/shared.
     */
    prefix: z.string().min(1).optional(),
    server: z.array(packageEntrySchema).optional(),
    client: z.array(packageEntrySchema).optional(),
    shared: z.array(packageEntrySchema).optional(),
});

// ── Database Schema ───────────────────────────────────────

const dbSchemaSchema = z.object({
    name: z.string().regex(schemaNameRegex, 'Schema name must be alphanumeric + underscores, 3-128 chars. May start with up to two underscores.'),
    createIfNotExists: z.boolean().optional().default(true),
    /** npm package that exports the generated entity subclasses for this schema.
     *  Used by CodeGen to resolve per-schema imports. If omitted, the install
     *  engine auto-detects it from packages.shared (first library-role package
     *  whose name contains "entities"). */
    entityPackage: z.string().min(1).optional(),
});

// ── Migrations ────────────────────────────────────────────

const migrationsSchema = z.object({
    directory: z.string().optional().default('migrations'),
    engine: z.enum(['flyway', 'skyway']).optional().default('skyway'),
});

// ── Metadata ──────────────────────────────────────────────

const metadataSchema = z.object({
    /**
     * Dev-time-only pointer to the directory whose metadata is the source of truth for the
     * app's seed migrations. The install engine NEVER reads this at install — seeding happens
     * exclusively through the app's Skyway `migrations/` (generated from this directory via
     * `mj sync push` at build time). Kept purely as documentation of where the metadata lives.
     */
    directory: z.string().optional().default('metadata'),
});

// ── Code Visibility ───────────────────────────────────────

const codeSchema = z.object({
    visibility: z.enum(['public', 'private']).optional().default('private'),
    sourceDirectory: z.string().optional(),
});

// ── Configuration Schema ──────────────────────────────────

const configurationSchema = z.object({
    schema: z.record(z.string(), z.unknown()).optional(),
});

// ── Hooks ─────────────────────────────────────────────────

const hooksSchema = z.object({
    postInstall: z.string().optional(),
    postUpgrade: z.string().optional(),
    preRemove: z.string().optional(),
});

// ── Full Manifest ─────────────────────────────────────────

/**
 * Complete Zod schema for the mj-app.json manifest.
 * All validation rules match the MJ Open App specification.
 */
export const mjAppManifestSchema = z.object({
    // Identity
    $schema: z.string().optional(),
    manifestVersion: z.literal(1),
    name: z.string().regex(appNameRegex, 'App name must be 3-64 chars, lowercase alphanumeric + hyphens'),
    displayName: z.string().min(1).max(200),
    description: z.string().min(10).max(500),
    version: z.string().regex(semverRegex, 'Version must be valid semver'),
    license: z.string().optional(),
    icon: z.string().optional(),
    color: z.string().regex(hexColorRegex, 'Color must be a hex color (#RRGGBB)').optional(),

    // Publisher
    publisher: publisherSchema,

    // Repository
    repository: z.string().regex(githubRepoRegex, 'Repository must be a GitHub URL'),

    // MJ Compatibility
    mjVersionRange: z.string().min(1),

    // Database Schema
    schema: dbSchemaSchema.optional(),

    // Migrations
    migrations: migrationsSchema.optional(),

    // Metadata — dev-time only. Points at the source-of-truth directory used to generate the
    // app's seed migrations; the install engine never processes it directly.
    metadata: metadataSchema.optional(),

    // NPM Packages — optional, like every other capability block. An app that extends MJ
    // purely via metadata or schema (or is manifest-only) declares no packages at all.
    packages: packagesSchema.optional(),

    // App Dependencies — accepted in TWO authoring forms, normalized to the same
    // internal record (app name -> semver range string | { version, repository, subpath? }):
    //   (1) object/record keyed by app name (canonical), or
    //   (2) an array of { name, repository, versionRange, subpath? } entries (the form
    //       several published apps ship, e.g. bizapps-tasks / bizapps-issues). The array
    //       is transformed to the record so downstream resolution sees a single shape.
    dependencies: z.union([
        z.array(z.object({
            name: z.string().regex(appNameRegex, 'Dependency app name must match app name format'),
            repository: z.string().regex(githubRepoRegex, 'Dependency repository must be a GitHub URL'),
            versionRange: z.string().min(1),
            /** In-repo subpath to the dependency app, for dependencies that live in a multi-app repo. */
            subpath: z.string().optional(),
        })).transform((arr) =>
            Object.fromEntries(arr.map((d) => [
                d.name,
                { version: d.versionRange, repository: d.repository, ...(d.subpath ? { subpath: d.subpath } : {}) },
            ]))
        ),
        z.record(
            z.string().regex(appNameRegex, 'Dependency app name must match app name format'),
            z.union([
                z.string().min(1),
                z.object({
                    version: z.string().min(1),
                    repository: z.string().regex(githubRepoRegex, 'Dependency repository must be a GitHub URL'),
                    /** In-repo subpath to the dependency app, for dependencies that live in a multi-app repo. */
                    subpath: z.string().optional(),
                })
            ])
        ),
    ]).optional(),

    // Code Visibility
    code: codeSchema.optional(),

    // Configuration Schema
    configuration: configurationSchema.optional(),

    // Lifecycle Hooks
    hooks: hooksSchema.optional(),

    // Discovery (MJ Central)
    categories: z.array(z.string()).max(5).optional(),
    tags: z.array(z.string().regex(tagRegex, 'Tags must be lowercase alphanumeric + hyphens, max 50 chars')).max(20).optional(),
});

/**
 * TypeScript type inferred from the manifest schema.
 * Use this for strongly-typed manifest handling throughout the engine.
 */
export type MJAppManifest = z.infer<typeof mjAppManifestSchema>;

/**
 * Type for a single package entry within the manifest.
 */
export type ManifestPackageEntry = z.infer<typeof packageEntrySchema>;

/**
 * Valid package roles.
 */
export type PackageRole = z.infer<typeof packageRoleSchema>;

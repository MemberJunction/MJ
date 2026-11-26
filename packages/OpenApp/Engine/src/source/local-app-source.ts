/**
 * Open App source backed by a folder inside the consumer repository, addressed by a `file:`
 * locator relative to the repository root (for example `file:openapps/analytics`).
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { ManifestFetchResult, MigrationDownloadResult } from '../github/github-client.js';
import { MAX_MIGRATION_DIRECTORY_DEPTH } from '../manifest/migration-layout.js';
import type { VersionStrategy } from '../install/package-manager.js';
import type { OpenAppSource, VersionValidationResult } from './open-app-source.js';

/** Prefix of a locator that names a folder in the consumer repository. */
export const LOCAL_LOCATOR_PREFIX = 'file:';

const MANIFEST_FILE = 'mj-app.json';

/** Result of {@link NormalizeAppSource}. */
export type NormalizedAppSource = { Success: true; Source: string } | { Success: false; ErrorMessage: string };

/** The app folder's manifest text and the version it declares. */
type ManifestRead = { Json: string; Version: string | undefined } | { ErrorMessage: string };

/** The `.sql` files of a directory, as `/`-separated paths relative to it. */
type SqlFileList = { Files: string[] } | { ErrorMessage: string };

/** Returns true when the locator names a folder in the consumer repository. */
export function IsLocalAppLocator(locator: string): boolean {
    return locator.startsWith(LOCAL_LOCATOR_PREFIX);
}

/**
 * Returns the source in the form the engine stores. A folder path (`./openapps/analytics`, an
 * absolute path, a `file:` locator, or a relative path to a folder that has `mj-app.json`) becomes
 * a `file:` locator relative to the repository root. Any other source, such as a GitHub URL, is
 * returned unchanged. A folder outside the repository root is refused, also when a link in its
 * path leads outside.
 *
 * @param source - The source the user gave
 * @param repoRoot - Absolute path of the repository root
 */
export function NormalizeAppSource(source: string, repoRoot: string): NormalizedAppSource {
    if (!IsLocalPath(source, repoRoot)) {
        return { Success: true, Source: source };
    }
    const folder = resolve(repoRoot, StripLocatorPrefix(source));
    const realFromRoot = relative(RealPath(repoRoot), RealPath(folder));
    if (IsOutside(realFromRoot)) {
        return {
            Success: false,
            ErrorMessage: `The app folder '${source}' is outside the repository root '${repoRoot}', or is reached through a link to a folder outside it. `
                + `A local Open App must be in the repository it is installed into.`,
        };
    }
    // The path as given when it is inside the root, else the real path: `/tmp/repo/x` is `/private/tmp/repo/x` on macOS.
    const givenFromRoot = relative(repoRoot, folder);
    const fromRoot = IsOutside(givenFromRoot) ? realFromRoot : givenFromRoot;
    return { Success: true, Source: `${LOCAL_LOCATOR_PREFIX}${ToPosixPath(fromRoot) || '.'}` };
}

/**
 * Reads an Open App from a folder in the consumer repository. The folder has one version: the
 * `version` in its `mj-app.json`. Package versions are written as `workspace:*`, because the
 * app's packages are built in the same workspace.
 */
export class LocalAppSource implements OpenAppSource {
    public readonly Locator: string;
    public readonly Subpath: string | undefined = undefined;
    public readonly PackageVersionStrategy: VersionStrategy = 'workspace';
    private readonly folderName: string;
    private readonly folder: string;
    private readonly locatorError: string | undefined;

    /**
     * @param locator - `file:` locator relative to the repository root
     * @param repoRoot - Absolute path of the repository root
     */
    public constructor(locator: string, repoRoot: string) {
        this.Locator = locator;
        this.folderName = StripLocatorPrefix(locator);
        this.folder = resolve(repoRoot, this.folderName);
        this.locatorError = IsOutside(relative(repoRoot, this.folder)) || IsOutsideRealPath(repoRoot, this.folder)
            ? `The app folder '${this.folderName}' is outside the repository root '${repoRoot}', or is reached through a link to a folder outside it.`
            : undefined;
    }

    public async FetchManifest(version?: string): Promise<ManifestFetchResult> {
        const manifest = this.readManifest();
        if ('ErrorMessage' in manifest) {
            return { Success: false, ErrorMessage: manifest.ErrorMessage };
        }
        if (version && NormalizeVersion(version) !== manifest.Version) {
            return { Success: false, ErrorMessage: this.describeOtherVersion(version, manifest.Version) };
        }
        return { Success: true, ManifestJSON: manifest.Json };
    }

    public async ValidateVersion(version: string): Promise<VersionValidationResult> {
        const manifest = this.readManifest();
        if ('ErrorMessage' in manifest) {
            return { Exists: false, ErrorMessage: manifest.ErrorMessage };
        }
        return NormalizeVersion(version) === manifest.Version
            ? { Exists: true }
            : { Exists: false, ErrorMessage: this.describeOtherVersion(version, manifest.Version) };
    }

    public async GetLatestVersion(): Promise<string | null> {
        const manifest = this.readManifest();
        return 'ErrorMessage' in manifest ? null : manifest.Version ?? null;
    }

    public async DescribeUnresolvedVersion(): Promise<string> {
        const manifest = this.readManifest();
        return 'ErrorMessage' in manifest ? manifest.ErrorMessage : `${MANIFEST_FILE} in the app folder '${this.folderName}' has no version.`;
    }

    public async ListVersions(): Promise<string[]> {
        const latest = await this.GetLatestVersion();
        return latest ? [latest] : [];
    }

    /**
     * Copies the `.sql` files under `directory` into `targetDir`, keeping subfolders. Fails when the
     * folder is not at `version`, so files of one version never run as another.
     */
    public async CopySqlDirectory(directory: string, version: string | undefined, targetDir: string): Promise<MigrationDownloadResult> {
        const manifest = this.readManifest();
        if ('ErrorMessage' in manifest) {
            return { Success: false, ErrorMessage: manifest.ErrorMessage };
        }
        if (version !== undefined && NormalizeVersion(version) !== manifest.Version) {
            return {
                Success: false,
                ErrorMessage: `Cannot read '${directory}' for version ${NormalizeVersion(version)}. ${this.describeOtherVersion(version, manifest.Version)} `
                    + `Put the folder back to version ${NormalizeVersion(version)}, or upgrade the app first.`,
            };
        }
        const listed = this.listSqlDirectory(directory);
        if ('ErrorMessage' in listed) {
            return { Success: false, ErrorMessage: listed.ErrorMessage };
        }
        const sourceDir = resolve(this.folder, directory);
        for (const file of listed.Files) {
            const target = join(targetDir, ...file.split('/'));
            mkdirSync(dirname(target), { recursive: true });
            copyFileSync(join(sourceDir, ...file.split('/')), target);
        }
        return { Success: true, LocalPath: targetDir, Files: listed.Files };
    }

    /** Returns this source: the folder holds the app's own files whatever the manifest's `repository` says. */
    public ForManifest(): OpenAppSource {
        return this;
    }

    private readManifest(): ManifestRead {
        if (this.locatorError) {
            return { ErrorMessage: this.locatorError };
        }
        const manifestPath = join(this.folder, MANIFEST_FILE);
        if (!existsSync(manifestPath)) {
            return { ErrorMessage: `${MANIFEST_FILE} not found in the app folder '${this.folderName}' (${this.folder}).` };
        }
        if (IsOutsideRealPath(this.folder, manifestPath)) {
            return { ErrorMessage: `${MANIFEST_FILE} in the app folder '${this.folderName}' is a link to a file outside the app folder.` };
        }
        const json = readFileSync(manifestPath, 'utf-8');
        return { Json: json, Version: ReadManifestVersion(json) };
    }

    /** Lists the `.sql` files of an app directory, refusing a directory outside the app folder, also through a link. */
    private listSqlDirectory(directory: string): SqlFileList {
        const sourceDir = resolve(this.folder, directory);
        if (IsOutside(relative(this.folder, sourceDir)) || IsOutsideRealPath(this.folder, sourceDir)) {
            return { ErrorMessage: `The directory '${directory}' is outside the app folder '${this.folderName}', or is reached through a link to a folder outside it.` };
        }
        if (!existsSync(sourceDir) || !lstatSync(sourceDir).isDirectory()) {
            return { ErrorMessage: `The directory '${directory}' was not found in the app folder '${this.folderName}'.` };
        }
        const listed = ListSqlFiles(sourceDir);
        if ('Files' in listed && listed.Files.length === 0) {
            return {
                ErrorMessage: `No .sql files found under '${directory}' in the app folder '${this.folderName}'. `
                    + `The manifest declares this directory, so an empty folder is a defect — check 'migrations' in mj-app.json.`,
            };
        }
        return listed;
    }

    private describeOtherVersion(requested: string, current: string | undefined): string {
        return `The app folder '${this.folderName}' is at version ${current ?? '(none)'}, not ${NormalizeVersion(requested)}. `
            + `A local app is available only at the version in its ${MANIFEST_FILE}.`;
    }
}

/**
 * Every regular `.sql` file under `root`, as sorted `/`-separated relative paths. Links under
 * `root` are skipped, as the GitHub download skips them. The caller checks the path to `root`.
 */
function ListSqlFiles(root: string): SqlFileList {
    const files: string[] = [];
    const pending: string[][] = [[]];
    while (pending.length > 0) {
        const folderSegments = pending.pop() ?? [];
        for (const entry of readdirSync(join(root, ...folderSegments), { withFileTypes: true })) {
            if (entry.isDirectory()) {
                pending.push([...folderSegments, entry.name]);
            } else if (entry.isFile() && entry.name.endsWith('.sql')) {
                if (folderSegments.length > MAX_MIGRATION_DIRECTORY_DEPTH) {
                    return { ErrorMessage: `Migration directory nesting exceeds ${MAX_MIGRATION_DIRECTORY_DEPTH} levels under '${root}'.` };
                }
                files.push([...folderSegments, entry.name].join('/'));
            }
        }
    }
    return { Files: files.sort() };
}

/** Reads `version` from manifest text, without a leading `v`; undefined when absent or unreadable. */
function ReadManifestVersion(json: string): string | undefined {
    try {
        const parsed: { version?: string } = JSON.parse(json);
        return typeof parsed.version === 'string' ? NormalizeVersion(parsed.version) : undefined;
    } catch {
        return undefined;
    }
}

function NormalizeVersion(version: string): string {
    return version.replace(/^v/, '');
}

/** Returns true for a path that starts with `./`, `../` or is absolute, a `file:` locator, or a folder with `mj-app.json`. */
function IsLocalPath(source: string, repoRoot: string): boolean {
    if (IsLocalAppLocator(source) || isAbsolute(source) || /^\.{1,2}([\\/]|$)/.test(source)) {
        return true;
    }
    return existsSync(join(resolve(repoRoot, source), MANIFEST_FILE));
}

function StripLocatorPrefix(source: string): string {
    return IsLocalAppLocator(source) ? source.slice(LOCAL_LOCATOR_PREFIX.length) : source;
}

/** Returns true when a path relative to a folder leaves that folder. */
function IsOutside(relativePath: string): boolean {
    return relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
}

/** Returns true when `path` leaves `root` once the links in both are resolved. */
function IsOutsideRealPath(root: string, path: string): boolean {
    return IsOutside(relative(RealPath(root), RealPath(path)));
}

/** The path with links resolved. A trailing part that does not exist is kept as written. */
function RealPath(path: string): string {
    if (existsSync(path)) {
        return realpathSync(path);
    }
    const parent = dirname(path);
    return parent === path ? path : join(RealPath(parent), basename(path));
}

function ToPosixPath(path: string): string {
    return path.split(sep).join('/');
}

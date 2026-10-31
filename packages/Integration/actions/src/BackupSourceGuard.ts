/**
 * Validation for every backup location, storage container and staging-file directory the backup actions
 * accept. These actions are callable directly (the `RunAction` mutation) with any parameter values, so
 * each value is checked here before it reaches T-SQL or an outbound request:
 *
 * - A storage container URL becomes a SQL Server credential name (`[...]` identifier) and the target of
 *   an HTTP request, so it must be exactly `https://<account>.<azure blob suffix>/<container>`.
 * - A backup URL must be a blob inside such a container, with no query string (a SAS token in the URL
 *   would be persisted and logged; tokens travel in `SasToken` / `StorageCredentialID`).
 * - A disk backup path and a staging-file directory must be local (no UNC share, which would make the
 *   SQL Server service account authenticate to another host) and free of `..` segments, and — when the
 *   operator configured roots (`MJ_BACKUP_DISK_ROOTS`, `MJ_STAGING_FILE_ROOTS`) — inside one of them.
 */

/** A parameter value the backup actions refuse; reported as `INVALID_PARAMETER`. */
export class InvalidBackupParameterError extends Error {
    public readonly ResultCode = 'INVALID_PARAMETER';

    constructor(message: string) {
        super(message);
        this.name = 'InvalidBackupParameterError';
    }
}

/** Host suffixes of Azure Blob Storage endpoints (public, US Government, China). */
const AZURE_BLOB_HOST_SUFFIXES: readonly string[] = [
    '.blob.core.windows.net',
    '.blob.core.usgovcloudapi.net',
    '.blob.core.chinacloudapi.cn',
];

/** A storage account name: 3-24 lowercase letters and digits. */
const STORAGE_ACCOUNT_PATTERN = /^[a-z0-9]{3,24}$/;

/** A container name: 3-63 of lowercase letters, digits and single hyphens, or one of Azure's `$` containers. */
const CONTAINER_NAME_PATTERN = /^(?:\$root|\$logs|\$web|[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,62})$/;

/** Characters never accepted in a location: they end a T-SQL literal or bracketed identifier. */
const FORBIDDEN_CHARACTERS: readonly string[] = ["'", '"', ']', '\0'];

/** The operator-configured roots for disk backup sources (comma-separated absolute directories). */
export const BACKUP_DISK_ROOTS_ENV = 'MJ_BACKUP_DISK_ROOTS';

/** The operator-configured roots for staging data/log file directories (comma-separated absolute directories). */
export const STAGING_FILE_ROOTS_ENV = 'MJ_STAGING_FILE_ROOTS';

/** Quotes a SQL Server identifier as `QUOTENAME` does: brackets, with every `]` doubled. */
export function QuoteSqlIdentifier(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`;
}

/** True when the value carries a character that could end a T-SQL literal or identifier. */
function hasForbiddenCharacter(value: string): boolean {
    return FORBIDDEN_CHARACTERS.some(c => value.includes(c));
}

/** The parsed URL, or undefined when the value is not an absolute URL. */
function tryParseUrl(value: string): URL | undefined {
    try {
        return new URL(value);
    } catch {
        return undefined;
    }
}

/** Why the URL's scheme, host or decoration is not an Azure Blob endpoint, or undefined when it is. */
function blobEndpointProblem(url: URL, label: string): string | undefined {
    if (url.protocol !== 'https:') {
        return `${label} must use https.`;
    }
    if (url.username || url.password || url.port) {
        return `${label} must not carry credentials or a port.`;
    }
    if (url.search || url.hash || url.href.includes('?') || url.href.includes('#')) {
        return `${label} must not carry a query string or fragment; pass the SAS token as 'SasToken' or 'StorageCredentialID'.`;
    }
    const suffix = AZURE_BLOB_HOST_SUFFIXES.find(s => url.hostname.endsWith(s));
    if (!suffix) {
        return `${label} must be an Azure Blob Storage endpoint (a host ending in ${AZURE_BLOB_HOST_SUFFIXES.join(', ')}).`;
    }
    const account = url.hostname.slice(0, url.hostname.length - suffix.length);
    if (!STORAGE_ACCOUNT_PATTERN.test(account)) {
        return `${label} names an invalid storage account '${account}'.`;
    }
    return undefined;
}

/** The URL's non-empty path segments (still percent-encoded). */
function pathSegments(url: URL): string[] {
    return url.pathname.split('/').filter(s => s.length > 0);
}

/**
 * Why `value` is not a storage container URL (`https://<account>.blob.core.windows.net/<container>`, or a
 * government/China cloud equivalent), or undefined when it is.
 */
export function StorageContainerUrlProblem(value: string, paramName = 'ContainerUrl'): string | undefined {
    const label = `Parameter '${paramName}'`;
    if (hasForbiddenCharacter(value)) {
        return `${label} contains a character that is not allowed in a storage container URL.`;
    }
    const url = tryParseUrl(value);
    if (!url) {
        return `${label} is not a valid URL.`;
    }
    const endpointProblem = blobEndpointProblem(url, label);
    if (endpointProblem) {
        return endpointProblem;
    }
    const segments = pathSegments(url);
    if (segments.length !== 1 || url.pathname !== `/${segments[0]}`) {
        return `${label} must name exactly one container: https://<account>.blob.core.windows.net/<container>.`;
    }
    if (!CONTAINER_NAME_PATTERN.test(segments[0])) {
        return `${label} names an invalid container '${segments[0]}'.`;
    }
    return undefined;
}

/** Throws {@link InvalidBackupParameterError} unless `value` is a storage container URL. */
export function AssertStorageContainerUrl(value: string, paramName = 'ContainerUrl'): void {
    const problem = StorageContainerUrlProblem(value, paramName);
    if (problem) {
        throw new InvalidBackupParameterError(problem);
    }
}

/** Why `value` is not a blob URL inside a valid storage container, or undefined when it is. */
export function BlobUrlProblem(value: string, paramName = 'BackupUrls'): string | undefined {
    const label = `Parameter '${paramName}'`;
    if (hasForbiddenCharacter(value)) {
        return `${label} contains a character that is not allowed in a backup URL.`;
    }
    const url = tryParseUrl(value);
    if (!url) {
        return `${label} contains an invalid URL.`;
    }
    const endpointProblem = blobEndpointProblem(url, label);
    if (endpointProblem) {
        return endpointProblem;
    }
    const segments = pathSegments(url);
    if (segments.length < 2) {
        return `${label} must name a blob inside a container: https://<account>.blob.core.windows.net/<container>/<blob>.`;
    }
    if (!CONTAINER_NAME_PATTERN.test(segments[0])) {
        return `${label} names an invalid container '${segments[0]}'.`;
    }
    return undefined;
}

/** True when the path names a UNC share (`\\host\share` or `//host/share`). */
function isUncPath(value: string): boolean {
    return value.startsWith('\\\\') || value.startsWith('//');
}

/** The path's segments, split on either separator. */
function localPathSegments(value: string): string[] {
    return value.split(/[\\/]/);
}

/** True when the path is absolute: a Windows drive path (`C:\...`) or a POSIX path (`/...`). */
function isAbsoluteLocalPath(value: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/');
}

/** The path with `/` separators and no trailing separator, for prefix comparison. */
function normalizeLocalPath(value: string): string {
    let normalized = value.replace(/\\/g, '/');
    while (normalized.length > 1 && normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/** True when `path` is `root` or inside it. Windows drive paths compare case-insensitively. */
function isUnderRoot(path: string, root: string, allowEqual: boolean): boolean {
    const caseInsensitive = /^[A-Za-z]:/.test(root);
    const fold = (s: string) => (caseInsensitive ? s.toLowerCase() : s);
    const normalizedPath = fold(normalizeLocalPath(path));
    const normalizedRoot = fold(normalizeLocalPath(root));
    if (allowEqual && normalizedPath === normalizedRoot) {
        return true;
    }
    const prefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
    return normalizedPath.startsWith(prefix) && normalizedPath.length > prefix.length;
}

/** The configured roots from a comma-separated environment variable; empty when unset. */
export function ReadConfiguredRoots(envName: string): string[] {
    const raw = process.env[envName];
    if (!raw) {
        return [];
    }
    return raw.split(',').map(r => r.trim()).filter(r => r.length > 0);
}

/** Why a local path is unsafe regardless of configuration, or undefined when it is not. */
function localPathShapeProblem(value: string, label: string): string | undefined {
    if (hasForbiddenCharacter(value)) {
        return `${label} contains a character that is not allowed in a file path.`;
    }
    if (isUncPath(value)) {
        return `${label} must be a local path; UNC share paths are not allowed.`;
    }
    if (localPathSegments(value).some(s => s === '..')) {
        return `${label} must not contain '..' segments.`;
    }
    return undefined;
}

/** Why the path is outside every configured root, or undefined when it is inside one (or none are configured). */
function rootsProblem(value: string, label: string, envName: string, allowEqual: boolean): string | undefined {
    const roots = ReadConfiguredRoots(envName);
    if (roots.length === 0) {
        return undefined;
    }
    if (!isAbsoluteLocalPath(value) || !roots.some(root => isUnderRoot(value, root, allowEqual))) {
        return `${label} must be inside one of the directories configured in ${envName}.`;
    }
    return undefined;
}

/** Why `value` is not an acceptable disk backup path, or undefined when it is. */
export function DiskBackupPathProblem(value: string, paramName = 'BackupUrls'): string | undefined {
    const label = `Parameter '${paramName}'`;
    return localPathShapeProblem(value, label) ?? rootsProblem(value, label, BACKUP_DISK_ROOTS_ENV, false);
}

/** Why `value` is not an acceptable staging data/log file directory, or undefined when it is. */
export function StagingDirectoryProblem(value: string, paramName: string): string | undefined {
    const label = `Parameter '${paramName}'`;
    return localPathShapeProblem(value, label) ?? rootsProblem(value, label, STAGING_FILE_ROOTS_ENV, true);
}

/** True when the backup source is a URL rather than a disk path. */
export function IsUrlSource(source: string): boolean {
    return /^https?:\/\//i.test(source);
}

/** The first problem among the backup sources (each a blob URL or a disk path), or undefined when all pass. */
export function BackupSourcesProblem(sources: string[], paramName = 'BackupUrls'): string | undefined {
    for (const source of sources) {
        const problem = IsUrlSource(source) ? BlobUrlProblem(source, paramName) : DiskBackupPathProblem(source, paramName);
        if (problem) {
            return problem;
        }
    }
    return undefined;
}

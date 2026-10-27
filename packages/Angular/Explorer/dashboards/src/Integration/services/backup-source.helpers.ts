/**
 * Pure helpers for the SQL Server backup bootstrap flow: byte formatting and the Azure Blob
 * URL arithmetic the wizard and the integration data service share. Kept out of the component
 * so the Explorer surface holds no domain logic and the rules are unit-testable on their own.
 */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Human-readable size with two decimals, e.g. 1073741824 → "1 GB", 2048 → "2 KB", 1536 → "1.5 KB". */
export function FormatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${parseFloat(value.toFixed(2))} ${BYTE_UNITS[exponent]}`;
}

/**
 * The Azure Blob container URL (origin plus the first path segment) of a blob URL, or undefined
 * when the value is not an http(s) URL with a container segment.
 * `https://acct.blob.core.windows.net/backups/db.bak` → `https://acct.blob.core.windows.net/backups`.
 */
export function DeriveContainerUrl(blobUrl: string): string | undefined {
  const trimmed = blobUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    const container = url.pathname.split('/').find(segment => segment.length > 0);
    return container ? `${url.origin}/${container}` : undefined;
  } catch {
    return undefined;
  }
}

/** The first comma-separated entry of a backup URL list, trimmed; empty string when there is none. */
export function FirstBackupUrl(backupUrls: string): string {
  return backupUrls.split(',')[0]?.trim() ?? '';
}

/**
 * The `BackupUrls` value after choosing a directory preset. A preset is a directory on the SQL Server
 * host, not a backup file, so it is never added as an entry of its own: it starts a new entry ending in
 * the directory's own separator for the user to complete with a file name. With nothing entered yet the
 * value becomes that directory; otherwise the directory is appended as a further comma-separated entry.
 */
export function AppendDirectoryPreset(currentBackupUrls: string, directory: string): string {
  const separator = /^[A-Za-z]:|\\/.test(directory) ? '\\' : '/';
  const entry = `${directory.replace(/[\\/]+$/, '')}${separator}`;
  const current = currentBackupUrls.trim().replace(/,\s*$/, '');
  return current ? `${current}, ${entry}` : entry;
}

/**
 * The comma-separated `BackupUrls` value for a set of blob names selected inside a container.
 * A blob name is appended to the container URL (trailing slashes removed); without a container the
 * names are passed through as given.
 */
export function BuildBackupUrlList(containerUrl: string, blobNames: Iterable<string>): string {
  const base = containerUrl.trim().replace(/\/+$/, '');
  return Array.from(blobNames)
    .map(name => (base ? `${base}/${name}` : name))
    .join(', ');
}

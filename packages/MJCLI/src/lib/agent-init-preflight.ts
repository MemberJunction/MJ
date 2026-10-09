/**
 * Checks and defaults for `mj agent init`: everything the Citizen Agent Builder workspace needs
 * settled before its containers start, so the long first install does not stop part way on
 * something that could have been caught up front (a port in use, too little Docker memory, an
 * invalid encryption key).
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { statfsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

/** The key every workspace shipped with before keys were generated per workspace. It decodes to 24 bytes, so it never worked. */
export const LEGACY_PLACEHOLDER_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

/** Docker memory below which the first install runs out of memory (measured: it fails at Docker Desktop's 8 GB default). */
export const MIN_DOCKER_MEMORY_BYTES = 11 * 1024 ** 3;

/** Disk the images, database and build cache need for one workspace. */
export const MIN_FREE_DISK_BYTES = 20 * 1000 ** 3;

/** The host ports the workspace publishes, with their defaults. */
export const DEFAULT_PORTS = [
  { Key: 'DB_PORT', Port: 1433 },
  { Key: 'API_PORT', Port: 4000 },
  { Key: 'EXPLORER_PORT', Port: 4202 },
] as const;

export type PortKey = (typeof DEFAULT_PORTS)[number]['Key'];

/** How many ports above the preferred one to try before giving up. */
const PORT_SEARCH_RANGE = 50;

/** MemberJunction base64-decodes the key and requires exactly 32 bytes (AES-256). */
export function IsValidEncryptionKey(key: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
    return false;
  }
  return Buffer.from(key, 'base64').length === 32;
}

export function GenerateEncryptionKey(): string {
  return randomBytes(32).toString('base64');
}

/**
 * The Docker Compose project name for a workspace: its folder name plus a random suffix, so two
 * workspaces never share containers or volumes even when their folders have the same name.
 */
export function ComposeProjectName(workspaceDir: string, suffix: string = randomBytes(3).toString('hex')): string {
  const slug = path
    .basename(path.resolve(workspaceDir))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `mj-${slug || 'workspace'}-${suffix}`;
}

/** True when nothing is listening on the port, on any interface. */
export function IsPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '0.0.0.0');
  });
}

/**
 * The preferred port if it is free, otherwise the next free port above it that no other workspace
 * port has claimed. Undefined when none is free within {@link PORT_SEARCH_RANGE}.
 */
export async function ChooseFreePort(
  preferred: number,
  claimed: ReadonlySet<number>,
  isFree: (port: number) => Promise<boolean> = IsPortFree
): Promise<number | undefined> {
  for (let port = preferred; port < preferred + PORT_SEARCH_RANGE; port++) {
    if (!claimed.has(port) && (await isFree(port))) {
      return port;
    }
  }
  return undefined;
}

/** Docker's total memory, from `docker info`. Undefined when Docker does not answer. */
export function ReadDockerMemoryBytes(): number | undefined {
  try {
    const output = execSync('docker info --format "{{.MemTotal}}"', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const bytes = Number(output.trim());
    return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined;
  } catch {
    return undefined; // Docker not running or not installed: the Docker check reports that.
  }
}

/** Free disk space where the workspace lives. Undefined when the platform cannot say. */
export function ReadFreeDiskBytes(dir: string): number | undefined {
  try {
    const stats = statfsSync(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return undefined;
  }
}

/** "16.0 GB" style, for messages. */
export function FormatGigabytes(bytes: number, base: 1000 | 1024 = 1024): string {
  return `${(bytes / base ** 3).toFixed(1)} GB`;
}

/**
 * Host resource pressure, measured on the tenant.
 *
 * plan.md line 158 asks what happens "if we run out of storage when we sync, how do we alert the
 * user, OOM (MJC should handle)". The split is deliberate: the TENANT can measure — it is the
 * process that fills the heap and the disk — and the control plane decides what to do about it.
 * Neither half works alone, and today neither exists, so a sync that dies of OOM or ENOSPC does so
 * with no signal anywhere ahead of it.
 *
 * Everything here is a MEASUREMENT. No thresholds are enforced and nothing is refused; callers
 * decide. The only opinion expressed is which numbers matter.
 */
import { readFile, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import v8 from 'node:v8';

export interface ResourcePressureReading {
    /** V8 heap in use, bytes. */
    HeapUsedBytes: number;
    /** The ceiling V8 will not grow past — --max-old-space-size, or the platform default. */
    HeapLimitBytes: number;
    /** 0..1. Above ~0.9 a long sync is usually already in trouble. */
    HeapUsedFraction: number;
    /** Resident set: what the CONTAINER sees, which is what an OOM killer acts on. */
    ResidentBytes: number;
    /** Host RAM, total and actually allocatable. Null off Linux or when /proc is unreadable. */
    HostMemTotalBytes: number | null;
    HostMemAvailableBytes: number | null;
    /**
     * Resident set as a fraction of host RAM — the number the OOM killer effectively acts on.
     *
     * This exists because HeapUsedFraction cannot see the memory that actually kills a sync.
     * `--max-old-space-size` bounds V8's OLD SPACE only; `Buffer`/`ArrayBuffer` — where an HTTP
     * response body lives before it is parsed — is external and counted in neither. Proven on the
     * sandbox 2026-09-14: the kernel killed node at 3,478 MB RSS on a 3,830 MB box against a
     * 1,964 MB heap ceiling (1.8x), while heap usage was unremarkable. A throttle watching only
     * the heap reads healthy right up to the kill.
     */
    ResidentFraction: number | null;
    /** Free bytes on the volume holding run artifacts, or null when it cannot be read. */
    ArtifactDiskFreeBytes: number | null;
    ArtifactDiskTotalBytes: number | null;
    /** Free bytes on the volume RSU writes migrations and compiles into. */
    WorkDirFreeBytes: number | null;
    WorkDirTotalBytes: number | null;
    /** Retained run directories, against the retention cap that prunes them. */
    RunDirCount: number | null;
    /** Syncs this process is currently running. */
    ActiveSyncCount: number;
}

/** Free/total for a path, or nulls when the path is unreadable — never throws. */
async function volume(path: string): Promise<{ free: number | null; total: number | null }> {
    try {
        const s = await statfs(path);
        // bavail, not bfree: bfree includes blocks reserved for root, which a service account
        // cannot use. Reporting those as free is how a "5% left" reading turns into ENOSPC.
        return { free: s.bsize * Number(s.bavail), total: s.bsize * Number(s.blocks) };
    } catch {
        return { free: null, total: null };
    }
}

/**
 * Host RAM from /proc/meminfo. MemAvailable, never MemFree: `os.freemem()` returns MemFree on
 * Linux, which excludes reclaimable page cache and therefore reads far tighter than what a
 * process can actually obtain. Returns nulls anywhere /proc is absent — never throws.
 */
async function hostMemory(): Promise<{ total: number | null; available: number | null }> {
    try {
        const text = await readFile('/proc/meminfo', 'utf8');
        const kb = (key: string): number | null => {
            const m = new RegExp(`^${key}:\\s+(\\d+) kB$`, 'm').exec(text);
            return m ? Number(m[1]) * 1024 : null;
        };
        return { total: kb('MemTotal'), available: kb('MemAvailable') };
    } catch {
        return { total: null, available: null };
    }
}

export async function ReadResourcePressure(opts: {
    artifactDir?: string;
    workDir?: string;
    runDirCount?: number | null;
    activeSyncCount?: number;
} = {}): Promise<ResourcePressureReading> {
    const heap = v8.getHeapStatistics();
    const mem = process.memoryUsage();
    const artifactDir = opts.artifactDir ?? join(process.cwd(), 'logs', 'integration-runs');
    const workDir = opts.workDir ?? process.env.RSU_WORK_DIR ?? process.cwd();

    const [art, work, host] = await Promise.all([volume(artifactDir), volume(workDir), hostMemory()]);
    const limit = heap.heap_size_limit;

    return {
        HeapUsedBytes: heap.used_heap_size,
        HeapLimitBytes: limit,
        HeapUsedFraction: limit > 0 ? heap.used_heap_size / limit : 0,
        ResidentBytes: mem.rss,
        HostMemTotalBytes: host.total,
        HostMemAvailableBytes: host.available,
        ResidentFraction: host.total && host.total > 0 ? mem.rss / host.total : null,
        ArtifactDiskFreeBytes: art.free,
        ArtifactDiskTotalBytes: art.total,
        WorkDirFreeBytes: work.free,
        WorkDirTotalBytes: work.total,
        RunDirCount: opts.runDirCount ?? null,
        ActiveSyncCount: opts.activeSyncCount ?? 0,
    };
}

/** Pressure severities, in the order a caller should act on them. */
export type PressureCode = 'HOST_MEMORY_PRESSURE' | 'HOST_DISK_PRESSURE';

export interface PressureFinding {
    Code: PressureCode;
    /** Plain enough to show a customer. No paths, no byte counts without units. */
    Message: string;
    /** 0..1 of the relevant ceiling, so a caller can rank findings. */
    Fraction: number;
}

/**
 * Default thresholds. Deliberately generous: this fires to WARN, ahead of the failure, and a
 * warning nobody can act on is noise. 0.85 heap leaves room to finish a batch and checkpoint;
 * 500 MB of disk is roughly one large migration plus a compile.
 */
export const HEAP_WARN_FRACTION = 0.85;
export const DISK_WARN_FREE_BYTES = 500 * 1024 * 1024;
/**
 * Resident set as a fraction of host RAM, above which a sync is heading for an OOM kill.
 *
 * Lower than the heap threshold on purpose. The heap ceiling is a wall V8 enforces, so 0.85 of it
 * still leaves the process alive to checkpoint. The host has no such wall — crossing it is a
 * SIGKILL with no stack, no run record and no chance to save a watermark, so the warning has to
 * arrive with enough headroom left to actually shed load. At 0.70 of a 3,830 MB box that is ~1.1 GB
 * of room, which is several batches' worth of time to halve concurrency and drain.
 */
export const RESIDENT_WARN_FRACTION = 0.70;

export function EvaluatePressure(
    r: ResourcePressureReading,
    heapWarnFraction = HEAP_WARN_FRACTION,
    diskWarnFreeBytes = DISK_WARN_FREE_BYTES,
    residentWarnFraction = RESIDENT_WARN_FRACTION,
): PressureFinding[] {
    const out: PressureFinding[] = [];
    // Two independent ways to run out of memory, and the RSS one is the one that kills. Report the
    // WORSE of the two under a single code so a caller has one number to act on: heap exhaustion is
    // a V8 abort the process can sometimes survive, while crossing the host's limit is a SIGKILL.
    const heapFrac = r.HeapLimitBytes > 0 ? r.HeapUsedFraction : 0;
    const rssFrac = r.ResidentFraction ?? 0;
    const worst = Math.max(heapFrac >= heapWarnFraction ? heapFrac : 0, rssFrac >= residentWarnFraction ? rssFrac : 0);
    if (worst > 0) {
        const hostBound = rssFrac >= residentWarnFraction && rssFrac >= heapFrac;
        out.push({
            Code: 'HOST_MEMORY_PRESSURE',
            Fraction: worst,
            Message: hostBound
                ? `This workspace is using ${Math.round(rssFrac * 100)}% of its machine's memory. Syncing fewer tables at once will help; if it keeps happening on a normal sync, this workspace needs a larger size.`
                : `This workspace is using ${Math.round(heapFrac * 100)}% of the memory available to it. A large sync may not finish; running fewer at once, or a smaller batch size, will help.`,
        });
    }
    // Either volume filling stops a sync: artifacts are the run's own record, and the work dir is
    // where RSU writes a migration and compiles. Report the tighter of the two.
    const disks = [r.ArtifactDiskFreeBytes, r.WorkDirFreeBytes].filter((v): v is number => v !== null);
    if (disks.length > 0) {
        const free = Math.min(...disks);
        if (free <= diskWarnFreeBytes) {
            out.push({
                Code: 'HOST_DISK_PRESSURE',
                Fraction: 1,
                Message: `This workspace has ${Math.max(0, Math.round(free / (1024 * 1024)))} MB of disk left. Syncs and schema updates write to disk and will start failing; older run history can be cleared to recover space.`,
            });
        }
    }
    return out;
}

/**
 * Classify a thrown error as running out of disk.
 *
 * Sits beside the DB-contention classifier for the same reason: without it, ENOSPC surfaces as a
 * generic failure and the customer is told the sync failed, not that the disk is full — which is
 * the one thing that would let them fix it.
 */
export function IsOutOfSpaceError(err: unknown): boolean {
    const code = (err as { code?: unknown } | null)?.code;
    if (code === 'ENOSPC' || code === 'EDQUOT') return true;
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return /ENOSPC|no space left on device|disk quota exceeded/i.test(msg);
}

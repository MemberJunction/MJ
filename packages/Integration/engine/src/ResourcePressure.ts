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
import { statfs } from 'node:fs/promises';
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

    const [art, work] = await Promise.all([volume(artifactDir), volume(workDir)]);
    const limit = heap.heap_size_limit;

    return {
        HeapUsedBytes: heap.used_heap_size,
        HeapLimitBytes: limit,
        HeapUsedFraction: limit > 0 ? heap.used_heap_size / limit : 0,
        ResidentBytes: mem.rss,
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

export function EvaluatePressure(
    r: ResourcePressureReading,
    heapWarnFraction = HEAP_WARN_FRACTION,
    diskWarnFreeBytes = DISK_WARN_FREE_BYTES,
): PressureFinding[] {
    const out: PressureFinding[] = [];
    if (r.HeapLimitBytes > 0 && r.HeapUsedFraction >= heapWarnFraction) {
        out.push({
            Code: 'HOST_MEMORY_PRESSURE',
            Fraction: r.HeapUsedFraction,
            Message: `This workspace is using ${Math.round(r.HeapUsedFraction * 100)}% of the memory available to it. A large sync may not finish; running fewer at once, or a smaller batch size, will help.`,
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

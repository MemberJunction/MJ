/**
 * rig.test.ts — the rig's start-up order: it prints the target database first (dry run included, and
 * never a credential), and refuses a repo output path or a database that does not look like a
 * development one before it connects.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunMeasurementRig } from '../../pipeline-type-measurement/rig';
import type { RigDependencies, RigSession } from '../../pipeline-type-measurement/rig';
import type { MeasurementBackend, MeasurementIO } from '../../pipeline-type-measurement/run';

/** The rig's full settings, credentials included, as `LoadDbConfig` returns them. */
interface FullDbSettings {
    Host: string;
    Port: number;
    User: string;
    Password: string;
    Database: string;
    Platform: string;
}

const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function outDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'pipeline-measure-rig-'));
    made.push(dir);
    return join(dir, 'report');
}

function argv(out: string, ...extra: string[]): string[] {
    return ['--entity', 'MJ: Actions', '--text-fields', 'Name', '--label-field', 'Category', '--values', 'A,B', '--llm-prompt', 'LLM prompt', '--out', out, ...extra];
}

/** A backend with enough for a dry run; a live call would throw. */
function dryRunBackend(): MeasurementBackend {
    const noLiveCalls = (): never => {
        throw new Error('a dry run made a live call');
    };
    return {
        LoadCandidates: async () => ({ LabelColumn: 'Category', Records: [{ RecordID: 'r1', Label: 'A' }, { RecordID: 'r2', Label: 'B' }] }),
        LoadDescriptionSources: async () => ({ A: 'About A', B: 'About B' }),
        ResolvePrompts: async () => ({ LLM: { PromptID: 'llm-id', FirstChoiceModel: 'Chat Model' }, Decision: { PromptID: 'decision-id', FirstChoiceModel: 'Jev' } }),
        CreateBatchProcessor: noLiveCalls,
        ReadPromptRunCosts: noLiveCalls,
    };
}

function rig(database: string) {
    const lines: string[] = [];
    const settings: FullDbSettings = { Host: 'localhost', Port: 1436, User: 'SECRET-USER', Password: 'SECRET-PASSWORD', Database: database, Platform: 'sqlserver' };
    const close = vi.fn<RigSession['Close']>(async () => undefined);
    const io: MeasurementIO = { Log: (line) => lines.push(line), Now: () => 0, Timestamp: () => '2026-09-30T00:00:00.000Z', WriteFile: () => undefined };
    const deps = {
        LoadDatabaseTarget: vi.fn<RigDependencies<FullDbSettings>['LoadDatabaseTarget']>(async () => settings),
        Connect: vi.fn<RigDependencies<FullDbSettings>['Connect']>(async () => ({ Backend: dryRunBackend(), Close: close })),
        IO: io,
    } satisfies RigDependencies<FullDbSettings>;
    return { deps, lines, close, settings };
}

describe('RunMeasurementRig', () => {
    it('prints the target database first on a dry run, without its credentials, then connects and closes', async () => {
        const { deps, lines, close, settings } = rig('MJ_6_2_0_CLEAN_dedupe_stt');
        const outcome = await RunMeasurementRig(argv(outDir(), '--dry-run'), deps);

        expect(outcome.DryRun).toBe(true);
        expect(lines[0]).toBe('Database: MJ_6_2_0_CLEAN_dedupe_stt on localhost:1436 (sqlserver)');
        expect(lines.join('\n')).not.toMatch(/SECRET/);
        expect(deps.Connect).toHaveBeenCalledWith(settings, expect.objectContaining({ DryRun: true }));
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('refuses a database whose name does not look like a development one, after naming it and before connecting', async () => {
        const { deps, lines } = rig('MemberJunction');
        await expect(RunMeasurementRig(argv(outDir(), '--dry-run'), deps)).rejects.toThrow(/^Refusing to run against MemberJunction on localhost:1436.*pass --allow-db MemberJunction\.$/);
        expect(lines).toEqual(['Database: MemberJunction on localhost:1436 (sqlserver)']);
        expect(deps.Connect).not.toHaveBeenCalled();
    });

    it('runs against that database when --allow-db names it', async () => {
        const { deps } = rig('MemberJunction');
        await expect(RunMeasurementRig(argv(outDir(), '--dry-run', '--allow-db', 'MemberJunction'), deps)).resolves.toMatchObject({ DryRun: true });
        expect(deps.Connect).toHaveBeenCalledTimes(1);
    });

    it('refuses an --allow-db that names another database', async () => {
        const { deps } = rig('MemberJunction');
        await expect(RunMeasurementRig(argv(outDir(), '--allow-db', 'MJ_Dev'), deps)).rejects.toThrow(/--allow-db 'MJ_Dev' does not name the configured database/);
        expect(deps.Connect).not.toHaveBeenCalled();
    });

    it('refuses an output path inside this repository before connecting', async () => {
        const { deps, lines } = rig('MJ_Dev');
        const insideRepo = join(dirname(fileURLToPath(import.meta.url)), 'report-out');
        await expect(RunMeasurementRig(argv(insideRepo, '--dry-run'), deps)).rejects.toThrow(/inside the git working tree/);
        expect(lines[0]).toBe('Database: MJ_Dev on localhost:1436 (sqlserver)');
        expect(deps.Connect).not.toHaveBeenCalled();
    });

    it('refuses bad arguments before reading the database settings', async () => {
        const { deps } = rig('MJ_Dev');
        await expect(RunMeasurementRig(['--entity', 'MJ: Actions'], deps)).rejects.toThrow(/is required/);
        expect(deps.LoadDatabaseTarget).not.toHaveBeenCalled();
    });

    it('closes the connection when the measurement fails', async () => {
        const { deps, close } = rig('MJ_Dev');
        deps.Connect.mockResolvedValueOnce({ Backend: { ...dryRunBackend(), LoadCandidates: async () => ({ LabelColumn: 'Category', Records: [] }) }, Close: close });
        await expect(RunMeasurementRig(argv(outDir(), '--dry-run'), deps)).rejects.toThrow(/No MJ: Actions records/);
        expect(close).toHaveBeenCalledTimes(1);
    });
});

/**
 * Where MJServer is in its startup, for the startup gate ({@link CreateStartupGate}) and the health
 * endpoints.
 *
 * `Serve()` binds its port first and boots behind that gate, so a probe gets an answer (and the phase
 * the server is in) instead of a refused connection while a slow start runs.
 */
import { BaseSingleton } from '@memberjunction/global';

/** `starting` until the bootstrap finishes, then `ready`; `failed` when it threw. */
export type StartupStatus = 'starting' | 'ready' | 'failed';

/** Where the boot is, for the readiness endpoint while the server is not ready. */
export interface StartupStatusReport {
    Status: StartupStatus;
    Phase: string;
    PhaseElapsedMs: number;
    ElapsedMs: number;
}

export class MJServerStartupState extends BaseSingleton<MJServerStartupState> {
    private status: StartupStatus = 'starting';
    private phase = 'Starting';
    private startedAt = Date.now();
    private phaseStartedAt = Date.now();
    private error: Error | null = null;

    /** Use {@link MJServerStartupState.Instance}. */
    public constructor() {
        super();
    }

    public static get Instance(): MJServerStartupState {
        return MJServerStartupState.getInstance<MJServerStartupState>();
    }

    public get Status(): StartupStatus { return this.status; }
    public get Phase(): string { return this.phase; }
    public get StartedAt(): number { return this.startedAt; }
    public get PhaseStartedAt(): number { return this.phaseStartedAt; }
    /** The error the bootstrap failed with; null unless {@link Status} is `failed`. */
    public get Error(): Error | null { return this.error; }
    public get IsReady(): boolean { return this.status === 'ready'; }

    /** Starts a new boot: `starting`, clock reset. */
    public Begin(now: number = Date.now()): void {
        this.status = 'starting';
        this.phase = 'Starting';
        this.startedAt = now;
        this.phaseStartedAt = now;
        this.error = null;
    }

    /** Records the phase the bootstrap entered. Ignored once the boot has finished either way. */
    public SetPhase(phase: string, now: number = Date.now()): void {
        if (this.status !== 'starting') return;
        this.phase = phase;
        this.phaseStartedAt = now;
    }

    /** The bootstrap finished: requests now reach the app. */
    public MarkReady(): void {
        this.status = 'ready';
        this.error = null;
    }

    /** The bootstrap threw. The phase it was in is kept, so the health endpoint names it. */
    public MarkFailed(error: Error): void {
        this.status = 'failed';
        this.error = error;
    }

    public Report(now: number = Date.now()): StartupStatusReport {
        return {
            Status: this.status,
            Phase: this.phase,
            PhaseElapsedMs: Math.max(0, now - this.phaseStartedAt),
            ElapsedMs: Math.max(0, now - this.startedAt),
        };
    }
}

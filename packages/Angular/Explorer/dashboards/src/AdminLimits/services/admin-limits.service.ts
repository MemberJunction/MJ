import { Injectable } from '@angular/core';
import type { IMetadataProvider, RemoteOpResult } from '@memberjunction/core';
import {
    LimitsGetDiagnosticsOperation,
    LimitsPauseRunOperation,
    LimitsResumePausedRunOperation,
    type LimitsGetDiagnosticsInput,
    type LimitsGetDiagnosticsOutput,
    type LimitsPauseRunInput,
    type LimitsPauseRunOutput,
    type LimitsResumePausedRunInput,
    type LimitsResumePausedRunOutput,
} from '@memberjunction/ai-core-plus';

/**
 * Provider-scoped service invoking the `Limits.*` `BaseRemotableOperation` endpoints.
 * Every method accepts the caller's `IMetadataProvider` so multi-provider Explorer shells
 * route cleanly without reaching for a global provider singleton.
 */
@Injectable({
    providedIn: 'root',
})
export class AdminLimitsService {
    /**
     * Loads resolved 5-tier execution limits, approved backstops, tier provenance,
     * multi-scope budget utilization, deterministic progress signals, fast judge reasons,
     * and active/paused run diagnostics via `Limits.GetDiagnostics`.
     */
    public async GetDiagnostics(
        input: LimitsGetDiagnosticsInput,
        provider: IMetadataProvider,
    ): Promise<LimitsGetDiagnosticsOutput> {
        return this.unwrapResult(
            new LimitsGetDiagnosticsOperation().Execute(input, { provider }),
            'Limits.GetDiagnostics',
        );
    }

    /**
     * Approves a paused run's checkpoint with optional budget extensions and resumes it
     * non-destructively via `Limits.ResumePausedRun`.
     */
    public async ResumePausedRun(
        input: LimitsResumePausedRunInput,
        provider: IMetadataProvider,
    ): Promise<LimitsResumePausedRunOutput> {
        return this.unwrapResult(
            new LimitsResumePausedRunOperation().Execute(input, { provider }),
            'Limits.ResumePausedRun',
        );
    }

    /**
     * Non-destructively pauses an active `Running` agent run with a persisted checkpoint
     * via `Limits.PauseRun`.
     */
    public async PauseRun(
        input: LimitsPauseRunInput,
        provider: IMetadataProvider,
    ): Promise<LimitsPauseRunOutput> {
        return this.unwrapResult(
            new LimitsPauseRunOperation().Execute(input, { provider }),
            'Limits.PauseRun',
        );
    }

    private async unwrapResult<T>(pending: Promise<RemoteOpResult<T>>, key: string): Promise<T> {
        const result = await pending;
        if (!result.Success || result.Output === undefined) {
            throw new Error(`${key} failed (${result.ResultCode ?? 'UNKNOWN'}): ${result.ErrorMessage ?? 'no details'}`);
        }
        return result.Output;
    }
}

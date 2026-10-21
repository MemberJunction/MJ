/** Subsystem checked by `VideoStudio.SetupHealth`. */
export type VideoStudioSetupHealthCheckKey = 'Storage' | 'Render' | 'Models';

/** Severity of one setup health check in `VideoStudio.SetupHealth`. */
export type VideoStudioSetupHealthCheckStatus = 'OK' | 'Warning' | 'Error';

/** One subsystem check returned by `VideoStudio.SetupHealth`. */
export interface VideoStudioSetupHealthCheck {
    /** Subsystem identifier (`Storage`, `Render`, or `Models`). */
    Key: VideoStudioSetupHealthCheckKey;
    /** Check severity (`OK`, `Warning`, or `Error`). */
    Status: VideoStudioSetupHealthCheckStatus;
    /** Short human-readable heading for the subsystem check. */
    Title: string;
    /** Summary of the check finding. */
    Message: string;
    /** Actionable remediation step when the check is not `OK`. */
    Action?: string;
    /** Optional supplementary diagnostic lines (such as tool versions, error strings, or per-preset details). */
    Details?: string[];
}

/** Output of `VideoStudio.SetupHealth`. */
export interface VideoStudioSetupHealthOutput {
    /** True when no check reported `Status === 'Error'`. */
    Healthy: boolean;
    /** Ordered check results for Storage, Render, and Models. */
    Checks: VideoStudioSetupHealthCheck[];
}

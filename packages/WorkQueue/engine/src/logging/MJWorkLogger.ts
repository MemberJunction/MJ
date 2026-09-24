import { LogError, LogStatus } from '@memberjunction/core';
import type { WorkJson, WorkLogger } from '@memberjunction/work-queue-core';

/** WorkLogger backed by MJ's LogStatus / LogError. */
export class MJWorkLogger implements WorkLogger {
    constructor(private readonly prefix = '[WorkQueue]') {}

    public Info(message: string, data?: Record<string, WorkJson>): void {
        LogStatus(this.format(message, data));
    }

    public Warn(message: string, data?: Record<string, WorkJson>): void {
        LogStatus(this.format(`WARNING: ${message}`, data));
    }

    public Error(message: string, error?: Error, data?: Record<string, WorkJson>): void {
        LogError(this.format(error ? `${message}: ${error.message}` : message, data));
    }

    private format(message: string, data?: Record<string, WorkJson>): string {
        return data ? `${this.prefix} ${message} ${JSON.stringify(data)}` : `${this.prefix} ${message}`;
    }
}

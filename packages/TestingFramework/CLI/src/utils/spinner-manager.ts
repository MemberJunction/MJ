/**
 * @fileoverview Spinner management for CLI progress indication
 * @module @memberjunction/testing-cli
 */

import ora from 'ora-classic';
import type { Ora } from 'ora-classic';

/**
 * Spinner manager for CLI operations
 */
export class SpinnerManager {
    private spinner: Ora | null = null;

    /**
     * Start a spinner with the given message
     */
    Start(message: string): void {
        if (this.spinner) {
            this.spinner.stop();
        }
        this.spinner = ora(message).start();
    }

    /** @deprecated Use {@link Start}. */
    start(message: string): void {
        return this.Start(message);
    }

    /**
     * Update spinner message
     */
    Update(message: string): void {
        if (this.spinner) {
            this.spinner.text = message;
        }
    }

    /** @deprecated Use {@link Update}. */
    update(message: string): void {
        return this.Update(message);
    }

    /**
     * Stop spinner with success message
     */
    Succeed(message?: string): void {
        if (this.spinner) {
            this.spinner.succeed(message);
            this.spinner = null;
        }
    }

    /** @deprecated Use {@link Succeed}. */
    succeed(message?: string): void {
        return this.Succeed(message);
    }

    /**
     * Stop spinner with failure message
     */
    Fail(message?: string): void {
        if (this.spinner) {
            this.spinner.fail(message);
            this.spinner = null;
        }
    }

    /** @deprecated Use {@link Fail}. */
    fail(message?: string): void {
        return this.Fail(message);
    }

    /**
     * Stop spinner with warning message
     */
    Warn(message?: string): void {
        if (this.spinner) {
            this.spinner.warn(message);
            this.spinner = null;
        }
    }

    /** @deprecated Use {@link Warn}. */
    warn(message?: string): void {
        return this.Warn(message);
    }

    /**
     * Stop spinner with info message
     */
    Info(message?: string): void {
        if (this.spinner) {
            this.spinner.info(message);
            this.spinner = null;
        }
    }

    /** @deprecated Use {@link Info}. */
    info(message?: string): void {
        return this.Info(message);
    }

    /**
     * Stop spinner without any message
     */
    Stop(): void {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
        }
    }

    /** @deprecated Use {@link Stop}. */
    stop(): void {
        return this.Stop();
    }

    /**
     * Check if spinner is currently running
     */
    get IsSpinning(): boolean {
        return this.spinner !== null;
    }

    /** @deprecated Use {@link IsSpinning}. */
    get isSpinning(): boolean {
        return this.IsSpinning;
    }
}

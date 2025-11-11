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
    start(message: string): void {
        if (this.spinner) {
            this.spinner.stop();
        }
        this.spinner = ora(message).start();
    }

    /**
     * Update spinner message
     */
    update(message: string): void {
        if (this.spinner) {
            this.spinner.text = message;
        }
    }

    /**
     * Stop spinner with success message
     */
    succeed(message?: string): void {
        if (this.spinner) {
            this.spinner.succeed(message);
            this.spinner = null;
        }
    }

    /**
     * Stop spinner with failure message
     */
    fail(message?: string): void {
        if (this.spinner) {
            this.spinner.fail(message);
            this.spinner = null;
        }
    }

    /**
     * Stop spinner with warning message
     */
    warn(message?: string): void {
        if (this.spinner) {
            this.spinner.warn(message);
            this.spinner = null;
        }
    }

    /**
     * Stop spinner with info message
     */
    info(message?: string): void {
        if (this.spinner) {
            this.spinner.info(message);
            this.spinner = null;
        }
    }

    /**
     * Stop spinner without any message
     */
    stop(): void {
        if (this.spinner) {
            this.spinner.stop();
            this.spinner = null;
        }
    }

    /**
     * Check if spinner is currently running
     */
    get isSpinning(): boolean {
        return this.spinner !== null;
    }
}

import { LogStatus } from '@memberjunction/core';

/**
 * Bootstrap function called by MJ server during startup.
 * Registered via the manifest's packages.server[].startupExport field.
 */
export function registerSampleApp(): void {
    LogStatus('MJ Sample App: Server bootstrap loaded successfully.');
}

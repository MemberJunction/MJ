/**
 * @fileoverview Startup validator for encryption key configuration.
 *
 * This class is registered with @RegisterForStartup to run during server bootstrap.
 * It performs two critical validations:
 *
 * 1. **Field metadata check**: Ensures no entity fields have `Encrypt=true` with a null
 *    `EncryptionKeyID`, which would cause saves to be rejected at runtime.
 *
 * 2. **Key material accessibility**: Probes each active encryption key's source provider
 *    (env vars, config files, cloud vaults) to verify key material is actually accessible.
 *    This catches misconfigurations (missing env vars, unreachable vaults) at startup
 *    rather than at the first save/load attempt.
 *
 * Priority is set to 200 (runs after EncryptionEngineBase at default 100) to ensure
 * encryption metadata is loaded before validation begins.
 *
 * @module @memberjunction/encryption
 */

import { IMetadataProvider, IStartupSink, Metadata, RegisterForStartup, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { EncryptionEngine } from './EncryptionEngine';

/**
 * Validates encryption key configuration at server startup.
 *
 * Registered with `@RegisterForStartup` at priority 200 (after metadata engines load).
 * Severity is 'error' — validation failures are logged prominently but don't prevent
 * startup, allowing the server to come up for non-encryption operations while making
 * the misconfiguration impossible to miss.
 */
@RegisterForStartup({ priority: 200, severity: 'error', description: 'Encryption key material validation' })
export class EncryptionStartupValidator extends BaseSingleton<EncryptionStartupValidator> implements IStartupSink {
    protected constructor() {
        super();
    }

    public static get Instance(): EncryptionStartupValidator {
        return super.getInstance<EncryptionStartupValidator>();
    }

    /**
     * Called by StartupManager during server bootstrap.
     *
     * Performs two critical validations:
     * 1. Checks that no entity fields have `Encrypt=true` with a null `EncryptionKeyID`
     * 2. Validates that all active encryption keys have accessible key material
     */
    public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const engine = EncryptionEngine.Instance;
        await engine.Config(false, contextUser);

        let hasErrors = false;

        // Phase 1: Check for fields marked Encrypt=true but missing EncryptionKeyID
        const misconfiguredFields = this.findMisconfiguredEncryptedFields(provider);
        if (misconfiguredFields.length > 0) {
            this.logMisconfiguredFieldsWarning(misconfiguredFields);
            hasErrors = true;
        }

        // Phase 2: Validate all active keys have accessible key material
        const activeKeys = engine.ActiveEncryptionKeys;
        if (activeKeys.length > 0) {
            const results = await engine.ValidateAllKeys(contextUser);
            const failures = results.filter(r => !r.IsAccessible);

            if (failures.length > 0) {
                this.logKeyValidationFailures(failures, results.length);
                hasErrors = true;
            } else {
                console.log(`  ✓ All ${results.length} encryption key(s) validated successfully`);
            }
        }

        if (hasErrors) {
            throw new Error(
                'Encryption configuration validation failed. ' +
                'See console output above for details and remediation steps. ' +
                'The server will continue to start, but encrypted field operations may fail.'
            );
        }
    }

    /**
     * Finds entity fields that have Encrypt=true but no EncryptionKeyID set.
     */
    private findMisconfiguredEncryptedFields(provider?: IMetadataProvider): Array<{ entityName: string; fieldName: string }> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const misconfigured: Array<{ entityName: string; fieldName: string }> = [];

        for (const entity of md.Entities) {
            for (const field of entity.Fields) {
                if (field.Encrypt && !field.EncryptionKeyID) {
                    misconfigured.push({
                        entityName: entity.Name,
                        fieldName: field.Name
                    });
                }
            }
        }

        return misconfigured;
    }

    /**
     * Logs a prominent warning about fields configured for encryption but missing key references.
     */
    private logMisconfiguredFieldsWarning(fields: Array<{ entityName: string; fieldName: string }>): void {
        const border = '═'.repeat(70);
        const lines = [
            '',
            `╔${border}╗`,
            `║  ENCRYPTION CONFIGURATION WARNING`.padEnd(71) + `║`,
            `║`.padEnd(71) + `║`,
            `║  The following fields are marked Encrypt=true but have no`.padEnd(71) + `║`,
            `║  EncryptionKeyID configured. Data in these fields will be REJECTED`.padEnd(71) + `║`,
            `║  on save to prevent storing cleartext sensitive data.`.padEnd(71) + `║`,
            `║`.padEnd(71) + `║`,
        ];

        for (const f of fields) {
            lines.push(`║    • ${f.entityName}.${f.fieldName}`.padEnd(71) + `║`);
        }

        lines.push(`║`.padEnd(71) + `║`);
        lines.push(`║  Fix: Set EncryptionKeyID on these EntityField records.`.padEnd(71) + `║`);
        lines.push(`╚${border}╝`);
        lines.push('');

        console.error(lines.join('\n'));
    }

    /**
     * Logs a prominent error about encryption keys that cannot access their key material.
     */
    private logKeyValidationFailures(
        failures: Array<{ KeyName: string; KeyId: string; SourceType: string; LookupValue: string; Error?: string }>,
        totalKeys: number
    ): void {
        const border = '═'.repeat(70);
        const lines = [
            '',
            `╔${border}╗`,
            `║  ENCRYPTION KEY VALIDATION FAILED`.padEnd(71) + `║`,
            `║`.padEnd(71) + `║`,
            `║  ${failures.length} of ${totalKeys} active encryption key(s) cannot access key material.`.padEnd(71) + `║`,
            `║  Encrypted fields using these keys will FAIL on save/load.`.padEnd(71) + `║`,
            `║`.padEnd(71) + `║`,
        ];

        for (const f of failures) {
            lines.push(`║  Key: "${f.KeyName}"`.padEnd(71) + `║`);
            lines.push(`║    Source: ${f.SourceType}`.padEnd(71) + `║`);
            lines.push(`║    Lookup: ${f.LookupValue}`.padEnd(71) + `║`);
            if (f.Error) {
                // Wrap long error messages
                const errorPrefix = '    Error: ';
                const maxLineLen = 68 - errorPrefix.length;
                const errorLines = this.wrapText(f.Error, maxLineLen);
                for (let i = 0; i < errorLines.length; i++) {
                    const prefix = i === 0 ? errorPrefix : ' '.repeat(errorPrefix.length);
                    lines.push(`║  ${prefix}${errorLines[i]}`.padEnd(71) + `║`);
                }
            }
            lines.push(`║`.padEnd(71) + `║`);
        }

        lines.push(`╚${border}╝`);
        lines.push('');

        console.error(lines.join('\n'));
    }

    /**
     * Wraps text to the specified max line length, breaking at word boundaries.
     */
    private wrapText(text: string, maxLen: number): string[] {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let current = '';

        for (const word of words) {
            if (current.length + word.length + 1 > maxLen && current.length > 0) {
                lines.push(current);
                current = word;
            } else {
                current = current ? `${current} ${word}` : word;
            }
        }
        if (current) lines.push(current);
        return lines.length > 0 ? lines : [''];
    }
}

/**
 * Schema drift guard for User Impersonation secret-entity isolation (PR #6958 Item 7).
 *
 * Scans the generated core entity classes in `packages/MJCoreEntities/src/generated/entities/__mj.ts`
 * for every entity that declares a field whose name matches `/Token|Secret|APIKey|Password/i`.
 *
 * Every matching entity MUST either:
 * 1. Be explicitly blocked during impersonation (`IMPERSONATION_FORBIDDEN_ENTITY_NAMES`), OR
 * 2. Appear in `NON_SECRET_OPERATIONAL_FIELD_ALLOWLIST` with the EXACT set of benign operational
 *    fields (LLM token counters, distributed lease/lock/fence tokens, sync cursors).
 *
 * If a future migration adds a secret/token/API-key/password column to a new OR existing entity
 * (even an allowlisted entity!), this test fails until the entity is added to
 * `IMPERSONATION_FORBIDDEN_ENTITY_NAMES` (or explicitly audited and allowlisted here).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    IMPERSONATION_FORBIDDEN_ENTITY_NAMES,
    IsEntityForbiddenDuringImpersonation,
    StampImpersonationSession,
} from '../auth/impersonationGuard.js';
import { UserInfo } from '@memberjunction/core';
import { RegisterServerUserImpersonationConfig } from '../userImpersonationConfigUnits.js';

const SECRET_FIELD_NAME_PATTERN = /Token|Secret|APIKey|Password/i;

/**
 * Explicitly audited operational fields that match `/Token|Secret|APIKey|Password/i` by substring
 * but do NOT hold bearer secrets, credentials, or user access tokens:
 * - LLM token usage / window limits (integers / timestamps)
 * - Distributed scheduler/worker concurrency lock/lease/fence tokens
 * - External calendar incremental sync cursors (`SyncToken`)
 */
const NON_SECRET_OPERATIONAL_FIELD_ALLOWLIST: Record<string, readonly string[]> = {
    'MJ: AI Agent Runs': [
        'TotalTokensUsed',
        'TotalPromptTokensUsed',
        'TotalCompletionTokensUsed',
        'TotalTokensUsedRollup',
        'TotalPromptTokensUsedRollup',
        'TotalCompletionTokensUsedRollup',
        'TotalCacheReadTokensUsed',
        'TotalCacheWriteTokensUsed',
    ],
    'MJ: AI Agent Types': ['ContextWindowMaxTokens'],
    'MJ: AI Agents': ['MaxTokensPerRun', 'ContextWindowMaxTokens'],
    'MJ: AI Model Vendors': ['MaxInputTokens', 'MaxOutputTokens'],
    'MJ: AI Models': ['InputTokenLimit'],
    'MJ: AI Prompt Runs': [
        'TokensUsed',
        'TokensPrompt',
        'TokensCompletion',
        'TokensUsedRollup',
        'TokensPromptRollup',
        'TokensCompletionRollup',
        'FirstTokenTime',
        'TokensCacheRead',
        'TokensCacheWrite',
        'TokensCacheReadRollup',
        'TokensCacheWriteRollup',
    ],
    'MJ: Calendar Sync States': ['SyncToken'],
    'MJ: Company Integration Runs': ['OwnerToken', 'FenceToken'],
    'MJ: Content Process Run Details': ['TotalTokensUsed'],
    'MJ: Experiment Session Iterations': ['TokensUsed'],
    'MJ: ML Training Runs': ['TokensUsed'],
    'MJ: Scheduled Jobs': ['LockToken'],
    'MJ: Work Queue Deliveries': ['LeaseToken'],
};

function scanGeneratedEntitySecretFields(schemaFilePath: string): Map<string, string[]> {
    const src = fs.readFileSync(schemaFilePath, 'utf8');
    const chunks = src.split(/@RegisterClass\(BaseEntity,\s*/);
    const result = new Map<string, string[]>();

    for (let i = 1; i < chunks.length; i++) {
        const chunk = chunks[i];
        const nameMatch = chunk.match(/^['"]([^'"]+)['"]\)/);
        if (!nameMatch) {
            continue;
        }
        const entityName = nameMatch[1];
        const getterRe = /^\s*(?:public\s+)?get\s+(\w+)\s*\(/gm;
        const fields: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = getterRe.exec(chunk)) !== null) {
            if (SECRET_FIELD_NAME_PATTERN.test(match[1])) {
                fields.push(match[1]);
            }
        }
        if (fields.length > 0) {
            result.set(entityName, fields);
        }
    }

    return result;
}

describe('ImpersonationSecretEntityCompliance — schema secret-field drift guard', () => {
    it('blocks every core entity carrying a Token/Secret/APIKey/Password field unless explicitly allowlisted as non-secret operational metadata', () => {
        const schemaPath = path.resolve(
            __dirname,
            '../../../MJCoreEntities/src/generated/entities/__mj.ts'
        );
        expect(fs.existsSync(schemaPath), `Generated schema not found at ${schemaPath}`).toBe(true);

        const entityFields = scanGeneratedEntitySecretFields(schemaPath);
        // Sanity check: the scan must actually find real entities so a broken regex cannot pass vacuously
        expect(entityFields.size).toBeGreaterThanOrEqual(20);

        const forbiddenLower = new Set(
            IMPERSONATION_FORBIDDEN_ENTITY_NAMES.map((name) => name.trim().toLowerCase())
        );

        RegisterServerUserImpersonationConfig({ enabled: true, allowWrites: true });
        const impersonatedUser = new UserInfo(null, {
            ID: '22222222-2222-4222-8222-222222222222',
            Name: 'Bob',
            Email: 'bob@example.com',
        });
        StampImpersonationSession(impersonatedUser, {
            apiKeyId: '66666666-6666-4666-8666-666666666666',
            mode: 'ActAs',
            readOnly: false,
            actorUserId: '11111111-1111-4111-8111-111111111111',
            targetUserId: '22222222-2222-4222-8222-222222222222',
        });

        const unguarded: string[] = [];
        try {
            for (const [entityName, fields] of entityFields.entries()) {
                if (forbiddenLower.has(entityName.toLowerCase())) {
                    // Verify the runtime predicate also blocks it
                    expect(
                        IsEntityForbiddenDuringImpersonation(entityName, impersonatedUser),
                        `${entityName} is in IMPERSONATION_FORBIDDEN_ENTITY_NAMES but IsEntityForbiddenDuringImpersonation returned false`
                    ).toBe(true);
                    continue;
                }

                const allowedFields = NON_SECRET_OPERATIONAL_FIELD_ALLOWLIST[entityName];
                if (!allowedFields) {
                    unguarded.push(
                        `${entityName} has secret-like field(s) [${fields.join(', ')}] and is NOT in IMPERSONATION_FORBIDDEN_ENTITY_NAMES or NON_SECRET_OPERATIONAL_FIELD_ALLOWLIST.`
                    );
                    continue;
                }

                const allowedSet = new Set(allowedFields);
                const unexpectedFields = fields.filter((f) => !allowedSet.has(f));
                if (unexpectedFields.length > 0) {
                    unguarded.push(
                        `${entityName} gained new un-audited secret-like field(s) [${unexpectedFields.join(', ')}] outside its operational allowlist.`
                    );
                }
            }
        } finally {
            RegisterServerUserImpersonationConfig(null);
        }

        expect(
            unguarded,
            `Found unguarded entity/field(s) matching /Token|Secret|APIKey|Password/i:\n${unguarded.join('\n')}`
        ).toEqual([]);
    });
});

/**
 * Schema Synchronization Tests
 *
 * These tests verify that GraphQL InputTypes defined in MJServer are properly
 * synchronized with their client-side usage in GraphQLDataProvider.
 *
 * PURPOSE: Prevent schema drift where server InputTypes have required fields
 * that clients don't send, causing runtime GraphQL errors like:
 *   "Field 'X' of required type 'Boolean!' was not provided"
 *
 * APPROACH: Rather than parsing client implementation (which is fragile), we:
 * 1. Parse server @InputType() classes (standardized, reliable format)
 * 2. Define explicit contract of fields the client MUST send
 * 3. Verify server required fields match the contract
 *
 * When a new required field is added to the server:
 * 1. This test fails (server has field not in contract)
 * 2. Developer updates client code to send the new field
 * 3. Developer updates CLIENT_CONTRACTS below to include the new field
 * 4. Test passes again
 *
 * @see GRAPHQL_DELETE.md for context on why these tests exist
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CLIENT CONTRACTS
 *
 * These define the fields that client code sends for each InputType the
 * GraphQLDataProvider puts on the wire. When you add a new REQUIRED field to a
 * server InputType:
 * 1. Update the client code to send the field
 * 2. Add the field name to the corresponding contract below
 *
 * Each entry names the server file that owns the @InputType so the generic
 * drift gate below can parse it. `fields` lists what the client always sends;
 * conditionally-sent optional fields (e.g. MaxRows only when provided) are noted
 * but only become gate failures if the server ever makes them required.
 *
 * This explicit contract approach is more reliable than parsing client code.
 */
const CLIENT_CONTRACTS: Record<string, {
    description: string;
    serverFile: string;
    clientFile: string;
    clientLocation: string;
    fields: string[];
}> = {
    DeleteOptionsInput: {
        description: 'Options for entity delete operations',
        serverFile: 'packages/MJServer/src/generic/DeleteOptionsInput.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'Delete() method, vars["options___"] assignment',
        fields: [
            'SkipEntityAIActions',
            'SkipEntityActions',
            'ReplayOnly',
            'IsParentEntityDelete'
        ]
    },
    RestoreContextInput: {
        description: 'Restore-lineage context mirrored onto Create/Update mutation inputs as RestoreContext___',
        serverFile: 'packages/MJServer/src/generic/RestoreContextInput.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'Save() method, vars.input["RestoreContext___"] assignment',
        fields: [
            'SourceChangeID',
            'Reason'
        ]
    },
    KeyValuePairInput: {
        description: 'Key/value pairs sent as OldValues___ on Update mutations for concurrency checking',
        serverFile: 'packages/MJServer/src/generic/KeyValuePairInput.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'Save() method, vars.input["OldValues___"] entries',
        fields: [
            'Key',
            'Value'
        ]
    },
    KeyValuePairInputType: {
        description: 'Field-name/value pairs inside CompositeKeyInputType (AfterKey cursors, GetRecordDependencies, record names)',
        serverFile: 'packages/MJServer/src/generic/KeyInputOutputTypes.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'ensureKeyValuePairValueIsString() + AfterKey serialization in InternalRunViews/RunViewsWithCacheCheck',
        fields: [
            'FieldName',
            'Value'
        ]
    },
    CompositeKeyInputType: {
        description: 'Composite primary-key wrapper (AfterKey keyset cursors, dependency/record-name lookups)',
        serverFile: 'packages/MJServer/src/generic/KeyInputOutputTypes.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'AfterKey serialization + GetRecordDependencies/GetRecordDuplicates vars',
        fields: [
            'KeyValuePairs'
        ]
    },
    RunViewByIDInput: {
        description: 'Saved-view-by-ID RunView execution',
        serverFile: 'packages/MJServer/src/generic/RunViewResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'InternalRunView()/InternalRunViews() ViewID branch innerParams',
        fields: [
            'ViewID',
            'ExtraFilter',
            'OrderBy',
            'UserSearchString',
            'Fields',
            'IgnoreMaxRows',
            'ForceAuditLog',
            'ResultType',
            'ExcludeUserViewRunID',
            'ExcludeDataFromAllPriorViewRuns',
            'OverrideExcludeFilter',
            'SaveViewResults'
            // Conditionally sent: MaxRows, StartRow, AfterKey, AuditLogDescription, BypassCache, Aggregates
        ]
    },
    RunViewByNameInput: {
        description: 'Saved-view-by-name RunView execution',
        serverFile: 'packages/MJServer/src/generic/RunViewResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'InternalRunView()/InternalRunViews() ViewName branch innerParams',
        fields: [
            'ViewName',
            'ExtraFilter',
            'OrderBy',
            'UserSearchString',
            'Fields',
            'IgnoreMaxRows',
            'ForceAuditLog',
            'ResultType',
            'ExcludeUserViewRunID',
            'ExcludeDataFromAllPriorViewRuns',
            'OverrideExcludeFilter',
            'SaveViewResults'
            // Conditionally sent: MaxRows, StartRow, AfterKey, AuditLogDescription, BypassCache, Aggregates
        ]
    },
    RunDynamicViewInput: {
        description: 'Dynamic (EntityName-based) RunView execution',
        serverFile: 'packages/MJServer/src/generic/RunViewResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'InternalRunView()/InternalRunViews() dynamic branch innerParams',
        fields: [
            'EntityName',
            'ExtraFilter',
            'OrderBy',
            'UserSearchString',
            'Fields',
            'IgnoreMaxRows',
            'ForceAuditLog',
            'ResultType'
            // Conditionally sent: MaxRows, StartRow, AfterKey, AuditLogDescription, BypassCache, Aggregates
        ]
    },
    RunViewGenericInput: {
        description: 'Batched RunViews execution (one entry per view in the batch)',
        serverFile: 'packages/MJServer/src/generic/RunViewResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'InternalRunViews() innerParams array',
        fields: [
            'EntityName',
            'ViewID',
            'ViewName',
            'ExtraFilter',
            'OrderBy',
            'UserSearchString',
            'Fields',
            'IgnoreMaxRows',
            'ForceAuditLog',
            'ResultType'
            // Conditionally sent: MaxRows, StartRow, AfterKey, AuditLogDescription, BypassCache, Aggregates,
            // and saved-view extras (ExcludeUserViewRunID, ExcludeDataFromAllPriorViewRuns, OverrideExcludeFilter, SaveViewResults)
        ]
    },
    AggregateExpressionInput: {
        description: 'Aggregate expressions attached to RunView requests',
        serverFile: 'packages/MJServer/src/generic/RunViewResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'InternalRunView()/InternalRunViews()/RunViewsWithCacheCheck() Aggregates mapping',
        fields: [
            'expression',
            'alias'
        ]
    },
    RunViewCacheStatusInput: {
        description: 'Client cache fingerprint for smart cache validation of a view',
        serverFile: 'packages/MJServer/src/generic/RunViewResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'RunViewsWithCacheCheck() cacheStatus mapping',
        fields: [
            'maxUpdatedAt',
            'rowCount'
        ]
    },
    RunViewWithCacheCheckInput: {
        description: 'Per-view envelope for the batched smart-cache-check query',
        serverFile: 'packages/MJServer/src/generic/RunViewResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'RunViewsWithCacheCheck() input mapping',
        fields: [
            'params',
            'cacheStatus'
        ]
    },
    RunQueryInput: {
        description: 'Batched RunQueries execution (one entry per query in the batch)',
        serverFile: 'packages/MJServer/src/resolvers/QueryResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'InternalRunQueries() input mapping',
        fields: [
            'QueryID',
            'QueryName',
            'CategoryID',
            'CategoryPath',
            'Parameters',
            'MaxRows',
            'StartRow',
            'ForceAuditLog',
            'AuditLogDescription',
            'Enrichment'
        ]
    },
    RunQueryCacheStatusInput: {
        description: 'Client cache fingerprint for smart cache validation of a query',
        serverFile: 'packages/MJServer/src/resolvers/QueryResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'RunQueriesWithCacheCheck() cacheStatus mapping',
        fields: [
            'maxUpdatedAt',
            'rowCount'
        ]
    },
    RunQueryWithCacheCheckInput: {
        description: 'Per-query envelope for the batched smart-cache-check query',
        serverFile: 'packages/MJServer/src/resolvers/QueryResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'RunQueriesWithCacheCheck() input mapping',
        fields: [
            'params',
            'cacheStatus'
        ]
    },
    AdhocQueryInput: {
        description: 'Ad-hoc SQL execution via ExecuteAdhocQuery',
        serverFile: 'packages/MJServer/src/resolvers/AdhocQueryResolver.ts',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'RunAdhocQuery() input construction',
        fields: [
            'SQL'
            // Conditionally sent: TimeoutSeconds, MaxRows, StartRow
        ]
    }
};

/**
 * Represents a field extracted from a GraphQL InputType
 */
interface InputTypeField {
    name: string;
    type: string;
    required: boolean;
}

/**
 * Represents an InputType definition extracted from server code
 */
interface InputTypeDefinition {
    name: string;
    fields: InputTypeField[];
    filePath: string;
}

/**
 * Given `content[index]` is a quote character (' " or `), returns the index just
 * AFTER the matching closing quote, honoring backslash escapes.
 */
function skipStringLiteral(content: string, index: number): number {
    const quote = content[index];
    let i = index + 1;
    while (i < content.length) {
        const ch = content[i];
        if (ch === '\\') {
            i += 2;
            continue;
        }
        if (ch === quote) {
            return i + 1;
        }
        i++;
    }
    return i;
}

/**
 * Given `content[openParenIndex]` is '(', returns the index of the balancing ')'.
 * Parentheses inside string literals are ignored. Returns -1 if unbalanced.
 */
function findBalancedCloseParen(content: string, openParenIndex: number): number {
    let depth = 0;
    let i = openParenIndex;
    while (i < content.length) {
        const ch = content[i];
        if (ch === "'" || ch === '"' || ch === '`') {
            i = skipStringLiteral(content, i);
            continue;
        }
        if (ch === '(') {
            depth++;
        } else if (ch === ')') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
        i++;
    }
    return -1;
}

/**
 * Extracts every `@Field(...)`-decorated property from a class body.
 *
 * Uses a balanced-paren scan for the decorator arguments rather than a regex —
 * type-graphql decorators routinely contain nested parens and parenthesized text
 * inside description strings (e.g. `"SUM(OrderTotal)"`), which a regex-based scan
 * terminates early on, mis-attributing `nullable: true` and inventing phantom
 * fields out of option-object keys.
 */
function extractFieldsFromClassBody(classBody: string): InputTypeField[] {
    const fields: InputTypeField[] = [];
    let searchFrom = 0;
    for (;;) {
        const decoratorStart = classBody.indexOf('@Field(', searchFrom);
        if (decoratorStart === -1) {
            break;
        }
        const openParen = decoratorStart + '@Field'.length;
        const closeParen = findBalancedCloseParen(classBody, openParen);
        if (closeParen === -1) {
            break;
        }
        searchFrom = closeParen + 1;

        const decoratorContent = classBody.substring(openParen + 1, closeParen);
        // The decorated property declaration immediately follows the decorator
        // (whitespace only in between): `Name?: Type;`
        const rest = classBody.substring(closeParen + 1);
        const propertyMatch = rest.match(/^\s*(?:public\s+|readonly\s+)?(\w+)\??\s*:\s*([\w.]+)/);
        if (!propertyMatch) {
            continue;
        }

        const fieldName = propertyMatch[1];
        const fieldType = propertyMatch[2];
        if (fieldName === 'constructor' || fieldType === 'void') {
            continue;
        }

        fields.push({
            name: fieldName,
            type: fieldType,
            // Nullability in the GraphQL schema comes from the DECORATOR options,
            // not from the TypeScript `?` — mirror type-graphql's semantics.
            required: !/nullable\s*:\s*true/.test(decoratorContent),
        });
    }
    return fields;
}

/**
 * Extract @InputType() decorated classes and their @Field() properties from a TypeScript file.
 *
 * @param filePath - Path to the TypeScript file
 * @returns Array of InputType definitions found in the file
 */
function extractInputTypesFromFile(filePath: string): InputTypeDefinition[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const inputTypes: InputTypeDefinition[] = [];

    // Match @InputType() decorated classes; the body runs to the first `}` at column 0
    const classPattern = /@InputType\(\)\s*(?:export\s+)?class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

    let classMatch: RegExpExecArray | null;
    while ((classMatch = classPattern.exec(content)) !== null) {
        inputTypes.push({
            name: classMatch[1],
            fields: extractFieldsFromClassBody(classMatch[2]),
            filePath,
        });
    }

    return inputTypes;
}

/**
 * Extract EntityDeleteOptions class fields from MJCore interfaces.ts
 */
function extractCoreDeleteOptionsFields(filePath: string): string[] {
    const content = fs.readFileSync(filePath, 'utf-8');

    const classPattern = /export class EntityDeleteOptions\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s;
    const match = content.match(classPattern);

    if (!match) {
        throw new Error(`Could not find EntityDeleteOptions class in ${filePath}`);
    }

    const classBody = match[1];
    const fields: string[] = [];

    const fieldPattern = /^\s*(\w+)\??:\s*boolean/gm;

    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldPattern.exec(classBody)) !== null) {
        fields.push(fieldMatch[1]);
    }

    return fields;
}

// Resolve paths relative to this test file
const TEST_DIR = path.dirname(__filename);
const GRAPHQL_PROVIDER_ROOT = path.resolve(TEST_DIR, '..');
const MJ_ROOT = path.resolve(GRAPHQL_PROVIDER_ROOT, '../../..');

describe('GraphQL Schema Synchronization', () => {
    describe('DeleteOptionsInput', () => {
        const serverFilePath = path.join(MJ_ROOT, 'packages/MJServer/src/generic/DeleteOptionsInput.ts');
        const coreFilePath = path.join(MJ_ROOT, 'packages/MJCore/src/generic/interfaces.ts');
        const contract = CLIENT_CONTRACTS['DeleteOptionsInput'];

        let serverInputType: InputTypeDefinition | undefined;
        let coreFields: string[];

        beforeAll(() => {
            if (!fs.existsSync(serverFilePath)) {
                console.warn(`Skipping schema sync tests: ${serverFilePath} not found`);
                return;
            }

            const serverTypes = extractInputTypesFromFile(serverFilePath);
            serverInputType = serverTypes.find(t => t.name === 'DeleteOptionsInput');

            if (fs.existsSync(coreFilePath)) {
                coreFields = extractCoreDeleteOptionsFields(coreFilePath);
            }
        });

        it('should find DeleteOptionsInput in MJServer', () => {
            if (!fs.existsSync(serverFilePath)) {
                return;
            }

            expect(serverInputType).toBeDefined();
            expect(serverInputType!.name).toBe('DeleteOptionsInput');
        });

        it('should have client contract defined for DeleteOptionsInput', () => {
            expect(contract).toBeDefined();
            expect(contract.fields.length).toBeGreaterThan(0);
        });

        it('should have all server required fields in client contract', () => {
            if (!serverInputType) {
                return;
            }

            const requiredServerFields = serverInputType.fields
                .filter(f => f.required)
                .map(f => f.name);

            const missingFromContract = requiredServerFields.filter(
                field => !contract.fields.includes(field)
            );

            if (missingFromContract.length > 0) {
                throw new Error(
                    `SCHEMA DRIFT DETECTED!\n\n` +
                    `Server DeleteOptionsInput has required fields not in client contract:\n` +
                    `  Missing: ${missingFromContract.join(', ')}\n\n` +
                    `To fix:\n` +
                    `1. Update ${contract.clientFile} at ${contract.clientLocation}\n` +
                    `   to send these fields with appropriate defaults\n` +
                    `2. Add the field names to CLIENT_CONTRACTS['DeleteOptionsInput'].fields\n` +
                    `   in schema-sync.test.ts`
                );
            }

            expect(missingFromContract).toEqual([]);
        });

        it('should not have extra fields in contract that server does not require', () => {
            if (!serverInputType) {
                return;
            }

            const requiredServerFields = serverInputType.fields
                .filter(f => f.required)
                .map(f => f.name);

            const extraInContract = contract.fields.filter(
                field => !requiredServerFields.includes(field)
            );

            if (extraInContract.length > 0) {
                console.warn(
                    `Client contract has fields not required by server: ${extraInContract.join(', ')}\n` +
                    `These may be optional fields or the server schema changed.`
                );
            }

            // This is a warning, not a failure - extra fields are safe to send
        });

        it('should match EntityDeleteOptions fields in MJCore', () => {
            if (!serverInputType || !coreFields) {
                return;
            }

            const serverFieldNames = serverInputType.fields.map(f => f.name);

            coreFields.forEach(coreField => {
                expect(serverFieldNames).toContain(coreField);
            });
        });

        it('should report sync status', () => {
            if (!serverInputType) {
                return;
            }

            const requiredServerFields = serverInputType.fields
                .filter(f => f.required)
                .map(f => f.name);

            console.log('\n--- DeleteOptionsInput Sync Status ---');
            console.log(`Server required fields: ${requiredServerFields.join(', ')}`);
            console.log(`Client contract fields: ${contract.fields.join(', ')}`);
            console.log(`Core EntityDeleteOptions: ${coreFields?.join(', ') || 'N/A'}`);
            console.log('--------------------------------------\n');
        });
    });

    // ────────────────────────────────────────────────────────────────────
    // Generic drift gate: EVERY InputType the client sends is contracted.
    // Adding a REQUIRED field to any of these server InputTypes without
    // updating the client (and the contract above) fails here.
    // ────────────────────────────────────────────────────────────────────
    describe.each(Object.entries(CLIENT_CONTRACTS))('%s contract', (inputTypeName, contract) => {
        const serverFilePath = path.join(MJ_ROOT, contract.serverFile);
        const serverAvailable = fs.existsSync(serverFilePath);

        it('parses the server InputType with at least one field', () => {
            if (!serverAvailable) {
                console.warn(`Skipping ${inputTypeName}: ${serverFilePath} not found`);
                return;
            }
            const serverType = extractInputTypesFromFile(serverFilePath).find(t => t.name === inputTypeName);
            expect(serverType, `@InputType ${inputTypeName} not found in ${contract.serverFile}`).toBeDefined();
            expect(serverType!.fields.length).toBeGreaterThan(0);
        });

        it('covers every server-required field in the client contract', () => {
            if (!serverAvailable) {
                return;
            }
            const serverType = extractInputTypesFromFile(serverFilePath).find(t => t.name === inputTypeName);
            expect(serverType).toBeDefined();

            const requiredServerFields = serverType!.fields
                .filter(f => f.required)
                .map(f => f.name);
            const missingFromContract = requiredServerFields.filter(f => !contract.fields.includes(f));

            if (missingFromContract.length > 0) {
                throw new Error(
                    `SCHEMA DRIFT DETECTED!\n\n` +
                    `Server ${inputTypeName} has required fields not in the client contract:\n` +
                    `  Missing: ${missingFromContract.join(', ')}\n\n` +
                    `To fix:\n` +
                    `1. Update ${contract.clientFile} at ${contract.clientLocation}\n` +
                    `   to send these fields with appropriate values\n` +
                    `2. Add the field names to CLIENT_CONTRACTS['${inputTypeName}'].fields in schema-sync.test.ts`
                );
            }
            expect(missingFromContract).toEqual([]);
        });

        it('only contracts fields that exist on the server InputType', () => {
            if (!serverAvailable) {
                return;
            }
            const serverType = extractInputTypesFromFile(serverFilePath).find(t => t.name === inputTypeName);
            expect(serverType).toBeDefined();

            // A contract field the server no longer defines means the client is sending
            // a field the schema will REJECT ("Unknown field") — that's drift too.
            const serverFieldNames = serverType!.fields.map(f => f.name);
            const unknownInContract = contract.fields.filter(f => !serverFieldNames.includes(f));
            expect(
                unknownInContract,
                `CLIENT_CONTRACTS['${inputTypeName}'] lists fields the server InputType no longer defines: ${unknownInContract.join(', ')}`
            ).toEqual([]);
        });
    });

    describe('Server InputType Parsing', () => {
        it('should correctly parse DeleteOptionsInput from server', () => {
            const serverPath = path.join(MJ_ROOT, 'packages/MJServer/src/generic/DeleteOptionsInput.ts');

            if (!fs.existsSync(serverPath)) {
                return;
            }

            const types = extractInputTypesFromFile(serverPath);

            expect(types).toHaveLength(1);
            expect(types[0].name).toBe('DeleteOptionsInput');
            expect(types[0].fields.length).toBeGreaterThanOrEqual(4);

            // All DeleteOptionsInput fields should be required
            types[0].fields.forEach(field => {
                expect(field.required).toBe(true);
            });
        });

        it('honors decorator nullability over TypeScript optionality and survives nested parens in descriptions', () => {
            const serverPath = path.join(MJ_ROOT, 'packages/MJServer/src/generic/RunViewResolver.ts');
            if (!fs.existsSync(serverPath)) {
                return;
            }

            const types = extractInputTypesFromFile(serverPath);
            const aggregate = types.find(t => t.name === 'AggregateExpressionInput');
            expect(aggregate).toBeDefined();
            // `expression` has a description containing "SUM(OrderTotal)" etc. — the balanced
            // scanner must not terminate the decorator early or invent phantom fields.
            expect(aggregate!.fields.map(f => f.name).sort()).toEqual(['alias', 'expression']);
            expect(aggregate!.fields.find(f => f.name === 'expression')!.required).toBe(true);
            expect(aggregate!.fields.find(f => f.name === 'alias')!.required).toBe(false);

            const byID = types.find(t => t.name === 'RunViewByIDInput');
            expect(byID).toBeDefined();
            // Exactly one required field (ViewID) — everything else is decorator-nullable
            expect(byID!.fields.filter(f => f.required).map(f => f.name)).toEqual(['ViewID']);
            // No phantom fields from decorator option objects
            expect(byID!.fields.map(f => f.name)).not.toContain('nullable');
            expect(byID!.fields.map(f => f.name)).not.toContain('description');
        });

        it('parses nested InputType references (RunViewWithCacheCheckInput.params)', () => {
            const serverPath = path.join(MJ_ROOT, 'packages/MJServer/src/generic/RunViewResolver.ts');
            if (!fs.existsSync(serverPath)) {
                return;
            }

            const types = extractInputTypesFromFile(serverPath);
            const wrapper = types.find(t => t.name === 'RunViewWithCacheCheckInput');
            expect(wrapper).toBeDefined();
            expect(wrapper!.fields).toEqual([
                { name: 'params', type: 'RunDynamicViewInput', required: true },
                { name: 'cacheStatus', type: 'RunViewCacheStatusInput', required: false },
            ]);
        });
    });
});

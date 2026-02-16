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
 * These define the fields that client code MUST send for each InputType.
 * When you add a new required field to a server InputType:
 * 1. Update the client code to send the field
 * 2. Add the field name to the corresponding contract below
 *
 * This explicit contract approach is more reliable than parsing client code.
 */
const CLIENT_CONTRACTS: Record<string, {
    description: string;
    clientFile: string;
    clientLocation: string;
    fields: string[];
}> = {
    DeleteOptionsInput: {
        description: 'Options for entity delete operations',
        clientFile: 'graphQLDataProvider.ts',
        clientLocation: 'Delete() method, vars["options___"] assignment (~line 1665)',
        fields: [
            'SkipEntityAIActions',
            'SkipEntityActions',
            'ReplayOnly',
            'IsParentEntityDelete'
        ]
    }
    // Add more InputType contracts here as needed
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
 * Extract @InputType() decorated classes and their @Field() properties from a TypeScript file.
 * Uses regex parsing - works reliably for the standardized type-graphql decorator format.
 *
 * @param filePath - Path to the TypeScript file
 * @returns Array of InputType definitions found in the file
 */
function extractInputTypesFromFile(filePath: string): InputTypeDefinition[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const inputTypes: InputTypeDefinition[] = [];

    // Match @InputType() decorated classes
    const classPattern = /@InputType\(\)\s*(?:export\s+)?class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;

    let classMatch: RegExpExecArray | null;
    while ((classMatch = classPattern.exec(content)) !== null) {
        const className = classMatch[1];
        const classBody = classMatch[2];

        const fields: InputTypeField[] = [];

        // Match @Field() decorated properties
        const fieldPattern = /@Field\(([^)]*(?:\([^)]*\)[^)]*)*)\)[\s\S]*?(\w+)(?:\?)?:\s*(\w+)/g;

        let fieldMatch: RegExpExecArray | null;
        while ((fieldMatch = fieldPattern.exec(classBody)) !== null) {
            const fieldDecorator = fieldMatch[1];
            const fieldName = fieldMatch[2];
            const fieldType = fieldMatch[3];

            if (fieldName === 'constructor' || fieldType === 'void') {
                continue;
            }

            const isNullable = fieldDecorator.includes('nullable: true') ||
                               fieldDecorator.includes('nullable:true');

            fields.push({
                name: fieldName,
                type: fieldType,
                required: !isNullable
            });
        }

        inputTypes.push({
            name: className,
            fields,
            filePath
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
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type { GenerateIntegrationActionResult } from '@memberjunction/integration-engine';

// ─── Mock Setup ─────────────────────────────────────────────────────

const mockGenerateAction = vi.fn();
const mockGenerateActionsForObject = vi.fn();

vi.mock('@memberjunction/integration-engine', () => ({
    IntegrationActionGenerator: class {
        GenerateAction = mockGenerateAction;
        GenerateActionsForObject = mockGenerateActionsForObject;
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        ...actual,
        LogError: vi.fn(),
    };
});

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual('@memberjunction/global') as Record<string, unknown>;
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        protected async InternalRunAction(_params: unknown): Promise<ActionResultSimple> {
            return { Success: false, ResultCode: 'NOT_IMPLEMENTED' } as ActionResultSimple;
        }
    },
}));

// Import after mocks
import { GenerateIntegrationActionAction } from '../custom/integration/generate-integration-action.action.js';

// ─── Helpers ────────────────────────────────────────────────────────

interface MockActionParam {
    Name: string;
    Value: unknown;
    Type: 'Input' | 'Output' | 'Both';
}

function param(name: string, value: unknown): MockActionParam {
    return { Name: name, Value: value, Type: 'Input' };
}

function makeParams(inputParams: MockActionParam[]): RunActionParams {
    return {
        Params: inputParams,
        ContextUser: { ID: 'user-1' },
        Provider: undefined,
    } as unknown as RunActionParams;
}

async function run(action: GenerateIntegrationActionAction, params: RunActionParams): Promise<ActionResultSimple> {
    return (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> }).InternalRunAction(params);
}

function ok(verb: GenerateIntegrationActionResult['Verb'], id: string, name: string, existed = false): GenerateIntegrationActionResult {
    return { Success: true, ActionID: id, ActionName: name, Verb: verb, ObjectName: 'contacts', AlreadyExisted: existed, Message: `${verb} ok` };
}

function findOutput(result: ActionResultSimple, name: string): unknown {
    return result.Params?.find(p => p.Name === name && (p.Type === 'Output' || p.Type === 'Both'))?.Value;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('GenerateIntegrationActionAction', () => {
    let action: GenerateIntegrationActionAction;

    beforeEach(() => {
        vi.clearAllMocks();
        action = new GenerateIntegrationActionAction();
    });

    it('should require IntegrationName and ObjectName', async () => {
        const result = await run(action, makeParams([param('IntegrationName', 'HubSpot')]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('MISSING_PARAMETER');
    });

    it('should reject an invalid Verb', async () => {
        const result = await run(action, makeParams([
            param('IntegrationName', 'HubSpot'),
            param('ObjectName', 'contacts'),
            param('Verb', 'Patch'),
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('INVALID_VERB');
        expect(mockGenerateAction).not.toHaveBeenCalled();
    });

    it('should generate a single verb and set singular output params', async () => {
        mockGenerateAction.mockResolvedValue(ok('Get', 'act-1', 'HubSpot - Get Contact'));

        const result = await run(action, makeParams([
            param('IntegrationName', 'HubSpot'),
            param('ObjectName', 'contacts'),
            param('Verb', 'Get'),
        ]));

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(mockGenerateAction).toHaveBeenCalledWith('HubSpot', 'contacts', 'Get', expect.anything(), undefined);
        expect(findOutput(result, 'GeneratedActionID')).toBe('act-1');
        expect(findOutput(result, 'ActionName')).toBe('HubSpot - Get Contact');
        expect(findOutput(result, 'GeneratedActionIDs')).toEqual(['act-1']);
        expect(findOutput(result, 'AlreadyExisted')).toBe(false);
    });

    it('should resolve verb case-insensitively', async () => {
        mockGenerateAction.mockResolvedValue(ok('Create', 'act-2', 'HubSpot - Create Contact'));
        await run(action, makeParams([
            param('IntegrationName', 'HubSpot'),
            param('ObjectName', 'contacts'),
            param('Verb', 'create'),
        ]));
        expect(mockGenerateAction).toHaveBeenCalledWith('HubSpot', 'contacts', 'Create', expect.anything(), undefined);
    });

    it('should generate all verbs when Verb is omitted', async () => {
        mockGenerateActionsForObject.mockResolvedValue([
            ok('Get', 'a1', 'HubSpot - Get Contact'),
            ok('Search', 'a2', 'HubSpot - Search Contact'),
        ]);

        const result = await run(action, makeParams([
            param('IntegrationName', 'HubSpot'),
            param('ObjectName', 'contacts'),
        ]));

        expect(result.Success).toBe(true);
        expect(mockGenerateActionsForObject).toHaveBeenCalledWith('HubSpot', 'contacts', expect.anything(), undefined);
        expect(mockGenerateAction).not.toHaveBeenCalled();
        expect(findOutput(result, 'GeneratedActionIDs')).toEqual(['a1', 'a2']);
        expect(findOutput(result, 'ActionNames')).toEqual(['HubSpot - Get Contact', 'HubSpot - Search Contact']);
        // Multiple results → singular ID is null
        expect(findOutput(result, 'GeneratedActionID')).toBeNull();
    });

    it('should report AlreadyExisted=true only when every result reused', async () => {
        mockGenerateActionsForObject.mockResolvedValue([
            ok('Get', 'a1', 'HubSpot - Get Contact', true),
            ok('Search', 'a2', 'HubSpot - Search Contact', true),
        ]);
        const result = await run(action, makeParams([
            param('IntegrationName', 'HubSpot'),
            param('ObjectName', 'contacts'),
        ]));
        expect(findOutput(result, 'AlreadyExisted')).toBe(true);
    });

    it('should fail when no result succeeded', async () => {
        mockGenerateAction.mockResolvedValue({
            Success: false, Verb: 'Get', ObjectName: 'contacts', AlreadyExisted: false, Message: 'object not found',
        } as GenerateIntegrationActionResult);

        const result = await run(action, makeParams([
            param('IntegrationName', 'HubSpot'),
            param('ObjectName', 'contacts'),
            param('Verb', 'Get'),
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('GENERATION_FAILED');
        expect(result.Message).toContain('object not found');
    });

    it('should catch unexpected errors from the generator', async () => {
        mockGenerateAction.mockRejectedValue(new Error('db down'));
        const result = await run(action, makeParams([
            param('IntegrationName', 'HubSpot'),
            param('ObjectName', 'contacts'),
            param('Verb', 'Get'),
        ]));
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe('UNEXPECTED_ERROR');
        expect(result.Message).toContain('db down');
    });
});

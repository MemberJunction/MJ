import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClassFactory } = vi.hoisted(() => ({
    mockClassFactory: {
        CreateInstance: vi.fn(),
        GetAllRegistrations: vi.fn().mockReturnValue([]),
        GetRegistration: vi.fn().mockReturnValue(null),
    },
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    const mockLogEntity = {
        NewRecord: vi.fn(),
        Save: vi.fn().mockResolvedValue(true),
        ActionID: '',
        StartedAt: null as Date | null,
        EndedAt: null as Date | null,
        UserID: '',
        Params: '',
        ResultCode: '',
        Message: '',
        LatestResult: null,
    };
    return {
        ...actual,
        Metadata: vi.fn(() => ({
            GetEntityObject: vi.fn().mockResolvedValue(mockLogEntity),
        })),
        LogError: vi.fn(),
        LogErrorEx: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogVerbose: vi.fn(),
        RunView: vi.fn(),
        RunQuery: vi.fn(),
    };
});

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        MJGlobal: {
            Instance: {
                ClassFactory: mockClassFactory,
            },
        },
        RegisterClass: () => (target: Function) => target,
    };
});

import type { UserInfo } from '@memberjunction/core';
import type {
    ActionParam,
    ActionResultSimple,
    MJActionEntityExtended,
    RunActionParams,
    SupportsAudienceContract,
} from '@memberjunction/actions-base';
import {
    AUDIENCE_UNSUPPORTED_RESULT_CODE,
    SERVER_BOUND_SCOPE_MISSING_RESULT_CODE,
    SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE,
} from '@memberjunction/actions-base';
import { BaseAction } from '../generic/BaseAction';
import { ActionEngineServer } from '../generic/ActionEngine';

function makeUser(id: string): UserInfo {
    return { ID: id, Name: `User ${id}`, UserRoles: [] } as UserInfo;
}

class ScopedReceiptAction extends BaseAction {
    public CapturedParams: ActionParam[] = [];
    public override get SupportsAudience(): boolean {
        return true;
    }

    public override get AudienceContract(): SupportsAudienceContract {
        return {
            SupportsAudience: true,
            SupportedModes: ['Intersection', 'ScopeCommonReach'],
            HiddenScopeParams: [
                {
                    ParamName: 'OrganizationID',
                    Source: 'RunScope.PrimaryScopeRecordID',
                    Required: true,
                    OverridePolicy: 'Reject',
                },
                {
                    ParamName: 'Region',
                    Source: 'RunScope.SecondaryScope',
                    SecondaryScopeKey: 'Region',
                    OverridePolicy: 'StripAndInject',
                },
            ],
            ReturnShaping: {
                Enabled: true,
                AllowedReceiptParamNames: ['ReceiptID'],
                ReferenceIDParamName: 'ReceiptID',
                ReceiptType: 'HostGrantedSubmission',
                ReceiptMessage: 'Request processed cleanly.',
            },
        };
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        this.CapturedParams = [...params.Params];
        const nextParams: ActionParam[] = [
            ...params.Params,
            { Name: 'ReceiptID', Type: 'Output', Value: 'rcpt-1001' },
            { Name: 'SensitivePayload', Type: 'Output', Value: { ssn: '999-00-1111', amount: 50000 } },
            { Name: 'OrganizationID', Type: 'Both', Value: 'org-real', Bound: true },
        ];
        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify({ secret: 'do-not-leak-to-chat', ssn: '999-00-1111' }),
            AIDirectives: [{ Message: 'Internal secret directive', Type: 'context', Priority: 'high' }],
            Params: nextParams,
        };
    }
}

class IntersectionOnlyAudienceAction extends BaseAction {
    public override get SupportsAudience(): boolean {
        return true;
    }
    public override get AudienceContract(): SupportsAudienceContract {
        return {
            SupportsAudience: true,
            SupportedModes: ['Intersection'],
        };
    }
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        return { Success: true, ResultCode: 'SUCCESS', Message: 'ok', Params: params.Params };
    }
}

describe('ActionEngineServer server-bound hidden scope & receipt shaping', () => {
    const caller = makeUser('user-caller');
    const reader = makeUser('user-reader');

    beforeEach(() => {
        vi.clearAllMocks();
        mockClassFactory.GetAllRegistrations.mockReturnValue([]);
    });

    function buildParams(overrides: Partial<RunActionParams> = {}): RunActionParams {
        const params: RunActionParams = {
            Action: {
                ID: 'act-1',
                Name: 'Scoped Receipt Action',
                DriverClass: 'ScopedReceiptAction',
                Type: 'Custom',
            } as MJActionEntityExtended,
            ContextUser: caller,
            SkipActionLog: true,
            Filters: [],
            Params: [{ Name: 'Query', Type: 'Input', Value: 'quarterly status' }],
            RunScope: {
                PrimaryScopeEntityName: 'Organizations',
                PrimaryScopeRecordID: 'org-real',
                SecondaryScopes: { Region: 'us-east' },
            },
            Audience: { Readers: [reader] },
            ...overrides,
        };
        return params;
    }

    it('rejects LLM/client spoofing of a Reject-policy hidden scope parameter before execution', async () => {
        const action = new ScopedReceiptAction();
        mockClassFactory.CreateInstance.mockReturnValue(action);

        const params = buildParams({
            Params: [
                { Name: 'Query', Type: 'Input', Value: 'quarterly status' },
                { Name: 'organizationid', Type: 'Input', Value: 'org-attacker' },
            ],
        });

        const result = await ActionEngineServer.Instance.RunAction(params);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE);
        expect(action.CapturedParams).toHaveLength(0);
        expect(result.Params?.some((p) => p.Name.toLowerCase() === 'organizationid')).toBe(false);
    });

    it('rejects a Bound=true parameter whose value conflicts with authoritative RunScope', async () => {
        const action = new ScopedReceiptAction();
        mockClassFactory.CreateInstance.mockReturnValue(action);

        const params = buildParams({
            Params: [
                { Name: 'Query', Type: 'Input', Value: 'quarterly status' },
                { Name: 'OrganizationID', Type: 'Input', Value: 'org-wrong', Bound: true },
            ],
        });

        const result = await ActionEngineServer.Instance.RunAction(params);
        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE);
        expect(action.CapturedParams).toHaveLength(0);
    });

    it('strips client override on StripAndInject param, injects authoritative server-bound values, and shapes receipt-only chat return', async () => {
        const action = new ScopedReceiptAction();
        mockClassFactory.CreateInstance.mockReturnValue(action);

        const params = buildParams({
            Params: [
                { Name: 'Query', Type: 'Input', Value: 'quarterly status' },
                { Name: 'region', Type: 'Input', Value: 'eu-spoofed' },
            ],
        });

        const result = await ActionEngineServer.Instance.RunAction(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');

        // Action received authoritative server-bound values
        const injectedOrg = action.CapturedParams.find((p) => p.Name === 'OrganizationID');
        const injectedRegion = action.CapturedParams.find((p) => p.Name === 'Region');
        expect(injectedOrg).toEqual({ Name: 'OrganizationID', Type: 'Input', Value: 'org-real', Bound: true });
        expect(injectedRegion).toEqual({ Name: 'Region', Type: 'Input', Value: 'us-east', Bound: true });

        // Chat-facing result is receipt-only: sensitive output, hidden Both param, raw Message, and AIDirectives are stripped
        expect(result.Message).toBe('Request processed cleanly.');
        expect(result.AIDirectives).toBeUndefined();
        expect(result.Params?.some((p) => p.Name === 'SensitivePayload')).toBe(false);
        expect(result.Params?.some((p) => p.Name === 'OrganizationID' && p.Type === 'Both')).toBe(false);
        expect(result.Params?.find((p) => p.Name === 'ReceiptID')?.Value).toBe('rcpt-1001');
        expect(result.ChatReceipt).toMatchObject({
            ReceiptOnly: true,
            ActionName: 'Scoped Receipt Action',
            ActionID: 'act-1',
            Success: true,
            ResultCode: 'SUCCESS',
            Summary: 'Request processed cleanly.',
            ReceiptType: 'HostGrantedSubmission',
            ReferenceID: 'rcpt-1001',
            RedactedOutputParamNames: ['SensitivePayload', 'OrganizationID'],
            RetainedOutputParamNames: ['ReceiptID'],
        });
    });

    it('fails closed when a required server-bound scope value cannot be resolved from RunScope', async () => {
        const action = new ScopedReceiptAction();
        mockClassFactory.CreateInstance.mockReturnValue(action);

        const params = buildParams({
            RunScope: {
                PrimaryScopeEntityName: 'Organizations',
                PrimaryScopeRecordID: null,
                SecondaryScopes: null,
            },
        });

        const result = await ActionEngineServer.Instance.RunAction(params);

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(SERVER_BOUND_SCOPE_MISSING_RESULT_CODE);
        expect(action.CapturedParams).toHaveLength(0);
    });

    it('enforces explicit ServerBoundScopeParams even when action has no AudienceContract', async () => {
        class PlainAction extends BaseAction {
            public CapturedChapterID: string | number | boolean | string[] | null | undefined;
            protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
                this.CapturedChapterID = params.Params.find((p) => p.Name === 'ChapterID')?.Value as string | number | boolean | string[] | null | undefined;
                return { Success: true, ResultCode: 'SUCCESS', Message: 'done', Params: params.Params };
            }
        }
        const action = new PlainAction();
        mockClassFactory.CreateInstance.mockReturnValue(action);

        const spoofed = await ActionEngineServer.Instance.RunAction(
            buildParams({
                Audience: undefined,
                ServerBoundScopeParams: { ChapterID: 'chapter-server' },
                Params: [{ Name: 'chapterid', Type: 'Input', Value: 'chapter-spoofed' }],
            })
        );
        expect(spoofed.Success).toBe(false);
        expect(spoofed.ResultCode).toBe(SERVER_BOUND_SCOPE_SPOOFING_RESULT_CODE);

        const legitimate = await ActionEngineServer.Instance.RunAction(
            buildParams({
                Audience: undefined,
                ServerBoundScopeParams: { ChapterID: 'chapter-server' },
                Params: [],
            })
        );
        expect(legitimate.Success).toBe(true);
        expect(action.CapturedChapterID).toBe('chapter-server');
    });

    it('refuses an audience mode excluded by SupportsAudienceContract.SupportedModes', async () => {
        const action = new IntersectionOnlyAudienceAction();
        mockClassFactory.CreateInstance.mockReturnValue(action);

        const result = await ActionEngineServer.Instance.RunAction(
            buildParams({
                Audience: undefined,
                IsStructuralAudience: true,
            })
        );

        expect(result.Success).toBe(false);
        expect(result.ResultCode).toBe(AUDIENCE_UNSUPPORTED_RESULT_CODE);
        expect(result.Message).toMatch(/ScopeCommonReach/);
    });
});

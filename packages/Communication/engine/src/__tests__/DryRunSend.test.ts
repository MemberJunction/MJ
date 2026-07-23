/**
 * Unit tests for DryRun threading through CommunicationEngine's public send surface:
 *   - SendSingleMessage passes the DryRun-flagged processed message to the provider,
 *     still writes the audit log (StartLog + completion Save), and returns the
 *     provider's DryRun-marked result untouched
 *   - SendMessages preserves the DryRun flag on every per-recipient message copy
 *   - previewOnly still short-circuits BEFORE the provider (the two modes stay distinct)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks (mirror Engine.test.ts)
// ============================================================================

const { mockClassFactory } = vi.hoisted(() => {
    const mockClassFactory = {
        CreateInstance: vi.fn(),
        GetAllRegistrations: vi.fn().mockReturnValue([]),
    };
    return { mockClassFactory };
});

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: mockClassFactory,
        },
    },
    RegisterClass: () => (target: Function) => target,
    BaseSingleton: class BaseSingletonMock<T> {
        protected constructor() {}
        protected static getInstance<U>(this: new () => U): U {
            return new this();
        }
    },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: vi.fn().mockImplementation(() => ({ GetEntityObject: vi.fn() })),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    UserInfo: class {},
    BaseEngine: class {
        static getInstance<T>(): T { return new (this as never)() as T; }
        protected ContextUser = { ID: 'test-user-id', Name: 'Test' };
        protected Loaded = true;
        async Config() {}
        async Load() {}
    },
    BaseEnginePropertyConfig: class {},
    IMetadataProvider: class {},
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJCommunicationRunEntity: class {},
    MJCommunicationLogEntity: class {},
    MJCommunicationBaseMessageTypeEntity: class {},
    MJCommunicationProviderMessageTypeEntity: class {},
    MJCommunicationProviderEntity: class {},
    MJEntityCommunicationFieldEntity: class {},
    MJEntityCommunicationMessageTypeEntity: class {},
    MJTemplateEntityExtended: class {},
}));

vi.mock('@memberjunction/templates', () => ({
    TemplateEngineServer: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            RenderTemplate: vi.fn().mockResolvedValue({ Success: true, Output: 'Rendered' }),
        },
    },
}));

vi.mock('@memberjunction/communication-types', () => {
    class MockMessage {
        MessageType: Record<string, unknown> | null = null;
        From = '';
        To = '';
        Body = '';
        HTMLBody = '';
        Subject = '';
        ContextData: unknown = null;
        BodyTemplate: unknown = null;
        HTMLBodyTemplate: unknown = null;
        SubjectTemplate: unknown = null;
        DryRun?: boolean;

        constructor(copyFrom?: Record<string, unknown>) {
            if (copyFrom) Object.assign(this, copyFrom);
        }
    }

    class MockProcessedMessage extends MockMessage {
        ProcessedBody = '';
        ProcessedHTMLBody = '';
        ProcessedSubject = '';

        async Process() {
            return { Success: true };
        }
    }

    class MockCommunicationEngineBase {
        private static _inst: MockCommunicationEngineBase | undefined;
        static get Instance(): MockCommunicationEngineBase {
            return (MockCommunicationEngineBase._inst ??= new MockCommunicationEngineBase());
        }
        static getInstance<T>(): T { return MockCommunicationEngineBase.Instance as unknown as T; }
        public ContextUser = { ID: 'test-user-id', Name: 'Test' };
        public Loaded = true;
        async Config() {}

        private _Metadata: Record<string, unknown[]> = {
            Providers: [],
            ProviderMessageTypes: [],
            BaseMessageTypes: [],
            EntityCommunicationMessageTypes: [],
            EntityCommunicationFields: [],
        };

        get Metadata() { return this._Metadata; }
        get Providers() { return this._Metadata.Providers; }
        get ProviderMessageTypes() { return this._Metadata.ProviderMessageTypes; }
        get BaseMessageTypes() { return this._Metadata.BaseMessageTypes; }

        async StartRun() {
            return {
                ID: 'run-1',
                Save: vi.fn().mockResolvedValue(true),
                set Status(_v: string) {},
                set EndedAt(_v: Date) {},
            };
        }
        async EndRun() { return true; }
        async StartLog() {
            return {
                Save: vi.fn().mockResolvedValue(true),
                set Status(_v: string) {},
                set ErrorMessage(_v: string) {},
                get LatestResult() { return null; },
            };
        }
    }

    return {
        BaseCommunicationProvider: class {
            SendSingleMessage = vi.fn();
            CreateDraft = vi.fn();
        },
        CommunicationEngineBase: MockCommunicationEngineBase,
        Message: MockMessage,
        ProcessedMessage: MockProcessedMessage,
        MessageResult: class {},
        MessageRecipient: class { To = ''; ContextData: unknown = null; },
        ProviderCredentialsBase: class {},
        CreateDraftResult: class {},
    };
});

// ============================================================================
// Import under test
// ============================================================================
import { CommunicationEngine } from '../Engine';
import { ProcessedMessageServer } from '../BaseProvider';

interface SentMessageShape {
    To: string;
    DryRun?: boolean;
}

function setupProviderMetadata(engine: CommunicationEngine): void {
    ((engine as unknown as { Base: Record<string, unknown> }).Base)['_Metadata'] = {
        Providers: [{
            Name: 'P',
            MessageTypes: [{ Name: 'T', ID: 'pmt-1', CommunicationProviderID: 'prov-1' }],
        }],
        ProviderMessageTypes: [],
        BaseMessageTypes: [],
        EntityCommunicationMessageTypes: [],
        EntityCommunicationFields: [],
    };
}

describe('CommunicationEngine DryRun threading', () => {
    let engine: CommunicationEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new CommunicationEngine();
        (engine as unknown as { Base: { Loaded: boolean } }).Base.Loaded = true;
        (engine as Record<string, unknown>)['ContextUser'] = { ID: 'test-user-id', Name: 'Test' };
    });

    it('SendSingleMessage passes the DryRun flag to the provider, writes the audit log, and returns the DryRun-marked result', async () => {
        const providerSend = vi.fn().mockImplementation(async (m: SentMessageShape) => ({
            Success: true,
            Error: '',
            Message: m,
            DryRun: true,
        }));
        vi.spyOn(engine, 'GetProvider').mockReturnValue({ SendSingleMessage: providerSend, constructor: { name: 'TestProvider' } } as never);
        setupProviderMetadata(engine);
        vi.spyOn(ProcessedMessageServer.prototype, 'Process').mockResolvedValue({ Success: true });
        const startLogSpy = vi.spyOn((engine as unknown as { Base: object }).Base as never, 'StartLog' as never);

        const message = { To: 'test@test.com', Body: 'Hello', Subject: 'Test', MessageType: null, DryRun: true };
        const result = await engine.SendSingleMessage('P', 'T', message as never);

        // Provider was invoked with the DryRun flag intact (threading proof)
        expect(providerSend).toHaveBeenCalledTimes(1);
        expect((providerSend.mock.calls[0][0] as SentMessageShape).DryRun).toBe(true);
        // Audit log lifecycle still ran (dry-run is audited, unlike previewOnly)
        expect(startLogSpy).toHaveBeenCalledTimes(1);
        // The provider's DryRun-marked result is returned untouched
        expect(result.Success).toBe(true);
        expect(result.DryRun).toBe(true);
    });

    it('SendMessages preserves DryRun on every per-recipient message copy', async () => {
        const mockRun = {
            ID: 'run-1',
            Save: vi.fn().mockResolvedValue(true),
            set Status(_v: string) {},
            set EndedAt(_v: Date) {},
        };
        vi.spyOn((engine as unknown as { Base: object }).Base as never, 'StartRun' as never).mockResolvedValue(mockRun as never);
        vi.spyOn((engine as unknown as { Base: object }).Base as never, 'EndRun' as never).mockResolvedValue(true as never);

        const sendSpy = vi.spyOn(engine, 'SendSingleMessage').mockImplementation(async (_p, _t, m) => ({
            Success: true,
            Error: '',
            Message: m as never,
            DryRun: (m as unknown as SentMessageShape).DryRun,
        }));

        const message = { From: 'sender@test.com', Body: 'Hello', Subject: 'Test', To: '', ContextData: null, DryRun: true };
        const recipients = [
            { To: 'a@test.com', ContextData: { name: 'Alice' } },
            { To: 'b@test.com', ContextData: { name: 'Bob' } },
        ];

        const results = await engine.SendMessages('P', 'T', message as never, recipients as never);

        expect(results).toHaveLength(2);
        expect(sendSpy).toHaveBeenCalledTimes(2);
        for (const call of sendSpy.mock.calls) {
            expect((call[2] as unknown as SentMessageShape).DryRun).toBe(true);
        }
        expect(results.every((r) => r.DryRun === true)).toBe(true);
    });

    it('previewOnly still stops BEFORE the provider and does NOT DryRun-mark the result (modes stay distinct)', async () => {
        const providerSend = vi.fn();
        vi.spyOn(engine, 'GetProvider').mockReturnValue({ SendSingleMessage: providerSend, constructor: { name: 'TestProvider' } } as never);
        setupProviderMetadata(engine);
        vi.spyOn(ProcessedMessageServer.prototype, 'Process').mockResolvedValue({ Success: true });
        const startLogSpy = vi.spyOn((engine as unknown as { Base: object }).Base as never, 'StartLog' as never);

        const message = { To: 'test@test.com', Body: 'Hello', Subject: 'Test', MessageType: null };
        const result = await engine.SendSingleMessage('P', 'T', message as never, undefined, true);

        expect(result.Success).toBe(true);
        expect(result.DryRun).toBeUndefined();
        expect(providerSend).not.toHaveBeenCalled();
        expect(startLogSpy).not.toHaveBeenCalled();
    });
});

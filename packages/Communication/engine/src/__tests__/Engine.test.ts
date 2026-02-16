import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks
// ============================================================================

const { mockProviderInstance, mockClassFactory } = vi.hoisted(() => {
    const mockProviderInstance = {
        SendSingleMessage: vi.fn().mockResolvedValue({ Success: true, Error: '' }),
        CreateDraft: vi.fn().mockResolvedValue({ Success: true, DraftID: 'draft-1' }),
    };

    const mockClassFactory = {
        CreateInstance: vi.fn().mockReturnValue(mockProviderInstance),
        GetAllRegistrations: vi.fn().mockReturnValue([]),
    };

    return { mockProviderInstance, mockClassFactory };
});

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: mockClassFactory,
        },
    },
    RegisterClass: () => (target: Function) => target,
}));

vi.mock('@memberjunction/core', () => {
    const mockRunEntity = {
        Save: vi.fn().mockResolvedValue(true),
        set Status(_v: string) {},
        get Status() { return 'Pending'; },
        set Direction(_v: string) {},
        set StartedAt(_v: Date) {},
        set EndedAt(_v: Date) {},
        set UserID(_v: string) {},
        get ID() { return 'run-1'; },
        LatestResult: null,
    };
    const mockLogEntity = {
        Save: vi.fn().mockResolvedValue(true),
        set CommunicationRunID(_v: string | undefined) {},
        set Status(_v: string) {},
        get Status() { return 'Pending'; },
        set CommunicationProviderID(_v: string) {},
        set CommunicationProviderMessageTypeID(_v: string) {},
        set MessageDate(_v: Date) {},
        set Direction(_v: string) {},
        set MessageContent(_v: string) {},
        set ErrorMessage(_v: string) {},
        get LatestResult() { return null; },
    };

    return {
        Metadata: vi.fn().mockImplementation(() => ({
            GetEntityObject: vi.fn()
                .mockImplementation((entityName: string) => {
                    if (entityName === 'MJ: Communication Runs') return Promise.resolve(mockRunEntity);
                    if (entityName === 'MJ: Communication Logs') return Promise.resolve(mockLogEntity);
                    return Promise.resolve({});
                }),
        })),
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        UserInfo: class {},
        BaseEngine: class {
            static getInstance<T>(): T { return new (this as never)() as T; }
            protected ContextUser = { ID: 'test-user-id', Name: 'Test' };
            protected Loaded = true;
            async Config() {}
            async Load() {}
            protected async AdditionalLoading() {}
            protected HandleSingleViewResult() {}
            protected RunViewProviderToUse = undefined;
        },
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJCommunicationRunEntity: class {},
    MJCommunicationLogEntity: class {},
    MJCommunicationBaseMessageTypeEntity: class {},
    MJCommunicationProviderMessageTypeEntity: class {
        ID = 'pmt-1';
        Name = 'Email';
        CommunicationProviderID = 'provider-1';
    },
    MJCommunicationProviderEntity: class { ID = ''; Name = ''; SupportsDrafts = false; },
    MJEntityCommunicationFieldEntity: class {},
    MJEntityCommunicationMessageTypeEntity: class {},
    TemplateEntityExtended: class {},
}));

// Mock the templates dependency
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
        static getInstance<T>(): T { return new (this as never)() as T; }
        protected ContextUser = { ID: 'test-user-id', Name: 'Test' };
        protected Loaded = true;
        async Config() {}
        async Load() {}
        protected async AdditionalLoading() {}
        protected HandleSingleViewResult() {}
        protected RunViewProviderToUse = undefined;

        private _Metadata = {
            Providers: [],
            ProviderMessageTypes: [],
            BaseMessageTypes: [],
            EntityCommunicationMessageTypes: [],
            EntityCommunicationFields: [],
        };

        get Providers() { return this._Metadata.Providers; }
        get ProviderMessageTypes() { return this._Metadata.ProviderMessageTypes; }
        get BaseMessageTypes() { return this._Metadata.BaseMessageTypes; }

        protected async StartRun() {
            return {
                ID: 'run-1',
                Save: vi.fn().mockResolvedValue(true),
                set Status(_v: string) {},
                set EndedAt(_v: Date) {},
            };
        }
        protected async EndRun() { return true; }
        protected async StartLog() {
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

describe('CommunicationEngine', () => {
    let engine: CommunicationEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new CommunicationEngine();
        (engine as Record<string, unknown>)['Loaded'] = true;
        (engine as Record<string, unknown>)['ContextUser'] = { ID: 'test-user-id', Name: 'Test' };
    });

    describe('Instance', () => {
        it('should return a singleton instance', () => {
            const instance = CommunicationEngine.Instance;
            expect(instance).toBeDefined();
        });
    });

    describe('GetProvider', () => {
        it('should throw when not loaded', () => {
            (engine as Record<string, unknown>)['Loaded'] = false;

            expect(() => engine.GetProvider('TestProvider')).toThrow('Metadata not loaded');
        });

        it('should throw when ClassFactory returns null', () => {
            mockClassFactory.CreateInstance.mockReturnValue(null);

            expect(() => engine.GetProvider('NonExistent')).toThrow('Provider NonExistent not found');
        });

        it('should throw when ClassFactory returns base class instance', () => {
            mockClassFactory.CreateInstance.mockReturnValue({
                constructor: { name: 'BaseCommunicationProvider' },
            });

            expect(() => engine.GetProvider('Base')).toThrow('Provider Base not found');
        });

        it('should return provider instance when valid subclass', () => {
            const subClassInstance = {
                constructor: { name: 'SendGridProvider' },
                SendSingleMessage: vi.fn(),
            };
            mockClassFactory.CreateInstance.mockReturnValue(subClassInstance);

            const provider = engine.GetProvider('SendGrid');
            expect(provider).toBe(subClassInstance);
        });
    });

    describe('SendMessages', () => {
        it('should send a message to each recipient', async () => {
            // Mock StartRun and EndRun
            const mockRun = {
                ID: 'run-1',
                Save: vi.fn().mockResolvedValue(true),
                set Status(_v: string) {},
                set EndedAt(_v: Date) {},
            };
            vi.spyOn(engine as never, 'StartRun' as never).mockResolvedValue(mockRun as never);
            vi.spyOn(engine as never, 'EndRun' as never).mockResolvedValue(true as never);

            // Mock SendSingleMessage
            const sendSpy = vi.spyOn(engine, 'SendSingleMessage').mockResolvedValue({
                Success: true,
                Error: '',
                Message: {} as never,
            });

            const message = {
                From: 'sender@test.com',
                Body: 'Hello',
                Subject: 'Test',
                To: '',
                ContextData: null,
            };
            const recipients = [
                { To: 'a@test.com', ContextData: { name: 'Alice' } },
                { To: 'b@test.com', ContextData: { name: 'Bob' } },
            ];

            const results = await engine.SendMessages(
                'TestProvider',
                'Email',
                message as never,
                recipients as never,
                false
            );

            expect(results).toHaveLength(2);
            expect(sendSpy).toHaveBeenCalledTimes(2);
        });

        it('should throw when StartRun fails', async () => {
            vi.spyOn(engine as never, 'StartRun' as never).mockResolvedValue(null as never);

            await expect(
                engine.SendMessages('P', 'T', {} as never, [] as never)
            ).rejects.toThrow('Failed to start communication run');
        });

        it('should throw when EndRun fails', async () => {
            const mockRun = { ID: 'run-1' };
            vi.spyOn(engine as never, 'StartRun' as never).mockResolvedValue(mockRun as never);
            vi.spyOn(engine as never, 'EndRun' as never).mockResolvedValue(false as never);
            vi.spyOn(engine, 'SendSingleMessage').mockResolvedValue({
                Success: true,
                Error: '',
                Message: {} as never,
            });

            await expect(
                engine.SendMessages('P', 'T', {} as never, [{ To: 'a@test.com', ContextData: null }] as never)
            ).rejects.toThrow('Failed to end communication run');
        });
    });

    describe('SendSingleMessage', () => {
        it('should throw when not loaded', async () => {
            (engine as Record<string, unknown>)['Loaded'] = false;

            await expect(
                engine.SendSingleMessage('P', 'T', {} as never)
            ).rejects.toThrow('Metadata not loaded');
        });

        it('should throw when provider not found', async () => {
            vi.spyOn(engine, 'GetProvider').mockImplementation(() => {
                throw new Error('Provider P not found.');
            });

            await expect(
                engine.SendSingleMessage('P', 'T', {} as never)
            ).rejects.toThrow('Provider P not found');
        });

        it('should return success for preview only mode', async () => {
            const mockProvider = { SendSingleMessage: vi.fn(), constructor: { name: 'TestProvider' } };
            vi.spyOn(engine, 'GetProvider').mockReturnValue(mockProvider as never);

            // Set up Providers metadata
            (engine as Record<string, unknown>)['_Metadata'] = {
                Providers: [{
                    Name: 'P',
                    MessageTypes: [{ Name: 'T', ID: 'pmt-1', CommunicationProviderID: 'prov-1' }],
                }],
                ProviderMessageTypes: [],
                BaseMessageTypes: [],
                EntityCommunicationMessageTypes: [],
                EntityCommunicationFields: [],
            };

            // We need to mock ProcessedMessageServer.Process
            const mockMessage = {
                To: 'test@test.com',
                Body: 'Hello',
                Subject: 'Test',
                MessageType: null,
                BodyTemplate: null,
                HTMLBodyTemplate: null,
                SubjectTemplate: null,
            };

            // Spy on ProcessedMessageServer prototype
            vi.spyOn(ProcessedMessageServer.prototype, 'Process').mockResolvedValue({ Success: true });

            const result = await engine.SendSingleMessage('P', 'T', mockMessage as never, undefined, true);

            expect(result.Success).toBe(true);
            expect(mockProvider.SendSingleMessage).not.toHaveBeenCalled();
        });

        it('should throw when message processing fails', async () => {
            const mockProvider = { constructor: { name: 'TestProvider' } };
            vi.spyOn(engine, 'GetProvider').mockReturnValue(mockProvider as never);

            (engine as Record<string, unknown>)['_Metadata'] = {
                Providers: [{
                    Name: 'P',
                    MessageTypes: [{ Name: 'T', ID: 'pmt-1', CommunicationProviderID: 'prov-1' }],
                }],
                ProviderMessageTypes: [],
                BaseMessageTypes: [],
                EntityCommunicationMessageTypes: [],
                EntityCommunicationFields: [],
            };

            vi.spyOn(ProcessedMessageServer.prototype, 'Process').mockResolvedValue({
                Success: false,
                Message: 'Template render error',
            });

            await expect(
                engine.SendSingleMessage('P', 'T', { MessageType: null } as never)
            ).rejects.toThrow('Failed to process message');
        });

        it('should throw when provider message type not found', async () => {
            const mockProvider = { constructor: { name: 'TestProvider' } };
            vi.spyOn(engine, 'GetProvider').mockReturnValue(mockProvider as never);

            (engine as Record<string, unknown>)['_Metadata'] = {
                Providers: [{
                    Name: 'P',
                    MessageTypes: [], // No message types
                }],
                ProviderMessageTypes: [],
                BaseMessageTypes: [],
                EntityCommunicationMessageTypes: [],
                EntityCommunicationFields: [],
            };

            await expect(
                engine.SendSingleMessage('P', 'NonExistentType', { MessageType: null } as never)
            ).rejects.toThrow('Provider message type NonExistentType not found');
        });

        it('should throw when provider entity not found in metadata', async () => {
            const mockProvider = { constructor: { name: 'TestProvider' } };
            vi.spyOn(engine, 'GetProvider').mockReturnValue(mockProvider as never);

            (engine as Record<string, unknown>)['_Metadata'] = {
                Providers: [], // Empty
                ProviderMessageTypes: [],
                BaseMessageTypes: [],
                EntityCommunicationMessageTypes: [],
                EntityCommunicationFields: [],
            };

            await expect(
                engine.SendSingleMessage('P', 'T', { MessageType: null } as never)
            ).rejects.toThrow('Provider P not found');
        });
    });

    describe('CreateDraft', () => {
        it('should return failure when not loaded', async () => {
            (engine as Record<string, unknown>)['Loaded'] = false;

            const result = await engine.CreateDraft({} as never, 'P');
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('Metadata not loaded');
        });

        it('should return failure when provider does not support drafts', async () => {
            const mockProvider = { constructor: { name: 'TestProvider' } };
            vi.spyOn(engine, 'GetProvider').mockReturnValue(mockProvider as never);

            (engine as Record<string, unknown>)['_Metadata'] = {
                Providers: [{ Name: 'P', SupportsDrafts: false }],
                ProviderMessageTypes: [],
                BaseMessageTypes: [],
                EntityCommunicationMessageTypes: [],
                EntityCommunicationFields: [],
            };

            const result = await engine.CreateDraft({} as never, 'P');
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support creating drafts');
        });

        it('should return failure when message processing fails', async () => {
            const mockProvider = { constructor: { name: 'TestProvider' }, CreateDraft: vi.fn() };
            vi.spyOn(engine, 'GetProvider').mockReturnValue(mockProvider as never);

            (engine as Record<string, unknown>)['_Metadata'] = {
                Providers: [{ Name: 'P', SupportsDrafts: true }],
                ProviderMessageTypes: [],
                BaseMessageTypes: [],
                EntityCommunicationMessageTypes: [],
                EntityCommunicationFields: [],
            };

            vi.spyOn(ProcessedMessageServer.prototype, 'Process').mockResolvedValue({
                Success: false,
                Message: 'Process failed',
            });

            const result = await engine.CreateDraft({ ContextData: {} } as never, 'P');
            expect(result.Success).toBe(false);
        });

        it('should call provider.CreateDraft on success', async () => {
            const createDraftFn = vi.fn().mockResolvedValue({ Success: true, DraftID: 'draft-123' });
            const mockProvider = { constructor: { name: 'TestProvider' }, CreateDraft: createDraftFn };
            vi.spyOn(engine, 'GetProvider').mockReturnValue(mockProvider as never);

            (engine as Record<string, unknown>)['_Metadata'] = {
                Providers: [{ Name: 'P', SupportsDrafts: true }],
                ProviderMessageTypes: [],
                BaseMessageTypes: [],
                EntityCommunicationMessageTypes: [],
                EntityCommunicationFields: [],
            };

            vi.spyOn(ProcessedMessageServer.prototype, 'Process').mockResolvedValue({ Success: true });

            const result = await engine.CreateDraft({ ContextData: {} } as never, 'P');
            expect(result.Success).toBe(true);
            expect(result.DraftID).toBe('draft-123');
            expect(createDraftFn).toHaveBeenCalled();
        });

        it('should handle thrown errors gracefully', async () => {
            vi.spyOn(engine, 'GetProvider').mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            const result = await engine.CreateDraft({} as never, 'P');
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBe('Unexpected error');
        });
    });
});

describe('ProcessedMessageServer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should process body without templates', async () => {
        const message = {
            Body: 'Plain body',
            HTMLBody: '<b>HTML body</b>',
            Subject: 'Test Subject',
            BodyTemplate: null,
            HTMLBodyTemplate: null,
            SubjectTemplate: null,
        };

        const processed = new ProcessedMessageServer(message as never);
        const result = await processed.Process();

        expect(result.Success).toBe(true);
        expect(processed.ProcessedBody).toBe('Plain body');
        expect(processed.ProcessedHTMLBody).toBe('<b>HTML body</b>');
        expect(processed.ProcessedSubject).toBe('Test Subject');
    });

    it('should set empty HTML body when no HTMLBody and no template', async () => {
        const message = {
            Body: 'Text',
            HTMLBody: null,
            Subject: null,
            BodyTemplate: null,
            HTMLBodyTemplate: null,
            SubjectTemplate: null,
        };

        const processed = new ProcessedMessageServer(message as never);
        const result = await processed.Process();

        expect(result.Success).toBe(true);
        expect(processed.ProcessedHTMLBody).toBe('');
        expect(processed.ProcessedSubject).toBe('');
    });
});

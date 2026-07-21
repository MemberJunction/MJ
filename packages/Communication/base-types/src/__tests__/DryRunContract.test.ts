/**
 * Unit tests for the DryRun seam at the BASE contract level:
 *   - `Message.DryRun` survives the copy constructor (the engine copies the message per recipient)
 *   - `MessageResult.DryRun` is part of the result contract
 *   - `CommunicationEngineBase.StartLog` stamps `DryRun: true` into the audit MessageContent JSON
 *     for dry-run sends, and omits the marker entirely for real sends
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSave, mockGetEntityObject } = vi.hoisted(() => ({
    mockSave: vi.fn(),
    mockGetEntityObject: vi.fn(),
}));

vi.mock('@memberjunction/core', () => {
    class MockBaseEngine {
        protected ContextUser = { ID: 'user-1' };
        protected get ProviderToUse() {
            return { GetEntityObject: mockGetEntityObject };
        }
        protected async Load() {}
        static _instances = new Map();
        static getInstance() {
            if (!this._instances.has(this)) {
                this._instances.set(this, new this());
            }
            return this._instances.get(this);
        }
    }
    return {
        BaseEngine: MockBaseEngine,
        BaseEntity: class {},
        BaseEnginePropertyConfig: class {},
        IMetadataProvider: class {},
        Metadata: vi.fn().mockImplementation(function () {
            return { GetEntityObject: mockGetEntityObject };
        }),
        UserInfo: class {},
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJCommunicationBaseMessageTypeEntity: class {},
    MJCommunicationLogEntity: class {},
    MJCommunicationProviderEntity: class {},
    MJCommunicationProviderMessageTypeEntity: class {},
    MJCommunicationRunEntity: class {},
    MJEntityCommunicationFieldEntity: class {},
    MJEntityCommunicationMessageTypeEntity: class {},
    MJTemplateEntityExtended: class {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));

import { CommunicationEngineBase } from '../BaseEngine';
import { Message, MessageResult } from '../BaseProvider';

function makeLogMock() {
    return {
        CommunicationRunID: undefined as string | undefined,
        Status: '',
        CommunicationProviderID: '',
        CommunicationProviderMessageTypeID: '',
        MessageDate: null as Date | null,
        Direction: '',
        MessageContent: '',
        Save: mockSave.mockResolvedValue(true),
    };
}

function makeProcessedMessage(dryRun: boolean | undefined) {
    return {
        MessageType: { CommunicationProviderID: 'prov-1', ID: 'pmt-1' },
        To: 'user@test.com',
        From: 'sender@test.com',
        ProcessedSubject: 'Subject',
        ProcessedHTMLBody: '<p>Hello</p>',
        ProcessedBody: 'Hello',
        DryRun: dryRun,
    };
}

describe('DryRun base contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Message.DryRun', () => {
        it('should default to undefined (real send)', () => {
            const msg = new Message();
            expect(msg.DryRun).toBeUndefined();
        });

        it('should survive the copy constructor (per-recipient copies keep the flag)', () => {
            const original = new Message();
            original.To = 'a@test.com';
            original.DryRun = true;
            const copy = new Message(original);
            expect(copy.DryRun).toBe(true);
            expect(copy.To).toBe('a@test.com');
        });

        it('should keep an explicit false through the copy constructor', () => {
            const original = new Message();
            original.DryRun = false;
            const copy = new Message(original);
            expect(copy.DryRun).toBe(false);
        });
    });

    describe('MessageResult.DryRun', () => {
        it('should be assignable and default to undefined', () => {
            const result = new MessageResult();
            expect(result.DryRun).toBeUndefined();
            result.DryRun = true;
            expect(result.DryRun).toBe(true);
        });
    });

    describe('CommunicationEngineBase.StartLog dry-run audit marker', () => {
        it('should stamp DryRun: true into MessageContent for a dry-run send', async () => {
            const engine = CommunicationEngineBase.Instance;
            const mockLog = makeLogMock();
            mockGetEntityObject.mockResolvedValue(mockLog);

            const result = await (engine as unknown as Record<string, Function>)['StartLog'](makeProcessedMessage(true));

            expect(result).toBe(mockLog);
            const content = JSON.parse(mockLog.MessageContent) as Record<string, unknown>;
            expect(content.DryRun).toBe(true);
            expect(content.To).toBe('user@test.com');
            expect(content.Subject).toBe('Subject');
        });

        it('should OMIT the DryRun key entirely for a real send', async () => {
            const engine = CommunicationEngineBase.Instance;
            const mockLog = makeLogMock();
            mockGetEntityObject.mockResolvedValue(mockLog);

            await (engine as unknown as Record<string, Function>)['StartLog'](makeProcessedMessage(undefined));

            const content = JSON.parse(mockLog.MessageContent) as Record<string, unknown>;
            expect('DryRun' in content).toBe(false);
        });

        it('should OMIT the DryRun key when DryRun is explicitly false', async () => {
            const engine = CommunicationEngineBase.Instance;
            const mockLog = makeLogMock();
            mockGetEntityObject.mockResolvedValue(mockLog);

            await (engine as unknown as Record<string, Function>)['StartLog'](makeProcessedMessage(false));

            const content = JSON.parse(mockLog.MessageContent) as Record<string, unknown>;
            expect('DryRun' in content).toBe(false);
        });
    });
});

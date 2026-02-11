import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class {},
    UserInfo: class {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => () => {},
}));

vi.mock('@memberjunction/core-entities', () => ({
    CommunicationProviderEntity: class {},
    CommunicationProviderMessageTypeEntity: class {},
    CommunicationRunEntity: class {},
    TemplateEntityExtended: class {},
}));

import {
    Message,
    MessageRecipient,
    MessageResult,
    BaseCommunicationProvider,
    CommunicationProviderEntityExtended,
    ProcessedMessage,
} from '../BaseProvider';

// Concrete test implementation of the abstract class
class TestProvider extends BaseCommunicationProvider {
    public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
        return { Message: message, Success: true, Error: '' };
    }
    public async GetMessages() {
        return { Success: true, Messages: [] };
    }
    public async ForwardMessage() {
        return { Success: true };
    }
    public async ReplyToMessage() {
        return { Success: true };
    }
    public async CreateDraft() {
        return { Success: true };
    }
}

describe('Message', () => {
    it('should create a new Message with default properties', () => {
        const msg = new Message();
        expect(msg.From).toBeUndefined();
        expect(msg.To).toBeUndefined();
        expect(msg.Body).toBeUndefined();
        expect(msg.Subject).toBeUndefined();
        expect(msg.CCRecipients).toBeUndefined();
        expect(msg.BCCRecipients).toBeUndefined();
        expect(msg.Headers).toBeUndefined();
    });

    it('should copy properties from another Message via constructor', () => {
        const original = new Message();
        original.From = 'sender@test.com';
        original.To = 'recipient@test.com';
        original.Subject = 'Test Subject';
        original.Body = 'Test Body';
        original.CCRecipients = ['cc@test.com'];
        original.BCCRecipients = ['bcc@test.com'];
        original.Headers = { 'X-Custom': 'value' };

        const copy = new Message(original);
        expect(copy.From).toBe('sender@test.com');
        expect(copy.To).toBe('recipient@test.com');
        expect(copy.Subject).toBe('Test Subject');
        expect(copy.Body).toBe('Test Body');
        expect(copy.CCRecipients).toEqual(['cc@test.com']);
        expect(copy.BCCRecipients).toEqual(['bcc@test.com']);
        expect(copy.Headers).toEqual({ 'X-Custom': 'value' });
    });

    it('should handle copy from undefined (no copyFrom)', () => {
        const msg = new Message(undefined);
        expect(msg.From).toBeUndefined();
    });
});

describe('MessageRecipient', () => {
    it('should create a new MessageRecipient with settable properties', () => {
        const recipient = new MessageRecipient();
        recipient.To = 'user@test.com';
        recipient.FullName = 'Test User';
        recipient.ContextData = { key: 'value' };

        expect(recipient.To).toBe('user@test.com');
        expect(recipient.FullName).toBe('Test User');
        expect(recipient.ContextData).toEqual({ key: 'value' });
    });
});

describe('MessageResult', () => {
    it('should create a MessageResult with all properties', () => {
        const result = new MessageResult();
        result.Success = true;
        result.Error = '';

        expect(result.Success).toBe(true);
        expect(result.Error).toBe('');
        expect(result.Run).toBeUndefined();
    });
});

describe('BaseCommunicationProvider', () => {
    let provider: TestProvider;

    beforeEach(() => {
        provider = new TestProvider();
    });

    describe('getSupportedOperations', () => {
        it('should return core operations by default', () => {
            const ops = provider.getSupportedOperations();
            expect(ops).toContain('SendSingleMessage');
            expect(ops).toContain('GetMessages');
            expect(ops).toContain('ForwardMessage');
            expect(ops).toContain('ReplyToMessage');
            expect(ops).toContain('CreateDraft');
            expect(ops).toHaveLength(5);
        });
    });

    describe('supportsOperation', () => {
        it('should return true for supported operations', () => {
            expect(provider.supportsOperation('SendSingleMessage')).toBe(true);
            expect(provider.supportsOperation('GetMessages')).toBe(true);
        });

        it('should return false for unsupported operations', () => {
            expect(provider.supportsOperation('DeleteMessage')).toBe(false);
            expect(provider.supportsOperation('MoveMessage')).toBe(false);
            expect(provider.supportsOperation('ListFolders')).toBe(false);
            expect(provider.supportsOperation('MarkAsRead')).toBe(false);
            expect(provider.supportsOperation('ArchiveMessage')).toBe(false);
            expect(provider.supportsOperation('SearchMessages')).toBe(false);
            expect(provider.supportsOperation('ListAttachments')).toBe(false);
            expect(provider.supportsOperation('DownloadAttachment')).toBe(false);
        });
    });

    describe('optional operations default implementations', () => {
        it('GetSingleMessage should return not supported', async () => {
            const result = await provider.GetSingleMessage({ MessageID: 'msg-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support GetSingleMessage');
            expect(result.ErrorMessage).toContain('msg-1');
        });

        it('DeleteMessage should return not supported', async () => {
            const result = await provider.DeleteMessage({ MessageID: 'msg-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support DeleteMessage');
        });

        it('MoveMessage should return not supported', async () => {
            const result = await provider.MoveMessage({ MessageID: 'msg-1', DestinationFolderID: 'folder-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support MoveMessage');
            expect(result.ErrorMessage).toContain('folder-1');
        });

        it('ListFolders should return not supported', async () => {
            const result = await provider.ListFolders({});
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support ListFolders');
        });

        it('MarkAsRead should return not supported', async () => {
            const result = await provider.MarkAsRead({ MessageIDs: ['msg-1', 'msg-2'], IsRead: true });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support MarkAsRead');
            expect(result.ErrorMessage).toContain('2 message(s)');
        });

        it('ArchiveMessage should return not supported', async () => {
            const result = await provider.ArchiveMessage({ MessageID: 'msg-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support ArchiveMessage');
        });

        it('SearchMessages should return not supported', async () => {
            const result = await provider.SearchMessages({ Query: 'hello' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support SearchMessages');
        });

        it('ListAttachments should return not supported', async () => {
            const result = await provider.ListAttachments({ MessageID: 'msg-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support ListAttachments');
        });

        it('DownloadAttachment should return not supported', async () => {
            const result = await provider.DownloadAttachment({ MessageID: 'msg-1', AttachmentID: 'att-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support DownloadAttachment');
        });

        it('should include credential info in error messages', async () => {
            const result = await provider.GetSingleMessage(
                { MessageID: 'msg-1' },
                { disableEnvironmentFallback: false }
            );
            expect(result.ErrorMessage).toContain('credentials provided: true');
        });

        it('should show credentials provided: false when no credentials', async () => {
            const result = await provider.GetSingleMessage({ MessageID: 'msg-1' });
            expect(result.ErrorMessage).toContain('credentials provided: false');
        });
    });
});

describe('CommunicationProviderEntityExtended', () => {
    it('should get and set MessageTypes', () => {
        const entity = new (CommunicationProviderEntityExtended as unknown as { new(): CommunicationProviderEntityExtended })();
        expect(entity.MessageTypes).toBeUndefined();

        const mockTypes = [{ ID: '1', Name: 'Email' }];
        entity.MessageTypes = mockTypes as never;
        expect(entity.MessageTypes).toBe(mockTypes);
    });
});

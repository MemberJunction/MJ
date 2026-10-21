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
    MJCommunicationProviderEntity: class {},
    MJCommunicationProviderMessageTypeEntity: class {},
    MJCommunicationRunEntity: class {},
    MJTemplateEntityExtended: class {},
}));

import {
    Message,
    MessageRecipient,
    MessageResult,
    BaseCommunicationProvider,
    MJCommunicationProviderEntityExtended,
    ProcessedMessage,
    WebhookNotificationInput,
    ParseNotificationResult,
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

// A subscription-managed, HINT-mode push provider (Graph/Gmail shape): full CRUD, the
// notification only carries MessageIDs to re-fetch with — never an inline Message.
class SubscriptionManagedPushProvider extends TestProvider {
    public override getSupportedOperations() {
        return [
            ...super.getSupportedOperations(),
            'CreateSubscription' as const,
            'RenewSubscription' as const,
            'DeleteSubscription' as const,
            'ParseNotification' as const,
        ];
    }
    public override GetSubscriptionCapabilities() {
        return {
            MaxLifetimeMinutes: 4230,
            SupportedChangeTypes: ['created' as const],
            RequiresEndpointValidation: true,
            SupportsSubscriptionManagement: true,
            DeliversPayloadInline: false,
        };
    }
    public override async ParseNotification(_input: WebhookNotificationInput): Promise<ParseNotificationResult> {
        return {
            Success: true,
            Notifications: [{ Kind: 'message', MessageIDs: ['ext-1'] }],
            SuggestedResponseStatus: 202,
        };
    }
}

// A parse-only, INLINE-mode push provider (SendGrid shape): no renewal, the notification
// carries the full message inline in NormalizedNotification.Message (no re-fetch path).
class InlineParsePushProvider extends TestProvider {
    public override getSupportedOperations() {
        return [
            ...super.getSupportedOperations(),
            'CreateSubscription' as const,
            'DeleteSubscription' as const,
            'ParseNotification' as const,
        ];
    }
    public override GetSubscriptionCapabilities() {
        return {
            MaxLifetimeMinutes: undefined,
            SupportedChangeTypes: ['created' as const],
            RequiresEndpointValidation: false,
            SupportsSubscriptionManagement: true,
            DeliversPayloadInline: true,
        };
    }
    public override async ParseNotification(_input: WebhookNotificationInput): Promise<ParseNotificationResult> {
        return {
            Success: true,
            Notifications: [{
                Kind: 'message',
                MessageIDs: [],
                Message: { From: 'a@x.com', To: 'b@y.com', Body: 'hello', Subject: 'hi' },
            }],
            SuggestedResponseStatus: 200,
        };
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

        /**
         * The distinction this pins is the one `GetEvents` is built around: a provider that cannot
         * look at a calendar must not be indistinguishable from one reporting an empty calendar. A
         * caller advancing a watermark on `Events: []` would skip the window it never actually read.
         */
        it('GetEvents should return not supported, with an empty list rather than a missing one', async () => {
            const result = await provider.GetEvents({ Identifier: 'someone@example.com', NumEvents: 10 });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support GetEvents');
            expect(result.ErrorMessage).toContain('someone@example.com');
            expect(result.Events).toEqual([]);
        });

        /**
         * A provider with no calendar must say so per operation, by name, rather than look like an
         * empty calendar or a write that went nowhere.
         */
        describe('calendar operations a provider does not implement', () => {
            const target = { Identifier: 'someone@example.com' };
            const start = new Date('2026-10-01T15:00:00Z');
            const end = new Date('2026-10-01T16:00:00Z');
            const calls: [string, () => Promise<{ Success: boolean; ErrorMessage?: string }>][] = [
                ['CreateEvent', () => provider.CreateEvent({ Target: target, Event: { Subject: 'x', Start: start, End: end } })],
                ['UpdateEvent', () => provider.UpdateEvent({ Target: target, ExternalEventID: 'e1', Changes: { Subject: 'y' } })],
                ['CancelEvent', () => provider.CancelEvent({ Target: target, ExternalEventID: 'e1' })],
                ['GetEvent', () => provider.GetEvent({ Target: target, ExternalEventID: 'e1' })],
                ['SyncEvents', () => provider.SyncEvents({ Target: target })],
            ];

            it.each(calls)('%s refuses, naming the provider, the operation and the calendar', async (operation, call) => {
                const result = await call();
                expect(result.Success).toBe(false);
                expect(result.ErrorMessage).toContain(`TestProvider does not support ${operation}`);
                expect(result.ErrorMessage).toContain('someone@example.com');
            });

            it('SyncEvents refuses with an empty change list rather than a missing one', async () => {
                const result = await provider.SyncEvents({ Target: target, SyncToken: 'tok' });
                expect(result.Changes).toEqual([]);
                expect(result.NextSyncToken).toBeUndefined();
            });

            it('does not report the calendar operations as supported', () => {
                for (const op of ['CreateEvent', 'UpdateEvent', 'CancelEvent', 'GetEvent', 'SyncEvents'] as const) {
                    expect(provider.SupportsOperation(op)).toBe(false);
                }
            });
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

        it('GetFreeBusy should return not supported with empty Schedules', async () => {
            const result = await provider.GetFreeBusy({
                Schedules: ['alice@example.com', 'bob@example.com'],
                StartDateTime: new Date('2026-10-18T09:00:00Z'),
                EndDateTime: new Date('2026-10-18T17:00:00Z'),
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support GetFreeBusy');
            expect(result.ErrorMessage).toContain('Schedules: 2');
            expect(result.Schedules).toEqual([]);
        });

        it('FindMeetingTimes should return not supported with empty Suggestions', async () => {
            const result = await provider.FindMeetingTimes({
                Identifier: 'alice@example.com',
                Attendees: [{ Email: 'bob@example.com', Required: true }],
                StartDateTime: new Date('2026-10-18T09:00:00Z'),
                EndDateTime: new Date('2026-10-18T17:00:00Z'),
                DurationMinutes: 30,
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support FindMeetingTimes');
            expect(result.ErrorMessage).toContain('alice@example.com');
            expect(result.Suggestions).toEqual([]);
        });

        it('CreateCalendarEvent should return not supported', async () => {
            const result = await provider.CreateCalendarEvent({
                Identifier: 'alice@example.com',
                Subject: 'Q4 Strategy Review',
                StartTime: new Date('2026-10-18T14:00:00Z'),
                EndTime: new Date('2026-10-18T15:00:00Z'),
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support CreateCalendarEvent');
            expect(result.ErrorMessage).toContain('Q4 Strategy Review');
        });

        it('UpdateCalendarEvent should return not supported', async () => {
            const result = await provider.UpdateCalendarEvent({
                Identifier: 'alice@example.com',
                EventID: 'evt-123',
                Subject: 'Updated Title',
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support UpdateCalendarEvent');
            expect(result.ErrorMessage).toContain('evt-123');
        });

        it('RespondToCalendarEvent should return not supported', async () => {
            const result = await provider.RespondToCalendarEvent({
                Identifier: 'alice@example.com',
                EventID: 'evt-123',
                Response: 'Accept',
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support RespondToCalendarEvent');
            expect(result.ErrorMessage).toContain('Accept');
        });

        it('CancelCalendarEvent should return not supported', async () => {
            const result = await provider.CancelCalendarEvent({
                Identifier: 'alice@example.com',
                EventID: 'evt-123',
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support CancelCalendarEvent');
            expect(result.ErrorMessage).toContain('evt-123');
        });

        it('VerifyMailboxAccess should return not supported with false flags', async () => {
            const result = await provider.VerifyMailboxAccess({
                Identifier: 'alice@example.com',
            });
            expect(result.Success).toBe(false);
            expect(result.CanReadMail).toBe(false);
            expect(result.CanReadCalendar).toBe(false);
            expect(result.ErrorMessage).toContain('does not support VerifyMailboxAccess');
        });
    });

    describe('subscription default implementations', () => {
        it('CreateSubscription should return not supported', async () => {
            const result = await provider.CreateSubscription({
                ChangeTypes: ['created'],
                NotificationUrl: 'https://example.com/hook',
                ClientState: 'secret',
                Identifier: 'mailbox@test.com',
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support CreateSubscription');
            expect(result.ErrorMessage).toContain('mailbox@test.com');
        });

        it('RenewSubscription should return not supported', async () => {
            const result = await provider.RenewSubscription({ SubscriptionID: 'sub-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support RenewSubscription');
            expect(result.ErrorMessage).toContain('sub-1');
        });

        it('DeleteSubscription should return not supported', async () => {
            const result = await provider.DeleteSubscription({ SubscriptionID: 'sub-1' });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support DeleteSubscription');
            expect(result.ErrorMessage).toContain('sub-1');
        });

        it('ParseNotification should return not supported with empty notifications and a 400', async () => {
            const result = await provider.ParseNotification({
                Headers: {},
                QueryParams: {},
                RawBody: '{}',
            });
            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toContain('does not support ParseNotification');
            expect(result.Notifications).toEqual([]);
            expect(result.SuggestedResponseStatus).toBe(400);
        });

        it('GetSubscriptionCapabilities should return undefined by default', () => {
            expect(provider.GetSubscriptionCapabilities()).toBeUndefined();
        });

        it('subscription operations are absent from getSupportedOperations by default', () => {
            expect(provider.supportsOperation('CreateSubscription')).toBe(false);
            expect(provider.supportsOperation('RenewSubscription')).toBe(false);
            expect(provider.supportsOperation('DeleteSubscription')).toBe(false);
            expect(provider.supportsOperation('ParseNotification')).toBe(false);
        });

        it('SupportsPush is false by default (no capabilities)', () => {
            expect(provider.SupportsPush).toBe(false);
        });

        it('capability gate holds for the default provider: no capabilities, no push, no ops', () => {
            expect(provider.GetSubscriptionCapabilities()).toBeUndefined();
            expect(provider.SupportsPush).toBe(false);
            const ops = provider.getSupportedOperations();
            expect(ops.includes('ParseNotification' as never)).toBe(false);
        });
    });

    describe('push capability gate (SupportsPush + generalized invariant)', () => {
        it('SupportsPush derives from GetSubscriptionCapabilities (subscription-managed provider)', () => {
            const p = new SubscriptionManagedPushProvider();
            expect(p.GetSubscriptionCapabilities()).toBeDefined();
            expect(p.SupportsPush).toBe(true);
        });

        it('SupportsPush derives from GetSubscriptionCapabilities (inline-parse provider)', () => {
            const p = new InlineParsePushProvider();
            expect(p.GetSubscriptionCapabilities()).toBeDefined();
            expect(p.SupportsPush).toBe(true);
        });

        it('GENERALIZED INVARIANT: SupportsPush IFF capabilities defined, for every shape', () => {
            for (const p of [new TestProvider(), new SubscriptionManagedPushProvider(), new InlineParsePushProvider()]) {
                expect(p.SupportsPush).toBe(p.GetSubscriptionCapabilities() !== undefined);
            }
        });

        it('a push provider MUST support ParseNotification (the common denominator)', () => {
            for (const p of [new SubscriptionManagedPushProvider(), new InlineParsePushProvider()]) {
                expect(p.SupportsPush).toBe(true);
                expect(p.supportsOperation('ParseNotification')).toBe(true);
            }
        });

        it('SupportsSubscriptionManagement agrees with Create/Delete ops being present', () => {
            for (const p of [new SubscriptionManagedPushProvider(), new InlineParsePushProvider()]) {
                const caps = p.GetSubscriptionCapabilities()!;
                const hasCreate = p.supportsOperation('CreateSubscription');
                const hasDelete = p.supportsOperation('DeleteSubscription');
                expect(caps.SupportsSubscriptionManagement).toBe(hasCreate && hasDelete);
            }
        });

        it('RenewSubscription op present IFF the service has a finite MaxLifetimeMinutes', () => {
            const managed = new SubscriptionManagedPushProvider();
            expect(managed.GetSubscriptionCapabilities()!.MaxLifetimeMinutes).toBeTypeOf('number');
            expect(managed.supportsOperation('RenewSubscription')).toBe(true);

            const inline = new InlineParsePushProvider();
            expect(inline.GetSubscriptionCapabilities()!.MaxLifetimeMinutes).toBeUndefined();
            expect(inline.supportsOperation('RenewSubscription')).toBe(false);
        });

        it('HINT-mode notifications carry MessageIDs and no inline Message', async () => {
            const p = new SubscriptionManagedPushProvider();
            expect(p.GetSubscriptionCapabilities()!.DeliversPayloadInline).toBe(false);
            const result = await p.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: '{}' });
            expect(result.Notifications[0].MessageIDs.length).toBeGreaterThan(0);
            expect(result.Notifications[0].Message).toBeUndefined();
        });

        it('INLINE-mode notifications carry the Message payload directly (no re-fetch)', async () => {
            const p = new InlineParsePushProvider();
            expect(p.GetSubscriptionCapabilities()!.DeliversPayloadInline).toBe(true);
            const result = await p.ParseNotification({ Headers: {}, QueryParams: {}, RawBody: '' });
            expect(result.Notifications[0].Message).toBeDefined();
            expect(result.Notifications[0].Message?.Body).toBe('hello');
            expect(result.Notifications[0].MessageIDs).toEqual([]);
        });
    });
});

describe('MJCommunicationProviderEntityExtended', () => {
    it('should get and set MessageTypes', () => {
        const entity = new (MJCommunicationProviderEntityExtended as unknown as { new(): MJCommunicationProviderEntityExtended })();
        expect(entity.MessageTypes).toBeUndefined();

        const mockTypes = [{ ID: '1', Name: 'Email' }];
        entity.MessageTypes = mockTypes as never;
        expect(entity.MessageTypes).toBe(mockTypes);
    });
});

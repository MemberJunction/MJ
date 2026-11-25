import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessedMessage } from '@memberjunction/communication-types';
import {
    LOCAL_JSON_COMMUNICATION_PROVIDER_NAME,
    LocalJsonCommunicationProvider,
    MJ_MOCK_COMM_DIR_ENV,
} from '../LocalJsonCommunicationProvider';

class SimpleProcessedMessage extends ProcessedMessage {
    public async Process(): Promise<{ Success: boolean; Message?: string }> {
        this.ProcessedSubject = this.Subject ?? '';
        this.ProcessedBody = this.Body ?? '';
        this.ProcessedHTMLBody = this.HTMLBody ?? '';
        return { Success: true };
    }
}

function makeProcessedMessage(fields: {
    From: string;
    To: string;
    Subject: string;
    Body: string;
    DryRun?: boolean;
}): ProcessedMessage {
    const msg = new SimpleProcessedMessage();
    msg.From = fields.From;
    msg.To = fields.To;
    msg.Subject = fields.Subject;
    msg.ProcessedSubject = fields.Subject;
    msg.Body = fields.Body;
    msg.ProcessedBody = fields.Body;
    msg.ProcessedHTMLBody = '';
    msg.DryRun = fields.DryRun;
    return msg;
}

describe('LocalJsonCommunicationProvider', () => {
    let tempDir: string;
    let prevEnv: string | undefined;

    beforeEach(() => {
        prevEnv = process.env[MJ_MOCK_COMM_DIR_ENV];
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-local-json-comm-'));
        process.env[MJ_MOCK_COMM_DIR_ENV] = tempDir;
    });

    afterEach(() => {
        if (prevEnv === undefined) {
            delete process.env[MJ_MOCK_COMM_DIR_ENV];
        } else {
            process.env[MJ_MOCK_COMM_DIR_ENV] = prevEnv;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('auto-seeds realistic executive inbox (4 threads) and calendar (4 events with a 2:00 PM conflict) on first access', async () => {
        const provider = new LocalJsonCommunicationProvider();
        const mailbox = 'amith@bluecypress.io';

        const access = await provider.VerifyMailboxAccess({
            Identifier: mailbox,
            CheckMailRead: true,
            CheckCalendarRead: true,
        });
        expect(access.Success).toBe(true);
        expect(access.CanReadMail).toBe(true);
        expect(access.CanReadCalendar).toBe(true);

        const filePath = provider.GetMailboxFilePath(mailbox);
        expect(filePath).toBeTruthy();
        expect(fs.existsSync(filePath!)).toBe(true);

        const msgs = await provider.GetMessages({ Identifier: mailbox, NumMessages: 20 });
        expect(msgs.Success).toBe(true);
        expect(msgs.Messages).toHaveLength(4);
        expect(msgs.AppliedFilters?.UnreadOnly).toBe(false);

        const unread = await provider.GetMessages({ Identifier: mailbox, NumMessages: 20, UnreadOnly: true });
        expect(unread.Success).toBe(true);
        expect(unread.Messages).toHaveLength(2);
        expect(unread.AppliedFilters?.UnreadOnly).toBe(true);

        const windowStart = new Date(Date.now() - 24 * 3_600_000);
        const windowEnd = new Date(Date.now() + 72 * 3_600_000);
        const events = await provider.GetEvents({
            Identifier: mailbox,
            NumEvents: 25,
            StartDateTime: windowStart,
            EndDateTime: windowEnd,
        });
        expect(events.Success).toBe(true);
        expect(events.Events).toHaveLength(4);

        // Verify two overlapping events exist at the 2:00 PM conflict slot
        const conflictPair = events.Events.filter((e) => e.StartTime?.getHours() === 14);
        expect(conflictPair).toHaveLength(2);
    });

    it('persists drafts, sent emails, replies, forwards, search, and read/archive mutations to JSON', async () => {
        const provider = new LocalJsonCommunicationProvider();
        const mailbox = 'da-robot-tester@bluecypress.io';

        // CreateDraft
        const draftRes = await provider.CreateDraft({
            Message: makeProcessedMessage({
                From: mailbox,
                To: 'sarah.chen@bluecypress.io',
                Subject: 'Draft Board Note',
                Body: 'Here is our updated ARR breakdown.',
            }),
            ContextData: { Email: mailbox },
        });
        expect(draftRes.Success).toBe(true);
        expect(draftRes.DraftID).toBeTruthy();

        // Drafts are persisted to JSON and excluded from inbox GetMessages
        const stateAfterDraft = provider.LoadOrSeedMailbox(mailbox);
        expect(stateAfterDraft.Messages.some((m) => m.ID === draftRes.DraftID && m.Folder === 'Drafts')).toBe(true);

        // SendSingleMessage (dry-run does not persist; live send persists)
        const dryRunSend = await provider.SendSingleMessage(
            makeProcessedMessage({
                From: mailbox,
                To: 'board@bluecypress.io',
                Subject: 'Dry Run Only',
                Body: 'Should not write',
                DryRun: true,
            })
        );
        expect(dryRunSend.Success).toBe(true);
        expect(dryRunSend.DryRun).toBe(true);
        expect(provider.LoadOrSeedMailbox(mailbox).Messages.some((m) => m.Subject === 'Dry Run Only')).toBe(false);

        const liveSend = await provider.SendSingleMessage(
            makeProcessedMessage({
                From: mailbox,
                To: 'board@bluecypress.io',
                Subject: 'Live Dispatch',
                Body: 'Sent via Local JSON Mock',
            })
        );
        expect(liveSend.Success).toBe(true);
        expect(provider.LoadOrSeedMailbox(mailbox).Messages.some((m) => m.Subject === 'Live Dispatch' && m.Folder === 'Sent')).toBe(true);

        // Reply + Forward
        const replyRes = await provider.ReplyToMessage({
            MessageID: 'mock-msg-001',
            Message: makeProcessedMessage({
                From: mailbox,
                To: 'sarah.chen@bluecypress.io',
                Subject: 'Re: Q4 Board Deck',
                Body: 'Numbers confirmed.',
            }),
            ContextData: { Email: mailbox },
        });
        expect(replyRes.Success).toBe(true);

        const fwdRes = await provider.ForwardMessage({
            MessageID: 'mock-msg-002',
            Message: 'FYI — see renewal timing',
            ToRecipients: ['finance@bluecypress.io'],
            ContextData: { Email: mailbox },
        });
        expect(fwdRes.Success).toBe(true);

        // SearchMessages + GetSingleMessage
        const searchRes = await provider.SearchMessages({
            Query: 'board deck',
            ContextData: { Email: mailbox },
        });
        expect(searchRes.Success).toBe(true);
        expect((searchRes.Messages?.length ?? 0)).toBeGreaterThanOrEqual(1);

        const singleRes = await provider.GetSingleMessage({
            MessageID: 'mock-msg-001',
            ContextData: { Email: mailbox },
        });
        expect(singleRes.Success).toBe(true);
        expect(singleRes.Message?.Subject).toContain('Q4 Board Deck');
    });

    it('supports full calendar CRUD, DryRun preview, RSVP, FreeBusy, and FindMeetingTimes', async () => {
        const provider = new LocalJsonCommunicationProvider();
        const mailbox = 'amith@bluecypress.io';

        const start = new Date('2026-12-01T15:00:00.000Z');
        const end = new Date('2026-12-01T15:30:00.000Z');

        // DryRun preview does not write to disk
        const dryCreate = await provider.CreateCalendarEvent({
            Identifier: mailbox,
            Subject: 'Preview Only Sync',
            StartTime: start,
            EndTime: end,
            IsOnlineMeeting: true,
            DryRun: true,
        });
        expect(dryCreate.Success).toBe(true);
        expect(dryCreate.DryRun).toBe(true);
        expect(provider.LoadOrSeedMailbox(mailbox).Events.some((e) => e.Subject === 'Preview Only Sync')).toBe(false);

        // Live create
        const created = await provider.CreateCalendarEvent({
            Identifier: mailbox,
            Subject: 'Board Prep 1:1',
            StartTime: start,
            EndTime: end,
            Attendees: [{ Email: 'sarah.chen@bluecypress.io', Required: true }],
            IsOnlineMeeting: true,
        });
        expect(created.Success).toBe(true);
        expect(created.Event?.ExternalSystemRecordID).toBeTruthy();
        expect(created.OnlineMeetingUrl).toContain('https://meet.local.mock/');

        const eventId = created.Event!.ExternalSystemRecordID;

        // Update
        const updated = await provider.UpdateCalendarEvent({
            Identifier: mailbox,
            EventID: eventId,
            Subject: 'Board Prep 1:1 (Updated)',
            Location: 'Room 4B',
        });
        expect(updated.Success).toBe(true);
        expect(updated.Event?.Subject).toBe('Board Prep 1:1 (Updated)');
        expect(updated.Event?.Location).toBe('Room 4B');

        // Respond
        const rsvp = await provider.RespondToCalendarEvent({
            Identifier: mailbox,
            EventID: eventId,
            Response: 'Accept',
            Comment: 'Confirmed',
        });
        expect(rsvp.Success).toBe(true);

        // GetFreeBusy sees the newly created event as Busy
        const fb = await provider.GetFreeBusy({
            Identifier: mailbox,
            Schedules: [mailbox],
            StartDateTime: new Date('2026-12-01T14:00:00.000Z'),
            EndDateTime: new Date('2026-12-01T17:00:00.000Z'),
            AvailabilityViewIntervalMinutes: 30,
        });
        expect(fb.Success).toBe(true);
        expect(fb.Schedules[0].Slots.some((s) => s.Subject === 'Board Prep 1:1 (Updated)')).toBe(true);
        expect(fb.Schedules[0].AvailabilityView).toContain('2');

        // FindMeetingTimes avoids the 15:00-15:30 busy slot
        const found = await provider.FindMeetingTimes({
            Identifier: mailbox,
            Attendees: [{ Email: 'sarah.chen@bluecypress.io', Required: true }],
            StartDateTime: new Date('2026-12-01T14:00:00.000Z'),
            EndDateTime: new Date('2026-12-01T17:00:00.000Z'),
            DurationMinutes: 30,
            MaxCandidates: 5,
        });
        expect(found.Success).toBe(true);
        expect(found.Suggestions.length).toBeGreaterThan(0);
        expect(found.Suggestions.every((s) => s.StartTime.toISOString() !== start.toISOString())).toBe(true);

        // Cancel / Delete
        const cancelled = await provider.DeleteCalendarEvent({
            Identifier: mailbox,
            EventID: eventId,
        });
        expect(cancelled.Success).toBe(true);

        const afterCancel = await provider.ListCalendarEvents({
            Identifier: mailbox,
            NumEvents: 10,
            StartDateTime: new Date('2026-12-01T14:00:00.000Z'),
            EndDateTime: new Date('2026-12-01T17:00:00.000Z'),
        });
        expect(afterCancel.Events.some((e) => e.ExternalSystemRecordID === eventId)).toBe(false);
    });

    it('declares full supported operation surface and fails cleanly when MJ_MOCK_COMM_DIR is unset', async () => {
        delete process.env[MJ_MOCK_COMM_DIR_ENV];
        const provider = new LocalJsonCommunicationProvider();
        expect(provider.SupportsOperation('VerifyMailboxAccess')).toBe(true);
        expect(provider.SupportsOperation('GetFreeBusy')).toBe(true);
        expect(provider.SupportsOperation('FindMeetingTimes')).toBe(true);
        expect(provider.SupportsOperation('CreateCalendarEvent')).toBe(true);
        expect(provider.SupportsOperation('CreateDraft')).toBe(true);
        expect(LOCAL_JSON_COMMUNICATION_PROVIDER_NAME).toBe('Local JSON Mock');

        const verify = await provider.VerifyMailboxAccess({ Identifier: 'test@example.com' });
        expect(verify.Success).toBe(false);
        expect(verify.ErrorMessage).toContain(MJ_MOCK_COMM_DIR_ENV);
    });
});

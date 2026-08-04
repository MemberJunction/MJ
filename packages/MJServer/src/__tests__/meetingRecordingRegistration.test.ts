import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

// ── Mocks ──────────────────────────────────────────────────────────────────
// The helper uses `RunView.FromMetadataProvider(provider).RunView(...)` for conversation lookups and
// `FileStorageEngine.Instance` for storage-account/driver/upload. We stub both so the test is pure
// (no DB, no network, no LiveKit/storage SDK).

const runViewMock = vi.fn();

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  class RunView {
    static FromMetadataProvider() {
      return { RunView: runViewMock };
    }
    RunView = runViewMock;
  }
  return { ...actual, RunView, LogError: vi.fn(), LogStatus: vi.fn() };
});

// FileStorageEngine — a configurable fake. Tests reset its behavior in beforeEach.
const storage = {
  accountsByProvider: new Map<string, Array<{ ID: string }>>(),
  getObject: vi.fn(async () => Buffer.from('mp4-bytes')),
  uploadFile: vi.fn(async () => ({ FileID: 'copied-file', StoragePath: 'meeting-recordings/2026/x.mp4' })),
};

vi.mock('@memberjunction/storage', () => ({
  FileStorageEngine: {
    Instance: {
      Config: vi.fn(async () => undefined),
      GetAccountsByProviderID: (id: string) => storage.accountsByProvider.get(id) ?? [],
      GetDriver: vi.fn(async () => ({ GetObject: storage.getObject })),
      UploadFile: (...args: unknown[]) => storage.uploadFile(...args),
    },
  },
}));

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual };
});

import {
  registerMeetingRecordingFile,
  resolveMeetingConversation,
  type MeetingRecordingEgressResult,
} from '../resolvers/meetingRecordingRegistration';

// ── Fakes ──────────────────────────────────────────────────────────────────

const user = { ID: 'U1', Name: 'Amith', Email: 'amith@x.com' } as unknown as UserInfo;

/** A fake BaseEntity for Conversations / Files — records the values set on it. */
class FakeEntity {
  public fields: Record<string, unknown> = {};
  public ID = 'new-id';
  public saved = false;
  public loadedID: string | null = null;
  constructor(public kind: 'conversation' | 'file', private saveResult = true) {}
  NewRecord() {}
  async Load(id: string) { this.loadedID = id; return true; }
  async Save() { this.saved = this.saveResult; return this.saveResult; }
  get LatestResult() { return { CompleteMessage: 'save failed' }; }
  // Conversation fields
  set UserID(v: string) { this.fields.UserID = v; }
  set Name(v: string) { this.fields.Name = v; }
  set Type(v: string) { this.fields.Type = v; }
  set ExternalID(v: string) { this.fields.ExternalID = v; }
  set ApplicationScope(v: string) { this.fields.ApplicationScope = v; }
  set RecordingFileID(v: string) { this.fields.RecordingFileID = v; }
  get RecordingFileID() { return this.fields.RecordingFileID as string; }
  set EgressID(v: string) { this.fields.EgressID = v; }
  get EgressID() { return this.fields.EgressID as string; }
  // File fields
  set ContentType(v: string) { this.fields.ContentType = v; }
  set ProviderID(v: string) { this.fields.ProviderID = v; }
  set ProviderKey(v: string) { this.fields.ProviderKey = v; }
  set Status(v: string) { this.fields.Status = v; }
}

/** Builds a provider whose GetEntityObject hands back fresh fakes and records the created Files row. */
function makeProvider(opts: { fileSaveOk?: boolean } = {}) {
  const created: { conversation: FakeEntity[]; file: FakeEntity[] } = { conversation: [], file: [] };
  const provider = {
    GetEntityObject: vi.fn(async (entityName: string) => {
      if (entityName === 'MJ: Files') {
        const f = new FakeEntity('file', opts.fileSaveOk ?? true);
        f.ID = 'file-123';
        created.file.push(f);
        return f;
      }
      const c = new FakeEntity('conversation');
      c.ID = 'conv-new';
      created.conversation.push(c);
      return c;
    }),
  } as unknown as IMetadataProvider;
  return { provider, created };
}

const egress: MeetingRecordingEgressResult = {
  EgressID: 'eg-1',
  RoomName: 'room-1',
  OutputLocation: 'room-1/2026.mp4',
  OutputSizeBytes: 1234,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  runViewMock.mockResolvedValue({ Success: true, Results: [] });
  storage.accountsByProvider = new Map([['prov-sink', [{ ID: 'acct-sink' }]]]);
  process.env.MJ_MEETING_RECORDING_STORAGE_PROVIDER = 'prov-sink';
  delete process.env.MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER;
});

describe('registerMeetingRecordingFile', () => {
  it('resolves the conversation, creates the Files row pointing at the sink, and stamps the Conversation', async () => {
    // First RunView (by EgressID) → no match; second (by RoomName) → an existing conversation.
    runViewMock
      .mockResolvedValueOnce({ Success: true, Results: [] })
      .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'conv-existing' }] });

    const { provider, created } = makeProvider();
    const result = await registerMeetingRecordingFile(egress, user, provider);

    expect(result.Success).toBe(true);
    expect(result.RecordingFileID).toBe('file-123');
    expect(result.ConversationID).toBe('conv-existing');

    // Files row: correct provider/key/content-type/status, pointing directly at the egress output.
    const file = created.file[0];
    expect(file.fields.ProviderID).toBe('prov-sink');
    expect(file.fields.ProviderKey).toBe('room-1/2026.mp4');
    expect(file.fields.ContentType).toBe('video/mp4');
    expect(file.fields.Status).toBe('Uploaded');
    expect(file.saved).toBe(true);

    // Conversation stamped with the file id (loaded by id, then saved).
    const conv = created.conversation[0];
    expect(conv.loadedID).toBe('conv-existing');
    expect(conv.fields.RecordingFileID).toBe('file-123');
    expect(conv.fields.EgressID).toBe('eg-1');
    expect(conv.saved).toBe(true);

    // No byte copy in the default v1 path.
    expect(storage.getObject).not.toHaveBeenCalled();
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('prefers matching the conversation by EgressID when present', async () => {
    runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'conv-by-egress' }] });
    const { provider } = makeProvider();
    const result = await registerMeetingRecordingFile(egress, user, provider);
    expect(result.ConversationID).toBe('conv-by-egress');
    // Only the EgressID lookup ran (no fall-through to room-name lookup).
    expect(runViewMock).toHaveBeenCalledTimes(1);
  });

  it('creates a Meeting-Room Conversation when none exists', async () => {
    runViewMock.mockResolvedValue({ Success: true, Results: [] }); // neither lookup matches
    const { provider, created } = makeProvider();
    const result = await registerMeetingRecordingFile(egress, user, provider);
    expect(result.Success).toBe(true);
    const conv = created.conversation[0];
    expect(conv.fields.Type).toBe('Meeting Room');
    expect(conv.fields.ExternalID).toBe('room-1');
    expect(conv.fields.ApplicationScope).toBe('Application');
  });

  it('returns a graceful failure when the storage provider is not configured', async () => {
    delete process.env.MJ_MEETING_RECORDING_STORAGE_PROVIDER;
    const { provider } = makeProvider();
    const result = await registerMeetingRecordingFile(egress, user, provider);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toMatch(/MJ_MEETING_RECORDING_STORAGE_PROVIDER/);
    expect(result.RecordingFileID).toBeUndefined();
  });

  it('returns a graceful failure when no account is linked to the configured provider', async () => {
    storage.accountsByProvider = new Map(); // no accounts for prov-sink
    const { provider } = makeProvider();
    const result = await registerMeetingRecordingFile(egress, user, provider);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toMatch(/No active MJStorage account/i);
  });

  it('returns a graceful failure when the egress has no output yet', async () => {
    const { provider } = makeProvider();
    const result = await registerMeetingRecordingFile({ ...egress, OutputLocation: undefined }, user, provider);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toMatch(/no output/i);
  });

  describe('copy-to-canonical (the "copy into Box" option)', () => {
    it('copies the MP4 into a differing canonical provider and points the Files row there', async () => {
      storage.accountsByProvider = new Map([
        ['prov-sink', [{ ID: 'acct-sink' }]],
        ['prov-canonical', [{ ID: 'acct-canonical' }]],
      ]);
      process.env.MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER = 'prov-canonical';
      runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'conv-1' }] });

      const { provider, created } = makeProvider();
      const result = await registerMeetingRecordingFile(egress, user, provider);

      expect(result.Success).toBe(true);
      // Bytes were read from the sink and uploaded into the canonical provider.
      expect(storage.getObject).toHaveBeenCalledWith({ fullPath: 'room-1/2026.mp4' });
      expect(storage.uploadFile).toHaveBeenCalledOnce();

      // The Files row points at the canonical provider + its uploaded key.
      const file = created.file[0];
      expect(file.fields.ProviderID).toBe('prov-canonical');
      expect(file.fields.ProviderKey).toBe('meeting-recordings/2026/x.mp4');
    });

    it('does NOT copy when the canonical provider equals the sink provider', async () => {
      process.env.MJ_MEETING_RECORDING_CANONICAL_STORAGE_PROVIDER = 'prov-sink'; // same as sink
      runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'conv-1' }] });
      const { provider, created } = makeProvider();
      const result = await registerMeetingRecordingFile(egress, user, provider);
      expect(result.Success).toBe(true);
      expect(storage.getObject).not.toHaveBeenCalled();
      expect(created.file[0].fields.ProviderID).toBe('prov-sink');
    });
  });

  it('fails gracefully (no throw) when the Files row save fails', async () => {
    runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ ID: 'conv-1' }] });
    const { provider } = makeProvider({ fileSaveOk: false });
    const result = await registerMeetingRecordingFile(egress, user, provider);
    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toMatch(/Files row/i);
  });
});

describe('resolveMeetingConversation', () => {
  it('falls back to creating a conversation when neither lookup matches', async () => {
    runViewMock.mockResolvedValue({ Success: true, Results: [] });
    const { provider, created } = makeProvider();
    const id = await resolveMeetingConversation(egress, user, provider);
    expect(id).toBe('conv-new');
    expect(created.conversation).toHaveLength(1);
  });
});

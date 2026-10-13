import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

const h = vi.hoisted(() => ({
  systemUser: { ID: 'SYS', Name: 'System' } as { ID: string; Name: string } | undefined,
  logError: vi.fn(),
}));

vi.mock('@memberjunction/core', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, LogError: h.logError };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: { Instance: { GetSystemUser: () => h.systemUser } },
}));

import { WriteAgentVisionConsentAudit, REALTIME_AGENT_VISION_CONSENT_AUDIT_TYPE } from '../resolvers/agentVisionConsentAudit';

/** A fake `MJ: Audit Logs` row that records what is set on it. */
class FakeAuditRow {
  public UserID = '';
  public AuditLogTypeID = '';
  public Status = '';
  public EntityID: string | null = null;
  public RecordID: string | null = null;
  public Description: string | null = null;
  public Details: string | null = null;
  public IsNew = false;
  constructor(private readonly saveResult: boolean) {}
  NewRecord() {
    this.IsNew = true;
  }
  async Save() {
    return this.saveResult;
  }
  get LatestResult() {
    return { CompleteMessage: 'save failed' };
  }
}

const user = { ID: 'U1', Name: 'Test User' } as unknown as UserInfo;

/** A provider with the consent audit type seeded (unless told otherwise), handing out one fake row. */
function fakeProvider(o: { seeded?: boolean; saveResult?: boolean; getThrows?: boolean } = {}) {
  const row = new FakeAuditRow(o.saveResult ?? true);
  const getEntityObject = vi.fn(async () => {
    if (o.getThrows) {
      throw new Error('database unavailable');
    }
    return row;
  });
  const provider = {
    AuditLogTypes: o.seeded === false ? [] : [{ ID: 'TYPE-1', Name: REALTIME_AGENT_VISION_CONSENT_AUDIT_TYPE }],
    EntityByName: (name: string) => (name === 'MJ: Users' ? { ID: 'USERS-ENTITY' } : undefined),
    GetEntityObject: getEntityObject,
  } as unknown as IMetadataProvider;
  return { provider, row, getEntityObject };
}

describe('WriteAgentVisionConsentAudit', () => {
  beforeEach(() => {
    h.logError.mockClear();
    h.systemUser = { ID: 'SYS', Name: 'System' };
  });

  it('records an applied choice, saved by the system user, about the person', async () => {
    const { provider, row, getEntityObject } = fakeProvider();
    await WriteAgentVisionConsentAudit({ User: user, RoomName: 'room-1', Allow: true, Applied: true }, provider);
    expect(getEntityObject).toHaveBeenCalledWith('MJ: Audit Logs', h.systemUser);
    expect(row).toMatchObject({
      IsNew: true,
      UserID: 'U1',
      AuditLogTypeID: 'TYPE-1',
      Status: 'Success',
      EntityID: 'USERS-ENTITY',
      RecordID: 'U1',
      Description: 'Let agents see their camera and shared screen in room room-1.',
    });
    expect(JSON.parse(row.Details ?? '')).toEqual({ roomName: 'room-1', allow: true, error: null });
    expect(h.logError).not.toHaveBeenCalled();
  });

  it('records a refused change as Failed, with the reason', async () => {
    const { provider, row } = fakeProvider();
    await WriteAgentVisionConsentAudit({ User: user, RoomName: 'room-1', Allow: false, Applied: false, ErrorMessage: 'not in the room' }, provider);
    expect(row.Status).toBe('Failed');
    expect(row.Description).toBe('Stopped letting agents see their camera and shared screen in room room-1 (not applied).');
    expect(JSON.parse(row.Details ?? '')).toEqual({ roomName: 'room-1', allow: false, error: 'not in the room' });
  });

  it('logs the choice instead when the audit log type is not seeded', async () => {
    const { provider, getEntityObject } = fakeProvider({ seeded: false });
    await WriteAgentVisionConsentAudit({ User: user, RoomName: 'room-1', Allow: true, Applied: true }, provider);
    expect(getEntityObject).not.toHaveBeenCalled();
    expect(h.logError).toHaveBeenCalledWith(expect.stringMatching(/is not seeded.*user U1: Let agents see their camera and shared screen in room room-1\./));
  });

  it('logs the choice instead when there is no system user or no provider', async () => {
    h.systemUser = undefined;
    const { provider, getEntityObject } = fakeProvider();
    await WriteAgentVisionConsentAudit({ User: user, RoomName: 'room-1', Allow: true, Applied: true }, provider);
    await WriteAgentVisionConsentAudit({ User: user, RoomName: 'room-1', Allow: true, Applied: true }, null);
    expect(getEntityObject).not.toHaveBeenCalled();
    expect(h.logError.mock.calls.map((c) => String(c[0]).match(/\((.*?)\)/)?.[1])).toEqual(['no system user', 'no provider']);
  });

  it('logs a row that does not save, and never throws when the write fails', async () => {
    await WriteAgentVisionConsentAudit({ User: user, RoomName: 'room-1', Allow: true, Applied: true }, fakeProvider({ saveResult: false }).provider);
    await expect(
      WriteAgentVisionConsentAudit({ User: user, RoomName: 'room-1', Allow: true, Applied: true }, fakeProvider({ getThrows: true }).provider),
    ).resolves.toBeUndefined();
    expect(h.logError.mock.calls.map((c) => String(c[0]))).toEqual([
      'Agent vision consent audit row not saved for user U1: save failed',
      'Agent vision consent audit write threw for user U1: database unavailable',
    ]);
  });
});

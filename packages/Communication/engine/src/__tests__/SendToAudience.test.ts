/**
 * Tests for `SendToAudience`. Mocks the audience resolver, the metadata
 * provider, and the engine's `SendMessages` so the test stays purely
 * focused on the field-mapping + skip-on-missing-field policy.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- hoisted mocks (vi.hoisted runs before module imports below) ----
const { resolveMock, sendMessagesMock, runViewMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  sendMessagesMock: vi.fn(),
  runViewMock: vi.fn(),
}));

vi.mock('@memberjunction/lists', () => ({
  AudienceResolver: class {
    Resolve = resolveMock;
  },
}));

vi.mock('@memberjunction/core', () => {
  class RunView {
    constructor(_p?: unknown) {}
    static FromMetadataProvider() {
      return new RunView();
    }
    RunView(params: unknown) {
      return runViewMock(params);
    }
  }
  class Metadata {
    EntityByName(name: string) {
      if (name === 'Contacts') return { PrimaryKeys: [{ Name: 'ID' }] };
      if (name === 'Composites') return { PrimaryKeys: [{ Name: 'A' }, { Name: 'B' }] };
      return undefined;
    }
  }
  return { Metadata, RunView, LogError: () => {} };
});

vi.mock('@memberjunction/communication-types', () => ({
  MessageRecipient: class {
    To = '';
    FullName?: string;
    ContextData: unknown = undefined;
  },
  // The engine import below is mocked too; communication-types only
  // needs these named exports to satisfy the import statement.
}));

vi.mock('../Engine', () => ({
  CommunicationEngine: {
    Instance: {
      SendMessages: sendMessagesMock,
    },
  },
}));

import { SendToAudience } from '../SendToAudience';

const CTX_USER = { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] };

function args(over: Partial<Parameters<typeof SendToAudience>[0]> = {}) {
  return {
    Source: { kind: 'view' as const, viewId: 'v1' },
    RecipientField: 'Email',
    ProviderName: 'SendGrid',
    ProviderMessageTypeName: 'SingleEmail',
    Message: { To: '', Subject: 'Hi' } as never,
    ContextUser: CTX_USER as never,
    ...over,
  };
}

describe('SendToAudience', () => {
  beforeEach(() => {
    resolveMock.mockReset();
    sendMessagesMock.mockReset();
    runViewMock.mockReset();
    sendMessagesMock.mockResolvedValue([]);
  });

  it('returns an empty result when the audience is empty (no send)', async () => {
    resolveMock.mockResolvedValue({ EntityName: 'Contacts', RecordIds: [] });
    const result = await SendToAudience(args());
    expect(result).toEqual({
      TotalAudienceSize: 0,
      WillReceiveCount: 0,
      SkippedCount: 0,
      Skipped: [],
      Results: [],
      PreviewOnly: false,
    });
    expect(sendMessagesMock).not.toHaveBeenCalled();
  });

  it('builds recipients from the mapped field', async () => {
    resolveMock.mockResolvedValue({ EntityName: 'Contacts', RecordIds: ['a', 'b'] });
    runViewMock.mockResolvedValue({
      Success: true,
      Results: [
        { ID: 'a', Email: 'alice@x', FirstLastName: 'Alice' },
        { ID: 'b', Email: 'bob@x', FirstLastName: 'Bob' },
      ],
    });
    sendMessagesMock.mockResolvedValue([
      { Success: true, Error: '' },
      { Success: true, Error: '' },
    ]);
    const result = await SendToAudience(args({ FullNameField: 'FirstLastName' }));
    expect(result.TotalAudienceSize).toBe(2);
    expect(result.WillReceiveCount).toBe(2);
    expect(result.SkippedCount).toBe(0);
    expect(sendMessagesMock).toHaveBeenCalledTimes(1);
    const recipients = sendMessagesMock.mock.calls[0][3];
    expect(recipients).toHaveLength(2);
    expect(recipients[0].To).toBe('alice@x');
    expect(recipients[0].FullName).toBe('Alice');
  });

  it('skips records whose recipient field is missing or empty', async () => {
    resolveMock.mockResolvedValue({ EntityName: 'Contacts', RecordIds: ['a', 'b', 'c'] });
    runViewMock.mockResolvedValue({
      Success: true,
      Results: [
        { ID: 'a', Email: 'alice@x' },
        { ID: 'b', Email: '' },
        { ID: 'c', Email: null },
      ],
    });
    const result = await SendToAudience(args());
    expect(result.TotalAudienceSize).toBe(3);
    expect(result.WillReceiveCount).toBe(1);
    expect(result.SkippedCount).toBe(2);
    expect(result.Skipped.map((s) => s.RecordID).sort()).toEqual(['b', 'c']);
    expect(result.Skipped.every((s) => s.Reason === 'MISSING_RECIPIENT_FIELD')).toBe(true);
  });

  it('does not call SendMessages when PreviewOnly is true', async () => {
    resolveMock.mockResolvedValue({ EntityName: 'Contacts', RecordIds: ['a'] });
    runViewMock.mockResolvedValue({
      Success: true,
      Results: [{ ID: 'a', Email: 'a@x' }],
    });
    const result = await SendToAudience(args({ PreviewOnly: true }));
    expect(result.PreviewOnly).toBe(true);
    expect(result.WillReceiveCount).toBe(1);
    expect(sendMessagesMock).not.toHaveBeenCalled();
  });

  it('reports all records as skipped for composite-PK entities', async () => {
    resolveMock.mockResolvedValue({ EntityName: 'Composites', RecordIds: ['A|1||B|x', 'A|2||B|y'] });
    const result = await SendToAudience(args({ Source: { kind: 'view', viewId: 'v' } }));
    expect(result.SkippedCount).toBe(2);
    expect(result.WillReceiveCount).toBe(0);
    expect(result.Skipped.every((s) => s.Reason === 'INVALID_RECIPIENT_FIELD')).toBe(true);
    expect(sendMessagesMock).not.toHaveBeenCalled();
  });
});

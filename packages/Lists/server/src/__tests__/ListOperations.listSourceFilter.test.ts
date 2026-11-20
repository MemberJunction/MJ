/**
 * A list source reads its members with a `MJ: List Details` filter on the list's ID. These tests pin
 * that the filter holds only a well-formed list ID and that a failed read does not return the
 * database error text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunViewImpl = vi.fn();
const mockGetEntityObject = vi.fn();

vi.mock('@memberjunction/core', () => {
  class RunView {
    static FromMetadataProvider(_p: unknown) {
      return new RunView();
    }
    RunView(params: unknown, _ctx?: unknown) {
      return mockRunViewImpl(params);
    }
  }
  class Metadata {
    static get Provider() {
      return {};
    }
    EntityByID(_id: string) {
      return { ID: 'entity-contacts', Name: 'Contacts' };
    }
    GetEntityObject(entityName: string, _ctx?: unknown) {
      return mockGetEntityObject(entityName);
    }
  }
  return { RunView, Metadata, LogError: () => {}, LogStatus: () => {} };
});

vi.mock('@memberjunction/core-entities', () => ({
  MJListDetailEntity: class {},
  MJListEntity: class {},
}));

import { ListOperations } from '../ListOperations';

const LIST_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CTX_USER = { ID: 'u1', Name: 'Test', Email: 't@x', UserRoles: [] };

/** A list entity whose Load matches any ID that starts with the list's ID. */
function stubList(): void {
  mockGetEntityObject.mockResolvedValue({
    ID: LIST_ID,
    EntityID: 'entity-contacts',
    Load: async (id: string) => id.toLowerCase().startsWith(LIST_ID),
  });
}

function ops(): ListOperations {
  return new ListOperations(CTX_USER as unknown as ConstructorParameters<typeof ListOperations>[0]);
}

describe('ListOperations list source filter', () => {
  beforeEach(() => {
    mockRunViewImpl.mockReset();
    mockGetEntityObject.mockReset();
    stubList();
  });

  it('builds the member filter from the loaded list ID, not from the caller text', async () => {
    mockRunViewImpl.mockResolvedValue({ Success: true, Results: [], RowCount: 0 });
    await ops().GetListMembers(`${LIST_ID}' AND '1'='1`);
    expect(mockRunViewImpl).toHaveBeenCalledWith(expect.objectContaining({ ExtraFilter: `ListID='${LIST_ID}'` }));
  });

  it('does not return the database error text when the member query fails', async () => {
    mockRunViewImpl.mockResolvedValue({ Success: false, ErrorMessage: 'DB-ERROR-MARKER', Results: [] });
    await expect(ops().GetListMembers(LIST_ID)).rejects.toThrow(/^(?!.*DB-ERROR-MARKER)/);
  });
});

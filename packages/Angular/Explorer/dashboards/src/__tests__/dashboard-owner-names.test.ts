/**
 * Tests for the owner text of the Library's dashboard cards (`shared/dashboard-owner-names.ts`):
 * "You" for the user's own dashboards, else the owner's first and last name, else the user name
 * without its e-mail domain, read from MJ: Users in one RunView.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import {
  BuildOwnerLabels,
  DashboardOwnerRow,
  LoadDashboardOwnerNames,
  NameWithoutEmailDomain,
  OwnerIdsToLoad,
  UserDisplayName,
} from '../shared/dashboard-owner-names';

/** What the provider double's RunView returns. */
interface OwnerReadResult {
  Success: boolean;
  Results?: DashboardOwnerRow[];
  ErrorMessage?: string;
}

/** A provider whose RunView returns `result`. */
function providerReturning(result: OwnerReadResult) {
  const RunView = vi.fn(async (_params: RunViewParams) => ({ Results: [], ...result }));
  return { provider: { CurrentUser: { ID: 'U-ME' }, RunView } as unknown as IMetadataProvider, RunView };
}

const d = (ID: string, UserID: string, User: string) => ({ ID, UserID, User }) as unknown as MJDashboardEntity;

describe('UserDisplayName', () => {
  it('joins the first and last name', () => {
    expect(UserDisplayName({ Name: 'ana@x.com', FirstName: 'Ana', LastName: 'Ruiz' })).toBe('Ana Ruiz');
  });

  it('uses the one part that is set, trimmed', () => {
    expect(UserDisplayName({ Name: 'ana@x.com', FirstName: ' Ana ', LastName: null })).toBe('Ana');
    expect(UserDisplayName({ Name: 'ana@x.com', FirstName: '  ', LastName: 'Ruiz' })).toBe('Ruiz');
  });

  it('falls back to the user name', () => {
    expect(UserDisplayName({ Name: 'Ana R', FirstName: null, LastName: '' })).toBe('Ana R');
  });

  it('drops an e-mail domain from the user name', () => {
    expect(UserDisplayName({ Name: 'ana.ruiz@x.com', FirstName: null, LastName: null })).toBe('ana.ruiz');
  });
});

describe('NameWithoutEmailDomain', () => {
  it('keeps the part before the @ of an e-mail', () => {
    expect(NameWithoutEmailDomain(' ana.ruiz@x.com ')).toBe('ana.ruiz');
  });

  it('keeps a name that is not an e-mail, and a name that starts with @', () => {
    expect(NameWithoutEmailDomain('Ana Ruiz')).toBe('Ana Ruiz');
    expect(NameWithoutEmailDomain('@ana')).toBe('@ana');
  });

  it('returns empty text for no name', () => {
    expect(NameWithoutEmailDomain(null)).toBe('');
    expect(NameWithoutEmailDomain(undefined)).toBe('');
    expect(NameWithoutEmailDomain('   ')).toBe('');
  });
});

describe('OwnerIdsToLoad', () => {
  it('lists other owners once, normalized, skipping the user and known ids', () => {
    const list = [d('1', 'U-ME', ''), d('2', 'U-ANA', ''), d('3', 'u-ana', ''), d('4', 'U-BO', '')];
    expect(OwnerIdsToLoad(list, 'u-me', new Map([['u-bo', 'Bo']]))).toEqual(['u-ana']);
  });

  it('skips a dashboard with no owner id', () => {
    expect(OwnerIdsToLoad([d('1', '', '')], 'u-me', new Map())).toEqual([]);
  });
});

describe('LoadDashboardOwnerNames', () => {
  it('reads the owners in one simple RunView and keys the names by normalized id', async () => {
    const { provider, RunView } = providerReturning({ Success: true, Results: [{ ID: 'U-ANA', Name: 'ana@x.com', FirstName: 'Ana', LastName: 'Ruiz' }] });
    const names = await LoadDashboardOwnerNames(provider, ['u-ana']);
    expect(RunView).toHaveBeenCalledTimes(1);
    expect(RunView.mock.calls[0][0]).toMatchObject({
      EntityName: 'MJ: Users',
      ResultType: 'simple',
      Fields: ['ID', 'Name', 'FirstName', 'LastName'],
      ExtraFilter: "ID IN ('u-ana')",
    });
    expect(names.get('u-ana')).toBe('Ana Ruiz');
  });

  it('escapes each id in the filter', async () => {
    const { provider, RunView } = providerReturning({ Success: true });
    await LoadDashboardOwnerNames(provider, ['u-1', "o'brien"]);
    expect(RunView.mock.calls[0][0].ExtraFilter).toBe("ID IN ('u-1', 'o''brien')");
  });

  it('reads nothing for no owners', async () => {
    const { provider, RunView } = providerReturning({ Success: true });
    expect((await LoadDashboardOwnerNames(provider, [])).size).toBe(0);
    expect(RunView).not.toHaveBeenCalled();
  });

  it('returns no names and logs the error when the read fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { provider } = providerReturning({ Success: false, ErrorMessage: 'denied' });
    expect((await LoadDashboardOwnerNames(provider, ['u-ana'])).size).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('denied'));
  });
});

describe('BuildOwnerLabels', () => {
  it("labels the user's dashboards You, others by name, else by the User field without its domain", () => {
    const labels = BuildOwnerLabels(
      [d('1', 'U-ME', 'me@x.com'), d('2', 'U-ANA', 'ana@x.com'), d('3', 'U-BO', 'bo@x.com')],
      'u-me',
      new Map([['u-ana', 'Ana Ruiz'], ['u-bo', '']])
    );
    expect([...labels]).toEqual([['1', 'You'], ['2', 'Ana Ruiz'], ['3', 'bo']]);
  });

  it('leaves out a dashboard with no owner text at all', () => {
    expect(BuildOwnerLabels([d('1', 'U-BO', '')], 'u-me', new Map()).size).toBe(0);
  });
});

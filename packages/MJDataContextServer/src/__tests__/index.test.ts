import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('mssql', () => ({
  Request: class {
    constructor() {}
    query = mockQuery;
  },
  ConnectionPool: class {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: Function) => {},
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
  UserInfo: class {},
}));

vi.mock('@memberjunction/data-context', () => ({
  DataContextItem: class {
    SQL: string | undefined;
    Data: unknown[] | undefined;
    DataLoadingError: string | undefined;
    DataLoaded = false;
  },
}));

import { DataContextItemServer } from '../index';

describe('DataContextItemServer', () => {
  let item: DataContextItemServer;

  beforeEach(() => {
    item = new DataContextItemServer();
    vi.clearAllMocks();
  });

  describe('LoadFromSQL', () => {
    it('should be a DataContextItemServer instance', () => {
      expect(item).toBeInstanceOf(DataContextItemServer);
    });

    it('should have SQL property from parent', () => {
      item.SQL = 'SELECT TOP 10 * FROM Users';
      expect(item.SQL).toBe('SELECT TOP 10 * FROM Users');
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityInfo, RunViewParams, RunQueryParams } from '@memberjunction/core';
import { ExternalDataSourceReadRouterImpl } from '../ExternalDataSourceReadRouterImpl';
import { ExternalDataSourceRouter } from '../ExternalDataSourceRouter';
import { BaseExternalDataSourceDriver } from '../BaseExternalDataSourceDriver';

/** Build a fake driver whose RunView/RunNativeQuery are spies returning canned results. */
function makeFakeDriver(overrides: Partial<BaseExternalDataSourceDriver> = {}) {
  return {
    RunView: vi.fn(),
    RunNativeQuery: vi.fn(),
    ...overrides,
  } as unknown as BaseExternalDataSourceDriver;
}

function mockResolve(driver: BaseExternalDataSourceDriver) {
  return vi.spyOn(ExternalDataSourceRouter.Instance, 'resolve').mockResolvedValue({
    driver,
    dataSource: { ID: 'ds-1', Name: 'Demo' } as never,
    dataSourceType: { DriverClass: 'PostgresExternalDriver' } as never,
  });
}

describe('ExternalDataSourceReadRouterImpl', () => {
  const impl = new ExternalDataSourceReadRouterImpl();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('RunViewExternal', () => {
    it('maps RunViewParams to ExternalViewParams and the driver result to a RunViewResult', async () => {
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        rows: [{ id: 1, name: 'Acme' }],
        totalRowCount: 42,
        executionTimeMs: 7,
      });
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'Sales', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'sales_fact', BaseTable: 'sales' });
      const params: RunViewParams = { EntityName: 'Sales', ExtraFilter: "region = 'NW'", OrderBy: 'id DESC', Fields: ['id', 'name'], MaxRows: 10, StartRow: 20 };

      const res = await impl.RunViewExternal(entity, params);

      // driver received the translated params (ExternalObjectName preferred over BaseTable)
      expect(driver.RunView).toHaveBeenCalledTimes(1);
      const [, viewParams] = (driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams).toEqual({ objectName: 'sales_fact', fields: ['id', 'name'], filter: "region = 'NW'", orderBy: 'id DESC', maxRows: 10, offset: 20 });

      // result mapped to MJ RunViewResult shape
      expect(res.Success).toBe(true);
      expect(res.Results).toEqual([{ id: 1, name: 'Acme' }]);
      expect(res.RowCount).toBe(1);
      expect(res.TotalRowCount).toBe(42);
    });

    it('falls back to BaseTable then Name when ExternalObjectName is unset', async () => {
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'Things', ExternalDataSourceID: 'ds-1', BaseTable: 'things_table' });
      await impl.RunViewExternal(entity, { EntityName: 'Things' });

      const [, viewParams] = (driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams.objectName).toBe('things_table');
    });

    it('caps an unbounded RunView: defaults maxRows to UserViewMaxRows, then to 1000', async () => {
      // (a) no MaxRows + no UserViewMaxRows -> default cap of 1000
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver);
      const entity = new EntityInfo({ Name: 'Big', ExternalDataSourceID: 'ds-1', BaseTable: 'big' });
      await impl.RunViewExternal(entity, { EntityName: 'Big' });
      let [, viewParams] = (driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams.maxRows).toBe(1000);

      // (b) no MaxRows but UserViewMaxRows set -> uses the entity's configured cap
      vi.restoreAllMocks();
      const driver2 = makeFakeDriver();
      (driver2.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver2);
      const entity2 = new EntityInfo({ Name: 'Big', ExternalDataSourceID: 'ds-1', BaseTable: 'big', UserViewMaxRows: 250 });
      await impl.RunViewExternal(entity2, { EntityName: 'Big' });
      [, viewParams] = (driver2.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams.maxRows).toBe(250);
    });

    it('returns a failed RunViewResult (not a throw) when the driver reports failure', async () => {
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, rows: [], errorMessage: 'boom', executionTimeMs: 3 });
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'X', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'x' });
      const res = await impl.RunViewExternal(entity, { EntityName: 'X' });
      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toBe('boom');
      expect(res.Results).toEqual([]);
    });
  });

  describe('RunQueryExternal', () => {
    it('runs the rendered SQL via the driver and maps the result', async () => {
      const driver = makeFakeDriver();
      (driver.RunNativeQuery as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        rows: [{ total: 5 }],
        rowCount: 1,
        executionTimeMs: 9,
      });
      mockResolve(driver);

      const params: RunQueryParams = { QueryID: 'q-1' };
      const res = await impl.RunQueryExternal('ds-1', 'q-1', 'Total Sales', 'SELECT count(*) AS total FROM sales', params);

      expect(driver.RunNativeQuery).toHaveBeenCalledTimes(1);
      const [, sql] = (driver.RunNativeQuery as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(sql).toBe('SELECT count(*) AS total FROM sales');
      expect(res.Success).toBe(true);
      expect(res.QueryID).toBe('q-1');
      expect(res.QueryName).toBe('Total Sales');
      expect(res.Results).toEqual([{ total: 5 }]);
      expect(res.RowCount).toBe(1);
    });

    it('returns a failed RunQueryResult when the driver throws', async () => {
      const driver = makeFakeDriver();
      (driver.RunNativeQuery as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection refused'));
      mockResolve(driver);

      const res = await impl.RunQueryExternal('ds-1', 'q-2', 'Bad', 'SELECT 1', { QueryID: 'q-2' });
      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toBe('connection refused');
      expect(res.QueryID).toBe('q-2');
    });
  });

  describe('GetCacheTTLSeconds', () => {
    const mockResolveWithTTL = (ttl: unknown) =>
      vi.spyOn(ExternalDataSourceRouter.Instance, 'resolve').mockResolvedValue({
        driver: makeFakeDriver(),
        dataSource: { ID: 'ds-1', Name: 'Demo', DefaultCacheTTLSeconds: ttl } as never,
        dataSourceType: { DriverClass: 'PostgresExternalDriver' } as never,
      });

    it("returns the data source's DefaultCacheTTLSeconds when set", async () => {
      mockResolveWithTTL(120);
      expect(await impl.GetCacheTTLSeconds('ds-1')).toBe(120);
    });

    it('returns 0 (caching disabled) when DefaultCacheTTLSeconds is explicitly 0', async () => {
      mockResolveWithTTL(0);
      expect(await impl.GetCacheTTLSeconds('ds-1')).toBe(0);
    });

    it('falls back to the default 300 when DefaultCacheTTLSeconds is null/unset', async () => {
      mockResolveWithTTL(null);
      expect(await impl.GetCacheTTLSeconds('ds-1')).toBe(300);
    });

    it('falls back to the default 300 when the source cannot be resolved', async () => {
      vi.spyOn(ExternalDataSourceRouter.Instance, 'resolve').mockRejectedValue(new Error('not found'));
      expect(await impl.GetCacheTTLSeconds('missing')).toBe(300);
    });
  });
});

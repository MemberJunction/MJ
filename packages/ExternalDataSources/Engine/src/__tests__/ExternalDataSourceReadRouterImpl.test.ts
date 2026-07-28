import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompositeKey, EntityInfo, KeyValuePair, RunViewParams, RunQueryParams } from '@memberjunction/core';
import { ExternalDataSourceReadRouterImpl } from '../ExternalDataSourceReadRouterImpl';
import { ExternalDataSourceRouter } from '../ExternalDataSourceRouter';
import { BaseExternalDataSourceDriver } from '../BaseExternalDataSourceDriver';

/** Build a fake driver whose RunView/RunNativeQuery/LoadSingle are spies returning canned results. */
function makeFakeDriver(overrides: Partial<BaseExternalDataSourceDriver> = {}) {
  return {
    RunView: vi.fn(),
    RunNativeQuery: vi.fn(),
    LoadSingle: vi.fn(),
    // Mirror the base driver's default resolution (bare name). SQL drivers override to schema-qualify;
    // tests that need that behavior override ResolveObjectName here.
    ResolveObjectName: (entity: EntityInfo) => entity.ExternalObjectName || entity.BaseTable || entity.Name,
    ...overrides,
  } as unknown as BaseExternalDataSourceDriver;
}

/** Build a CompositeKey from field/value pairs. */
function compositeKey(pairs: Array<[string, unknown]>): CompositeKey {
  return new CompositeKey(pairs.map(([f, v]) => new KeyValuePair(f, v)));
}

function mockResolve(driver: BaseExternalDataSourceDriver) {
  return vi.spyOn(ExternalDataSourceRouter.Instance, 'Resolve').mockResolvedValue({
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

    it('delegates object-name resolution to the driver and passes its result through verbatim (fix B)', async () => {
      // The router is dialect-agnostic: whatever driver.ResolveObjectName returns is what reaches RunView.
      // SQL drivers schema-qualify (tested in the SQL driver suites); non-SQL drivers (e.g. MongoDB) return
      // the bare collection name (tested in the Mongo suite). Here we assert the router doesn't second-guess
      // the driver — a regression guard against re-introducing router-side, driver-blind qualification that
      // would break MongoDB (which treats the name as a literal collection).
      const driver = makeFakeDriver({ ResolveObjectName: () => 'bronze.sales' });
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'Bronze Sales', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'sales', SchemaName: 'bronze', BaseTable: 'sales' });
      await impl.RunViewExternal(entity, { EntityName: 'Bronze Sales' });

      const [, viewParams] = (driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams.objectName).toBe('bronze.sales');
    });

    it('fails clearly (no driver call) when offset-paginating a PK-less entity with no OrderBy', async () => {
      const driver = makeFakeDriver();
      mockResolve(driver);
      // No Fields => no primary keys; offset paging with no OrderBy would be nondeterministic.
      const entity = new EntityInfo({ Name: 'NoPK', ExternalDataSourceID: 'ds-1', BaseTable: 'nopk' });
      const res = await impl.RunViewExternal(entity, { EntityName: 'NoPK', StartRow: 20, MaxRows: 10 });
      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toMatch(/no primary key/i);
      expect(driver.RunView).not.toHaveBeenCalled();
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

    it('caps an explicit MaxRows above the hard ceiling (fail-closed against a metered source)', async () => {
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver);
      const entity = new EntityInfo({ Name: 'Big', ExternalDataSourceID: 'ds-1', BaseTable: 'big' });
      await impl.RunViewExternal(entity, { EntityName: 'Big', MaxRows: 100_000_000 });
      const [, viewParams] = (driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams.maxRows).toBe(50_000); // HARD_MAX_EXTERNAL_ROWS — not the requested 100M
    });

    it('honors a per-source ConnectionConfig maxRowLimit as the effective ceiling', async () => {
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      vi.spyOn(ExternalDataSourceRouter.Instance, 'Resolve').mockResolvedValue({
        driver,
        dataSource: { ID: 'ds-1', Name: 'Demo', ConnectionConfig: JSON.stringify({ maxRowLimit: 250 }) } as never,
        dataSourceType: { DriverClass: 'PostgresExternalDriver' } as never,
      });
      const entity = new EntityInfo({ Name: 'Big', ExternalDataSourceID: 'ds-1', BaseTable: 'big' });
      await impl.RunViewExternal(entity, { EntityName: 'Big', MaxRows: 100_000_000 });
      const [, viewParams] = (driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams.maxRows).toBe(250); // per-source override caps below the hard default
    });

    it('passes the entity PK as defaultOrderByColumns (raw, for the driver to quote) when paginating without an explicit order', async () => {
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver);

      // Paginated read (StartRow set) with NO OrderBy → the router passes the raw PK name(s) as
      // defaultOrderByColumns so the driver can quote them per-dialect; it does NOT pre-build orderBy.
      const entity = new EntityInfo({ Name: 'Sales', ExternalDataSourceID: 'ds-1', BaseTable: 'sales', Fields: [{ Name: 'ID', IsPrimaryKey: true }] });
      await impl.RunViewExternal(entity, { EntityName: 'Sales', StartRow: 20, MaxRows: 10 });

      const [, viewParams] = (driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(viewParams.orderBy).toBeUndefined();
      expect(viewParams.defaultOrderByColumns).toEqual(['ID']);
      expect(viewParams.offset).toBe(20);
    });

    it('does NOT override a caller-supplied OrderBy, and adds no default order for non-paginated reads', async () => {
      const driver = makeFakeDriver();
      (driver.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'Sales', ExternalDataSourceID: 'ds-1', BaseTable: 'sales', Fields: [{ Name: 'ID', IsPrimaryKey: true }] });
      // caller order is respected even when paginating (and no default columns are added)
      await impl.RunViewExternal(entity, { EntityName: 'Sales', StartRow: 5, MaxRows: 10, OrderBy: 'Name ASC' });
      expect((driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0][1].orderBy).toBe('Name ASC');
      expect((driver.RunView as ReturnType<typeof vi.fn>).mock.calls[0][1].defaultOrderByColumns).toBeUndefined();

      // no pagination → no synthesized order at all
      vi.restoreAllMocks();
      const driver2 = makeFakeDriver();
      (driver2.RunView as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, rows: [], executionTimeMs: 1 });
      mockResolve(driver2);
      const entity2 = new EntityInfo({ Name: 'Sales', ExternalDataSourceID: 'ds-1', BaseTable: 'sales', Fields: [{ Name: 'ID', IsPrimaryKey: true }] });
      await impl.RunViewExternal(entity2, { EntityName: 'Sales', MaxRows: 10 });
      expect((driver2.RunView as ReturnType<typeof vi.fn>).mock.calls[0][1].orderBy).toBeUndefined();
      expect((driver2.RunView as ReturnType<typeof vi.fn>).mock.calls[0][1].defaultOrderByColumns).toBeUndefined();
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

  describe('LoadExternalRecord', () => {
    it('passes the full composite key to the driver and wraps the row in a RunViewResult', async () => {
      const driver = makeFakeDriver();
      (driver.LoadSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ OrderId: 10, Region: 'EU', total: 5 });
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'Orders', ExternalDataSourceID: 'ds-1', ExternalObjectName: 'orders_fact', BaseTable: 'orders' });
      const res = await impl.LoadExternalRecord(entity, compositeKey([['OrderId', 10], ['Region', 'EU']]));

      expect(driver.LoadSingle).toHaveBeenCalledTimes(1);
      const [, objectName, primaryKeys] = (driver.LoadSingle as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(objectName).toBe('orders_fact'); // ExternalObjectName preferred over BaseTable
      expect(primaryKeys).toEqual([{ name: 'OrderId', value: 10 }, { name: 'Region', value: 'EU' }]);

      expect(res.Success).toBe(true);
      expect(res.Results).toEqual([{ OrderId: 10, Region: 'EU', total: 5 }]);
      expect(res.RowCount).toBe(1);
    });

    it('returns an empty result set (success, no throw) when the record is not found', async () => {
      const driver = makeFakeDriver();
      (driver.LoadSingle as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'Orders', ExternalDataSourceID: 'ds-1', BaseTable: 'orders' });
      const res = await impl.LoadExternalRecord(entity, compositeKey([['ID', 999]]));
      expect(res.Success).toBe(true);
      expect(res.Results).toEqual([]);
      expect(res.RowCount).toBe(0);
    });

    it('fails clearly (no driver call) when no primary key values are supplied', async () => {
      const driver = makeFakeDriver();
      mockResolve(driver);
      const entity = new EntityInfo({ Name: 'Orders', ExternalDataSourceID: 'ds-1', BaseTable: 'orders' });
      const res = await impl.LoadExternalRecord(entity, compositeKey([]));
      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toMatch(/no primary key/i);
      expect(driver.LoadSingle).not.toHaveBeenCalled();
    });

    it('returns a failed RunViewResult (not a throw) when the driver throws', async () => {
      const driver = makeFakeDriver();
      (driver.LoadSingle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection refused'));
      mockResolve(driver);

      const entity = new EntityInfo({ Name: 'Orders', ExternalDataSourceID: 'ds-1', BaseTable: 'orders' });
      const res = await impl.LoadExternalRecord(entity, compositeKey([['ID', 1]]));
      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toBe('connection refused');
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
      vi.spyOn(ExternalDataSourceRouter.Instance, 'Resolve').mockResolvedValue({
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
      vi.spyOn(ExternalDataSourceRouter.Instance, 'Resolve').mockRejectedValue(new Error('not found'));
      expect(await impl.GetCacheTTLSeconds('missing')).toBe(300);
    });
  });
});

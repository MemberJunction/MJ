/**
 * Data hooks for the Explorer surface (entities, records, queries, dashboards).
 * All wrap the `@/data/services/explorer` service layer: entity/query lookups
 * read from MJ's in-memory Metadata (synchronous, cheap), while records, query
 * runs, and dashboards hit RunView/RunQuery. Every hook gates on the MJ
 * provider's `status === 'ready'` and returns `null`/idle until then.
 */
import { useCallback, useEffect, useState } from 'react';
import { useMJ } from '@/providers/mj-provider';
import {
    loadEntities, loadEntityRecords, loadRecordDetail,
    loadQueries, runQuery, loadDashboards, loadDashboard,
    entityCount, queryCount,
    type EntityListItem, type EntityRecordsLoad, type RecordDetailLoad,
    type QueryListItem, type QueryRunResult, type DashboardListItem, type DashboardLoad,
} from '@/data/services/explorer';
import {
    loadRecordForEdit, saveRecord,
    type RecordEditLoad, type RecordSaveResult, type FieldValue, type FieldValidationError,
} from '@/data/services/record-edit';

/**
 * Hub counts for the Explorer landing screen — number of entities, queries,
 * and dashboards. Entity/query counts come from in-memory Metadata (cheap);
 * the dashboard count requires a `loadDashboards` fetch (errors coalesce to an
 * empty list). Guarded by a cancellation flag.
 *
 * @returns `{ entities, queries, dashboards }` counts, or `null` until loaded.
 */
export function useExplorerCounts() {
    const { status } = useMJ();
    const [counts, setCounts] = useState<{ entities: number; queries: number; dashboards: number } | null>(null);

    useEffect(() => {
        if (status !== 'ready') return;
        let cancelled = false;
        (async () => {
            const dashboards = await loadDashboards().catch(() => []);
            if (cancelled) return;
            setCounts({ entities: entityCount(), queries: queryCount(), dashboards: dashboards.length });
        })();
        return () => { cancelled = true; };
    }, [status]);

    return counts;
}

/**
 * Lists all entities from in-memory Metadata via `loadEntities` (synchronous).
 * @returns The {@link EntityListItem}[] once MJ is `ready`, else `null`; on any
 *   error resolves to an empty array.
 */
export function useEntities() {
    const { status } = useMJ();
    const [entities, setEntities] = useState<EntityListItem[] | null>(null);
    useEffect(() => {
        if (status !== 'ready') return;
        try { setEntities(loadEntities()); } catch { setEntities([]); }
    }, [status]);
    return entities;
}

/**
 * Loads a page of records for a named entity via `loadEntityRecords` (RunView).
 * @param entityName The entity to query; `undefined` keeps the hook idle.
 * @returns `{ data, loading, error, refresh }` — the {@link EntityRecordsLoad}
 *   (or `null`), in-flight flag, last error, and a manual `refresh` handler.
 */
export function useEntityRecords(entityName: string | undefined) {
    const { status } = useMJ();
    const [data, setData] = useState<EntityRecordsLoad | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        if (status !== 'ready' || !entityName) return;
        setLoading(true);
        setError(null);
        try { setData(await loadEntityRecords(entityName)); }
        catch (e) { setError(e instanceof Error ? e : new Error(String(e))); }
        finally { setLoading(false); }
    }, [status, entityName]);

    useEffect(() => { void refresh(); }, [refresh]);
    return { data, loading, error, refresh };
}

/**
 * Loads the full field detail for a single record via `loadRecordDetail`
 * (RunView). Cancellation-guarded against id changes / unmount.
 * @param entityName The entity of the record.
 * @param recordId The primary key of the record; both args must be defined for
 *   the hook to load.
 * @returns `{ data, loading, error }` — the {@link RecordDetailLoad} (or
 *   `null`), in-flight flag, and last error.
 */
export function useRecordDetail(entityName: string | undefined, recordId: string | undefined) {
    const { status } = useMJ();
    const [data, setData] = useState<RecordDetailLoad | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (status !== 'ready' || !entityName || !recordId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const d = await loadRecordDetail(entityName, recordId);
                if (!cancelled) setData(d);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [status, entityName, recordId]);

    return { data, loading, error };
}

/**
 * Edit-mode companion to {@link useRecordDetail}. Loads a record into an editable
 * form model via `loadRecordForEdit`, owns the mutable `values` bag + inline
 * validation `errors`, and exposes `setValue`/`save` handlers. Cancellation-guarded
 * against id changes / unmount. Save failures are captured into `errors`/the
 * returned {@link RecordSaveResult} rather than thrown.
 *
 * @param entityName The entity of the record; `undefined` keeps the hook idle.
 * @param recordId The primary key of the record; both args must be defined to load.
 * @returns `{ load, values, errors, loading, saving, error, canUpdate, setValue, save }`.
 */
export function useRecordEditor(entityName: string | undefined, recordId: string | undefined) {
    const { status } = useMJ();
    const [load, setLoad] = useState<RecordEditLoad | null>(null);
    const [values, setValues] = useState<Record<string, FieldValue>>({});
    const [errors, setErrors] = useState<FieldValidationError[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (status !== 'ready' || !entityName || !recordId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const l = await loadRecordForEdit(entityName, recordId);
                if (cancelled) return;
                setLoad(l);
                setValues(l ? { ...l.values } : {});
                setErrors([]);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [status, entityName, recordId]);

    /** Update one field value and clear any inline error previously shown for it. */
    const setValue = useCallback((key: string, value: FieldValue) => {
        setValues((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => prev.filter((e) => e.key !== key));
    }, []);

    /** Validate + persist the current edits; surfaces field errors into `errors`. */
    const save = useCallback(async (): Promise<RecordSaveResult> => {
        if (!load) return { success: false, error: 'Nothing to save.' };
        setSaving(true);
        setErrors([]);
        try {
            const result = await saveRecord(load, values);
            if (!result.success && result.validationErrors) setErrors(result.validationErrors);
            return result;
        } finally {
            setSaving(false);
        }
    }, [load, values]);

    return { load, values, errors, loading, saving, error, canUpdate: load?.canUpdate ?? false, setValue, save };
}

/**
 * Lists all saved queries from in-memory Metadata via `loadQueries`.
 * @returns The {@link QueryListItem}[] once MJ is `ready`, else `null`; on any
 *   error resolves to an empty array.
 */
export function useQueries() {
    const { status } = useMJ();
    const [queries, setQueries] = useState<QueryListItem[] | null>(null);
    useEffect(() => {
        if (status !== 'ready') return;
        try { setQueries(loadQueries()); } catch { setQueries([]); }
    }, [status]);
    return queries;
}

/**
 * Runs a saved query via `runQuery` (RunQuery) and exposes its tabular result.
 * Auto-runs on mount/id-change; can be re-run manually with parameters. Errors
 * are captured into the result as `{ success: false, errorMessage }` rather
 * than thrown.
 *
 * @param queryId The query to run; `undefined` keeps the hook idle.
 * @returns `{ result, loading, run }` — the {@link QueryRunResult} (or `null`),
 *   in-flight flag, and a `run(parameters?)` handler.
 */
export function useQueryRun(queryId: string | undefined) {
    const { status } = useMJ();
    const [result, setResult] = useState<QueryRunResult | null>(null);
    const [loading, setLoading] = useState(false);

    /** Execute the query; captures failures into `result` instead of throwing. */
    const run = useCallback(async (parameters?: Record<string, unknown>) => {
        if (status !== 'ready' || !queryId) return;
        setLoading(true);
        try { setResult(await runQuery(queryId, parameters)); }
        catch (e) { setResult({ columns: [], rows: [], rowCount: 0, success: false, errorMessage: e instanceof Error ? e.message : String(e) }); }
        finally { setLoading(false); }
    }, [status, queryId]);

    useEffect(() => { void run(); }, [run]);
    return { result, loading, run };
}

/**
 * Loads the list of dashboards via `loadDashboards` (async). Cancellation-
 * guarded; errors coalesce to an empty list.
 * @returns The {@link DashboardListItem}[] once loaded, else `null`.
 */
export function useDashboards() {
    const { status } = useMJ();
    const [dashboards, setDashboards] = useState<DashboardListItem[] | null>(null);
    useEffect(() => {
        if (status !== 'ready') return;
        let cancelled = false;
        loadDashboards().then((d) => { if (!cancelled) setDashboards(d); }).catch(() => { if (!cancelled) setDashboards([]); });
        return () => { cancelled = true; };
    }, [status]);
    return dashboards;
}

/**
 * Loads a single dashboard resolved into renderable parts via `loadDashboard`.
 * Cancellation-guarded against id changes / unmount.
 * @param dashboardId The dashboard to load; `undefined` keeps the hook idle.
 * @returns `{ dashboard, loading, error }` — the {@link DashboardLoad} (or
 *   `null`), in-flight flag, and last error.
 */
export function useDashboard(dashboardId: string | undefined) {
    const { status } = useMJ();
    const [dashboard, setDashboard] = useState<DashboardLoad | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (status !== 'ready' || !dashboardId) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                const d = await loadDashboard(dashboardId);
                if (!cancelled) setDashboard(d);
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [status, dashboardId]);

    return { dashboard, loading, error };
}

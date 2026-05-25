import { useCallback, useEffect, useState } from 'react';
import { useMJ } from '@/providers/mj-provider';
import {
    loadEntities, loadEntityRecords, loadRecordDetail,
    loadQueries, runQuery, loadDashboards,
    entityCount, queryCount,
    type EntityListItem, type EntityRecordsLoad, type RecordDetailLoad,
    type QueryListItem, type QueryRunResult, type DashboardListItem,
} from '@/data/services/explorer';

/** Hub counts — entities, queries, dashboards. Metadata is in-memory so these are cheap. */
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

export function useEntities() {
    const { status } = useMJ();
    const [entities, setEntities] = useState<EntityListItem[] | null>(null);
    useEffect(() => {
        if (status !== 'ready') return;
        try { setEntities(loadEntities()); } catch { setEntities([]); }
    }, [status]);
    return entities;
}

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

export function useQueries() {
    const { status } = useMJ();
    const [queries, setQueries] = useState<QueryListItem[] | null>(null);
    useEffect(() => {
        if (status !== 'ready') return;
        try { setQueries(loadQueries()); } catch { setQueries([]); }
    }, [status]);
    return queries;
}

export function useQueryRun(queryId: string | undefined) {
    const { status } = useMJ();
    const [result, setResult] = useState<QueryRunResult | null>(null);
    const [loading, setLoading] = useState(false);

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

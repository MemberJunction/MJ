import { UUIDSet } from '@memberjunction/global';
import type { CompositionCTEInfo } from '../queryCompositionEngine.js';
import type { CompositionInstance } from './compositionRender.js';

/** The public CTE metadata of an instance. Argument values are written as text. */
export function CTEInfoOf(instance: CompositionInstance): CompositionCTEInfo {
    const parameters: Record<string, string> = {};
    for (const [name, value] of Object.entries(instance.Arguments)) {
        parameters[name] = value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : JSON.stringify(value);
    }
    return {
        QueryID: instance.Resolved.Query.ID,
        QueryName: instance.Resolved.Query.Name,
        CategoryPath: instance.Path.FullPath,
        CTEName: instance.CTEName,
        OriginalSQL: instance.Resolved.Query.SQL ?? '',
        ResolvedSQL: instance.RenderedSQL,
        Parameters: parameters,
    };
}

/** The distinct query IDs of the instances, in order. */
export function DistinctQueryIDs(instances: readonly CompositionInstance[]): string[] {
    const seen = new UUIDSet();
    const ids: string[] = [];
    for (const instance of instances) {
        const id = instance.Resolved.Query.ID;
        if (seen.Has(id)) continue;
        seen.Add(id);
        ids.push(id);
    }
    return ids;
}

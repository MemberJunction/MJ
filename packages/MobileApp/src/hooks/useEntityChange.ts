import { useEffect } from 'react';
import { MJGlobal } from '@memberjunction/global';
import { BaseEntity, type BaseEntityEvent } from '@memberjunction/core';

/** Change events worth reacting to (a persisted mutation of a record). */
const REACTIVE_EVENT_TYPES: ReadonlySet<BaseEntityEvent['type']> = new Set([
    'save',
    'delete',
    'new_record',
]);

/**
 * React to MemberJunction's **global** entity-change bus.
 *
 * Every `BaseEntity.Save()`/`Delete()` raises a global `MJGlobal` event
 * (`eventCode === BaseEntity.BaseEventCode`, `args` = the {@link BaseEntityEvent})
 * in addition to the per-instance `Event$`. Subscribing here lets a screen that
 * loaded data for `entityName` refresh in place the moment *any* record of that
 * entity is mutated anywhere in the app — without knowing which `BaseEngine`
 * subclass (if any) caches it. The generic cache layer (`LocalCacheManager`,
 * gated by `IsCachingEnabledForEntity`) keeps the cache correct on the same
 * events; this hook only re-reads, so it stays engine-agnostic.
 *
 * Matching is by entity name (case/whitespace-tolerant). We deliberately do NOT
 * filter by primary key: re-reading a single record on any same-entity save is
 * cheap and always correct, and it avoids brittle key comparison.
 *
 * @param entityName The entity whose changes should trigger `onChange`; when
 *   `undefined` the hook is inert.
 * @param onChange Callback invoked (fire-and-forget) on a matching save/delete/
 *   new-record event. Should be a stable reference (e.g. a `useCallback`).
 */
export function useEntityChange(entityName: string | undefined, onChange: () => void): void {
    useEffect(() => {
        if (!entityName) return;
        const target = entityName.trim().toLowerCase();
        const subscription = MJGlobal.Instance.GetEventListener().subscribe((mjEvent) => {
            if (mjEvent.eventCode !== BaseEntity.BaseEventCode) return;
            const event = mjEvent.args as BaseEntityEvent | undefined;
            if (!event || !REACTIVE_EVENT_TYPES.has(event.type)) return;
            const changed = event.baseEntity?.EntityInfo?.Name ?? event.entityName;
            if (!changed || changed.trim().toLowerCase() !== target) return;
            onChange();
        });
        return () => subscription.unsubscribe();
    }, [entityName, onChange]);
}

import { describe, it, expect, beforeEach } from 'vitest';
import type { ChangeDetectorRef, ElementRef, NgZone } from '@angular/core';
import { EntityInfo } from '@memberjunction/core';
import type { ViewGridState } from '@memberjunction/core-entities';
import { EntityViewerComponent } from '../lib/entity-viewer/entity-viewer.component';

/**
 * The SOURCE of the stale cross-entity grid state in MemberJunction/MJ#4244.
 *
 * The grid defends itself against a state that matches NO field of the current entity, but it
 * cannot defend against one that matches SOME: a partial overlap is indistinguishable, from
 * inside the grid, from a saved view whose entity has since lost a field. So the partially
 * matching case renders a silently truncated column set — Animals -> Breeds share `Name` and
 * `Species`, so two of four columns survive and the grid reads as normal.
 *
 * The viewer is where that can be fixed properly. Its `Entity` setter already drops every other
 * piece of per-entity state on an entity change (the per-view-type config map, the sort state,
 * the loaded view record, the cached renderer instances) — the canonical `_gridState` was simply
 * missed, and `resolveCanonicalGridState()` prefers it over the new entity's own saved view.
 *
 * Only a state the viewer CAPTURED from the renderer is dropped. One the host passed through
 * `[GridState]` is the host's instruction and is left alone.
 */

function makeEntity(id: string, name: string, fieldNames: string[]): EntityInfo {
    const table = name.replace(/\W/g, '');
    return new EntityInfo({
        ID: id,
        Name: name,
        Status: 'Active',
        BaseTable: table,
        BaseView: `vw${table}`,
        Fields: fieldNames.map((Name, i) => ({
            ID: `${id}-F${i}`, Name, Type: 'nvarchar', Length: 100, AllowsNull: true, DefaultInView: true,
        })),
    });
}

/** The measured pair: no shared field name. */
const ANIMALS = makeEntity('E0000006-0000-0000-0000-000000000001', 'MJ: Animals', ['Name', 'Species', 'Breed']);
const CARE_LOGS = makeEntity('E0000006-0000-0000-0000-000000000002', 'MJ: Care Logs', ['CareDate', 'CareType']);
/** The PARTIAL-overlap pair, which is the case the grid's own floor cannot catch. */
const BREEDS = makeEntity('E0000006-0000-0000-0000-000000000003', 'MJ: Breeds', ['Name', 'Species', 'Origin', 'Size']);

function gridStateFor(columnNames: string[]): ViewGridState {
    return {
        columnSettings: columnNames.map((Name, orderIndex) => ({ Name, orderIndex })),
    } as unknown as ViewGridState;
}

type Internals = {
    _initialized: boolean;
    _records: unknown[] | null;
    _gridState: ViewGridState | null;
    _gridStateFromRenderer: boolean;
};

/**
 * A viewer already showing `startEntity`. `_records` is set so the setter's reload branch — which
 * would fire a RunView — is skipped; nothing in this spec depends on data.
 */
function makeViewer(startEntity: EntityInfo): EntityViewerComponent {
    const cdr = { detectChanges: () => {}, markForCheck: () => {} } as unknown as ChangeDetectorRef;
    const ngZone = { run: (fn: () => void) => fn(), runOutsideAngular: (fn: () => void) => fn() } as unknown as NgZone;
    const elementRef = { nativeElement: { querySelector: () => null } } as unknown as ElementRef<HTMLElement>;

    const viewer = new EntityViewerComponent(cdr, ngZone, elementRef);
    const internals = viewer as unknown as Internals;
    internals._records = [];
    viewer.Entity = startEntity;
    internals._initialized = true;
    return viewer;
}

function internalsOf(viewer: EntityViewerComponent): Internals {
    return viewer as unknown as Internals;
}

/** Stand in for the renderer handing its captured state back through the config-changed path. */
function captureFromRenderer(viewer: EntityViewerComponent, columnNames: string[]): void {
    const internals = internalsOf(viewer);
    internals._gridState = gridStateFor(columnNames);
    internals._gridStateFromRenderer = true;
}

describe('EntityViewerComponent — a captured grid state does not outlive its entity', () => {
    let viewer: EntityViewerComponent;

    beforeEach(() => {
        viewer = makeViewer(ANIMALS);
        captureFromRenderer(viewer, ['Name', 'Species', 'Breed']);
    });

    it('drops it on an entity change, so the new entity supplies its own columns', () => {
        viewer.Entity = CARE_LOGS;
        expect(internalsOf(viewer)._gridState).toBeNull();
        expect(internalsOf(viewer)._gridStateFromRenderer).toBe(false);
    });

    it('drops it for a PARTIALLY overlapping entity too — the case the grid cannot catch', () => {
        // Animals -> Breeds share Name and Species. Left in place, exactly those two columns would
        // render and the other two would vanish with no error: a silently truncated grid.
        viewer.Entity = BREEDS;
        expect(internalsOf(viewer)._gridState).toBeNull();
    });

    it('KEEPS it when the same entity is re-assigned', () => {
        // Not an entity change, so the user's in-session column work must survive.
        viewer.Entity = ANIMALS;
        expect(internalsOf(viewer)._gridState).not.toBeNull();
        expect(internalsOf(viewer)._gridStateFromRenderer).toBe(true);
    });

    it('KEEPS it when a different EntityInfo instance carries the same ID', () => {
        const sameEntityReloaded = makeEntity(ANIMALS.ID, 'MJ: Animals', ['Name', 'Species', 'Breed']);
        viewer.Entity = sameEntityReloaded;
        expect(internalsOf(viewer)._gridState).not.toBeNull();
    });
});

describe('EntityViewerComponent — a HOST-supplied grid state is never discarded', () => {
    it('survives an entity change, because it is the host\'s instruction and not ours to drop', () => {
        const viewer = makeViewer(ANIMALS);
        viewer.GridState = gridStateFor(['Name', 'Species']);

        viewer.Entity = CARE_LOGS;

        expect(viewer.GridState).not.toBeNull();
        expect(viewer.GridState?.columnSettings?.map(c => c.Name)).toEqual(['Name', 'Species']);
    });

    it('a host binding CLEARS the captured-from-renderer provenance', () => {
        // The order that matters: the user tweaks columns, then the host pushes its own state.
        // From that point the state is the host's, so a later entity change must not drop it.
        const viewer = makeViewer(ANIMALS);
        captureFromRenderer(viewer, ['Name', 'Species', 'Breed']);
        viewer.GridState = gridStateFor(['Name']);
        expect(internalsOf(viewer)._gridStateFromRenderer).toBe(false);

        viewer.Entity = CARE_LOGS;
        expect(viewer.GridState?.columnSettings?.map(c => c.Name)).toEqual(['Name']);
    });
});

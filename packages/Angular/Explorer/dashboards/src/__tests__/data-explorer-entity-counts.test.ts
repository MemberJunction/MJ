/**
 * @fileoverview The Data Explorer home screen prints two entity counts. They must agree.
 *
 * `data-explorer-dashboard.component.html:75` prints `entities.length` — distinct entities —
 * while `:157` printed `filteredEntityCount`, which summed `group.entities.length` over the
 * application groups. `buildAppEntityGroups` deliberately assigns an entity to EVERY
 * application it belongs to, so the sum counted multi-application entities once per
 * membership: on a stock install, "2195 entities" eight lines below "2134 entities
 * available", differing by the 61 multi-app entities.
 *
 * Both are counts of entities now. (This is NOT the same root cause as the 1000-row view
 * truncation fixed in #4430: `buildAppEntityGroups` reads the metadata cache, not a RunView,
 * so no row cap applies to either number.)
 *
 * Driven off the prototype, matching data-explorer-application-entities.test.ts.
 */
import '@angular/compiler'; // JIT support — the component import evaluates Angular decorators in vitest's node env
import { describe, it, expect } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import type { AppEntityGroup } from '../DataExplorer/models/explorer-state.interface';

import { DataExplorerDashboardComponent } from '../DataExplorer/data-explorer-dashboard.component';

function entity(id: string, name: string): EntityInfo {
    return {
        ID: id,
        Name: name,
        DisplayNameOrName: name,
        Description: null,
    } as unknown as EntityInfo;
}

function group(applicationId: string, entities: EntityInfo[]): AppEntityGroup {
    return {
        applicationId,
        applicationName: `App ${applicationId}`,
        applicationIcon: 'fa-solid fa-cube',
        applicationColor: null,
        entities,
        isExpanded: true,
    };
}

interface Harness {
    /** What the header prints at html:75. */
    entitiesAvailable: number;
    /** What the meta row prints at html:157. */
    filteredEntityCount: number;
    applicationCount: number;
}

/**
 * Wires the component's two count sources directly: `entities` (the flat distinct list) and
 * `appEntityGroups` (the multi-assigned grouping). `filteredAppEntityGroups` reads
 * `appEntityGroups` through the filter getters, so the harness supplies the filter state those
 * getters read.
 */
function buildHarness(entities: EntityInfo[], groups: AppEntityGroup[], filterText = ''): Harness {
    const component = Object.create(DataExplorerDashboardComponent.prototype) as DataExplorerDashboardComponent;
    Object.assign(component as unknown as Record<string, unknown>, {
        entities,
        appEntityGroups: groups,
        entityFilterText: filterText,
        entityFilter: null,
        state: { homeViewMode: 'all' },
        favoriteEntityIds: new Set<string>(),
    });

    return {
        entitiesAvailable: component.entities.length,
        filteredEntityCount: component.filteredEntityCount,
        applicationCount: component.applicationCount,
    };
}

describe('Data Explorer entity counts — both labels count entities', () => {
    it('agrees with entities.length when an entity belongs to two applications', () => {
        const shared = entity('e-shared', 'Contacts');
        const soloA = entity('e-a', 'Invoices');
        const soloB = entity('e-b', 'Shipments');
        const harness = buildHarness(
            [shared, soloA, soloB],
            [group('app-1', [shared, soloA]), group('app-2', [shared, soloB])],
        );

        // Summing the groups would give 4 here.
        expect(harness.filteredEntityCount).toBe(3);
        expect(harness.filteredEntityCount).toBe(harness.entitiesAvailable);
    });

    it('agrees at the reported scale — 2134 entities, 2195 memberships', () => {
        const entities = Array.from({ length: 2134 }, (_, i) => entity(`e-${i}`, `Entity ${i}`));
        // 61 entities belong to a second application, which is exactly 2195 − 2134.
        const primary = group('app-1', entities);
        const secondary = group('app-2', entities.slice(0, 61));
        const harness = buildHarness(entities, [primary, secondary]);

        expect(harness.entitiesAvailable).toBe(2134);
        expect(harness.filteredEntityCount).toBe(2134);
        // Prove the fixture really does carry 2195 memberships, so this test would have
        // caught the old behaviour.
        expect(primary.entities.length + secondary.entities.length).toBe(2195);
    });

    it('counts an entity once even when it is in three applications', () => {
        const shared = entity('e-shared', 'Contacts');
        const harness = buildHarness(
            [shared],
            [group('app-1', [shared]), group('app-2', [shared]), group('app-3', [shared])],
        );

        expect(harness.filteredEntityCount).toBe(1);
    });

    it('still counts application MEMBERSHIPS for applicationCount', () => {
        const shared = entity('e-shared', 'Contacts');
        const harness = buildHarness([shared], [group('app-1', [shared]), group('app-2', [shared])]);

        // Distinct entities: 1. Applications with at least one visible entity: 2. Both correct.
        expect(harness.filteredEntityCount).toBe(1);
        expect(harness.applicationCount).toBe(2);
    });

    it('still narrows with the filter, and still counts distinctly while narrowed', () => {
        const contacts = entity('e-1', 'Contacts');
        const invoices = entity('e-2', 'Invoices');
        const harness = buildHarness(
            [contacts, invoices],
            [group('app-1', [contacts, invoices]), group('app-2', [contacts])],
            'contact',
        );

        expect(harness.filteredEntityCount).toBe(1);
    });

    it('reports zero when every group is empty', () => {
        const harness = buildHarness([], [group('app-1', []), group('app-2', [])]);

        expect(harness.filteredEntityCount).toBe(0);
        expect(harness.applicationCount).toBe(0);
    });
});

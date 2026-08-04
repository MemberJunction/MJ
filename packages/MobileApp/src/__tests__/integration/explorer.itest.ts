/**
 * Integration: Data Explorer service against the live backend.
 *
 * Exercises loadEntities / entity records / record detail using the real
 * metadata + RunView routed through the live provider.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Metadata } from '@memberjunction/core';
import { initLiveProvider, hasToken } from './setup-live';
import {
    loadEntities,
    entityCount,
    loadEntityRecords,
    loadRecordDetail,
} from '@/data/services/explorer';

/**
 * Resolve a readable, seeded entity for the authenticated test user.
 *
 * `loadEntities()` returns only the entities the current user's roles can see
 * (real MJ row-level metadata security), so we deliberately test against a
 * core entity that the UI/Developer roles CAN read — "MJ: AI Agents" (aka the
 * legacy "AI Agents") — rather than a restricted one like "Users", which is
 * intentionally not exposed to this user.
 */
function readableAgentsEntityName(): string {
    const md = new Metadata();
    const entity = md.EntityByName('MJ: AI Agents') ?? md.EntityByName('AI Agents');
    if (!entity) throw new Error('AI Agents entity not found in metadata');
    return entity.Name;
}

describe.skipIf(!hasToken())('integration: explorer', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('loadEntities returns a non-empty, sorted list scoped to the user permissions', () => {
        const entities = loadEntities();
        expect(entities.length).toBeGreaterThan(0);

        const displayNames = entities.map((e) => e.displayName);
        // The list is permission-scoped, so assert against entities the UI/Developer
        // roles can see (e.g. Actions + AI Agents), not restricted ones like Users.
        expect(displayNames).toContain('Actions');
        expect(displayNames.some((n) => n === 'AI Agents' || n === 'MJ: AI Agents')).toBe(true);

        // Sorted ascending by display name.
        const sorted = [...displayNames].sort((a, b) => a.localeCompare(b));
        expect(displayNames).toEqual(sorted);
    });

    it('entityCount reports a positive total', () => {
        expect(entityCount()).toBeGreaterThan(0);
    });

    it('loadEntityRecords returns rows with expected fields for a readable entity', async () => {
        const name = readableAgentsEntityName();
        const load = await loadEntityRecords(name, undefined, 10);
        expect(load).not.toBeNull();
        expect(load!.entity.Name).toBe(name);
        expect(load!.rows.length).toBeGreaterThan(0);

        const first = load!.rows[0];
        expect(first.id).toBeTruthy();
        expect(typeof first.title).toBe('string');
        expect(first.raw).toBeTypeOf('object');
    });

    it('loadRecordDetail loads a returned record id with field rows', async () => {
        const name = readableAgentsEntityName();
        const load = await loadEntityRecords(name, undefined, 5);
        expect(load).not.toBeNull();
        const someId = load!.rows[0]?.id;
        expect(someId).toBeTruthy();

        const detail = await loadRecordDetail(name, someId!);
        expect(detail).not.toBeNull();
        expect(detail!.entity.Name).toBe(name);
        expect(detail!.fields.length).toBeGreaterThan(0);
        // Every field row has a key + label.
        for (const f of detail!.fields) {
            expect(f.key).toBeTruthy();
            expect(f.label).toBeTruthy();
        }
    });

    it('current user has read access reflected in loadable AI Agents records', async () => {
        const load = await loadEntityRecords(readableAgentsEntityName(), undefined, 10);
        expect(load).not.toBeNull();
        // Seed data includes agents; expect at least one row.
        expect(load!.rows.length).toBeGreaterThan(0);
    });
});

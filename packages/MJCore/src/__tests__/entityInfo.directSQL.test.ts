/**
 * EntityInfo — the direct-SQL opt-in flags.
 *
 * MJ's contract is that every mutation flows through `BaseEntity`, because that is the only path
 * where record-change tracking, cache invalidation, entity actions, validation and soft delete
 * actually run. `AllowDirectSQLInsert` / `Update` / `Delete` declare, per verb, that an entity is
 * sanctioned for SQL that bypasses it.
 *
 * These are asserted rather than assumed for one specific reason: `BaseInfo.copyInitData` only
 * copies keys that are already OWN properties of the instance, which a field initializer creates.
 * Dropping the `= false` — a plausible "cleanup", since TypeScript is happy to just declare the
 * type — would leave the property `undefined` and silently stop it loading from the database. The
 * flag would then read as "not sanctioned" everywhere regardless of what the row says, which is a
 * failure nothing else in the stack would notice.
 */
import { describe, expect, it } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';

/** An EntityInfo with just the fields these flags interact with. */
function entity(over: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        Name: 'Order Headers',
        BaseTable: 'OrderHeader',
        BaseView: 'vwOrderHeaders',
        SchemaName: 'orders',
        ...over,
    });
}

describe('direct-SQL opt-in flags', () => {
    it('are all off by default — every existing entity keeps the BaseEntity-only contract', () => {
        // The whole point of the columns being additive: nothing opts in implicitly, so no install
        // changes behaviour and there is nothing to re-verify.
        const e = entity();
        expect(e.AllowDirectSQLInsert).toBe(false);
        expect(e.AllowDirectSQLUpdate).toBe(false);
        expect(e.AllowDirectSQLDelete).toBe(false);
    });

    it('populate from the metadata row', () => {
        // Guards the copyInitData own-property requirement described above.
        const e = entity({ AllowDirectSQLInsert: true, AllowDirectSQLUpdate: true, AllowDirectSQLDelete: true });
        expect(e.AllowDirectSQLInsert).toBe(true);
        expect(e.AllowDirectSQLUpdate).toBe(true);
        expect(e.AllowDirectSQLDelete).toBe(true);
    });

    it('are independent per verb', () => {
        // Sanctioning a bulk load must not also sanction a direct DELETE — the verbs carry very
        // different risk, which is why this is three columns rather than one.
        const e = entity({ AllowDirectSQLInsert: true });
        expect(e.AllowDirectSQLInsert).toBe(true);
        expect(e.AllowDirectSQLUpdate).toBe(false);
        expect(e.AllowDirectSQLDelete).toBe(false);
    });

    it('are distinct from the API permission flags', () => {
        // AllowCreateAPI/UpdateAPI/DeleteAPI gate the API channel; these gate the raw-SQL channel.
        // Same verbs, different channels — neither implies the other.
        const e = entity({ AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true });
        expect(e.AllowDirectSQLInsert).toBe(false);
        expect(e.AllowDirectSQLUpdate).toBe(false);
        expect(e.AllowDirectSQLDelete).toBe(false);
    });
});

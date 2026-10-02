import { describe, it, expect } from 'vitest';
import { IsStringSQLType, IsIntegerSQLType, IsFloatSQLType } from '../typeClassification.js';

describe('PostgreSQL full-text search types', () => {
    // CodeGen's PostgreSQL full-text search adds a `__mj_fts_vector TSVECTOR` column that the base view
    // exposes, so it is registered as an EntityField of type `tsvector`. The driver returns it as text.
    // Unclassified, it fell through to number / GraphQL Int, and every single-record query of an entity
    // with full-text search failed once its rows had vectors ("Int cannot represent non-integer value").
    it.each(['tsvector', 'tsquery', 'TSVECTOR', ' tsvector '])('classifies %j as a string type', (t) => {
        expect(IsStringSQLType(t)).toBe(true);
    });

    it('does not classify tsvector as a numeric type', () => {
        expect(IsIntegerSQLType('tsvector')).toBe(false);
        expect(IsFloatSQLType('tsvector')).toBe(false);
    });

    it('leaves existing string and non-string types unchanged', () => {
        for (const t of ['text', 'varchar', 'citext', 'nvarchar', 'char']) expect(IsStringSQLType(t)).toBe(true);
        for (const t of ['int', 'bigint', 'uuid', 'uniqueidentifier', 'bit', 'boolean', 'timestamptz', 'jsonb']) expect(IsStringSQLType(t)).toBe(false);
    });
});

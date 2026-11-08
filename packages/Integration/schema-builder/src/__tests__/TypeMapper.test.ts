import { describe, it, expect, vi } from 'vitest';
import { SQLDialect, type ResolveTypeOptions } from '@memberjunction/sql-dialect';
import { TypeMapper } from '../TypeMapper.js';
import type { SourceFieldInfo } from '../interfaces.js';

function MakeField(overrides: Partial<SourceFieldInfo> = {}): SourceFieldInfo {
    return {
        Name: 'TestField',
        Label: 'Test Field',
        SourceType: 'string',
        IsRequired: false,
        MaxLength: null,
        Precision: null,
        Scale: null,
        DefaultValue: null,
        IsPrimaryKey: false,
        IsForeignKey: false,
        ForeignKeyTarget: null,
        ...overrides,
    };
}

describe('TypeMapper', () => {
    const mapper = new TypeMapper();

    describe('MapSourceType', () => {
        it('should add generous additive headroom to a small declared length (SQL Server)', () => {
            // Declared 100 → 100 + 300 headroom = NVARCHAR(400). The sample is a LOWER bound, so we
            // add a generous buffer for values longer than discovery happened to see. Never MAX.
            const field = MakeField({ MaxLength: 100 });
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(400)');
        });

        it('should add generous additive headroom to a small declared length (PostgreSQL)', () => {
            const field = MakeField({ MaxLength: 100 });
            expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('VARCHAR(400)');
        });

        it('should add additive headroom for mid-range declared lengths', () => {
            // 500 → 500 + 300 = 800
            const field = MakeField({ MaxLength: 500 });
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(800)');
            expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('VARCHAR(800)');
        });

        it('should default string without MaxLength to the 255 floor (never MAX)', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(255)');
            expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('VARCHAR(255)');
        });

        it('should honor the MJ "nvarchar" field type (persisted-discovery path) — NOT drop to MAX', () => {
            // Regression for the bounded-types bug: a discovered column persisted as IOF.Type='nvarchar'
            // is re-read here as the source type. It MUST normalize to the 'string' sizing path
            // (450 + 300 = NVARCHAR(750)); before the fix it fell through to unknown→NVARCHAR(MAX) and
            // the Length was silently dropped.
            const field = MakeField({ MaxLength: 450 });
            expect(mapper.MapSourceType('nvarchar', 'sqlserver', field)).toBe('NVARCHAR(750)');
            expect(mapper.MapSourceType('varchar', 'postgresql', field)).toBe('VARCHAR(750)');
        });

        it('should cap a PRIMARY-KEY string column at the dialect index-key limit (SQL Server 450; PG uncapped)', () => {
            // A PK string can't exceed SQL Server's 900-byte / 450-char index-key limit, so the generous
            // +300 headroom is capped for PK columns: 450 + 300 = 750 → min(750, 450) = NVARCHAR(450).
            // PostgreSQL has no declare-time key cap, so the PK keeps the full bounded size.
            const pk = MakeField({ MaxLength: 450, IsPrimaryKey: true });
            expect(mapper.MapSourceType('string', 'sqlserver', pk)).toBe('NVARCHAR(450)');
            expect(mapper.MapSourceType('string', 'postgresql', pk)).toBe('VARCHAR(750)');
            // a NON-key column of the same width is NOT capped (stays generous/bounded)
            const nonPk = MakeField({ MaxLength: 450, IsPrimaryKey: false });
            expect(mapper.MapSourceType('string', 'sqlserver', nonPk)).toBe('NVARCHAR(750)');
        });

        it('honours an explicit MaxLength of -1 as MAX/unbounded', () => {
            // -1 is the convention both dialects already render as unbounded (see
            // sqlServerDialect/postgresqlDialect: `length === -1`). It previously failed the
            // `MaxLength > 0` test in boundedStringLength and fell through to the 255 floor — so
            // asking for MAX produced the NARROWEST possible column, and records longer than 255
            // chars were then skipped whole at sync time.
            const unbounded = MakeField({ MaxLength: -1 });
            expect(mapper.MapSourceType('string', 'sqlserver', unbounded)).toBe('NVARCHAR(MAX)');
            expect(mapper.MapSourceType('string', 'postgresql', unbounded)).toBe('TEXT');
        });

        it('never lets an unbounded PRIMARY-KEY column through — MAX cannot be indexed', () => {
            // Math.min(-1, 450) is -1, so the cap had to special-case MAX rather than compare.
            const unboundedPk = MakeField({ MaxLength: -1, IsPrimaryKey: true });
            expect(mapper.MapSourceType('string', 'sqlserver', unboundedPk)).toBe('NVARCHAR(450)');
        });

        it('gives an unbounded PRIMARY-KEY column a type PostgreSQL can create', () => {
            // PostgreSQL has no index-key string cap, so the clamp above lands on Number.MAX_SAFE_INTEGER;
            // VARCHAR(9007199254740991) is not a type PostgreSQL accepts. TEXT is, and it is indexable there.
            const unboundedPk = MakeField({ MaxLength: -1, IsPrimaryKey: true });
            expect(mapper.MapSourceType('string', 'postgresql', unboundedPk)).toBe('TEXT');
        });

        it('renders a source width at or past nvarchar(max) as each dialect\'s unbounded type', () => {
            // netFORUM reports nvarchar(max) as MaxLength 2147483646; SQL Server's own count is 1073741823.
            // Padding that by the 300 headroom gave VARCHAR(2147483946) on PostgreSQL, which caps VARCHAR(n)
            // at 10485760, so the CREATE TABLE failed ("syntax error at or near 2147483946").
            for (const MaxLength of [2147483646, 1073741823]) {
                const field = MakeField({ MaxLength });
                expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
                expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('TEXT');
                const pk = MakeField({ MaxLength, IsPrimaryKey: true });
                expect(mapper.MapSourceType('string', 'sqlserver', pk)).toBe('NVARCHAR(450)');
                expect(mapper.MapSourceType('string', 'postgresql', pk)).toBe('TEXT');
            }
        });

        describe('what the sizing policy asks the dialect for', () => {
            /** The ResolveAbstractType options a non-key `string` column of this declared width produces. */
            function RequestedType(maxLength: number | null): ResolveTypeOptions[] {
                const spy = vi.spyOn(SQLDialect.prototype, 'ResolveAbstractType');
                try {
                    mapper.MapSourceType('string', 'postgresql', MakeField({ MaxLength: maxLength }));
                    return spy.mock.calls.map(([options]) => options);
                } finally {
                    spy.mockRestore();
                }
            }

            it('hands a declared width at or past nvarchar(max) on as unbounded, never padded', () => {
                // The dialect then picks its own unbounded type, rather than being handed a width no dialect renders.
                expect(RequestedType(2147483646)).toEqual([{ type: 'text' }]);
                expect(RequestedType(1073741823)).toEqual([{ type: 'text' }]);
            });

            it('keeps the headroom and floor for every narrower width', () => {
                expect(RequestedType(100)).toEqual([{ type: 'string', maxLength: 400 }]);
                expect(RequestedType(null)).toEqual([{ type: 'string', maxLength: 255 }]);
                expect(RequestedType(-1)).toEqual([{ type: 'text' }]);
                expect(RequestedType(1073741822)).toEqual([{ type: 'string', maxLength: 1073742122 }]);
            });
        });

        it('should stay BOUNDED for a declared length comfortably under the ceiling (SQL Server)', () => {
            // 3000 + 300 headroom = 3300 ≤ 4000 → NVARCHAR(3300), bounded. The dialect only spills to
            // its OWN unbounded type when the sized value genuinely exceeds the dialect's bounded ceiling.
            const field = MakeField({ MaxLength: 3000 });
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(3300)');
        });

        it('should fall back to NVARCHAR(MAX) only for genuinely huge fields (SQL Server)', () => {
            // 5000 + headroom far exceeds the SS bounded ceiling → the dialect returns NVARCHAR(MAX).
            // This is the best-effort limit: MAX appears only when bounding would risk truncating real data.
            const field = MakeField({ MaxLength: 5000 });
            expect(mapper.MapSourceType('string', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
        });

        it('should keep a huge declared length BOUNDED on PostgreSQL (no 4000 ceiling there)', () => {
            // PG VARCHAR has no 4000 limit → 5000 + 300 = VARCHAR(5300), never MAX/TEXT.
            const field = MakeField({ MaxLength: 5000 });
            expect(mapper.MapSourceType('string', 'postgresql', field)).toBe('VARCHAR(5300)');
        });

        it('should map text to NVARCHAR(MAX) / TEXT', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('text', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
            expect(mapper.MapSourceType('text', 'postgresql', field)).toBe('TEXT');
        });

        it('should map integer to INT / INTEGER', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('integer', 'sqlserver', field)).toBe('INT');
            expect(mapper.MapSourceType('integer', 'postgresql', field)).toBe('INTEGER');
        });

        it('should map boolean to BIT / BOOLEAN', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('boolean', 'sqlserver', field)).toBe('BIT');
            expect(mapper.MapSourceType('boolean', 'postgresql', field)).toBe('BOOLEAN');
        });

        it('should map datetime to DATETIMEOFFSET / TIMESTAMPTZ', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('datetime', 'sqlserver', field)).toBe('DATETIMEOFFSET');
            expect(mapper.MapSourceType('datetime', 'postgresql', field)).toBe('TIMESTAMPTZ');
        });

        it('should map uuid to UNIQUEIDENTIFIER / UUID', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('uuid', 'sqlserver', field)).toBe('UNIQUEIDENTIFIER');
            expect(mapper.MapSourceType('uuid', 'postgresql', field)).toBe('UUID');
        });

        it('should map json to NVARCHAR(MAX) / TEXT, the nvarchar its MJ field type declares', () => {
            // MJ metadata reads the column as nvarchar, so CodeGen's CRUD functions take and write TEXT, and
            // PostgreSQL rejects TEXT into a JSONB column. The column has to be the type the metadata says.
            const field = MakeField();
            expect(mapper.MapSourceType('json', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
            expect(mapper.MapSourceType('json', 'postgresql', field)).toBe('TEXT');
            expect(mapper.GetMJFieldType('json')).toBe('nvarchar');
            expect(mapper.GetAllMappings().find(m => m.SourceType === 'json')).toMatchObject({
                SqlServerType: 'NVARCHAR(MAX)',
                PostgresType: 'TEXT',
            });
        });

        it('should floor low declared precision to 28 (defensive against narrow describe output)', () => {
            // Sources sometimes report narrow precision (e.g. SF formula fields
            // declared 10,4) but real values overflow. TypeMapper floors at 28.
            const field = MakeField({ Precision: 10, Scale: 4 });
            expect(mapper.MapSourceType('decimal', 'sqlserver', field)).toBe('DECIMAL(28,4)');
            expect(mapper.MapSourceType('decimal', 'postgresql', field)).toBe('NUMERIC(28,4)');
        });

        it('should respect declared precision when above the 28 floor', () => {
            const field = MakeField({ Precision: 30, Scale: 4 });
            expect(mapper.MapSourceType('decimal', 'sqlserver', field)).toBe('DECIMAL(30,4)');
            expect(mapper.MapSourceType('decimal', 'postgresql', field)).toBe('NUMERIC(30,4)');
        });

        it('should cap declared precision at SQL Server max of 38', () => {
            const field = MakeField({ Precision: 50, Scale: 4 });
            expect(mapper.MapSourceType('decimal', 'sqlserver', field)).toBe('DECIMAL(38,4)');
        });

        it('should default decimal precision to 28,2 (the floor)', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('decimal', 'sqlserver', field)).toBe('DECIMAL(28,2)');
        });

        it('should fall back to text for unknown types', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('foobar', 'sqlserver', field)).toBe('NVARCHAR(MAX)');
            expect(mapper.MapSourceType('foobar', 'postgresql', field)).toBe('TEXT');
        });

        it('should handle case-insensitive source types', () => {
            const field = MakeField();
            expect(mapper.MapSourceType('STRING', 'sqlserver', field)).toBe('NVARCHAR(255)');
            expect(mapper.MapSourceType('  Integer  ', 'sqlserver', field)).toBe('INT');
        });
    });

    describe('GetMJFieldType', () => {
        it('should return nvarchar for string', () => {
            expect(mapper.GetMJFieldType('string')).toBe('nvarchar');
        });

        it('should return int for integer', () => {
            expect(mapper.GetMJFieldType('integer')).toBe('int');
        });

        it('should return nvarchar for unknown types', () => {
            expect(mapper.GetMJFieldType('foobar')).toBe('nvarchar');
        });
    });

    describe('GetAllMappings', () => {
        it('should return all type mappings', () => {
            const mappings = mapper.GetAllMappings();
            expect(mappings.length).toBeGreaterThan(0);
            expect(mappings.find(m => m.SourceType === 'string')).toBeTruthy();
            expect(mappings.find(m => m.SourceType === 'integer')).toBeTruthy();
        });
    });
});

// #3527: the catalog persists MJ field types (int, bit, datetimeoffset); they must map to typed columns,
// not fall to the text fallback.
describe('TypeMapper — MJ field-type aliases (#3527)', () => {
    const mapper = new TypeMapper();
    const field = MakeField({ Precision: 18, Scale: 4 });

    it.each([
        ['int', 'INT', 'INTEGER'],
        ['bit', 'BIT', 'BOOLEAN'],
        ['datetimeoffset', 'DATETIMEOFFSET', 'TIMESTAMPTZ'],
        ['uniqueidentifier', 'UNIQUEIDENTIFIER', 'UUID'],
        ['bigint', 'BIGINT', 'BIGINT'],
    ])('%s maps to a typed column on both dialects', (type, sqlServer, postgres) => {
        expect(mapper.MapSourceType(type, 'sqlserver', field)).toBe(sqlServer);
        expect(mapper.MapSourceType(type, 'postgresql', field)).toBe(postgres);
    });

    it('decimal and numeric map to a decimal column', () => {
        expect(mapper.MapSourceType('decimal', 'sqlserver', field)).toMatch(/^DECIMAL/);
        expect(mapper.MapSourceType('numeric', 'postgresql', field)).toMatch(/^NUMERIC/);
    });
});

import { describe, it, expect } from 'vitest';
import { MapTSQLCastTypesForPostgreSQL } from '../postgresqlClauseTypes';

describe('MapTSQLCastTypesForPostgreSQL', () => {
    it('maps a uniqueidentifier cast to uuid, in any case and spacing', () => {
        expect(MapTSQLCastTypesForPostgreSQL('CAST(RecordID AS uniqueidentifier)')).toBe('CAST(RecordID AS uuid)');
        expect(MapTSQLCastTypesForPostgreSQL('CAST("RecordID" as UNIQUEIDENTIFIER )')).toBe('CAST("RecordID" as uuid )');
        expect(MapTSQLCastTypesForPostgreSQL('a IN (SELECT CAST(x AS uniqueidentifier) FROM v) AND b IN (SELECT CAST(y AS uniqueidentifier) FROM w)'))
            .toBe('a IN (SELECT CAST(x AS uuid) FROM v) AND b IN (SELECT CAST(y AS uuid) FROM w)');
    });

    it('leaves other casts and a uniqueidentifier that does not close a cast alone', () => {
        expect(MapTSQLCastTypesForPostgreSQL('CAST(RecordID AS int)')).toBe('CAST(RecordID AS int)');
        expect(MapTSQLCastTypesForPostgreSQL('SELECT x AS uniqueidentifier, y FROM v')).toBe('SELECT x AS uniqueidentifier, y FROM v');
        expect(MapTSQLCastTypesForPostgreSQL('CAST(RecordID AS uniqueidentifierX)')).toBe('CAST(RecordID AS uniqueidentifierX)');
    });
});

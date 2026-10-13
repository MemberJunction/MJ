/**
 * QueryParameterEnricher.IsIdentifierParameterName: names that read as keys (ID, GUID, UUID) get the empty-GUID sample;
 * words that merely end in the same letters do not.
 */
import { describe, it, expect } from 'vitest';
import { QueryParameterEnricher } from '../custom/query-extraction/enrich';

describe('QueryParameterEnricher.IsIdentifierParameterName', () => {
    it.each([
        'ID', 'id', 'ActivityID', 'userId', 'user_id', 'USER_ID',
        'GUID', 'guid', 'UUID', 'Uuid', 'RecordGUID', 'recordGuid', 'userUUID', 'userUuid', 'record_guid', 'USER_UUID'
    ])('treats %s as an identifier', (name) => {
        expect(QueryParameterEnricher.IsIdentifierParameterName(name)).toBe(true);
    });

    it.each(['Valid', 'PAID', 'Name', 'Guide', 'Status'])('does not treat %s as an identifier', (name) => {
        expect(QueryParameterEnricher.IsIdentifierParameterName(name)).toBe(false);
    });
});

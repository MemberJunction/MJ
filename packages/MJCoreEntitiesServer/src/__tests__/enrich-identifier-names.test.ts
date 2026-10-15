import { describe, it, expect } from 'vitest';
import { IsIdentifierParameterName } from '../custom/query-extraction/enrich';

describe('IsIdentifierParameterName', () => {
    it.each([
        'ID', 'id', 'ActivityID', 'userId', 'user_id', 'USER_ID',
        'GUID', 'guid', 'UUID', 'Uuid', 'RecordGUID', 'recordGuid', 'userUUID', 'userUuid', 'record_guid', 'USER_UUID'
    ])('treats %s as an identifier', (name) => {
        expect(IsIdentifierParameterName(name)).toBe(true);
    });

    it.each(['Valid', 'PAID', 'Name', 'Guide', 'Status'])('does not treat %s as an identifier', (name) => {
        expect(IsIdentifierParameterName(name)).toBe(false);
    });
});

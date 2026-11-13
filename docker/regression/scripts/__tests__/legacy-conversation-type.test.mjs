import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AddLegacyTypeParameter } = require('../lib/legacy-conversation-type.cjs');

const CREATE = [
    'CREATE PROCEDURE [__mj].[spCreateConversation]',
    '    @ID uniqueidentifier = NULL,',
    '    @Name nvarchar(255) = NULL,',
    '    @TypeID uniqueidentifier = NULL',
    'AS',
    'BEGIN',
    '    SET NOCOUNT ON;',
    '    INSERT INTO [__mj].[Conversation] ([TypeID]) VALUES (ISNULL(@TypeID, NEWID()))',
    'END',
].join('\n');

describe('AddLegacyTypeParameter', () => {
    it('adds an optional @Type parameter that sets @TypeID from the type name', () => {
        const altered = AddLegacyTypeParameter(CREATE, '__mj');
        expect(altered.startsWith('ALTER PROCEDURE [__mj].[spCreateConversation]')).toBe(true);
        expect(altered).toContain('    @TypeID uniqueidentifier = NULL,\n    @Type nvarchar(100) = NULL\nAS\nBEGIN\n');
        expect(altered).toContain(
            'IF @TypeID IS NULL AND @Type IS NOT NULL SELECT @TypeID = [ID] FROM [__mj].[ConversationType] WHERE [Name] = @Type;'
        );
        expect(altered.indexOf('SELECT @TypeID')).toBeLessThan(altered.indexOf('SET NOCOUNT ON'));
    });

    it('returns null when the procedure already takes @Type', () => {
        const withType = CREATE.replace('@TypeID uniqueidentifier = NULL', '@Type nvarchar(100) = NULL');
        expect(AddLegacyTypeParameter(withType, '__mj')).toBeNull();
    });

    it('fails when the procedure has no @TypeID parameter', () => {
        const noTypeId = CREATE.replace('    @TypeID uniqueidentifier = NULL', '    @Other int = NULL');
        expect(() => AddLegacyTypeParameter(noTypeId, '__mj')).toThrow(/@TypeID/);
    });
});

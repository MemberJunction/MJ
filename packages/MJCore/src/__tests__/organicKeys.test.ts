import { describe, it, expect } from 'vitest';
import { EntityOrganicKeyInfo, EntityOrganicKeyRelatedEntityInfo, EntityInfo } from '../generic/entityInfo';

describe('EntityOrganicKeyInfo', () => {
    it('should construct with default values', () => {
        const info = new EntityOrganicKeyInfo();
        expect(info.NormalizationStrategy).toBe('LowerCaseTrim');
        expect(info.Status).toBe('Active');
        expect(info.Sequence).toBe(0);
        expect(info.AutoCreateRelatedViewOnForm).toBe(false);
        expect(info.RelatedEntities).toEqual([]);
    });

    it('should populate from initData via copyInitData', () => {
        const info = new EntityOrganicKeyInfo({
            ID: 'abc-123',
            EntityID: 'entity-456',
            Name: 'Email Match',
            Description: 'Match by email',
            MatchFieldNames: 'EmailAddress',
            NormalizationStrategy: 'Trim',
            Status: 'Active',
            Sequence: 1,
        });
        expect(info.ID).toBe('abc-123');
        expect(info.Name).toBe('Email Match');
        expect(info.MatchFieldNames).toBe('EmailAddress');
        expect(info.NormalizationStrategy).toBe('Trim');
    });

    it('should parse MatchFieldNamesArray for simple key', () => {
        const info = new EntityOrganicKeyInfo({ MatchFieldNames: 'EmailAddress' });
        expect(info.MatchFieldNamesArray).toEqual(['EmailAddress']);
    });

    it('should parse MatchFieldNamesArray for compound key', () => {
        const info = new EntityOrganicKeyInfo({ MatchFieldNames: 'FirstName, LastName, DateOfBirth' });
        expect(info.MatchFieldNamesArray).toEqual(['FirstName', 'LastName', 'DateOfBirth']);
    });

    it('should populate nested RelatedEntities from initData', () => {
        const info = new EntityOrganicKeyInfo({
            Name: 'Email Match',
            MatchFieldNames: 'Email',
            EntityOrganicKeyRelatedEntities: [
                { ID: 're-1', RelatedEntity: 'Mailchimp Recipients', RelatedEntityFieldNames: 'Email', Sequence: 2 },
                { ID: 're-2', RelatedEntity: 'Zendesk Tickets', RelatedEntityFieldNames: 'ContactEmail', Sequence: 1 },
            ],
        });
        expect(info.RelatedEntities).toHaveLength(2);
        // Should be sorted by sequence: Zendesk (1) before Mailchimp (2)
        expect(info.RelatedEntities[0].RelatedEntity).toBe('Zendesk Tickets');
        expect(info.RelatedEntities[1].RelatedEntity).toBe('Mailchimp Recipients');
    });
});

describe('EntityOrganicKeyRelatedEntityInfo', () => {
    it('should construct with default values', () => {
        const info = new EntityOrganicKeyRelatedEntityInfo();
        expect(info.DisplayLocation).toBe('After Field Tabs');
        expect(info.Sequence).toBe(0);
        expect(info.RelatedEntityFieldNames).toBeNull();
        expect(info.TransitiveObjectName).toBeNull();
    });

    it('should detect direct match', () => {
        const info = new EntityOrganicKeyRelatedEntityInfo({
            RelatedEntityFieldNames: 'Email',
        });
        expect(info.IsDirectMatch).toBe(true);
        expect(info.IsTransitiveMatch).toBe(false);
    });

    it('should detect transitive match', () => {
        const info = new EntityOrganicKeyRelatedEntityInfo({
            TransitiveObjectName: '__mj.vwBridge',
            TransitiveObjectMatchFieldNames: 'Email',
            TransitiveObjectOutputFieldName: 'RecordID',
            RelatedEntityJoinFieldName: 'ID',
        });
        expect(info.IsDirectMatch).toBe(false);
        expect(info.IsTransitiveMatch).toBe(true);
    });

    it('should parse RelatedEntityFieldNamesArray', () => {
        const info = new EntityOrganicKeyRelatedEntityInfo({
            RelatedEntityFieldNames: 'First, Last, DOB',
        });
        expect(info.RelatedEntityFieldNamesArray).toEqual(['First', 'Last', 'DOB']);
    });

    it('should parse TransitiveObjectMatchFieldNamesArray', () => {
        const info = new EntityOrganicKeyRelatedEntityInfo({
            TransitiveObjectMatchFieldNames: 'FirstName, LastName',
        });
        expect(info.TransitiveObjectMatchFieldNamesArray).toEqual(['FirstName', 'LastName']);
    });
});

describe('EntityInfo.BuildOrganicKeyViewParams', () => {
    // Create a minimal mock record
    function createMockRecord(fieldValues: Record<string, string>): {
        Get: (field: string) => string | null;
        EntityInfo: { Fields: { Name: string; NeedsQuotes: boolean }[] };
    } {
        return {
            Get: (field: string) => fieldValues[field] ?? null,
            EntityInfo: {
                Fields: Object.keys(fieldValues).map(name => ({ Name: name, NeedsQuotes: true })),
            },
        };
    }

    describe('Direct match - simple key', () => {
        it('should build LowerCaseTrim filter', () => {
            const record = createMockRecord({ EmailAddress: 'John@Acme.com' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'EmailAddress',
                NormalizationStrategy: 'LowerCaseTrim',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'Email',
                RelatedEntity: 'Mailchimp Recipients',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.EntityName).toBe('Mailchimp Recipients');
            expect(params.ExtraFilter).toBe(
                "LOWER(LTRIM(RTRIM([Email]))) = LOWER(LTRIM(RTRIM('John@Acme.com')))"
            );
        });

        it('should build ExactMatch filter', () => {
            const record = createMockRecord({ TaxID: '123-45-6789' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'TaxID',
                NormalizationStrategy: 'ExactMatch',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'SSN',
                RelatedEntity: 'Tax Records',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.ExtraFilter).toBe("[SSN] = '123-45-6789'");
        });

        it('should build Trim filter', () => {
            const record = createMockRecord({ Code: 'ABC-123' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'Code',
                NormalizationStrategy: 'Trim',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'RefCode',
                RelatedEntity: 'References',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.ExtraFilter).toBe("LTRIM(RTRIM([RefCode])) = LTRIM(RTRIM('ABC-123'))");
        });

        it('should return 1=0 when record value is null', () => {
            const record = createMockRecord({});
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'EmailAddress',
                NormalizationStrategy: 'LowerCaseTrim',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'Email',
                RelatedEntity: 'Recipients',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.ExtraFilter).toBe('1=0');
        });

        it('should escape single quotes in values', () => {
            const record = createMockRecord({ Name: "O'Brien" });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'Name',
                NormalizationStrategy: 'ExactMatch',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'ContactName',
                RelatedEntity: 'Contacts',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.ExtraFilter).toBe("[ContactName] = 'O''Brien'");
        });
    });

    describe('Direct match - compound key', () => {
        it('should build AND conditions for multiple fields', () => {
            const record = createMockRecord({ FirstName: 'John', LastName: 'Doe', DOB: '1990-01-15' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'FirstName,LastName,DOB',
                NormalizationStrategy: 'LowerCaseTrim',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'First,Last,DateOfBirth',
                RelatedEntity: 'HR Employees',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.ExtraFilter).toContain("LOWER(LTRIM(RTRIM([First]))) = LOWER(LTRIM(RTRIM('John')))");
            expect(params.ExtraFilter).toContain(' AND ');
            expect(params.ExtraFilter).toContain("LOWER(LTRIM(RTRIM([Last]))) = LOWER(LTRIM(RTRIM('Doe')))");
            expect(params.ExtraFilter).toContain("LOWER(LTRIM(RTRIM([DateOfBirth]))) = LOWER(LTRIM(RTRIM('1990-01-15')))");
        });
    });

    describe('Transitive match', () => {
        it('should build subquery filter', () => {
            const record = createMockRecord({ EmailAddress: 'john@acme.com' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'EmailAddress',
                NormalizationStrategy: 'LowerCaseTrim',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                TransitiveObjectName: '__mj.vwContactEmailBridge',
                TransitiveObjectMatchFieldNames: 'Email',
                TransitiveObjectOutputFieldName: 'EmailSentID',
                RelatedEntityJoinFieldName: 'ID',
                RelatedEntity: 'Mailchimp Emails Sent',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.EntityName).toBe('Mailchimp Emails Sent');
            expect(params.ExtraFilter).toBe(
                "[ID] IN (SELECT [EmailSentID] FROM [__mj].[vwContactEmailBridge] WHERE LOWER(LTRIM(RTRIM([Email]))) = LOWER(LTRIM(RTRIM('john@acme.com'))))"
            );
        });
    });

    describe('Custom normalization', () => {
        it('should apply custom expression', () => {
            const record = createMockRecord({ Phone: '(555) 123-4567' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'Phone',
                NormalizationStrategy: 'Custom',
                CustomNormalizationExpression: "REPLACE(REPLACE({{FieldName}}, '-', ''), ' ', '')",
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'PhoneNumber',
                RelatedEntity: 'Call Records',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
            );

            expect(params.ExtraFilter).toBe(
                "REPLACE(REPLACE([PhoneNumber], '-', ''), ' ', '') = REPLACE(REPLACE('(555) 123-4567', '-', ''), ' ', '')"
            );
        });
    });

    describe('Additional parameters', () => {
        it('should apply filter parameter', () => {
            const record = createMockRecord({ Email: 'test@test.com' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'Email',
                NormalizationStrategy: 'ExactMatch',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'Email',
                RelatedEntity: 'Records',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
                "Status = 'Active'",
            );

            expect(params.ExtraFilter).toContain("AND (Status = 'Active')");
        });

        it('should apply maxRecords parameter', () => {
            const record = createMockRecord({ Email: 'test@test.com' });
            const organicKey = new EntityOrganicKeyInfo({
                MatchFieldNames: 'Email',
                NormalizationStrategy: 'ExactMatch',
            });
            const relatedEntity = new EntityOrganicKeyRelatedEntityInfo({
                RelatedEntityFieldNames: 'Email',
                RelatedEntity: 'Records',
            });

            const params = EntityInfo.BuildOrganicKeyViewParams(
                record as never,
                relatedEntity,
                organicKey,
                undefined,
                100,
            );

            expect(params.MaxRows).toBe(100);
        });
    });
});

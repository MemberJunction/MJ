import { describe, expect, it } from 'vitest';
import {
    BuildProduceVideoRequest,
    type ProduceVideoArchetypeLookup,
    type ProduceVideoBrandKitLookup,
    type ProduceVideoLookups,
} from '../produce-video.mapping.js';

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';

const KPI_ARCHETYPE: ProduceVideoArchetypeLookup = {
    ID: 'aaaa0000-0000-4000-8000-000000000001',
    Name: 'KPI Briefing',
    Status: 'Active',
    CompanyID: null,
    DefaultFormats: '["16:9","9:16"]',
    DefaultDurationSeconds: 45,
    MinDurationSeconds: 45,
    MaxDurationSeconds: 90,
};

const COMPANY_A_ARCHETYPE: ProduceVideoArchetypeLookup = {
    ID: 'aaaa0000-0000-4000-8000-000000000002',
    Name: 'Company A Promo',
    Status: 'Active',
    CompanyID: COMPANY_A,
    DefaultFormats: ['9:16'],
    DefaultDurationSeconds: 15,
};

const DEFAULT_BRAND_KIT: ProduceVideoBrandKitLookup = {
    ID: 'bbbb0000-0000-4000-8000-000000000001',
    Name: 'MemberJunction Default',
    Status: 'Active',
    CompanyID: null,
    IsDefault: true,
};

const COMPANY_B_BRAND_KIT: ProduceVideoBrandKitLookup = {
    ID: 'bbbb0000-0000-4000-8000-000000000002',
    Name: 'Company B Kit',
    Status: 'Active',
    CompanyID: COMPANY_B,
    IsDefault: false,
};

const PRESETS = [
    {
        ID: 'preset-draft',
        Name: 'Draft',
        DisplayName: 'Draft',
        AIConfigurationID: 'cfg-draft',
        IsDefault: false,
        Status: 'Active',
    },
    {
        ID: 'preset-standard',
        Name: 'Standard',
        DisplayName: 'Standard',
        AIConfigurationID: 'cfg-standard',
        IsDefault: true,
        Status: 'Active',
    },
    {
        ID: 'preset-high',
        Name: 'High',
        DisplayName: 'High',
        AIConfigurationID: 'cfg-high',
        IsDefault: false,
        Status: 'Active',
    },
];

function createLookups(): ProduceVideoLookups {
    const archetypes = [KPI_ARCHETYPE, COMPANY_A_ARCHETYPE];
    const kits = [DEFAULT_BRAND_KIT, COMPANY_B_BRAND_KIT];
    const queries = [{ ID: 'q-monthly-rev', Name: 'Monthly Revenue By Region' }];
    return {
        findArchetype: (nameOrId) =>
            archetypes.find(
                (a) => a.ID === nameOrId || a.Name.toLowerCase() === nameOrId.trim().toLowerCase(),
            ),
        findBrandKit: (nameOrId) =>
            kits.find(
                (k) => k.ID === nameOrId || k.Name.toLowerCase() === nameOrId.trim().toLowerCase(),
            ),
        findDefaultBrandKit: () => DEFAULT_BRAND_KIT,
        findQueryByName: (name) =>
            queries.find((q) => q.Name.toLowerCase() === name.trim().toLowerCase()),
        findPreset: (name) => {
            const target = name.trim().toLowerCase();
            return (
                PRESETS.find((p) => p.Name.toLowerCase() === target) ??
                PRESETS.find((p) => p.DisplayName.toLowerCase() === target)
            );
        },
        defaultPreset: () => PRESETS.find((p) => p.IsDefault),
        presetNames: () => PRESETS.map((p) => p.Name),
    };
}

describe('BuildProduceVideoRequest', () => {
    it('applies defaults from archetype (DefaultFormats, DefaultDurationSeconds), default brand kit, and default preset', () => {
        const res = BuildProduceVideoRequest(
            {
                Topic: '  Q3 KPI executive summary  ',
                Archetype: 'KPI Briefing',
            },
            createLookups(),
        );

        expect('Error' in res).toBe(false);
        if ('Error' in res) return;

        expect(res.Message).toBe('Q3 KPI executive summary');
        expect(res.ConfigurationID).toBe('cfg-standard');
        expect(res.Payload).toEqual({
            Archetype: {
                ArchetypeID: KPI_ARCHETYPE.ID,
                Name: 'KPI Briefing',
            },
            BrandKitID: DEFAULT_BRAND_KIT.ID,
            Film: {
                Formats: ['16:9', '9:16'],
                DurationSeconds: 45,
            },
            Deliverables: {
                Formats: ['16:9', '9:16'],
            },
            Interaction: {
                Mode: 'Autonomous',
            },
        });
    });

    it('maps Query (by QueryID and by QueryName), View, and Artifact DataRefs into VideoDataBindings', () => {
        const res = BuildProduceVideoRequest(
            {
                Topic: 'Quarterly metrics overview',
                Formats: '16:9, 1:1',
                DurationSeconds: 30,
                PowerLevel: 'Draft',
                DataRefs: [
                    {
                        Key: 'rev_by_region',
                        Kind: 'Query',
                        QueryName: 'monthly revenue by region',
                        Parameters: { Year: 2026 },
                        Shape: 'Series',
                        Format: { Kind: 'Currency', Currency: 'USD', Decimals: 0 },
                        Label: 'Revenue by Region',
                    },
                    {
                        Key: 'direct_query',
                        Kind: 'Query',
                        QueryID: 'q-explicit-id',
                        Shape: 'Scalar',
                    },
                    {
                        Key: 'active_members',
                        Kind: 'View',
                        EntityName: 'Members',
                        ExtraFilter: "Status = 'Active'",
                        Fields: ['ID', 'Name'],
                        Shape: 'Table',
                    },
                    {
                        Key: 'prior_report',
                        Kind: 'Artifact',
                        ArtifactVersionID: 'art-ver-99',
                        Shape: 'Delta',
                        Format: { Kind: 'Percent', Decimals: 1, Suffix: '%' },
                    },
                ],
            },
            createLookups(),
        );

        expect('Error' in res).toBe(false);
        if ('Error' in res) return;

        expect(res.ConfigurationID).toBe('cfg-draft');
        expect(res.Payload.Film?.Formats).toEqual(['16:9', '1:1']);
        expect(res.Payload.Deliverables?.Formats).toEqual(['16:9', '1:1']);
        expect(res.Payload.DataBindings).toEqual([
            {
                Key: 'rev_by_region',
                Source: {
                    Kind: 'Query',
                    QueryID: 'q-monthly-rev',
                    Parameters: { Year: 2026 },
                },
                Shape: 'Series',
                Format: { Kind: 'Currency', Currency: 'USD', Decimals: 0 },
                Label: 'Revenue by Region',
            },
            {
                Key: 'direct_query',
                Source: {
                    Kind: 'Query',
                    QueryID: 'q-explicit-id',
                },
                Shape: 'Scalar',
            },
            {
                Key: 'active_members',
                Source: {
                    Kind: 'View',
                    EntityName: 'Members',
                    ExtraFilter: "Status = 'Active'",
                    Fields: ['ID', 'Name'],
                },
                Shape: 'Table',
            },
            {
                Key: 'prior_report',
                Source: {
                    Kind: 'Artifact',
                    ArtifactVersionID: 'art-ver-99',
                },
                Shape: 'Delta',
                Format: { Kind: 'Percent', Decimals: 1, Suffix: '%' },
            },
        ]);
    });

    it('returns NOT_FOUND when QueryName cannot be resolved', () => {
        const res = BuildProduceVideoRequest(
            {
                Topic: 'Missing query test',
                DataRefs: [
                    {
                        Key: 'missing_q',
                        Kind: 'Query',
                        QueryName: 'Does Not Exist',
                        Shape: 'Scalar',
                    },
                ],
            },
            createLookups(),
        );

        expect(res).toEqual({
            Error: {
                Code: 'NOT_FOUND',
                Message: expect.stringContaining('Does Not Exist'),
            },
        });
    });

    it('refuses an archetype or brand kit whose CompanyID does not match the caller CompanyID', () => {
        const archetypeMismatch = BuildProduceVideoRequest(
            {
                Topic: 'Company scope mismatch',
                Archetype: 'Company A Promo',
                CompanyID: COMPANY_B,
            },
            createLookups(),
        );
        expect(archetypeMismatch).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: expect.stringContaining(COMPANY_A),
            },
        });

        const brandKitMismatch = BuildProduceVideoRequest(
            {
                Topic: 'Brand kit scope mismatch',
                BrandKit: 'Company B Kit',
                CompanyID: COMPANY_A,
            },
            createLookups(),
        );
        expect(brandKitMismatch).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: expect.stringContaining(COMPANY_B),
            },
        });

        const matchingScope = BuildProduceVideoRequest(
            {
                Topic: 'Matching company scope',
                Archetype: 'Company A Promo',
                CompanyID: COMPANY_A,
            },
            createLookups(),
        );
        expect('Error' in matchingScope).toBe(false);
    });

    it('rejects bad video format, bad DataRef Kind, and bad DataRef Shape with INVALID_PARAMS', () => {
        const badFormat = BuildProduceVideoRequest(
            {
                Topic: 'Bad format',
                Formats: '16:9,4:3',
            },
            createLookups(),
        );
        expect(badFormat).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: expect.stringContaining('4:3'),
            },
        });

        const badKind = BuildProduceVideoRequest(
            {
                Topic: 'Bad kind',
                DataRefs: [{ Key: 'k1', Kind: 'SQL', Shape: 'Scalar' }],
            },
            createLookups(),
        );
        expect(badKind).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: expect.stringContaining('SQL'),
            },
        });

        const badShape = BuildProduceVideoRequest(
            {
                Topic: 'Bad shape',
                DataRefs: [{ Key: 'k1', Kind: 'View', EntityName: 'Users', Shape: 'Cube' }],
            },
            createLookups(),
        );
        expect(badShape).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: expect.stringContaining('Cube'),
            },
        });
    });

    it('refuses Inline DataRefs with INVALID_PARAMS', () => {
        const inlineRef = BuildProduceVideoRequest(
            {
                Topic: 'Inline data ref attempt',
                DataRefs: [{ Key: 'inline_metric', Kind: 'Inline', Shape: 'Scalar' }],
            },
            createLookups(),
        );

        expect(inlineRef).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: expect.stringContaining('Inline'),
            },
        });
    });

    it('returns INVALID_PARAMS listing available preset names when PowerLevel is unknown', () => {
        const unknownPreset = BuildProduceVideoRequest(
            {
                Topic: 'Unknown preset test',
                PowerLevel: 'UltraMax',
            },
            createLookups(),
        );

        expect(unknownPreset).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: "Unknown PowerLevel 'UltraMax'. Available presets: Draft, Standard, High.",
            },
        });
    });

    it('enforces archetype MinDurationSeconds and MaxDurationSeconds range on DurationSeconds', () => {
        const outOfRange = BuildProduceVideoRequest(
            {
                Topic: 'Duration out of bounds',
                Archetype: 'KPI Briefing',
                DurationSeconds: 600,
            },
            createLookups(),
        );
        expect(outOfRange).toEqual({
            Error: {
                Code: 'INVALID_PARAMS',
                Message: expect.stringContaining('45-90'),
            },
        });

        const inRange = BuildProduceVideoRequest(
            {
                Topic: 'Duration within bounds',
                Archetype: 'KPI Briefing',
                DurationSeconds: 60,
            },
            createLookups(),
        );
        expect('Error' in inRange).toBe(false);
        if (!('Error' in inRange)) {
            expect(inRange.Payload.Film?.DurationSeconds).toBe(60);
        }
    });
});

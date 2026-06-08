/**
 * Tests for the T1_InvariantValidator inline checks.
 *
 * Each test builds a SYNTHETIC connector fixture in a fresh temp dir — no real
 * registry connector is touched. A baseline fixture passes all four invariants;
 * each invalid variant mutates exactly one input so a single check fails.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ValidateInvariants } from '../invariants.js';

const CONNECTOR = 'acme';

/** Shape of an IOF `fields` block used in fixtures. */
interface FixtureIOF {
    Name: string;
    Type: string;
    Length?: number;
    IsPrimaryKey?: boolean;
    IsForeignKey?: boolean;
    RelatedIntegrationObjectID?: string | null;
}

/** Shape of an IO node used in fixtures. */
interface FixtureIO {
    fields: {
        Name: string;
        APIPath: string;
        SupportsCreate?: boolean;
        SupportsUpdate?: boolean;
        SupportsDelete?: boolean;
        CreateAPIPath?: string | null;
        UpdateAPIPath?: string | null;
        DeleteAPIPath?: string | null;
    };
    relatedEntities: { 'MJ: Integration Object Fields': Array<{ fields: FixtureIOF }> };
}

/** Root integration metadata file shape used in fixtures. */
interface FixtureFile {
    fields: { Name: string; ClassName: string };
    relatedEntities: { 'MJ: Integration Objects': FixtureIO[] };
}

let root: string;

beforeEach(() => {
    root = mkdtempSync(resolve(tmpdir(), 'mj-t1-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

/** Build the FK `@lookup:` reference for an IO target by Name. */
function fkLookup(targetIOName: string): string {
    return `@lookup:MJ: Integration Objects.Name=${targetIOName}&IntegrationID=@lookup:MJ: Integrations.Name=Acme`;
}

/** A valid two-IO metadata file: `Company` (PK=Id) + `Contact` (PK=Id, FK→Company). */
function validMetadata(): FixtureFile {
    return {
        fields: { Name: 'Acme', ClassName: 'AcmeConnector' },
        relatedEntities: {
            'MJ: Integration Objects': [
                {
                    fields: {
                        Name: 'Company',
                        APIPath: '/companies',
                        SupportsCreate: true,
                        CreateAPIPath: '/companies',
                        SupportsUpdate: true,
                        UpdateAPIPath: '/companies/{ID}',
                        SupportsDelete: true,
                        DeleteAPIPath: '/companies/{ID}',
                    },
                    relatedEntities: {
                        'MJ: Integration Object Fields': [
                            { fields: { Name: 'Id', Type: 'int', IsPrimaryKey: true } },
                            { fields: { Name: 'Name', Type: 'nvarchar', Length: 255 } },
                        ],
                    },
                },
                {
                    fields: { Name: 'Contact', APIPath: '/contacts' },
                    relatedEntities: {
                        'MJ: Integration Object Fields': [
                            { fields: { Name: 'Id', Type: 'int', IsPrimaryKey: true } },
                            { fields: { Name: 'CompanyId', Type: 'int', IsForeignKey: true, RelatedIntegrationObjectID: fkLookup('Company') } },
                        ],
                    },
                },
            ],
        },
    };
}

/** A valid connector `.ts` source matching the metadata identity. */
function validConnectorSource(): string {
    return [
        `import { RegisterClass } from '@memberjunction/global';`,
        `import { BaseIntegrationConnector, BaseRESTIntegrationConnector } from '@memberjunction/integration-engine';`,
        ``,
        `@RegisterClass(BaseIntegrationConnector, 'AcmeConnector')`,
        `export class AcmeConnector extends BaseRESTIntegrationConnector {`,
        `    public override get IntegrationName(): string { return 'Acme'; }`,
        `}`,
        ``,
    ].join('\n');
}

/** A valid matrix: each PK-bearing IO row has ≥1 source-check yes and PKVerdict=emit. */
function validMatrixCsv(): string {
    return [
        'IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCount',
        'Company,yes,no,yes,no,no,no,no,no,no,no,emit,n/a,2',
        'Contact,yes,no,no,yes,no,no,no,no,no,yes,emit,emit,2',
        '',
    ].join('\n');
}

/** Write a complete fixture (metadata + connector .ts + matrix) to the temp registry. */
function writeFixture(opts: { metadata?: FixtureFile; connectorSource?: string | null; matrixCsv?: string | null }): void {
    const dir = resolve(root, CONNECTOR);
    const metadata = opts.metadata ?? validMetadata();

    mkdirSync(resolve(dir, 'metadata/integrations'), { recursive: true });
    writeFileSync(resolve(dir, 'metadata/integrations', `.${CONNECTOR}.json`), JSON.stringify(metadata, null, 2));

    if (opts.connectorSource !== null) {
        mkdirSync(resolve(dir, 'src'), { recursive: true });
        writeFileSync(resolve(dir, 'src', 'AcmeConnector.ts'), opts.connectorSource ?? validConnectorSource());
    }

    if (opts.matrixCsv !== null) {
        mkdirSync(resolve(dir, 'output'), { recursive: true });
        writeFileSync(resolve(dir, 'output', 'EXTRACTION_REPORT_MATRIX.csv'), opts.matrixCsv ?? validMatrixCsv());
    }
}

/** Find a check result by name inside the aggregated Details payload. */
function checkStatus(details: Record<string, unknown>, checkName: string): string | undefined {
    const checks = details['checks'];
    if (!Array.isArray(checks)) return undefined;
    const match = checks.find((c): c is { check: string; status: string } =>
        typeof c === 'object' && c !== null && (c as { check?: unknown }).check === checkName);
    return match?.status;
}

describe('ValidateInvariants', () => {
    describe('valid fixture', () => {
        it('passes all four invariants', () => {
            writeFixture({});
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status, r.Errors.join('\n')).toBe('Pass');
            expect(r.Errors).toHaveLength(0);
            expect(checkStatus(r.Details, 'ThreeWayName')).toBe('Pass');
            expect(checkStatus(r.Details, 'ForeignKeyResolution')).toBe('Pass');
            expect(checkStatus(r.Details, 'CapabilityMethodMatch')).toBe('Pass');
            expect(checkStatus(r.Details, 'PkSourceMatrix')).toBe('Pass');
            expect(checkStatus(r.Details, 'FullRecordPassThrough')).toBe('Pass');
        });
    });

    describe('check 6: full-record pass-through (Phase-2 forward-compat)', () => {
        const withFields = (expr: string): string => [
            `import { RegisterClass } from '@memberjunction/global';`,
            `import { BaseIntegrationConnector, BaseRESTIntegrationConnector } from '@memberjunction/integration-engine';`,
            `@RegisterClass(BaseIntegrationConnector, 'AcmeConnector')`,
            `export class AcmeConnector extends BaseRESTIntegrationConnector {`,
            `    public override get IntegrationName(): string { return 'Acme'; }`,
            `    private build(raw: Record<string, unknown>) {`,
            `        return { ExternalID: '1', ObjectType: 'Company', Fields: ${expr} };`,
            `    }`,
            `}`,
        ].join('\n');

        it('fails when Fields is a filtered object literal (drops customs)', () => {
            writeFixture({ connectorSource: withFields('{ Id: raw.Id, Name: raw.Name }') });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'FullRecordPassThrough')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/filtered object literal/i);
        });

        it('passes when Fields spreads the full source record', () => {
            writeFixture({ connectorSource: withFields('{ ...raw }') });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(checkStatus(r.Details, 'FullRecordPassThrough')).toBe('Pass');
        });

        it('passes when Fields spreads source then adds keys (still full)', () => {
            writeFixture({ connectorSource: withFields('{ ...raw, _GroupTypeName: name }') });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(checkStatus(r.Details, 'FullRecordPassThrough')).toBe('Pass');
        });

        it('passes when Fields is the raw record identifier', () => {
            writeFixture({ connectorSource: withFields('raw') });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(checkStatus(r.Details, 'FullRecordPassThrough')).toBe('Pass');
        });
    });

    describe('missing metadata file', () => {
        it('fails when no connector metadata file exists', () => {
            mkdirSync(resolve(root, CONNECTOR), { recursive: true });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/metadata file/i);
        });
    });

    describe('check 1: three-way name match', () => {
        it('fails when IntegrationName getter disagrees with metadata Name', () => {
            const src = validConnectorSource().replace(`return 'Acme'`, `return 'AcmeWrong'`);
            writeFixture({ connectorSource: src });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'ThreeWayName')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/IntegrationName getter/);
        });

        it('fails when @RegisterClass driver disagrees with metadata ClassName', () => {
            const src = validConnectorSource().replace(`'AcmeConnector')`, `'WrongConnector')`);
            writeFixture({ connectorSource: src });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'ThreeWayName')).toBe('Fail');
        });

        it('records a finding (not a silent pass) when the connector .ts is absent', () => {
            writeFixture({ connectorSource: null });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(checkStatus(r.Details, 'ThreeWayName')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/source not found/i);
        });
    });

    describe('check 2: FK metadata correctness', () => {
        it('fails when an FK RelatedIntegrationObjectID points at an IO not in the set', () => {
            const md = validMetadata();
            const contact = md.relatedEntities['MJ: Integration Objects'][1];
            contact.relatedEntities['MJ: Integration Object Fields'][1].fields.RelatedIntegrationObjectID = fkLookup('GhostObject');
            writeFixture({ metadata: md });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'ForeignKeyResolution')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/GhostObject/);
        });

        it('fails when IsForeignKey=true but RelatedIntegrationObjectID is null', () => {
            const md = validMetadata();
            const contact = md.relatedEntities['MJ: Integration Objects'][1];
            contact.relatedEntities['MJ: Integration Object Fields'][1].fields.RelatedIntegrationObjectID = null;
            writeFixture({ metadata: md });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'ForeignKeyResolution')).toBe('Fail');
        });

        it('resolves the FK target regardless of @lookup predicate order', () => {
            const md = validMetadata();
            const contact = md.relatedEntities['MJ: Integration Objects'][1];
            // Reversed predicate order — Name appears AFTER the nested IntegrationID lookup.
            contact.relatedEntities['MJ: Integration Object Fields'][1].fields.RelatedIntegrationObjectID =
                '@lookup:MJ: Integration Objects.IntegrationID=@lookup:MJ: Integrations.Name=Acme&Name=Company';
            writeFixture({ metadata: md });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(checkStatus(r.Details, 'ForeignKeyResolution')).toBe('Pass');
        });
    });

    describe('check 3: capability ↔ method match', () => {
        it('fails when SupportsCreate=true but CreateAPIPath is null', () => {
            const md = validMetadata();
            md.relatedEntities['MJ: Integration Objects'][0].fields.CreateAPIPath = null;
            writeFixture({ metadata: md });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'CapabilityMethodMatch')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/SupportsCreate=true but CreateAPIPath/);
        });

        it('fails when SupportsDelete=true but DeleteAPIPath is missing', () => {
            const md = validMetadata();
            delete md.relatedEntities['MJ: Integration Objects'][0].fields.DeleteAPIPath;
            writeFixture({ metadata: md });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'CapabilityMethodMatch')).toBe('Fail');
        });
    });

    describe('check 4: PK/FK source-check matrix consistency (Gap 10)', () => {
        it('fails when an emitted PK has no matrix at all', () => {
            writeFixture({ matrixCsv: null });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'PkSourceMatrix')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/matrix.*missing/i);
        });

        it('fails when a PK-bearing IO row shows no source-check yes', () => {
            const matrix = [
                'IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCount',
                'Company,no,no,no,no,no,no,no,no,no,no,emit,n/a,0',
                'Contact,yes,no,no,yes,no,no,no,no,no,yes,emit,emit,2',
                '',
            ].join('\n');
            writeFixture({ matrixCsv: matrix });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'PkSourceMatrix')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/no source-check `yes`/);
        });

        it('fails when PK defer-rate exceeds 50%', () => {
            const matrix = [
                'IOName,ExistingConnectorTs,ExistingMetadataJson,OpenAPIxPK,OpenAPIPathOps,OpenAPILocationHeader,VendorDocsProseScan,SDKTypes,PostmanCommunity,NamingConvention,CrossIOMatch,PKVerdict,FKVerdict,EvidenceCount',
                'Company,yes,no,no,no,no,no,no,no,no,no,defer,n/a,1',
                'Contact,yes,no,no,no,no,no,no,no,no,no,defer,emit,1',
                '',
            ].join('\n');
            writeFixture({ matrixCsv: matrix });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(r.Status).toBe('Fail');
            expect(checkStatus(r.Details, 'PkSourceMatrix')).toBe('Fail');
            expect(r.Errors.join(' ')).toMatch(/defer-rate/i);
        });

        it('does not fault a missing matrix when no PK is emitted', () => {
            const md = validMetadata();
            // Strip all IsPrimaryKey flags so no fabrication risk exists.
            for (const io of md.relatedEntities['MJ: Integration Objects']) {
                for (const iof of io.relatedEntities['MJ: Integration Object Fields']) {
                    delete iof.fields.IsPrimaryKey;
                }
            }
            writeFixture({ metadata: md, matrixCsv: null });
            const r = ValidateInvariants(CONNECTOR, root);
            expect(checkStatus(r.Details, 'PkSourceMatrix')).toBe('Pass');
        });
    });
});

/**
 * Tests for the deterministic record-type enumerator — the universe anchor that removes scope-finding
 * from agent judgment (the Salesforce-11-of-1,694 fix). The contract: enumerate RECORD TYPES, not
 * ENTRY POINTS, across every machine-readable source format; exclude scalars/enums/inputs/unions,
 * operation roots, introspection internals, and Relay pagination plumbing; union across sources;
 * and report confidence honestly (high for a typed/structural model, low for a best-effort scrape,
 * count 0 for prose with no model — never a false high).
 *
 * Run: `node --test packages/Integration/connector-builder-workshop/floor/`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateCatalog } from './enumerate-catalog.mjs';

test('GraphQL introspection: OBJECT + INTERFACE with fields; excludes roots, __internals, Connection plumbing, scalars, enums', () => {
    const intro = JSON.stringify({ __schema: {
        queryType: { name: 'Query' }, mutationType: { name: 'Mutation' },
        types: [
            { kind: 'OBJECT', name: 'Query', fields: [{ name: 'x' }] },          // root — excluded
            { kind: 'OBJECT', name: 'Mutation', fields: [{ name: 'y' }] },        // root — excluded
            { kind: 'OBJECT', name: 'Member', fields: [{ name: 'id' }] },
            { kind: 'OBJECT', name: 'Event', fields: [{ name: 'id' }] },
            { kind: 'INTERFACE', name: 'Activity', fields: [{ name: 'id' }] },    // interface IS a record type
            { kind: 'OBJECT', name: 'MemberConnection', fields: [{ name: 'edges' }] }, // plumbing — excluded
            { kind: 'OBJECT', name: 'MemberEdge', fields: [{ name: 'node' }] },   // plumbing — excluded
            { kind: 'OBJECT', name: 'PageInfo', fields: [{ name: 'hasNext' }] },  // plumbing — excluded
            { kind: 'OBJECT', name: '__Type', fields: [{ name: 'x' }] },          // introspection — excluded
            { kind: 'OBJECT', name: 'EmptyType', fields: [] },                    // no fields — excluded
            { kind: 'SCALAR', name: 'DateTime' },                                 // scalar — excluded
            { kind: 'ENUM', name: 'Status' },                                     // enum — excluded
            { kind: 'INPUT_OBJECT', name: 'MemberFilter', inputFields: [] },      // input — excluded
        ],
    } });
    const r = enumerateCatalog(intro);
    assert.equal(r.format, 'graphql-introspection');
    assert.equal(r.confidence, 'high');
    assert.deepEqual(r.recordTypes, ['Activity', 'Event', 'Member']);
    assert.equal(r.count, 3);
});

test('GraphQL SDL: type + interface; excludes Query/Mutation, input, enum, union, scalar, Connection', () => {
    const sdl = `
        type Query { members: [Member] }
        type Member { id: ID! name: String activity: Activity }
        type Event { id: ID! at: String }
        interface Activity { id: ID! occurredAt: String }
        type LoginActivity implements Activity { id: ID! ip: String }
        type MemberConnection { edges: [MemberEdge] }
        input MemberFilter { name: String }
        enum Status { ACTIVE INACTIVE }
        scalar DateTime
        union SearchResult = Member | Event
    `;
    const r = enumerateCatalog(sdl);
    assert.equal(r.format, 'graphql-sdl');
    assert.equal(r.confidence, 'high');
    assert.deepEqual(r.recordTypes, ['Activity', 'Event', 'LoginActivity', 'Member']);
});

test('OpenAPI JSON: components.schemas object models; excludes enum-only and primitive aliases', () => {
    const oas = JSON.stringify({ openapi: '3.0.0', paths: { '/contacts': {} }, components: { schemas: {
        Contact: { type: 'object', properties: { id: { type: 'string' } } },
        Company: { type: 'object', properties: { id: { type: 'string' } } },
        Address: { type: 'object', properties: { line1: { type: 'string' } } }, // sub-object — bias-to-more keeps it
        StatusEnum: { type: 'string', enum: ['a', 'b'] },                        // enum — excluded
        IdAlias: { type: 'string' },                                            // primitive alias — excluded
    } } });
    const r = enumerateCatalog(oas);
    assert.equal(r.format, 'openapi-json');
    assert.deepEqual(r.recordTypes, ['Address', 'Company', 'Contact']);
});

test('Swagger 2.0 JSON: definitions block is read', () => {
    const swag = JSON.stringify({ swagger: '2.0', paths: {}, definitions: {
        Pet: { type: 'object', properties: { id: {} } },
        Tag: { type: 'object', properties: { name: {} } },
    } });
    const r = enumerateCatalog(swag);
    assert.equal(r.count, 2);
    assert.deepEqual(r.recordTypes, ['Pet', 'Tag']);
});

test('Postman collection: resources from request URLs; strips ids/version/host; singularizes; recurses folders', () => {
    const pm = JSON.stringify({ info: { name: 'Vendor' }, item: [
        { name: 'Contacts', item: [
            { request: { url: { raw: 'https://api.vendor.com/v2/contacts' } } },
            { request: { url: { raw: 'https://api.vendor.com/v2/contacts/{{id}}' } } },
        ] },
        { name: 'Companies', request: { url: { raw: 'https://api.vendor.com/v2/companies?limit=10' } } },
        { request: { url: 'https://api.vendor.com/v2/deals/123' } },          // string url + numeric id
    ] });
    const r = enumerateCatalog(pm);
    assert.equal(r.format, 'postman');
    assert.equal(r.confidence, 'high');
    assert.deepEqual(r.recordTypes, ['company', 'contact', 'deal']);
});

test('XSD: complexType names', () => {
    const xsd = `<?xml version="1.0"?><xs:schema><xs:complexType name="Invoice"/><xs:complexType name="LineItem"/></xs:schema>`;
    const r = enumerateCatalog(xsd);
    assert.equal(r.format, 'xsd');
    assert.deepEqual(r.recordTypes, ['Invoice', 'LineItem']);
});

test('OpenAPI YAML: best-effort schema keys, marked LOW confidence (coarse, not authoritative)', () => {
    const yaml = 'openapi: 3.0.0\ncomponents:\n  schemas:\n    Contact:\n      type: object\n    Company:\n      type: object\n';
    const r = enumerateCatalog(yaml);
    assert.equal(r.format, 'openapi-yaml');
    assert.equal(r.confidence, 'low');
    assert.deepEqual(r.recordTypes, ['Company', 'Contact']);
});

test('fieldCount: total fields across record types is counted per typed format (for the floor field-completeness gate #17)', () => {
    const sdl = enumerateCatalog('type Account { id: ID! name: String email: String } type Course { id: ID! title: String }');
    assert.equal(sdl.fieldCount, 5);   // 3 + 2
    const oas = enumerateCatalog(JSON.stringify({ openapi: '3.0', components: { schemas: {
        Contact: { type: 'object', properties: { id: {}, name: {}, email: {} } },
        Co: { type: 'object', properties: { id: {} } },
    } } }));
    assert.equal(oas.fieldCount, 4);   // 3 + 1
    const intro = enumerateCatalog(JSON.stringify({ __schema: { queryType: { name: 'Query' }, types: [
        { kind: 'OBJECT', name: 'Member', fields: [{ name: 'id' }, { name: 'x' }] },
        { kind: 'OBJECT', name: 'Event', fields: [{ name: 'id' }] },
    ] } }));
    assert.equal(intro.fieldCount, 3); // 2 + 1
});

test('prose with no machine model: count 0, LOW confidence (the honest residual — never a false high)', () => {
    const r = enumerateCatalog('# Vendor API\nWe sync contacts and companies. See the docs page.');
    assert.equal(r.count, 0);
    assert.equal(r.confidence, 'low');
    assert.deepEqual(r.recordTypes, []);
});

test('empty / non-string input: count 0, never throws', () => {
    assert.equal(enumerateCatalog('').count, 0);
    assert.equal(enumerateCatalog('   ').count, 0);
    assert.equal(enumerateCatalog(undefined).count, 0);
});

test('record types are deduped + sorted deterministically (stable across runs)', () => {
    const sdl = 'type Beta { id: ID! } type Alpha { id: ID! } type Alpha { id: ID! }';
    const r = enumerateCatalog(sdl);
    assert.deepEqual(r.recordTypes, ['Alpha', 'Beta']); // deduped, sorted
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogFromOpenAPI } from './contract-catalog.mjs';

test('derives objects + fields + required flags + provenance from an OpenAPI spec', () => {
    const spec = {
        openapi: '3.0.0',
        components: {
            schemas: {
                Contact: {
                    type: 'object',
                    required: ['id', 'email'],
                    properties: {
                        id: { type: 'integer' },
                        email: { type: 'string' },
                        age: { type: 'number' },
                        active: { type: 'boolean' },
                    },
                },
                Company: {
                    // No explicit type, but has properties → still an object.
                    required: ['name'],
                    properties: {
                        name: { type: 'string' },
                        tags: { type: 'array' },
                        metadata: { type: 'object' },
                        weird: { type: 'unknown-type' }, // unrecognized → defaults to 'string'
                    },
                },
            },
        },
    };

    const catalog = catalogFromOpenAPI(spec);

    assert.equal(catalog.provenance, 'openapi');
    assert.equal(catalog.objects.length, 2);

    const byName = Object.fromEntries(catalog.objects.map((o) => [o.name, o]));
    assert.ok(byName.Contact, 'Contact object present');
    assert.ok(byName.Company, 'Company object present');

    // Contact: field names, mapped types, required flags.
    assert.deepEqual(byName.Contact.fields, [
        { name: 'id', type: 'integer', required: true },
        { name: 'email', type: 'string', required: true },
        { name: 'age', type: 'number', required: false },
        { name: 'active', type: 'boolean', required: false },
    ]);

    // Company: array/object pass through; unknown type defaults to 'string'; only 'name' required.
    assert.deepEqual(byName.Company.fields, [
        { name: 'name', type: 'string', required: true },
        { name: 'tags', type: 'array', required: false },
        { name: 'metadata', type: 'object', required: false },
        { name: 'weird', type: 'string', required: false },
    ]);
});

test('an empty spec yields provenance none and no objects', () => {
    const empty = catalogFromOpenAPI({});
    assert.equal(empty.provenance, 'none');
    assert.deepEqual(empty.objects, []);

    // Undefined / null spec is also contract-less.
    assert.deepEqual(catalogFromOpenAPI(undefined), { provenance: 'none', objects: [] });
    assert.deepEqual(catalogFromOpenAPI(null), { provenance: 'none', objects: [] });

    // components present but no schemas → still none.
    assert.deepEqual(catalogFromOpenAPI({ components: {} }), { provenance: 'none', objects: [] });
});

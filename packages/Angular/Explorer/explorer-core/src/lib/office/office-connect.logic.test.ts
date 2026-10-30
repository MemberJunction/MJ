import { describe, it, expect } from 'vitest';
import { EncodeBase64Url } from '@memberjunction/excel-addin';
import { BuildOfficeHandoffUrl, BuildOfficeSignInOptions, DisplayNameForUser, ReadOfficeConnectRequest } from './office-connect.logic';

const encodeJson = (value: unknown) => EncodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
const PUBLIC_KEY = encodeJson({ kty: 'RSA', n: 'sXch', e: 'AQAB', alg: 'RSA-OAEP-256' });
const STATE = 'aGVsbG8td29ybGQ';

describe('ReadOfficeConnectRequest', () => {
    it('reads a well-formed public key and state', () => {
        expect(ReadOfficeConnectRequest({ pk: PUBLIC_KEY, state: STATE })).toEqual({ PublicKey: PUBLIC_KEY, State: STATE });
    });

    it('refuses a missing or malformed value', () => {
        expect(ReadOfficeConnectRequest({ state: STATE })).toBeNull();
        expect(ReadOfficeConnectRequest({ pk: PUBLIC_KEY })).toBeNull();
        expect(ReadOfficeConnectRequest({ pk: 'not base64url!', state: STATE })).toBeNull();
        expect(ReadOfficeConnectRequest({ pk: PUBLIC_KEY, state: '<script>' })).toBeNull();
    });

    it('refuses a key that is not an RSA public key', () => {
        expect(ReadOfficeConnectRequest({ pk: encodeJson({ kty: 'EC', x: 'a', y: 'b' }), state: STATE })).toBeNull();
        expect(ReadOfficeConnectRequest({ pk: encodeJson({ kty: 'RSA', n: 'a', e: 'b', d: 'private' }), state: STATE })).toBeNull();
        expect(ReadOfficeConnectRequest({ pk: EncodeBase64Url(new TextEncoder().encode('not json')), state: STATE })).toBeNull();
    });
});

describe('BuildOfficeHandoffUrl', () => {
    const CONNECTED = 'https://mj.example.org/api/office/excel/connected.html';

    it('carries the sealed key in the fragment, never the query', () => {
        const url = BuildOfficeHandoffUrl(CONNECTED, { Sealed: 'abc_DEF-123' });
        expect(url).toBe(`${CONNECTED}#h=abc_DEF-123`);
        expect(new URL(url as string).search).toBe('');
    });

    it('replaces any fragment the host URL already had', () => {
        expect(BuildOfficeHandoffUrl(`${CONNECTED}#old`, 'cancelled')).toBe(`${CONNECTED}#cancelled=1`);
    });

    it('refuses a host URL that is not absolute http(s)', () => {
        expect(BuildOfficeHandoffUrl('/office/excel/connected.html', 'cancelled')).toBeNull();
        expect(BuildOfficeHandoffUrl('javascript:alert(1)', 'cancelled')).toBeNull();
    });
});

describe('BuildOfficeSignInOptions', () => {
    it('asks every provider to return to this page, query included', () => {
        const target = '/office/connect?pk=abc&state=def';
        expect(BuildOfficeSignInOptions(target)).toEqual({ appState: { target }, targetUrl: target });
    });

    it('never sends the user off-site', () => {
        expect(BuildOfficeSignInOptions('https://evil.example/x')).toEqual({ appState: { target: '/office/connect' }, targetUrl: '/office/connect' });
        expect(BuildOfficeSignInOptions('//evil.example/x')).toEqual({ appState: { target: '/office/connect' }, targetUrl: '/office/connect' });
    });
});

describe('DisplayNameForUser', () => {
    it('prefers first and last name, then the user name, then the email', () => {
        expect(DisplayNameForUser({ FirstName: 'Ada', LastName: 'Lovelace', Name: 'ada', Email: 'ada@example.org' })).toBe('Ada Lovelace');
        expect(DisplayNameForUser({ FirstName: ' ', Name: 'ada', Email: 'ada@example.org' })).toBe('ada');
        expect(DisplayNameForUser({ Email: 'ada@example.org' })).toBe('ada@example.org');
        expect(DisplayNameForUser(null)).toBe('');
    });
});

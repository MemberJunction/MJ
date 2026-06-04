import { describe, it, expect } from 'vitest';
import { ClassifyConnectEndpoint } from '../browser/connect-endpoint.js';

describe('ClassifyConnectEndpoint', () => {
    it('classifies http(s):// endpoints as CDP', () => {
        expect(ClassifyConnectEndpoint('http://localhost:9222')).toBe('cdp');
        expect(ClassifyConnectEndpoint('https://chrome.example.com')).toBe('cdp');
    });

    it('classifies ws(s):// endpoints as a Playwright server', () => {
        expect(ClassifyConnectEndpoint('ws://localhost:55001/abc')).toBe('server');
        expect(ClassifyConnectEndpoint('wss://pw.example.com/abc')).toBe('server');
    });

    it('honors an explicit hint over the scheme', () => {
        // A raw CDP websocket also starts with ws:// — the override forces CDP.
        expect(ClassifyConnectEndpoint('ws://localhost:9222/devtools/browser/x', 'cdp')).toBe('cdp');
        expect(ClassifyConnectEndpoint('http://localhost:9222', 'server')).toBe('server');
    });

    it('treats explicit auto hint as auto-detect', () => {
        expect(ClassifyConnectEndpoint('http://x', 'auto')).toBe('cdp');
        expect(ClassifyConnectEndpoint('ws://x', 'auto')).toBe('server');
    });

    it('throws on an unrecognized scheme when auto-detecting', () => {
        expect(() => ClassifyConnectEndpoint('localhost:9222')).toThrow(/Unrecognized connect endpoint/);
        expect(() => ClassifyConnectEndpoint('tcp://x')).toThrow(/Unrecognized connect endpoint/);
    });

    it('does NOT throw on an unrecognized scheme when an explicit hint is given', () => {
        // Hint overrides scheme inspection, so any string passes through.
        expect(ClassifyConnectEndpoint('whatever://abc', 'cdp')).toBe('cdp');
        expect(ClassifyConnectEndpoint('not-a-url', 'server')).toBe('server');
    });
});

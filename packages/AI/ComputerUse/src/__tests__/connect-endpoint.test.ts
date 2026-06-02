import { describe, it, expect } from 'vitest';
import { classifyConnectEndpoint } from '../browser/connect-endpoint.js';

describe('classifyConnectEndpoint', () => {
    it('classifies http(s):// endpoints as CDP', () => {
        expect(classifyConnectEndpoint('http://localhost:9222')).toBe('cdp');
        expect(classifyConnectEndpoint('https://chrome.example.com')).toBe('cdp');
    });

    it('classifies ws(s):// endpoints as a Playwright server', () => {
        expect(classifyConnectEndpoint('ws://localhost:55001/abc')).toBe('server');
        expect(classifyConnectEndpoint('wss://pw.example.com/abc')).toBe('server');
    });

    it('honors an explicit hint over the scheme', () => {
        // A raw CDP websocket also starts with ws:// — the override forces CDP.
        expect(classifyConnectEndpoint('ws://localhost:9222/devtools/browser/x', 'cdp')).toBe('cdp');
        expect(classifyConnectEndpoint('http://localhost:9222', 'server')).toBe('server');
    });

    it('treats explicit auto hint as auto-detect', () => {
        expect(classifyConnectEndpoint('http://x', 'auto')).toBe('cdp');
        expect(classifyConnectEndpoint('ws://x', 'auto')).toBe('server');
    });

    it('throws on an unrecognized scheme when auto-detecting', () => {
        expect(() => classifyConnectEndpoint('localhost:9222')).toThrow(/Unrecognized connect endpoint/);
        expect(() => classifyConnectEndpoint('tcp://x')).toThrow(/Unrecognized connect endpoint/);
    });

    it('does NOT throw on an unrecognized scheme when an explicit hint is given', () => {
        // Hint overrides scheme inspection, so any string passes through.
        expect(classifyConnectEndpoint('whatever://abc', 'cdp')).toBe('cdp');
        expect(classifyConnectEndpoint('not-a-url', 'server')).toBe('server');
    });
});

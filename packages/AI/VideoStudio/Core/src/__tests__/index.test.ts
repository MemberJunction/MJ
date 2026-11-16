import { describe, it, expect } from 'vitest';
import {
    RENDER_WORKER_ENV,
    RENDER_WORKER_PORT_PREFIX,
    RENDER_WORKER_ROUTES,
    VIDEO_STUDIO_SPEC_VERSION,
} from '../index.js';

describe('@memberjunction/video-studio-core', () => {
    it('exports the canonical VideoGenerationSpec schema version', () => {
        expect(VIDEO_STUDIO_SPEC_VERSION).toBe('1.0');
    });

    it('exports the canonical render worker wire contract constants', () => {
        expect(RENDER_WORKER_PORT_PREFIX).toBe('VIDEO_STUDIO_RENDER_WORKER_PORT=');
        expect(RENDER_WORKER_ROUTES).toEqual({
            Health: '/health',
            Render: '/render',
            Video: '/videos',
            Stills: '/stills',
            ContactSheet: '/contact-sheet',
            Check: '/check',
            Keyframes: '/keyframes',
        });
        expect(RENDER_WORKER_ENV).toEqual({
            Host: 'VIDEO_STUDIO_RENDER_HOST',
            Port: 'VIDEO_STUDIO_RENDER_PORT',
            Token: 'VIDEO_STUDIO_RENDER_TOKEN',
            MaxBodyMb: 'VIDEO_STUDIO_RENDER_MAX_BODY_MB',
            Concurrency: 'VIDEO_STUDIO_RENDER_CONCURRENCY',
            MaxTimeoutMs: 'VIDEO_STUDIO_RENDER_MAX_TIMEOUT_MS',
            AllowRoot: 'VIDEO_STUDIO_RENDER_ALLOW_ROOT',
        });
    });
});

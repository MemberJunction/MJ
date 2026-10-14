import { describe, it, expect } from 'vitest';
import { BrowserRealtimeMediaHost } from '../lib/services/browser-realtime-media-host';

describe('BrowserRealtimeMediaHost', () => {
    it('shares a screen through the browser picker, which a browser without one reports as unsupported', async () => {
        // Node has no getDisplayMedia, which is exactly what /media's RequestDisplayCapture checks first.
        const result = await new BrowserRealtimeMediaHost().RequestDisplayCapture({ PreferredSurface: 'window' });
        expect(result).toMatchObject({ Status: 'failed', Reason: 'unsupported' });
    });
});

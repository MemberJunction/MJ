import { describe, it, expect } from 'vitest';
import type { EntityConfig } from '../config';

describe('EntityConfig.push.skipGeoCoding', () => {
    it('is a per-entity push option, not a global CLI flag', () => {
        const cfg: EntityConfig = {
            entity: 'MJ_BizApps_Common: People',
            filePattern: '**/.*.json',
            push: { skipGeoCoding: true },
        };
        expect(cfg.push?.skipGeoCoding).toBe(true);
    });
});

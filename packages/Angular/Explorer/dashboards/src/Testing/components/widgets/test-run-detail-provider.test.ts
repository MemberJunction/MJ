import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('run detail provider', () => {
    it('passes the session provider through to the stored evaluation', () => {
        const directory = dirname(fileURLToPath(import.meta.url));
        const panel = readFileSync(join(directory, 'test-run-detail-panel.component.ts'), 'utf8');
        const result = readFileSync(join(directory, '../../../../../../Generic/Testing/src/lib/components/testing-rubric-result.component.ts'), 'utf8');
        expect(panel).toContain('[Provider]="SessionProvider"');
        expect(panel).toContain('this.Provider ?? this.session?.Provider');
        expect(result).not.toContain('Metadata.Provider');
        expect(result).toContain('this.Provider');
    });
});

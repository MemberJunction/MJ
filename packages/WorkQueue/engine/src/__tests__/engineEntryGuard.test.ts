import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const AWS_IMPORT = /(?:from\s*|import\s*|require\(\s*)['"](?:@memberjunction\/work-queue-aws|@aws-sdk\/)[^'"]*['"]/;

function SourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === '__tests__' || full === join(SRC, 'aws') ? [] : SourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('engine main entry (03 §0, F12)', () => {
    it('never imports the AWS package or an AWS SDK client outside src/aws', () => {
        const offenders = SourceFiles(SRC).filter(file => AWS_IMPORT.test(readFileSync(file, 'utf8')));
        expect(offenders.map(file => file.split(sep).slice(-2).join('/'))).toEqual([]);
    });

    it('never re-exports another package (03 §0, F13)', () => {
        const reExport = /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]@memberjunction\//;
        const offenders = SourceFiles(SRC).filter(file => reExport.test(readFileSync(file, 'utf8')));
        expect(offenders.map(file => file.split(sep).slice(-2).join('/'))).toEqual([]);
    });
});

/**
 * Unit tests for Invariant 7 — CRUD bodies are structurally real.
 *
 * Writes a synthetic connector .ts to a tmp file + runs the inspector
 * with a small metadata fixture that exercises the capability flags.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CheckCRUDBodiesReal } from '../Invariant7_CRUDBodiesReal.js';
import type { MetadataFile } from '../types.js';

const METADATA: MetadataFile = {
    fields: { Name: 'Test', ClassName: 'TestConnector' },
    relatedEntities: {
        'MJ: Integration Objects': [{
            fields: {
                Name: 'contacts',
                SupportsCreate: true,
                SupportsUpdate: true,
                SupportsDelete: true,
                GetAPIPath: '/contacts/{id}',
                ListAPIPath: '/contacts',
            },
        }],
    },
};

let workDir: string;

beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'inv7-'));
});
afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
});

function writeConnector(body: string): string {
    const path = join(workDir, 'TestConnector.ts');
    writeFileSync(path, body, 'utf-8');
    return path;
}

const REAL_BODY = `
export class TestConnector {
    async CreateRecord(ctx: any): Promise<any> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return { Success: false };
        const auth = await this.Authenticate();
        const url = this.GetBaseURL() + io.CreateAPIPath;
        const response = await this.MakeHTTPRequest(auth, url, 'POST', {}, ctx.Attributes);
        return this.ParseCRUDResponse(response);
    }
    async UpdateRecord(ctx: any): Promise<any> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return { Success: false };
        const auth = await this.Authenticate();
        const url = this.GetBaseURL() + io.UpdateAPIPath;
        const response = await this.MakeHTTPRequest(auth, url, 'PATCH', {}, ctx.Attributes);
        return this.ParseCRUDResponse(response);
    }
    async DeleteRecord(ctx: any): Promise<any> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return { Success: false };
        const auth = await this.Authenticate();
        const url = this.GetBaseURL() + io.DeleteAPIPath;
        const response = await this.MakeHTTPRequest(auth, url, 'DELETE', {});
        return this.ParseCRUDResponse(response);
    }
    async GetRecord(ctx: any): Promise<any> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return { Success: false };
        const auth = await this.Authenticate();
        const url = this.GetBaseURL() + io.GetAPIPath;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', {});
        return this.ParseCRUDResponse(response);
    }
    async ListRecords(ctx: any): Promise<any> {
        const io = this.ResolveIO(ctx.ObjectName);
        if (!io) return { Records: [], HasMore: false };
        const auth = await this.Authenticate();
        const url = this.GetBaseURL() + io.ListAPIPath;
        const response = await this.MakeHTTPRequest(auth, url, 'GET', {});
        return this.ParseListLikeResponse(response, 'results');
    }
}
`;

const STUB_BODY = `
export class TestConnector {
    async CreateRecord(ctx: any): Promise<any> {
        return { Success: false, ErrorMessage: 'not implemented', StatusCode: 501 };
    }
    async UpdateRecord(ctx: any): Promise<any> {
        return { Success: false, ErrorMessage: 'not implemented', StatusCode: 501 };
    }
    async DeleteRecord(ctx: any): Promise<any> {
        return { Success: false, ErrorMessage: 'not implemented', StatusCode: 501 };
    }
    async GetRecord(ctx: any): Promise<any> {
        return { Success: false };
    }
    async ListRecords(ctx: any): Promise<any> {
        return { Records: [], HasMore: false };
    }
}
`;

describe('Invariant 7 — CRUD bodies real', () => {
    it('passes when CRUD bodies use MakeHTTPRequest with sufficient statements', () => {
        const path = writeConnector(REAL_BODY);
        const result = CheckCRUDBodiesReal(path, METADATA);
        expect(result.Status).toBe('Pass');
        expect(result.Failures).toEqual([]);
    });

    it('fails when CRUD bodies are 501-stubs with "not implemented"', () => {
        const path = writeConnector(STUB_BODY);
        const result = CheckCRUDBodiesReal(path, METADATA);
        expect(result.Status).toBe('Fail');
        // Should catch at least the create/update/delete + list/get stubs
        expect(result.Failures.length).toBeGreaterThan(0);
        // At least one failure cites stub / not-implemented / no-HTTP-call
        expect(result.Failures.some((f) => /stub|not implemented|no HTTP|too few statements|only \d+ statements/i.test(f.Failure))).toBe(true);
    });

    it('fails when a required method (GetRecord) is missing', () => {
        const noGet = REAL_BODY.replace(/async GetRecord[\s\S]*?\n    \}/, '');
        const path = writeConnector(noGet);
        const result = CheckCRUDBodiesReal(path, METADATA);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes('GetRecord'))).toBe(true);
    });

    it('passes when no CRUD capabilities are declared on any IO', () => {
        const md: MetadataFile = {
            fields: { Name: 'Test', ClassName: 'TestConnector' },
            relatedEntities: { 'MJ: Integration Objects': [{ fields: { Name: 'readOnly' } }] },
        };
        const path = writeConnector(STUB_BODY);
        const result = CheckCRUDBodiesReal(path, md);
        expect(result.Status).toBe('Pass');
    });

    it('returns Pass when connector file doesn\'t exist (Invariant 2 catches that case)', () => {
        const result = CheckCRUDBodiesReal(join(workDir, 'does-not-exist.ts'), METADATA);
        expect(result.Status).toBe('Pass');
    });
});

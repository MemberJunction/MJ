/**
 * Unit tests for AzureFileStorage's pre-authenticated URLs: each must be a SERVICE SAS scoped to the one blob it names
 * (`sr=b`), never an ACCOUNT SAS (`ss`/`srt`), which reads or writes every blob in the storage account.
 *
 * SAS generation is local HMAC signing with the shared key, so the real driver and the real Azure SDK run here with a
 * throwaway key — no network call is made.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AzureFileStorage } from '../drivers/AzureFileStorage';

const ACCOUNT = 'mjunittest';
const CONTAINER = 'docs';

async function makeDriver(): Promise<AzureFileStorage> {
    const driver = new AzureFileStorage();
    await driver.initialize({
        accountName: ACCOUNT,
        accountKey: Buffer.from('k'.repeat(32)).toString('base64'),
        defaultContainer: CONTAINER,
    });
    return driver;
}

function expectBlobScoped(url: URL, blobPath: string, permissions: string): void {
    expect(url.host).toBe(`${ACCOUNT}.blob.core.windows.net`);
    expect(decodeURIComponent(url.pathname)).toBe(`/${CONTAINER}/${blobPath}`);
    expect(url.searchParams.get('sr')).toBe('b');
    expect(url.searchParams.get('ss')).toBeNull();
    expect(url.searchParams.get('srt')).toBeNull();
    expect(url.searchParams.get('sp')).toBe(permissions);
    expect(url.searchParams.get('spr')).toBe('https');
    expect(url.searchParams.get('sig')).toBeTruthy();
}

describe('AzureFileStorage pre-authenticated URLs', () => {
    let driver: AzureFileStorage;

    beforeEach(async () => {
        driver = await makeDriver();
    });

    it('CreatePreAuthDownloadUrl signs read access to that one blob only', async () => {
        const url = new URL(await driver.CreatePreAuthDownloadUrl('hr/secret report.pdf'));
        expectBlobScoped(url, 'hr/secret report.pdf', 'r');
    });

    it('CreatePreAuthUploadUrl signs create+write access to that one blob only', async () => {
        const payload = await driver.CreatePreAuthUploadUrl('uploads/new.pdf');
        expectBlobScoped(new URL(payload.UploadUrl), 'uploads/new.pdf', 'cw');
        expect(payload.HttpMethod).toBe('PUT');
        expect(payload.HttpHeaders).toEqual({ 'x-ms-blob-type': 'BlockBlob' });
    });

    it('keeps the 10-minute expiry (with a one-minute start skew)', async () => {
        const before = Date.now();
        const url = new URL(await driver.CreatePreAuthDownloadUrl('a.txt'));
        const expiresAt = Date.parse(url.searchParams.get('se') ?? '');
        const startsAt = Date.parse(url.searchParams.get('st') ?? '');
        expect(expiresAt - before).toBeGreaterThan(9 * 60 * 1000);
        expect(expiresAt - before).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
        expect(before - startsAt).toBeGreaterThanOrEqual(59 * 1000);
    });
});

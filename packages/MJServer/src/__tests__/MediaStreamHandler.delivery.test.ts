/**
 * Two properties of the `/media` routes that are about what a caller can make the server do:
 *
 *  - A stored file is shown `inline` only when its content type cannot run script. A file whose
 *    declared type is HTML or SVG would otherwise execute as a document on the API origin.
 *  - `POST /media/upload-stage` checks the signed upload token before the body parser runs, so a
 *    caller without a token cannot make the process buffer a 100 MB body.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('@memberjunction/storage', () => ({ FileStorageEngine: { Instance: {} } }));
vi.mock('../auth/index.js', () => ({ GetSystemUser: vi.fn() }));

import { ContentDispositionFor } from '../rest/mediaContentDisposition.js';
import { CreateMediaStreamRouter } from '../rest/MediaStreamHandler.js';
import { MediaAccessKeyManager } from '../rest/MediaAccessKeys.js';

describe('ContentDispositionFor', () => {
    it.each([
        ['image/png'],
        ['image/jpeg'],
        ['IMAGE/WEBP'],
        ['video/mp4'],
        ['audio/mpeg'],
        ['application/pdf'],
        ['text/plain'],
        ['text/plain; charset=utf-8'],
    ])('shows %s inline', (contentType) => {
        expect(ContentDispositionFor(contentType, 'file.bin')).toBe('inline; filename="file.bin"');
    });

    it.each([
        ['text/html'],
        ['text/html; charset=utf-8'],
        ['image/svg+xml'],
        ['IMAGE/SVG+XML'],
        ['application/xhtml+xml'],
        ['text/xml'],
        ['application/javascript'],
        ['application/octet-stream'],
        ['application/pdf+html'],
        ['text/plainly'],
        [' image/png'],
        [''],
    ])('sends %j as a download', (contentType) => {
        expect(ContentDispositionFor(contentType, 'file.bin')).toBe('attachment; filename="file.bin"');
    });

    it('percent-encodes the file name, so a quote in it cannot end the header value', () => {
        expect(ContentDispositionFor('text/html', 'a"; x=".html')).toBe('attachment; filename="a%22%3B%20x%3D%22.html"');
    });
});

describe('POST /media/upload-stage', () => {
    let server: http.Server | undefined;

    afterEach(async () => {
        if (server) {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server!.close(() => resolve()));
            server = undefined;
        }
    });

    async function startApp(): Promise<number> {
        const app = express();
        app.use('/media', CreateMediaStreamRouter());
        server = app.listen(0, '127.0.0.1');
        await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
        return (server.address() as AddressInfo).port;
    }

    /**
     * Declares a 500 MB body and sends none of it. A body parser that ran first would wait for
     * those bytes, so an answer arriving at once shows the token check ran before it.
     */
    function postWithoutSendingBody(port: number, authorization?: string, contentLength = 500 * 1024 * 1024): Promise<{ status: number; body: string }> {
        return new Promise((resolve, reject) => {
            const headers: http.OutgoingHttpHeaders = { 'Content-Type': 'application/octet-stream', 'Content-Length': contentLength };
            if (authorization) headers['Authorization'] = authorization;
            const req = http.request({ host: '127.0.0.1', port, path: '/media/upload-stage', method: 'POST', headers }, (res) => {
                let body = '';
                res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
                res.on('end', () => {
                    req.destroy();
                    resolve({ status: res.statusCode ?? 0, body });
                });
            });
            req.on('error', reject);
            req.flushHeaders();
        });
    }

    it('answers 401 without waiting for the body when there is no upload token', async () => {
        const port = await startApp();

        expect((await postWithoutSendingBody(port)).status).toBe(401);
    });

    it('answers 401 without waiting for the body when the token is not a signed upload token', async () => {
        const port = await startApp();
        const readToken = MediaAccessKeyManager.Instance.Sign('FILE-1', 'USER-1').Token;

        expect((await postWithoutSendingBody(port, 'Bearer not-a-token')).status).toBe(401);
        // A token signed for reading a file is not an upload token.
        expect((await postWithoutSendingBody(port, `Bearer ${readToken}`)).status).toBe(401);
    });

    it('lets a signed upload token through to the upload handler', async () => {
        const port = await startApp();
        const uploadToken = MediaAccessKeyManager.Instance.SignUpload('USER-1').Token;

        // An empty body is the handler's own refusal, so the request got past the token check.
        const response = await postWithoutSendingBody(port, `Bearer ${uploadToken}`, 0);

        expect(response.status).toBe(400);
        expect(response.body).toContain('Empty or invalid file payload');
    });
});

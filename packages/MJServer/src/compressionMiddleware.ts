import compression from 'compression';
import type { Request, RequestHandler, Response } from 'express';

/** Request content types whose responses are already compressed media, so gzip only costs CPU. */
const BINARY_REQUEST_TYPES = ['image/', 'video/', 'audio/', 'application/octet-stream'];

/**
 * MJAPI's response-compression middleware.
 *
 * Server-sent event streams are never compressed: gzip holds output until its window fills or the
 * stream ends, so an open stream (MCP, agent progress) would deliver nothing until it closed. The
 * `compression` package skips only responses marked `Cache-Control: no-transform`, and not every
 * SSE producer sets that — the MCP SDK's streamable-HTTP POST response sends only `no-cache`.
 */
export function CreateCompressionMiddleware(): RequestHandler {
    return compression({
        // Don't compress responses smaller than 1KB
        threshold: 1024,
        filter: ShouldCompressResponse,
        // High compression level (good balance between CPU and compression ratio)
        level: 6,
    }) as object as RequestHandler;
}

/** The compression filter: skips SSE streams and binary media, then defers to the package default. */
export function ShouldCompressResponse(req: Request, res: Response): boolean {
    const responseType = String(res.getHeader('Content-Type') ?? '');
    if (responseType.includes('text/event-stream')) {
        return false;
    }
    const requestType = req.headers['content-type'];
    if (requestType && BINARY_REQUEST_TYPES.some(t => requestType.includes(t))) {
        return false;
    }
    return compression.filter(req, res);
}

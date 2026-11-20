import type { Request, Response } from 'express';
import type { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

/**
 * Hands one `POST /mcp/messages` request to the session's SSE transport. The transport reads the body
 * itself and refuses a body larger than its limit (4 MB) as soon as that much has arrived.
 */
export async function ForwardSessionMessage(transport: SSEServerTransport, req: Request, res: Response): Promise<void> {
    try {
        await transport.handlePostMessage(req, res);
    } catch (error) {
        console.error('[Messages] Error handling message:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: error instanceof Error ? error.message : 'Internal server error'
            });
        }
    }
}

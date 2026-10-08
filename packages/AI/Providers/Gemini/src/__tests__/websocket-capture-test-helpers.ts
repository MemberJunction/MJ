/**
 * A minimal websocket server on `node:http` for the parity test, so the package needs no websocket dependency. It does
 * the upgrade handshake and hands back the first message each connection sends (the SDK's `setup`), then drops that
 * connection. Nothing else of RFC 6455 is needed: the `ws` client under `@google/genai` sends each message as one
 * masked text frame, and a frame read wrongly fails the test when its JSON does not parse.
 */
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

/** RFC 6455 §4.2.2: the GUID a server appends to the client's key to prove it speaks websocket. */
const HANDSHAKE_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** The payload of the first complete client frame in `bytes`, unmasked, or `null` while more bytes are due. */
export function ReadClientFrame(bytes: Buffer): Buffer | null {
    const header = readFrameHeader(bytes);
    if (!header || bytes.length < header.MaskAt + 4 + header.Length) {
        return null;
    }
    const mask = bytes.subarray(header.MaskAt, header.MaskAt + 4);
    const payload = Buffer.from(bytes.subarray(header.MaskAt + 4, header.MaskAt + 4 + header.Length));
    for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
    }
    return payload;
}

/** The payload length (7-bit, 16-bit or 64-bit form) and where the 4-byte mask starts, once those bytes are in. */
function readFrameHeader(bytes: Buffer): { Length: number; MaskAt: number } | null {
    if (bytes.length < 2) {
        return null;
    }
    const length = bytes[1] & 0x7f;
    if (length < 126) {
        return { Length: length, MaskAt: 2 };
    }
    if (length === 126) {
        return bytes.length < 4 ? null : { Length: bytes.readUInt16BE(2), MaskAt: 4 };
    }
    return bytes.length < 10 ? null : { Length: Number(bytes.readBigUInt64BE(2)), MaskAt: 10 };
}

/** Accepts websocket upgrades on a free local port and captures the first message of each connection. */
export class CaptureWebSocketServer {
    private readonly server = createServer((_request, response) => response.writeHead(404).end());
    private readonly sockets = new Set<Duplex>();
    private waiting: ((text: string) => void) | null = null;

    /** Starts listening on 127.0.0.1 and a free port. */
    public static async Start(): Promise<CaptureWebSocketServer> {
        const capture = new CaptureWebSocketServer();
        capture.server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => capture.accept(request, socket, head));
        await new Promise<void>((resolve) => capture.server.listen(0, '127.0.0.1', () => resolve()));
        return capture;
    }

    /** The http base URL to give a client (the SDK turns it into `ws://`). */
    public get BaseUrl(): string {
        const address = this.server.address();
        return typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : '';
    }

    /** The first message of the next connection that sends one. */
    public NextMessage(): Promise<string> {
        return new Promise<string>((resolve) => (this.waiting = resolve));
    }

    /** Drops every open connection. */
    public CloseConnections(): void {
        for (const socket of this.sockets) {
            socket.destroy();
        }
        this.sockets.clear();
    }

    /** Drops every connection and stops listening. */
    public async Stop(): Promise<void> {
        this.CloseConnections();
        await new Promise<void>((resolve) => this.server.close(() => resolve()));
    }

    /** Completes the handshake, then reads until the first frame is whole. */
    private accept(request: IncomingMessage, socket: Duplex, head: Buffer): void {
        const key = request.headers['sec-websocket-key'] ?? '';
        const accept = createHash('sha1').update(`${key}${HANDSHAKE_GUID}`).digest('base64');
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        this.sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => this.sockets.delete(socket));
        let received = Buffer.from(head);
        socket.on('data', (chunk: Buffer) => {
            received = Buffer.concat([received, chunk]);
            const payload = ReadClientFrame(received);
            if (payload) {
                socket.destroy();
                this.waiting?.(payload.toString('utf8'));
                this.waiting = null;
            }
        });
    }
}

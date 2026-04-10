import { EventEmitter } from 'node:events';
import type { SqlConnectivityResult } from '../adapters/SqlServerAdapter.js';

// ---------------------------------------------------------------------------
// Mock net module with a constructible Socket class
// ---------------------------------------------------------------------------
type MockSocket = EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  setTimeout: ReturnType<typeof vi.fn>;
  removeAllListeners: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
};

let mockSocket: MockSocket;

class FakeSocket extends EventEmitter {
  connect = vi.fn();
  setTimeout = vi.fn();
  destroy = vi.fn();

  constructor() {
    super();
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const originalRemoveAll = self.removeAllListeners.bind(self);
    self.removeAllListeners = vi.fn(function (event?: string | symbol) {
      return originalRemoveAll(event);
    }) as MockSocket['removeAllListeners'];

    // Expose this instance so tests can drive events on it
    mockSocket = self as unknown as MockSocket;
  }
}

vi.mock('node:net', () => ({
  default: {
    Socket: FakeSocket,
  },
}));

// Import AFTER mock is installed
const { SqlServerAdapter } = await import('../adapters/SqlServerAdapter.js');

describe('SqlServerAdapter', () => {
  let adapter: InstanceType<typeof SqlServerAdapter>;

  beforeEach(() => {
    adapter = new SqlServerAdapter();
  });

  describe('CheckConnectivity', () => {
    it('should return Reachable: true when socket connects', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);
      // Socket is created synchronously inside the Promise constructor,
      // so mockSocket is already set by the time we get here.
      mockSocket.emit('connect');

      const result: SqlConnectivityResult = await promise;
      expect(result.Reachable).toBe(true);
      expect(result.LatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.ErrorMessage).toBeUndefined();
    });

    it('should call socket.connect with the supplied host and port', async () => {
      const promise = adapter.CheckConnectivity('db.example.com', 5432);
      mockSocket.emit('connect');
      await promise;

      expect(mockSocket.connect).toHaveBeenCalledWith(5432, 'db.example.com');
    });

    it('should set socket timeout to default 5000ms when not specified', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);
      mockSocket.emit('connect');
      await promise;

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(5000);
    });

    it('should use custom timeout when provided', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433, 10000);
      mockSocket.emit('connect');
      await promise;

      expect(mockSocket.setTimeout).toHaveBeenCalledWith(10000);
    });

    it('should return Reachable: false with "refused" message on ECONNREFUSED', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);

      const err = new Error('connect ECONNREFUSED') as NodeJS.ErrnoException;
      err.code = 'ECONNREFUSED';
      mockSocket.emit('error', err);

      const result = await promise;
      expect(result.Reachable).toBe(false);
      expect(result.ErrorMessage).toContain('refused');
      expect(result.ErrorMessage).toContain('localhost');
      expect(result.ErrorMessage).toContain('1433');
    });

    it('should return Reachable: false with hostname in message on ENOTFOUND', async () => {
      const promise = adapter.CheckConnectivity('nonexistent.host', 1433);

      const err = new Error('getaddrinfo ENOTFOUND') as NodeJS.ErrnoException;
      err.code = 'ENOTFOUND';
      mockSocket.emit('error', err);

      const result = await promise;
      expect(result.Reachable).toBe(false);
      expect(result.ErrorMessage).toContain('not found');
      expect(result.ErrorMessage).toContain('nonexistent.host');
    });

    it('should return Reachable: false with "timed out" message on ETIMEDOUT', async () => {
      const promise = adapter.CheckConnectivity('slow.host', 1433);

      const err = new Error('connect ETIMEDOUT') as NodeJS.ErrnoException;
      err.code = 'ETIMEDOUT';
      mockSocket.emit('error', err);

      const result = await promise;
      expect(result.Reachable).toBe(false);
      expect(result.ErrorMessage).toContain('timed out');
    });

    it('should return Reachable: false with "reset" message on ECONNRESET', async () => {
      const promise = adapter.CheckConnectivity('db.host', 1433);

      const err = new Error('read ECONNRESET') as NodeJS.ErrnoException;
      err.code = 'ECONNRESET';
      mockSocket.emit('error', err);

      const result = await promise;
      expect(result.Reachable).toBe(false);
      expect(result.ErrorMessage).toContain('reset');
      expect(result.ErrorMessage).toContain('db.host');
    });

    it('should include the raw error message for unknown error codes', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);

      const err = new Error('Something unexpected happened') as NodeJS.ErrnoException;
      err.code = 'ESOMETHING';
      mockSocket.emit('error', err);

      const result = await promise;
      expect(result.Reachable).toBe(false);
      expect(result.ErrorMessage).toContain('Something unexpected happened');
    });

    it('should include the error code for unknown errors when code is present', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);

      const err = new Error('custom error') as NodeJS.ErrnoException;
      err.code = 'ECUSTOM';
      mockSocket.emit('error', err);

      const result = await promise;
      expect(result.ErrorMessage).toContain('ECUSTOM');
    });

    it('should return Reachable: false with "timed out" on socket timeout event', async () => {
      const promise = adapter.CheckConnectivity('slow.host', 1433, 3000);
      mockSocket.emit('timeout');

      const result = await promise;
      expect(result.Reachable).toBe(false);
      expect(result.ErrorMessage).toContain('timed out');
      expect(result.ErrorMessage).toContain('3000');
    });

    it('should destroy the socket after a successful connection', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);
      mockSocket.emit('connect');
      await promise;

      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should destroy the socket after an error', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);

      const err = new Error('fail') as NodeJS.ErrnoException;
      err.code = 'ECONNREFUSED';
      mockSocket.emit('error', err);
      await promise;

      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should destroy the socket after a timeout', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);
      mockSocket.emit('timeout');
      await promise;

      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    it('should remove all listeners during cleanup', async () => {
      const promise = adapter.CheckConnectivity('localhost', 1433);
      mockSocket.emit('connect');
      await promise;

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
    });
  });
});

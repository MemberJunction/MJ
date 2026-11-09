import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the SIGHUP operator control that hard-reloads metadata in a running MJAPI.
 * What matters: a signal triggers exactly one refresh, a burst of signals does not stack
 * reloads, and a failing refresh never rejects out of a process signal listener.
 */

const { logStatusMock, logErrorMock } = vi.hoisted(() => ({
  logStatusMock: vi.fn(),
  logErrorMock: vi.fn()
}));

vi.mock('@memberjunction/core', () => ({
  LogStatus: logStatusMock,
  LogError: logErrorMock
}));

import { CreateMetadataRefreshSignalHandler, METADATA_REFRESH_SIGNAL } from '../metadataRefreshSignal.js';

describe('CreateMetadataRefreshSignalHandler', () => {
  beforeEach(() => {
    logStatusMock.mockReset();
    logErrorMock.mockReset();
  });

  it('uses SIGHUP, not SIGUSR1 (reserved by the Node inspector)', () => {
    expect(METADATA_REFRESH_SIGNAL).toBe('SIGHUP');
  });

  it('runs the refresh once per signal', async () => {
    const refresh = vi.fn(async () => true);
    const handler = CreateMetadataRefreshSignalHandler(refresh);

    await handler();
    await handler();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(logErrorMock).not.toHaveBeenCalled();
  });

  it('ignores a signal that arrives while a refresh is still running', async () => {
    let finish: (ok: boolean) => void = () => {};
    const refresh = vi.fn(async () => true)
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    const handler = CreateMetadataRefreshSignalHandler(refresh);

    const first = handler();
    await handler(); // arrives mid-refresh
    finish(true);
    await first;

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(logStatusMock).toHaveBeenCalledWith(expect.stringContaining('already running'));

    await handler(); // in-flight flag cleared after completion
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('logs, does not reject, and re-arms when the refresh throws', async () => {
    const refresh = vi.fn(async (): Promise<boolean> => { throw new Error('db down'); });
    const handler = CreateMetadataRefreshSignalHandler(refresh);

    await expect(handler()).resolves.toBeUndefined();
    expect(logErrorMock).toHaveBeenCalledTimes(1);

    await handler();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('logs an error when the refresh reports failure', async () => {
    const handler = CreateMetadataRefreshSignalHandler(async () => false);

    await handler();

    expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('reported failure'));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AvatarVideoParams } from '@memberjunction/ai';

/**
 * How the driver classifies a failed request, with the real ErrorAnalyzer and the real HttpError
 * that `HttpPost` throws. Only the request itself is stubbed.
 */
const mockHttpPost = vi.hoisted(() => vi.fn());

vi.mock('@memberjunction/network-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/network-utils')>();
  return { ...actual, HttpPost: mockHttpPost };
});

import { HttpError } from '@memberjunction/network-utils';
import { HeyGenVideoGenerator } from '../index';

const GENERATE_URL = 'https://api.heygen.com/v2/video/generate';

/** The error `HttpPost` throws for a non-2xx response: a generic message, with the status on `Status`. */
function rejectedWith(status: number, headers: Record<string, string> = {}): HttpError {
  return new HttpError(`Request failed with status code ${status}`, {
    Status: status,
    StatusText: '',
    Data: { error: { code: 'invalid_parameter', message: 'avatar_id is invalid' } },
    Headers: headers,
    Url: GENERATE_URL,
    Method: 'POST',
  });
}

function params(): AvatarVideoParams {
  return {
    title: 'Quarterly update',
    avatarId: 'avatar-1',
    scale: 1,
    avatarStyle: 'normal',
    offsetX: 0,
    offsetY: 0,
    audioAssetId: 'audio-asset-1',
    imageAssetId: 'image-asset-1',
    outputWidth: 1280,
    outputHeight: 720,
  };
}

describe('HeyGenVideoGenerator error classification', () => {
  beforeEach(() => {
    mockHttpPost.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it.each([400, 422])('reports a %i as a request that another vendor would reject too', async (status) => {
    mockHttpPost.mockRejectedValueOnce(rejectedWith(status));

    const result = await new HeyGenVideoGenerator('test-key').CreateAvatarVideo(params());

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe(`Request failed with status code ${status}`);
    expect(result.errorInfo).toMatchObject({ httpStatusCode: status, errorType: 'InvalidRequest', canFailover: false });
    expect(result.errorInfo?.error).toBeInstanceOf(HttpError);
  });

  it.each([
    [503, 'ServiceUnavailable'],
    [502, 'InternalServerError'],
    [429, 'RateLimit'],
  ])('reports a %i as %s, which may fail over', async (status, errorType) => {
    mockHttpPost.mockRejectedValueOnce(rejectedWith(status));

    const result = await new HeyGenVideoGenerator('test-key').CreateAvatarVideo(params());

    expect(result.errorInfo).toMatchObject({ httpStatusCode: status, errorType, canFailover: true });
  });

  it("reads a rate limit's retry-after header", async () => {
    mockHttpPost.mockRejectedValueOnce(rejectedWith(429, { 'retry-after': '12' }));

    const result = await new HeyGenVideoGenerator('test-key').CreateAvatarVideo(params());

    expect(result.errorInfo?.suggestedRetryDelaySeconds).toBe(12);
  });

  it('classifies a request that got no response from its message', async () => {
    mockHttpPost.mockRejectedValueOnce(new HttpError(`Request to ${GENERATE_URL} failed: network unreachable`, { Url: GENERATE_URL, Method: 'POST' }));

    const result = await new HeyGenVideoGenerator('test-key').CreateAvatarVideo(params());

    expect(result.errorInfo).toMatchObject({ errorType: 'NetworkError', canFailover: true });
  });
});

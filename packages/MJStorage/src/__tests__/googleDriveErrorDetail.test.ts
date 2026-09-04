/**
 * Unit tests for `describeGoogleApiError`, the allowlist extractor the Google Drive driver logs
 * instead of discarding a caught googleapis error.
 *
 * The defect it exists for: a realtime recording upload failed with Drive's
 * "Service Accounts do not have storage quota. Leverage shared drives instead.", and the driver's
 * `PutObject` catch logged the error to `console.error` and returned `false` — so the only sentence
 * naming the cause never reached an operator. These tests pin the fields that must survive.
 */

import { describe, it, expect } from 'vitest';
import { describeGoogleApiError } from '../drivers/GoogleDriveFileStorage';

/** The shape googleapis actually throws for the service-account quota refusal (GaxiosError). */
const quotaError = Object.assign(new Error('Service Accounts do not have storage quota. Leverage shared drives instead.'), {
  code: 403,
  errors: [
    {
      domain: 'usageLimits',
      reason: 'storageQuotaExceeded',
      message: 'Service Accounts do not have storage quota. Leverage shared drives instead.',
    },
  ],
  response: {
    data: {
      error: {
        code: 403,
        message: 'Service Accounts do not have storage quota. Leverage shared drives instead.',
        errors: [{ domain: 'usageLimits', reason: 'storageQuotaExceeded', message: 'Service Accounts do not have storage quota.' }],
      },
    },
  },
});

describe('describeGoogleApiError', () => {
  it('names the quota reason and the human sentence for a googleapis error', () => {
    const described = describeGoogleApiError(quotaError);

    expect(described).toContain('storageQuotaExceeded');
    expect(described).toContain('Service Accounts do not have storage quota');
    expect(described).toContain('403');
  });

  it('reads the cause out of response.data.error when the top level carries none', () => {
    const described = describeGoogleApiError({
      response: { data: { error: { code: 404, message: 'File not found: abc', errors: [{ reason: 'notFound' }] } } },
    });

    expect(described).toContain('404');
    expect(described).toContain('File not found: abc');
    expect(described).toContain('notFound');
  });

  it('does not repeat the same sentence when the SDK carries it at several levels', () => {
    const described = describeGoogleApiError(quotaError);
    const sentence = 'Service Accounts do not have storage quota. Leverage shared drives instead.';
    const occurrences = described.split(sentence).length - 1;

    // Present on `message`, on `response.data.error.message`, and on `errors[0].message` — three
    // copies of one sentence is noise, so only the first survives and the detail contributes its
    // reason alone.
    expect(occurrences).toBe(1);
  });

  it('yields a plain Error its own message', () => {
    expect(describeGoogleApiError(new Error('boom'))).toBe('boom');
  });

  it('does not throw on a non-error value', () => {
    expect(describeGoogleApiError('just a string')).toBe('just a string');
    expect(describeGoogleApiError(undefined)).toBe('undefined');
    expect(describeGoogleApiError(null)).toBe('null');
    expect(() => describeGoogleApiError({})).not.toThrow();
  });
});

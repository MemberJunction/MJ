import { describe, it, expect } from 'vitest';
import { BuildBoundaryLogPayload } from '../logging/boundaryLogPayload.js';

/**
 * Guards the load-bearing #2638 fix: the always-on GraphQL boundary log line emits the
 * operation name ONLY and never a `variables` key, in any configuration. A future refactor
 * that re-adds variables to this line (the original leak) must fail here.
 *
 * See docs/adr/0001-graphql-variables-logging-tiered-by-verbose.md.
 */
describe('buildBoundaryLogPayload', () => {
  it('returns operation name only', () => {
    expect(BuildBoundaryLogPayload('CreateMJCredential')).toEqual({ operationName: 'CreateMJCredential' });
  });

  it('never includes a `variables` key', () => {
    const payload = BuildBoundaryLogPayload('RunViewsWithCacheCheck');
    expect('variables' in payload).toBe(false);
  });

  it('serialized form contains no value content — only the operation name', () => {
    // Even if someone passes a secret-shaped operation name, nothing but the name is emitted.
    const serialized = JSON.stringify(BuildBoundaryLogPayload('SomeOp'));
    expect(serialized).toBe('{"operationName":"SomeOp"}');
  });

  it('handles undefined operation name (non-named operations)', () => {
    expect(BuildBoundaryLogPayload(undefined)).toEqual({ operationName: undefined });
    expect('variables' in BuildBoundaryLogPayload(undefined)).toBe(false);
  });
});

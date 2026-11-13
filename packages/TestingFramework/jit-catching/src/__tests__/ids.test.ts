import { describe, it, expect } from 'vitest';
import { NewRunID, NewID, IsSafeFileID } from '../ids';

describe('ids', () => {
  it('NewRunID embeds the PR number and short head SHA', () => {
    const id = NewRunID(123, 'abcdef0123456789', new Date('2026-11-05T07:45:00Z'));
    expect(id).toBe('20261105-074500-pr123-abcdef0');
  });
  it('NewRunID uses "local" when there is no PR', () => {
    expect(NewRunID(null, 'abcdef0123456789', new Date('2026-11-05T07:45:00Z'))).toBe('20261105-074500-local-abcdef0');
  });
  it('NewID returns a UUID that is safe in a file name', () => {
    const id = NewID();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(IsSafeFileID(id)).toBe(true);
    expect(IsSafeFileID('../x')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { RedactConnectionSecrets } from '../types';

describe('RedactConnectionSecrets', () => {
  it.each([
    ['failed: mongodb://user:pass@host:27017/db', 'failed: mongodb://***@host:27017/db'],
    ['MongoDB+SRV://u:p@cluster.example', 'MongoDB+SRV://***@cluster.example'],
    ['a postgres://x@h and redis://y:z@r', 'a postgres://***@h and redis://***@r'],
    ['1abc://u@h', '1abc://***@h'],
    ['https://host/path@notuser', 'https://host/path@notuser'],
    ['http://user name@host', 'http://user name@host'],
    ['mailto:someone@example.com', 'mailto:someone@example.com'],
    ['a://b://c@d', 'a://b://***@d'],
    ['no secrets here', 'no secrets here'],
  ])('redacts %j', (message, expected) => {
    expect(RedactConnectionSecrets(message)).toBe(expected);
  });

  it('reads 100k scheme characters with no "://" in linear time', () => {
    const started = Date.now();
    expect(RedactConnectionSecrets('a'.repeat(100_000))).toBe('a'.repeat(100_000));
    expect(RedactConnectionSecrets('a://'.repeat(25_000))).toBe('a://'.repeat(25_000));
    expect(Date.now() - started).toBeLessThan(2500);
  });
});

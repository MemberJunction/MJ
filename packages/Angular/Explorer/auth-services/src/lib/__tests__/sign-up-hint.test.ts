import { describe, it, expect } from 'vitest';
import { ReadSignUpHint, RemoveSignUpHint, SIGN_UP_HINT_PARAM } from '../sign-up-hint';

describe('SIGN_UP_HINT_PARAM', () => {
  it('is the "signup" query parameter', () => {
    expect(SIGN_UP_HINT_PARAM).toBe('signup');
  });
});

describe('ReadSignUpHint', () => {
  it('is true for signup=1 and signup=true', () => {
    expect(ReadSignUpHint('?signup=1')).toBe(true);
    expect(ReadSignUpHint('?signup=true')).toBe(true);
    expect(ReadSignUpHint('?utm_source=x&signup=1')).toBe(true);
  });

  it('is false when the hint is absent or has another value', () => {
    expect(ReadSignUpHint('')).toBe(false);
    expect(ReadSignUpHint('?q=1')).toBe(false);
    expect(ReadSignUpHint('?signup=0')).toBe(false);
    expect(ReadSignUpHint('?signup=')).toBe(false);
  });
});

describe('RemoveSignUpHint', () => {
  it('drops only the hint and keeps other params and the hash', () => {
    expect(RemoveSignUpHint('/?signup=1')).toBe('/');
    expect(RemoveSignUpHint('/app/home?a=1&signup=1&b=2#top')).toBe('/app/home?a=1&b=2#top');
    expect(RemoveSignUpHint('https://example.com/?signup=true#x')).toBe('https://example.com/#x');
  });

  it('returns the URL unchanged when the hint is absent', () => {
    expect(RemoveSignUpHint('/app/home?a=1#top')).toBe('/app/home?a=1#top');
    expect(RemoveSignUpHint('/')).toBe('/');
  });
});

import { describe, it, expect } from 'vitest';
import {
  ValidateAvatarInput,
  AVATAR_MAX_IMAGE_BYTES,
  AVATAR_MAX_URL_LENGTH,
  AVATAR_MAX_ICON_CLASS_LENGTH,
} from '../resolvers/avatarInputValidation.js';

/** A valid base64 data URI whose payload decodes to exactly `bytes` bytes. */
function dataUri(bytes: number, type = 'png'): string {
  return `data:image/${type};base64,${Buffer.alloc(bytes, 7).toString('base64')}`;
}

function expectRefused(imageURL: string | null, iconClass: string | null = null): string {
  const result = ValidateAvatarInput(imageURL, iconClass);
  expect(result.Valid).toBe(false);
  expect(result.ErrorMessage).toBeTruthy();
  return result.ErrorMessage!;
}

describe('ValidateAvatarInput', () => {
  describe('clearing', () => {
    it('accepts both null as a revert to default', () => {
      expect(ValidateAvatarInput(null, null)).toEqual({ Valid: true, ImageURL: null, IconClass: null });
    });

    it('treats undefined and empty strings as clear', () => {
      expect(ValidateAvatarInput(undefined, undefined)).toEqual({ Valid: true, ImageURL: null, IconClass: null });
      expect(ValidateAvatarInput('', '')).toEqual({ Valid: true, ImageURL: null, IconClass: null });
    });
  });

  describe('data URIs', () => {
    it.each(['png', 'jpeg', 'jpg', 'gif', 'webp'])('accepts image/%s', (type) => {
      const uri = dataUri(10, type);
      expect(ValidateAvatarInput(uri, null)).toEqual({ Valid: true, ImageURL: uri, IconClass: null });
    });

    it('accepts every padding variant', () => {
      for (const bytes of [3, 4, 5]) {
        expect(ValidateAvatarInput(dataUri(bytes), null).Valid).toBe(true);
      }
    });

    it('accepts a decoded payload of exactly the cap', () => {
      expect(ValidateAvatarInput(dataUri(AVATAR_MAX_IMAGE_BYTES), null).Valid).toBe(true);
    });

    it('refuses a decoded payload one byte over the cap', () => {
      expect(expectRefused(dataUri(AVATAR_MAX_IMAGE_BYTES + 1))).toContain('200KB');
    });

    it('refuses SVG, which can carry script', () => {
      expectRefused(`data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`);
    });

    it.each([
      'data:text/html;base64,PHNjcmlwdD4=',
      'data:application/octet-stream;base64,AAAA',
      'data:image/png,rawdata',
      'data:image/png;base64,',
      'data:image/png;base64,AAA',
      'data:image/png;base64,AA=A',
      'data:image/png;base64,AA AA',
      'data:image/png;base64,AA*A',
      'data:image/PNG;base64,AAAA',
      `${dataUri(10)}\n`,
    ])('refuses %j', (value) => {
      expectRefused(value);
    });
  });

  describe('http(s) URLs', () => {
    it.each(['https://example.com/me.png', 'http://example.com/a/b?c=d#e', 'HTTPS://EXAMPLE.COM/x.png'])('accepts %s', (url) => {
      expect(ValidateAvatarInput(url, null)).toEqual({ Valid: true, ImageURL: url, IconClass: null });
    });

    it('accepts a URL of exactly the length cap', () => {
      const base = 'https://example.com/';
      const url = base + 'a'.repeat(AVATAR_MAX_URL_LENGTH - base.length);
      expect(url).toHaveLength(AVATAR_MAX_URL_LENGTH);
      expect(ValidateAvatarInput(url, null).Valid).toBe(true);
    });

    it('refuses a URL one character over the length cap', () => {
      const base = 'https://example.com/';
      expectRefused(base + 'a'.repeat(AVATAR_MAX_URL_LENGTH - base.length + 1));
    });

    it.each([
      'javascript:alert(1)',
      'JavaScript:alert(document.cookie)',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com/me.png',
      'blob:https://example.com/abc',
      '//example.com/me.png',
      '/assets/user.png',
      'me.png',
      'https://exa mple.com/me.png',
      ' https://example.com/me.png',
      'https://example.com/me.png\t',
      'https://',
      'http:example.com',
    ])('refuses %j', (value) => {
      expectRefused(value);
    });
  });

  describe('icon classes', () => {
    it.each(['fa-solid fa-user', 'fa-regular fa-circle-user', 'fa-user', 'fa-solid fa-user-astronaut fa-2x'])('accepts %j', (icon) => {
      expect(ValidateAvatarInput(null, icon)).toEqual({ Valid: true, ImageURL: null, IconClass: icon });
    });

    it('accepts an icon class of exactly the length cap', () => {
      const icon = 'fa-' + 'a'.repeat(AVATAR_MAX_ICON_CLASS_LENGTH - 3);
      expect(ValidateAvatarInput(null, icon).Valid).toBe(true);
    });

    it('refuses an icon class one character over the length cap', () => {
      expectRefused(null, 'fa-' + 'a'.repeat(AVATAR_MAX_ICON_CLASS_LENGTH - 2));
    });

    it.each([
      'solid user',
      'fa-',
      'fa-solid fa-User',
      'FA-SOLID FA-USER',
      'fa-solid fa-user" onmouseover="alert(1)',
      'fa-solid fa-user<script>',
      'fa-solid;fa-user',
      'fa_solid fa_user',
      'fa-solid\tfa-user',
      'fa-solid\nfa-user',
    ])('refuses %j', (icon) => {
      expectRefused(null, icon);
    });
  });

  describe('both values', () => {
    it('accepts a valid image and a valid icon together', () => {
      const uri = dataUri(10);
      expect(ValidateAvatarInput(uri, 'fa-solid fa-user')).toEqual({ Valid: true, ImageURL: uri, IconClass: 'fa-solid fa-user' });
    });

    it('refuses the whole request when either value is bad, and returns no values to store', () => {
      expect(ValidateAvatarInput('javascript:alert(1)', 'fa-solid fa-user')).toMatchObject({ Valid: false, ImageURL: null, IconClass: null });
      expect(ValidateAvatarInput(dataUri(10), 'bad icon')).toMatchObject({ Valid: false, ImageURL: null, IconClass: null });
    });
  });
});

// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { WithoutMedia } from '../lib/explorer-app.component';

/**
 * The realtime session gets a surface tool's result without its images: a voice model reads tool
 * results as text, and gets images as video frames instead.
 */
describe('WithoutMedia', () => {
  it('copies Success, Data and ErrorMessage and leaves out Media', () => {
    const result = WithoutMedia({
      Success: true,
      Data: { width: 1280, height: 720 },
      Media: [{ MimeType: 'image/jpeg', Base64: 'AAAA', Width: 1280, Height: 720 }],
    });

    expect(result).toEqual({ Success: true, Data: { width: 1280, height: 720 } });
    expect(result).not.toHaveProperty('Media');
  });

  it('keeps the error message of a failed result that carries Media', () => {
    expect(WithoutMedia({ Success: false, ErrorMessage: 'Screenshot failed.', Media: [] })).toEqual({ Success: false, ErrorMessage: 'Screenshot failed.' });
  });

  it('does not change the result it is given', () => {
    const media = [{ MimeType: 'image/png', Base64: 'BBBB' }];
    const original = { Success: true, Data: { panels: 2 }, Media: media };

    WithoutMedia(original);

    expect(original).toEqual({ Success: true, Data: { panels: 2 }, Media: media });
  });

  it('returns a result without Media as it is, other keys included', () => {
    const result = { Success: false, Message: 'No workflow named "Nightly".' };

    expect(WithoutMedia(result)).toBe(result);
  });

  it('returns a value that is not an object as it is', () => {
    expect(WithoutMedia('done')).toBe('done');
    expect(WithoutMedia(42)).toBe(42);
    expect(WithoutMedia(null)).toBeNull();
    expect(WithoutMedia(undefined)).toBeUndefined();
    const list = [{ Media: [] }];
    expect(WithoutMedia(list)).toBe(list);
  });
});

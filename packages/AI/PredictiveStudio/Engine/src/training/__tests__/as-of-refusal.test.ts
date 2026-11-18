import { describe, it, expect } from 'vitest';
import { AsOfSettingHasNoEffectError } from '../as-of-refusal';

describe('AsOfSettingHasNoEffectError.WouldBeIgnored', () => {
  it('a setting with no Mode asks for nothing', () => {
    expect(AsOfSettingHasNoEffectError.WouldBeIgnored({})).toBe(false);
    expect(AsOfSettingHasNoEffectError.WouldBeIgnored(null)).toBe(false);
    expect(AsOfSettingHasNoEffectError.WouldBeIgnored({ Mode: 'none' })).toBe(false);
    expect(AsOfSettingHasNoEffectError.WouldBeIgnored({ Mode: 'column' })).toBe(true);
  });
});

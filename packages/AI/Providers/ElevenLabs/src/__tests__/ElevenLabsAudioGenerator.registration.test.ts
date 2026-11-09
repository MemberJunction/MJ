import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAudioGenerator, BaseSpeechToText, BaseTextToSpeech } from '@memberjunction/ai';
import { ElevenLabsAudioGenerator } from '../index';

// No mocks: the driver's own @RegisterClass decorators run against the real ClassFactory, under the
// key model metadata names ('ElevenLabsAudioGenerator').
const KEY = 'ElevenLabsAudioGenerator';

describe('ElevenLabsAudioGenerator registration', () => {
  it.each([
    ['BaseTextToSpeech', BaseTextToSpeech],
    ['BaseAudioGenerator (deprecated)', BaseAudioGenerator],
  ])('resolves through the ClassFactory under %s', (_name, base) => {
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTextToSpeech>(base, KEY, 'test-key');

    expect(resolved.Resolved).toBe(true);
    expect(resolved.Instance).toBeInstanceOf(ElevenLabsAudioGenerator);
  });

  it('is not registered as speech-to-text, which it does not implement', () => {
    expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseSpeechToText, KEY)).toBeNull();
  });
});

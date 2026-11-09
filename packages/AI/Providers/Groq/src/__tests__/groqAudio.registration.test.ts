import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAudioGenerator, BaseSpeechToText, BaseTextToSpeech } from '@memberjunction/ai';
import { GroqAudioGenerator } from '../models/groqAudio';

// No mocks: the driver's own @RegisterClass decorators run against the real ClassFactory, under the
// key model metadata names ('GroqAudioGenerator').
const KEY = 'GroqAudioGenerator';

describe('GroqAudioGenerator registration', () => {
  it.each([
    ['BaseSpeechToText', BaseSpeechToText],
    ['BaseAudioGenerator (deprecated)', BaseAudioGenerator],
  ])('resolves through the ClassFactory under %s', (_name, base) => {
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseSpeechToText>(base, KEY, 'test-key');

    expect(resolved.Resolved).toBe(true);
    expect(resolved.Instance).toBeInstanceOf(GroqAudioGenerator);
  });

  it('is not registered as text-to-speech, which Groq does not offer', () => {
    expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseTextToSpeech, KEY)).toBeNull();
  });
});

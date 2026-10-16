import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAudioGenerator, BaseSpeechToText, BaseTextToSpeech } from '@memberjunction/ai';
import { OpenAIAudioGenerator } from '../models/tts';

// No mocks: the driver's own @RegisterClass decorators run against the real ClassFactory, under the
// key model metadata names ('OpenAIAudioGenerator').
const KEY = 'OpenAIAudioGenerator';

describe('OpenAIAudioGenerator registration', () => {
  it.each([
    ['BaseTextToSpeech', BaseTextToSpeech],
    ['BaseSpeechToText', BaseSpeechToText],
    ['BaseAudioGenerator (deprecated)', BaseAudioGenerator],
  ])('resolves through the ClassFactory under %s', (_name, base) => {
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTextToSpeech | BaseSpeechToText>(base, KEY, 'test-key');

    expect(resolved.Resolved).toBe(true);
    expect(resolved.Instance).toBeInstanceOf(OpenAIAudioGenerator);
  });

  it('reports both halves as supported, since it does both', async () => {
    const methods = await new OpenAIAudioGenerator('test-key').GetSupportedMethods();

    expect(methods).toEqual(expect.arrayContaining(['CreateSpeech', 'SpeechToText']));
  });
});

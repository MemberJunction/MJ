import { describe, it, expect } from 'vitest';
import { BaseTextToSpeech } from '../generic/baseTextToSpeech';
import { AudioModel, PronounciationDictionary, SpeechResult, TextToSpeechParams, VoiceInfo } from '../generic/baseAudio';

/** A speech driver written against the new base alone: it has no SpeechToText to implement. */
class TestTextToSpeech extends BaseTextToSpeech {
    public async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
        const audio = Buffer.from(`${params.voice}:${params.text}`);
        const result = new SpeechResult();
        result.success = true;
        result.data = audio;
        result.content = audio.toString('base64');
        return result;
    }

    public async GetVoices(): Promise<VoiceInfo[]> {
        return [{ id: 'v1', name: 'Voice One' }];
    }

    public async GetModels(): Promise<AudioModel[]> {
        return [];
    }

    public async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        return [];
    }

    public async GetSupportedMethods(): Promise<string[]> {
        return ['CreateSpeech', 'GetVoices'];
    }
}

describe('BaseTextToSpeech', () => {
    it('a driver needs only the text-to-speech methods', async () => {
        const driver = new TestTextToSpeech('key');

        const result = await driver.CreateSpeech({ voice: 'v1', text: 'Hello' });

        expect(result.success).toBe(true);
        expect(result.data?.toString()).toBe('v1:Hello');
        expect(Buffer.from(result.content, 'base64').toString()).toBe('v1:Hello');
        expect(await driver.GetVoices()).toEqual([{ id: 'v1', name: 'Voice One' }]);
    });
});

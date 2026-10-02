import { describe, it, expect, vi } from 'vitest';
import { BaseSpeechToText, TranscribeAudioWithSplitting } from '../generic/baseSpeechToText';
import { AudioModel, AudioSplitter, SpeechResult, SpeechToTextParams, TranscriptionPiece } from '../generic/baseAudio';
import { ModelUsage } from '../generic/baseModel';

const MB = 1024 * 1024;

/** A transcription driver written against the new base alone. */
class TestSpeechToText extends BaseSpeechToText {
    public async SpeechToText(params: SpeechToTextParams): Promise<SpeechResult> {
        const result = new SpeechResult();
        result.success = true;
        result.content = `transcript of ${params.fileName}`;
        result.usage = ModelUsage.ForMedia('Seconds', 12);
        return result;
    }

    public async GetModels(): Promise<AudioModel[]> {
        return [{
            id: 'whisper-test', name: 'Whisper Test', supportsTextToSpeech: false, supportsVoiceConversion: false,
            supportsStyle: false, supportsSpeakerBoost: false, supportsFineTuning: false,
        }];
    }

    public async GetSupportedMethods(): Promise<string[]> {
        return ['SpeechToText', 'GetModels'];
    }
}

/** Splits into fixed pieces, whatever the input. */
function splitterReturning(pieces: Buffer[]): AudioSplitter {
    return { Split: vi.fn(async () => pieces) };
}

describe('BaseSpeechToText', () => {
    it('a driver needs only the speech-to-text methods', async () => {
        const driver = new TestSpeechToText('key');

        const result = await driver.SpeechToText({ audioFile: '', audioData: Buffer.from('abc'), fileName: 'clip.mp3', model: 'whisper-test' });

        expect(result.success).toBe(true);
        expect(result.content).toBe('transcript of clip.mp3');
        expect(result.usage?.unitKind).toBe('Seconds');
        expect(await driver.GetSupportedMethods()).toEqual(['SpeechToText', 'GetModels']);
    });
});

describe('TranscribeAudioWithSplitting', () => {
    it('transcribes audio under the ceiling in one call, without splitting', async () => {
        const splitter = splitterReturning([]);
        const transcribeOne = vi.fn(async (): Promise<TranscriptionPiece> => ({ text: 'hello', durationSeconds: 3 }));

        const result = await TranscribeAudioWithSplitting(Buffer.alloc(10), 100, 90, splitter, 'Test', transcribeOne);

        expect(result).toEqual({ text: 'hello', durationSeconds: 3 });
        expect(transcribeOne).toHaveBeenCalledTimes(1);
        expect(splitter.Split).not.toHaveBeenCalled();
    });

    it('refuses oversized audio when no splitter is assigned, naming the option', async () => {
        await expect(
            TranscribeAudioWithSplitting(Buffer.alloc(3 * MB), 2 * MB, MB, null, 'Test', async () => ({ text: '' }))
        ).rejects.toThrow("Audio is 3.0MB, above Test's 2MB transcription limit. Assign an AudioSplitter");
    });

    it('transcribes the pieces in order, joining the text and summing the durations', async () => {
        const pieces = [Buffer.from('one'), Buffer.from('two')];
        const order: string[] = [];
        const transcribeOne = async (piece: Buffer): Promise<TranscriptionPiece> => {
            order.push(piece.toString());
            return { text: piece.toString(), durationSeconds: 5 };
        };

        const result = await TranscribeAudioWithSplitting(Buffer.alloc(200), 100, 90, splitterReturning(pieces), 'Test', transcribeOne);

        expect(order).toEqual(['one', 'two']);
        expect(result).toEqual({ text: 'one two', durationSeconds: 10 });
    });

    it('leaves the duration undefined when any piece reports none', async () => {
        const pieces = [Buffer.from('one'), Buffer.from('two')];
        let call = 0;
        const transcribeOne = async (): Promise<TranscriptionPiece> => (++call === 1 ? { text: 'a', durationSeconds: 5 } : { text: 'b' });

        const result = await TranscribeAudioWithSplitting(Buffer.alloc(200), 100, 90, splitterReturning(pieces), 'Test', transcribeOne);

        expect(result.text).toBe('a b');
        expect(result.durationSeconds).toBeUndefined();
    });

    it('refuses a piece the splitter left above the ceiling', async () => {
        const splitter = splitterReturning([Buffer.alloc(3 * MB)]);

        await expect(
            TranscribeAudioWithSplitting(Buffer.alloc(4 * MB), 2 * MB, MB, splitter, 'Test', async () => ({ text: '' }))
        ).rejects.toThrow("The configured AudioSplitter produced a 3.0MB piece, above Test's 2MB limit");
    });

    it('refuses a splitter that returns no pieces', async () => {
        await expect(
            TranscribeAudioWithSplitting(Buffer.alloc(200), 100, 90, splitterReturning([]), 'Test', async () => ({ text: '' }))
        ).rejects.toThrow('The configured AudioSplitter returned no pieces');
    });
});

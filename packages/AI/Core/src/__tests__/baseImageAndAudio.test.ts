import { describe, it, expect, vi } from 'vitest';
import {
    BaseImageGenerator,
    BaseDiffusion,
    GeneratedImage,
    ImageGenerationResult,
    ImageGenerationParams,
    ImageEditParams,
    ImageVariationParams,
    ImageModelInfo,
    MediaInput
} from '../generic/baseImage';
import { MJGlobal } from '@memberjunction/global';
import {
    AudioSplitter,
    BaseAudioGenerator,
    TranscriptionPiece,
    SpeechResult,
    SpeechAlignment,
    WordTiming,
    DeriveWordTimings,
    VoiceInfo,
    VoiceSample,
    AudioModel,
    AudioLanguage,
    PronounciationDictionary,
    TextToSpeechParams,
    SpeechToTextParams
} from '../generic/baseAudio';
import { BaseTextToSpeech } from '../generic/baseTextToSpeech';
import { BaseSpeechToText } from '../generic/baseSpeechToText';
import {
    BaseVideoGenerator,
    VideoResult,
    AvatarInfo,
    AvatarVideoParams,
    VideoTranslationParams,
    VideoGenerationParams,
    VideoGenerationJob
} from '../generic/baseVideo';
import { ModelUsage } from '../generic/baseModel';

// Test implementations
class TestImageGenerator extends BaseImageGenerator {
    async GenerateImage(params: ImageGenerationParams): Promise<ImageGenerationResult> {
        const img = new GeneratedImage();
        img.base64 = 'abc123';
        img.format = 'png';
        return this.createSuccessResult(new Date(), [img]);
    }
    async EditImage(params: ImageEditParams): Promise<ImageGenerationResult> {
        throw new Error('Not supported');
    }
    async CreateVariation(params: ImageVariationParams): Promise<ImageGenerationResult> {
        throw new Error('Not supported');
    }
    async GetModels(): Promise<ImageModelInfo[]> {
        return [{ id: 'dall-e-3', name: 'DALL-E 3' }];
    }
    async GetSupportedMethods(): Promise<string[]> {
        return ['GenerateImage'];
    }
}

class TestAudioGenerator extends BaseAudioGenerator {
    async CreateSpeech(params: TextToSpeechParams): Promise<SpeechResult> {
        return { success: true, content: 'audio-data' };
    }
    async SpeechToText(params: SpeechToTextParams): Promise<SpeechResult> {
        return { success: true, content: 'Hello world' };
    }
    async GetVoices(): Promise<VoiceInfo[]> {
        const voice = new VoiceInfo();
        voice.id = 'v1';
        voice.name = 'Voice 1';
        return [voice];
    }
    async GetModels(): Promise<AudioModel[]> {
        const model = new AudioModel();
        model.id = 'eleven_monolingual_v1';
        model.name = 'Monolingual v1';
        model.supportsTextToSpeech = true;
        return [model];
    }
    async GetPronounciationDictionaries(): Promise<PronounciationDictionary[]> {
        return [];
    }
    async GetSupportedMethods(): Promise<string[]> {
        return ['CreateSpeech', 'SpeechToText'];
    }
}

class TestVideoGenerator extends BaseVideoGenerator {
    async CreateAvatarVideo(params: AvatarVideoParams): Promise<VideoResult> {
        return { success: true, videoId: 'vid-123' };
    }
    async CreateVideoTranslation(params: VideoTranslationParams): Promise<VideoResult> {
        throw new Error('Not supported');
    }
    async GetAvatars(): Promise<AvatarInfo[]> {
        return [];
    }
    async GetSupportedMethods(): Promise<string[]> {
        return ['CreateAvatarVideo'];
    }
}

describe('BaseImageGenerator', () => {
    it('should generate images successfully', async () => {
        const gen = new TestImageGenerator('key');
        const result = await gen.GenerateImage({ prompt: 'A cat', model: 'dall-e-3' });

        expect(result.success).toBe(true);
        expect(result.images).toHaveLength(1);
        expect(result.images[0].base64).toBe('abc123');
    });

    it('should create success result with timing', async () => {
        const gen = new TestImageGenerator('key');
        const result = await gen.GenerateImage({ prompt: 'test' });

        expect(result.startTime).toBeInstanceOf(Date);
        expect(result.endTime).toBeInstanceOf(Date);
    });

    it('should list supported methods', async () => {
        const gen = new TestImageGenerator('key');
        const methods = await gen.GetSupportedMethods();

        expect(methods).toContain('GenerateImage');
    });

    it('should list available models', async () => {
        const gen = new TestImageGenerator('key');
        const models = await gen.GetModels();

        expect(models[0].id).toBe('dall-e-3');
        expect(models[0].name).toBe('DALL-E 3');
    });

    describe('CancelledResult', () => {
        class CancellingImageGenerator extends TestImageGenerator {
            public Cancelled(signal: AbortSignal, error?: unknown): ImageGenerationResult {
                return this.CancelledResult(signal, error);
            }
        }

        it('classifies a caller cancellation as Cancelled, never failed over', () => {
            const controller = new AbortController();
            controller.abort('user stopped it');
            const result = new CancellingImageGenerator('key').Cancelled(controller.signal);

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('was cancelled');
            expect(result.errorInfo?.errorType).toBe('Cancelled');
            expect(result.errorInfo?.canFailover).toBe(false);
        });

        it('classifies an abort caused by a timeout as a retriable network error', () => {
            const controller = new AbortController();
            controller.abort(new DOMException('The operation timed out', 'TimeoutError'));
            const result = new CancellingImageGenerator('key').Cancelled(controller.signal);

            expect(result.errorInfo?.errorType).toBe('NetworkError');
            expect(result.errorInfo?.canFailover).toBe(true);
        });
    });
});

describe('BaseDiffusion (deprecated)', () => {
    it('should be a subclass of BaseImageGenerator', () => {
        // BaseDiffusion is just an alias for backward compatibility
        expect(BaseDiffusion.prototype).toBeInstanceOf(Object);
    });
});

describe('GeneratedImage', () => {
    it('should default format to png', () => {
        const img = new GeneratedImage();
        expect(img.format).toBe('png');
    });

    it('should hold data, base64, url, width, height', () => {
        const img = new GeneratedImage();
        img.base64 = 'abc';
        img.url = 'https://example.com/img.png';
        img.width = 1024;
        img.height = 1024;

        expect(img.base64).toBe('abc');
        expect(img.url).toBe('https://example.com/img.png');
        expect(img.width).toBe(1024);
        expect(img.height).toBe(1024);
    });
});

describe('ImageGenerationParams', () => {
    it('should have sensible defaults', () => {
        const params = new ImageGenerationParams();

        expect(params.n).toBe(1);
        expect(params.size).toBe('1024x1024');
        expect(params.quality).toBe('standard');
        expect(params.outputFormat).toBe('b64_json');
    });

    it('accepts optional ReferenceImages using MediaInput (inline Data + MimeType or URL)', () => {
        const refs: MediaInput[] = [
            { Data: Buffer.from('png-bytes'), MimeType: 'image/png' },
            { URL: 'https://example.com/ref.jpg', MimeType: 'image/jpeg' }
        ];
        const params = new ImageGenerationParams();
        params.prompt = 'Hero frame with brand style';
        params.ReferenceImages = refs;

        expect(params.ReferenceImages).toHaveLength(2);
        expect(params.ReferenceImages[0].MimeType).toBe('image/png');
        expect(params.ReferenceImages[1].URL).toBe('https://example.com/ref.jpg');
    });
});

describe('BaseAudioGenerator', () => {
    it('should create speech', async () => {
        const gen = new TestAudioGenerator('key');
        const result = await gen.CreateSpeech({ voice: 'v1', text: 'Hello' });

        expect(result.success).toBe(true);
        expect(result.content).toBe('audio-data');
    });

    it('should transcribe speech to text', async () => {
        const gen = new TestAudioGenerator('key');
        const result = await gen.SpeechToText({ audioFile: 'base64data', model: 'whisper' });

        expect(result.success).toBe(true);
        expect(result.content).toBe('Hello world');
    });

    it('should list voices', async () => {
        const gen = new TestAudioGenerator('key');
        const voices = await gen.GetVoices();

        expect(voices).toHaveLength(1);
        expect(voices[0].name).toBe('Voice 1');
    });

    it('should list models', async () => {
        const gen = new TestAudioGenerator('key');
        const models = await gen.GetModels();

        expect(models[0].supportsTextToSpeech).toBe(true);
    });

    // BaseAudioGenerator is deprecated in favor of BaseTextToSpeech and BaseSpeechToText, and must keep working.
    it('can be used wherever either of the classes it was split into is expected', async () => {
        const gen = new TestAudioGenerator('key');
        const tts: BaseTextToSpeech = gen;
        const stt: BaseSpeechToText = gen;

        expect((await tts.CreateSpeech({ voice: 'v1', text: 'Hello' })).content).toBe('audio-data');
        expect((await stt.SpeechToText({ audioFile: 'base64data', model: 'whisper' })).content).toBe('Hello world');
    });

    it('still offers TranscribeWithSplitting to its drivers', async () => {
        class SplittingAudioGenerator extends TestAudioGenerator {
            public Transcribe(audio: Buffer, splitter: AudioSplitter): Promise<TranscriptionPiece> {
                return this.TranscribeWithSplitting(audio, 4, 4, splitter, 'Test', async (piece) => ({ text: piece.toString(), durationSeconds: 2 }));
            }
        }
        const splitter: AudioSplitter = { Split: async () => [Buffer.from('ab'), Buffer.from('cd')] };

        const result = await new SplittingAudioGenerator('key').Transcribe(Buffer.from('abcdefgh'), splitter);

        expect(result).toEqual({ text: 'ab cd', durationSeconds: 4 });
    });

    it('a driver registered against it and both new classes resolves through each, under one key', () => {
        const key = 'CoreTestAudioGenerator';
        const factory = MJGlobal.Instance.ClassFactory;
        factory.Register(BaseAudioGenerator, TestAudioGenerator, key);
        factory.Register(BaseTextToSpeech, TestAudioGenerator, key);
        factory.Register(BaseSpeechToText, TestAudioGenerator, key);

        for (const base of [BaseAudioGenerator, BaseTextToSpeech, BaseSpeechToText]) {
            const resolved = factory.TryCreateInstance<BaseTextToSpeech | BaseSpeechToText>(base, key, 'key');
            expect(resolved.Resolved).toBe(true);
            expect(resolved.Instance).toBeInstanceOf(TestAudioGenerator);
        }
    });
});

describe('SpeechResult', () => {
    it('should hold success and content', () => {
        const result = new SpeechResult();
        result.success = true;
        result.content = 'speech data';

        expect(result.success).toBe(true);
        expect(result.content).toBe('speech data');
    });

    it('should hold error message on failure', () => {
        const result = new SpeechResult();
        result.success = false;
        result.errorMessage = 'Voice not found';

        expect(result.success).toBe(false);
        expect(result.errorMessage).toBe('Voice not found');
    });

    it('should hold optional Alignment when timestamps are returned', () => {
        const result = new SpeechResult();
        result.success = true;
        result.content = 'audio-base64';
        result.Alignment = {
            Characters: ['H', 'i'],
            StartSeconds: [0, 0.1],
            EndSeconds: [0.1, 0.25],
        };

        expect(result.Alignment.Characters).toEqual(['H', 'i']);
        expect(result.Alignment.StartSeconds).toEqual([0, 0.1]);
        expect(result.Alignment.EndSeconds).toEqual([0.1, 0.25]);
    });
});

describe('DeriveWordTimings', () => {
    function buildAlignment(text: string, stepSeconds = 0.1): SpeechAlignment {
        const chars = Array.from(text);
        return {
            Characters: chars,
            StartSeconds: chars.map((_, idx) => Number((idx * stepSeconds).toFixed(4))),
            EndSeconds: chars.map((_, idx) => Number(((idx + 1) * stepSeconds).toFixed(4))),
        };
    }

    const cases: Array<{
        name: string;
        alignment: SpeechAlignment | null | undefined;
        expected: WordTiming[];
    }> = [
        {
            name: 'undefined alignment returns []',
            alignment: undefined,
            expected: [],
        },
        {
            name: 'null alignment returns []',
            alignment: null,
            expected: [],
        },
        {
            name: 'empty alignment arrays return []',
            alignment: { Characters: [], StartSeconds: [], EndSeconds: [] },
            expected: [],
        },
        {
            name: 'sentence with punctuation keeps punctuation attached to its word',
            alignment: buildAlignment('Hello, world!'),
            expected: [
                { Word: 'Hello,', StartSeconds: 0, EndSeconds: 0.6 },
                { Word: 'world!', StartSeconds: 0.7, EndSeconds: 1.3 },
            ],
        },
        {
            name: 'leading and trailing spaces are ignored',
            alignment: buildAlignment('  Hi  '),
            expected: [{ Word: 'Hi', StartSeconds: 0.2, EndSeconds: 0.4 }],
        },
        {
            name: 'multiple consecutive spaces split words cleanly',
            alignment: buildAlignment('A   B'),
            expected: [
                { Word: 'A', StartSeconds: 0, EndSeconds: 0.1 },
                { Word: 'B', StartSeconds: 0.4, EndSeconds: 0.5 },
            ],
        },
        {
            name: 'newlines and tabs split words cleanly',
            alignment: buildAlignment('One\nTwo\tThree\r\nFour'),
            expected: [
                { Word: 'One', StartSeconds: 0, EndSeconds: 0.3 },
                { Word: 'Two', StartSeconds: 0.4, EndSeconds: 0.7 },
                { Word: 'Three', StartSeconds: 0.8, EndSeconds: 1.3 },
                { Word: 'Four', StartSeconds: 1.5, EndSeconds: 1.9 },
            ],
        },
        {
            name: 'whitespace-only alignment returns []',
            alignment: buildAlignment('   \n\t '),
            expected: [],
        },
        {
            name: 'mismatched StartSeconds length returns []',
            alignment: {
                Characters: ['H', 'i'],
                StartSeconds: [0],
                EndSeconds: [0.1, 0.2],
            },
            expected: [],
        },
        {
            name: 'mismatched EndSeconds length returns []',
            alignment: {
                Characters: ['H', 'i'],
                StartSeconds: [0, 0.1],
                EndSeconds: [0.1],
            },
            expected: [],
        },
    ];

    it.each(cases)('$name', ({ alignment, expected }) => {
        expect(DeriveWordTimings(alignment)).toEqual(expected);
    });
});

describe('BaseVideoGenerator', () => {
    it('should create avatar video', async () => {
        const gen = new TestVideoGenerator('key');
        const result = await gen.CreateAvatarVideo({
            title: 'Test Video',
            outputWidth: 1280,
            outputHeight: 720,
            avatarId: 'av1',
            scale: 1,
            offsetX: 0,
            offsetY: 0,
            audioAssetId: 'audio1',
            imageAssetId: 'img1',
            avatarStyle: 'circle'
        });

        expect(result.success).toBe(true);
        expect(result.videoId).toBe('vid-123');
    });

    it('throws a clear not-supported error when a driver does not override GenerateVideo or GetVideoGenerationStatus', async () => {
        const gen = new TestVideoGenerator('key');

        await expect(
            gen.GenerateVideo({
                Prompt: 'Calm ocean waves at dusk',
                Mode: 'TextToVideo',
                DurationSeconds: 5,
                AspectRatio: '16:9',
                Quality: 'standard'
            })
        ).rejects.toThrow('GenerateVideo is not supported by TestVideoGenerator');

        await expect(gen.GetVideoGenerationStatus('job-42')).rejects.toThrow(
            'GetVideoGenerationStatus is not supported by TestVideoGenerator'
        );
    });

    it('round-trips a VideoGenerationJob when a subclass overrides GenerateVideo and GetVideoGenerationStatus', async () => {
        class StubGenerativeVideoDriver extends TestVideoGenerator {
            private jobs = new Map<string, VideoGenerationParams>();

            public override async GenerateVideo(params: VideoGenerationParams): Promise<VideoGenerationJob> {
                const jobId = 'job-flux-1';
                this.jobs.set(jobId, params);
                return {
                    JobID: jobId,
                    Status: 'Pending'
                };
            }

            public override async GetVideoGenerationStatus(jobId: string, _signal?: AbortSignal): Promise<VideoGenerationJob> {
                const submitted = this.jobs.get(jobId);
                if (!submitted) {
                    return {
                        JobID: jobId,
                        Status: 'Failed',
                        ErrorMessage: 'Unknown job ID'
                    };
                }
                return {
                    JobID: jobId,
                    Status: 'Succeeded',
                    Video: {
                        URL: 'https://cdn.example.com/generated.mp4',
                        MimeType: 'video/mp4',
                        DurationSeconds: submitted.DurationSeconds,
                        Width: 1920,
                        Height: 1080
                    },
                    Usage: ModelUsage.ForMedia('Seconds', 0, submitted.DurationSeconds),
                    Provenance: { C2PA: true }
                };
            }
        }

        const driver = new StubGenerativeVideoDriver('key');
        const submitted = await driver.GenerateVideo({
            Prompt: 'Aerial camera glide over pine forest',
            Mode: 'ImageToVideo',
            DurationSeconds: 6,
            AspectRatio: '16:9',
            Quality: 'high',
            Seed: 12345,
            ReferenceImages: [{ URL: 'https://example.com/start-frame.png' }],
            Keyframes: [{ Seconds: 0, Image: { Data: Buffer.from('frame0'), MimeType: 'image/png' } }],
            WantAudio: false
        });

        expect(submitted.JobID).toBe('job-flux-1');
        expect(submitted.Status).toBe('Pending');

        const completed = await driver.GetVideoGenerationStatus(submitted.JobID);
        expect(completed.Status).toBe('Succeeded');
        expect(completed.Video?.URL).toBe('https://cdn.example.com/generated.mp4');
        expect(completed.Video?.DurationSeconds).toBe(6);
        expect(completed.Usage?.unitKind).toBe('Seconds');
        expect(completed.Usage?.outputUnits).toBe(6);
        expect(completed.Provenance?.C2PA).toBe(true);
    });
});

describe('VideoResult', () => {
    it('should hold success and videoId', () => {
        const result = new VideoResult();
        result.success = true;
        result.videoId = 'vid-abc';

        expect(result.videoId).toBe('vid-abc');
    });

    it('carries the video length as usage when a driver reports it', () => {
        const result = new VideoResult();
        result.success = true;
        result.videoId = 'vid-abc';
        result.usage = ModelUsage.ForMedia('Seconds', 0, 30);

        expect(result.usage.unitKind).toBe('Seconds');
        expect(result.usage.outputUnits).toBe(30);
    });
});

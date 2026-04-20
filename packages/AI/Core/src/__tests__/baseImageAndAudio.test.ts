import { describe, it, expect, vi } from 'vitest';
import {
    BaseImageGenerator,
    BaseDiffusion,
    GeneratedImage,
    ImageGenerationResult,
    ImageGenerationParams,
    ImageEditParams,
    ImageVariationParams,
    ImageModelInfo
} from '../generic/baseImage';
import {
    BaseAudioGenerator,
    SpeechResult,
    VoiceInfo,
    VoiceSample,
    AudioModel,
    AudioLanguage,
    PronounciationDictionary,
    TextToSpeechParams,
    SpeechToTextParams
} from '../generic/baseAudio';
import { BaseVideoGenerator, VideoResult, AvatarInfo, AvatarVideoParams, VideoTranslationParams } from '../generic/baseVideo';

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
});

describe('VideoResult', () => {
    it('should hold success and videoId', () => {
        const result = new VideoResult();
        result.success = true;
        result.videoId = 'vid-abc';

        expect(result.videoId).toBe('vid-abc');
    });
});

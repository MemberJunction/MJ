import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ------------------------------------------------------------------ */
/*  Hoisted mocks                                                     */
/* ------------------------------------------------------------------ */
const mockAxiosPost = vi.hoisted(() => vi.fn());
const mockAxiosGet = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: {
    post: mockAxiosPost,
    get: mockAxiosGet,
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (_target: unknown) => {},
}));

vi.mock('@memberjunction/ai', () => {
  class MockBaseVideoGenerator {
    protected _apiKey: string;
    constructor(apiKey: string) { this._apiKey = apiKey; }
    get apiKey() { return this._apiKey; }
  }
  class MockVideoResult {
    videoId: string = '';
    success: boolean = false;
    errorMessage: string = '';
  }
  class MockAvatarInfo {
    id: string = '';
    name: string = '';
    gender: string = '';
    previewImageUrl: string = '';
    previewVideoUrl: string = '';
  }
  return {
    BaseVideoGenerator: MockBaseVideoGenerator,
    AvatarVideoParams: class {},
    VideoResult: MockVideoResult,
    AvatarInfo: MockAvatarInfo,
    ErrorAnalyzer: { analyzeError: vi.fn().mockReturnValue({ category: 'unknown' }) },
  };
});

import { HeyGenVideoGenerator } from '../index';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */
describe('HeyGenVideoGenerator', () => {
  let video: HeyGenVideoGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    video = new HeyGenVideoGenerator('test-heygen-key');
  });

  /* ---- Constructor ---- */
  describe('constructor', () => {
    it('should create an instance', () => {
      expect(video).toBeInstanceOf(HeyGenVideoGenerator);
    });

    it('should set default API URLs', () => {
      const inst = video as unknown as Record<string, string>;
      expect(inst['_generateUrl']).toBe('https://api.heygen.com/v2/video/generate');
      expect(inst['_avatarsUrl']).toBe('https://api.heygen.com/v2/avatars');
    });
  });

  /* ---- CreateAvatarVideo request building ---- */
  describe('CreateAvatarVideo', () => {
    it('should build correct API request and return videoId on success', async () => {
      mockAxiosPost.mockResolvedValueOnce({
        data: { data: { video_id: 'vid-123' } },
      });

      const params = {
        avatarId: 'avatar1',
        scale: 1.0,
        avatarStyle: 'normal',
        offsetX: 0,
        offsetY: 0,
        audioAssetId: 'audio1',
        imageAssetId: 'img1',
        outputWidth: 1920,
        outputHeight: 1080,
      };

      const result = await video.CreateAvatarVideo(params as never);
      expect(result.success).toBe(true);
      expect(result.videoId).toBe('vid-123');

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://api.heygen.com/v2/video/generate',
        expect.objectContaining({
          video_inputs: expect.arrayContaining([
            expect.objectContaining({
              character: expect.objectContaining({ avatar_id: 'avatar1' }),
              voice: expect.objectContaining({ audio_asset_id: 'audio1' }),
              background: expect.objectContaining({ image_asset_id: 'img1' }),
            }),
          ]),
          dimension: { width: 1920, height: 1080 },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Api-Key': 'test-heygen-key' }),
        }),
      );
    });

    it('should return error result on API failure', async () => {
      mockAxiosPost.mockRejectedValueOnce(new Error('HeyGen API error'));

      const params = {
        avatarId: 'avatar1',
        scale: 1.0,
        avatarStyle: 'normal',
        offsetX: 0,
        offsetY: 0,
        audioAssetId: 'audio1',
        imageAssetId: 'img1',
        outputWidth: 1920,
        outputHeight: 1080,
      };

      const result = await video.CreateAvatarVideo(params as never);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('HeyGen API error');
    });
  });

  /* ---- GetAvatars ---- */
  describe('GetAvatars', () => {
    it('should parse avatar list from API response', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          data: {
            avatars: [
              {
                avatar_id: 'a1',
                avatar_name: 'Alice',
                gender: 'female',
                preview_image_url: 'https://img/alice.png',
                preview_video_url: 'https://vid/alice.mp4',
              },
              {
                avatar_id: 'a2',
                avatar_name: 'Bob',
                gender: 'male',
                preview_image_url: 'https://img/bob.png',
                preview_video_url: 'https://vid/bob.mp4',
              },
            ],
          },
        },
      });

      const avatars = await video.GetAvatars();
      expect(avatars).toHaveLength(2);
      expect(avatars[0].id).toBe('a1');
      expect(avatars[0].name).toBe('Alice');
      expect(avatars[0].gender).toBe('female');
      expect(avatars[1].id).toBe('a2');
    });

    it('should return empty array on error', async () => {
      mockAxiosGet.mockRejectedValueOnce(new Error('API error'));
      const avatars = await video.GetAvatars();
      expect(avatars).toEqual([]);
    });
  });

  /* ---- GetSupportedMethods ---- */
  describe('GetSupportedMethods', () => {
    it('should return supported method names', async () => {
      const methods = await video.GetSupportedMethods();
      expect(methods).toContain('CreateAvatarVideo');
      expect(methods).toContain('GetAvatars');
    });
  });

  /* ---- CreateVideoTranslation ---- */
  describe('CreateVideoTranslation', () => {
    it('should throw not implemented', async () => {
      await expect(video.CreateVideoTranslation({} as never)).rejects.toThrow('Method not implemented.');
    });
  });
});

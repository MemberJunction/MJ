import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    BaseOAuthAction: class BaseOAuthAction {
        protected oauthParams: unknown[] = [];
        protected getAccessToken(): string | null { return null; }
        protected getRefreshToken(): string | null { return null; }
        protected getCustomAttribute(_index: number): string | null { return null; }
        protected async updateStoredTokens(_access: string, _refresh: string, _expiresIn: number): Promise<void> {}
    },
    OAuth2Manager: class OAuth2Manager {}
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class UserInfo {},
    Metadata: vi.fn(),
    LogStatus: vi.fn(),
    LogError: vi.fn(),
    RunView: vi.fn().mockImplementation(() => ({
        RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] })
    }))
}));

vi.mock('@memberjunction/core-entities', () => ({
    CompanyIntegrationEntity: class CompanyIntegrationEntity {
        CompanyID: string = '';
        AccessToken: string | null = null;
        RefreshToken: string | null = null;
    }
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam {
        Name: string = '';
        Value: unknown = null;
        Type: string = 'Input';
    }
}));

vi.mock('axios', () => {
    const mockAxiosInstance = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        interceptors: {
            request: { use: vi.fn() },
            response: { use: vi.fn() }
        }
    };
    return {
        default: {
            create: vi.fn(() => mockAxiosInstance),
            post: vi.fn(),
            put: vi.fn()
        }
    };
});

vi.mock('form-data', () => ({
    default: vi.fn().mockImplementation(() => ({
        append: vi.fn(),
        getHeaders: vi.fn(() => ({}))
    }))
}));

import { BaseSocialMediaAction, SocialPost, SocialAnalytics } from '../base/base-social.action';
import { BufferBaseAction } from '../providers/buffer/buffer-base.action';
import { LinkedInBaseAction } from '../providers/linkedin/linkedin-base.action';

// Concrete subclass for testing BaseSocialMediaAction
class TestSocialAction extends BaseSocialMediaAction {
    protected get platformName(): string { return 'TestPlatform'; }
    protected get apiBaseUrl(): string { return 'https://api.test.com/v1'; }

    protected async uploadSingleMedia(): Promise<string> { return 'test-url'; }
    protected async searchPosts(): Promise<SocialPost[]> { return []; }
    protected normalizePost(platformPost: Record<string, unknown>): SocialPost {
        return {
            id: String(platformPost['id'] || ''),
            platform: 'TestPlatform',
            profileId: '',
            content: '',
            mediaUrls: [],
            publishedAt: new Date(),
            platformSpecificData: {}
        };
    }

    protected async refreshAccessToken(): Promise<void> {}

    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
        return { Success: true, ResultCode: 'SUCCESS' };
    }
}

describe('BaseSocialMediaAction', () => {
    let action: TestSocialAction;

    beforeEach(() => {
        action = new TestSocialAction();
    });

    describe('normalizeAnalytics', () => {
        it('should normalize platform data with all fields', () => {
            const result = action['normalizeAnalytics']({
                impressions: 1000,
                engagements: 200,
                clicks: 50,
                shares: 30,
                comments: 20,
                likes: 100,
                reach: 800,
                saves: 10,
                videoViews: 500
            });

            expect(result.impressions).toBe(1000);
            expect(result.engagements).toBe(200);
            expect(result.clicks).toBe(50);
            expect(result.shares).toBe(30);
            expect(result.comments).toBe(20);
            expect(result.likes).toBe(100);
            expect(result.reach).toBe(800);
            expect(result.saves).toBe(10);
            expect(result.videoViews).toBe(500);
        });

        it('should default missing fields to 0', () => {
            const result = action['normalizeAnalytics']({});

            expect(result.impressions).toBe(0);
            expect(result.engagements).toBe(0);
            expect(result.clicks).toBe(0);
            expect(result.shares).toBe(0);
            expect(result.comments).toBe(0);
            expect(result.likes).toBe(0);
            expect(result.reach).toBe(0);
        });
    });

    describe('validateMediaFile', () => {
        it('should accept valid JPEG file', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.jpg',
                    mimeType: 'image/jpeg',
                    data: Buffer.from('test'),
                    size: 1024
                });
            }).not.toThrow();
        });

        it('should accept valid PNG file', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.png',
                    mimeType: 'image/png',
                    data: Buffer.from('test'),
                    size: 1024
                });
            }).not.toThrow();
        });

        it('should reject unsupported mime types', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.bmp',
                    mimeType: 'image/bmp',
                    data: Buffer.from('test'),
                    size: 1024
                });
            }).toThrow('Unsupported media type');
        });

        it('should reject files exceeding size limits', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.jpg',
                    mimeType: 'image/jpeg',
                    data: Buffer.from('test'),
                    size: 10 * 1024 * 1024 // 10MB, exceeds 5MB limit
                });
            }).toThrow('File size exceeds limit');
        });
    });

    describe('parseRateLimitHeaders', () => {
        it('should parse standard rate limit headers', () => {
            const headers = {
                'x-rate-limit-remaining': '99',
                'x-rate-limit-reset': '1718444400',
                'x-rate-limit-limit': '100'
            };

            const result = action['parseRateLimitHeaders'](headers);
            expect(result).not.toBeNull();
            expect(result!.remaining).toBe(99);
            expect(result!.limit).toBe(100);
            expect(result!.reset).toBeInstanceOf(Date);
        });

        it('should parse ratelimit variant headers', () => {
            const headers = {
                'x-ratelimit-remaining': '50',
                'x-ratelimit-reset': '1718444400',
                'x-ratelimit-limit': '200'
            };

            const result = action['parseRateLimitHeaders'](headers);
            expect(result).not.toBeNull();
            expect(result!.remaining).toBe(50);
            expect(result!.limit).toBe(200);
        });

        it('should return null when headers are missing', () => {
            const result = action['parseRateLimitHeaders']({});
            expect(result).toBeNull();
        });
    });

    describe('formatDate', () => {
        it('should format Date object to ISO string', () => {
            const date = new Date('2024-06-15T10:30:00Z');
            expect(action['formatDate'](date)).toBe('2024-06-15T10:30:00.000Z');
        });

        it('should format date string to ISO string', () => {
            const result = action['formatDate']('2024-06-15T10:30:00Z');
            expect(result).toBe('2024-06-15T10:30:00.000Z');
        });
    });

    describe('parseDate', () => {
        it('should parse ISO date string', () => {
            const result = action['parseDate']('2024-06-15T10:30:00Z');
            expect(result.toISOString()).toBe('2024-06-15T10:30:00.000Z');
        });
    });

    describe('getParamValue', () => {
        it('should find param by name', () => {
            const params = [{ Name: 'ProfileID', Value: 'p1', Type: 'Input' as const }];
            expect(action['getParamValue'](params, 'ProfileID')).toBe('p1');
        });

        it('should return undefined for missing param', () => {
            expect(action['getParamValue']([], 'Missing')).toBeUndefined();
        });
    });
});

describe('BufferBaseAction', () => {
    class TestBufferAction extends BufferBaseAction {
        protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
            return { Success: true, ResultCode: 'SUCCESS' };
        }
    }

    let action: TestBufferAction;

    beforeEach(() => {
        action = new TestBufferAction();
    });

    describe('platformName', () => {
        it('should return Buffer', () => {
            expect(action['platformName']).toBe('Buffer');
        });
    });

    describe('apiBaseUrl', () => {
        it('should return Buffer API URL', () => {
            expect(action['apiBaseUrl']).toBe('https://api.bufferapp.com/1');
        });
    });

    describe('extractHashtags', () => {
        it('should extract hashtags from content', () => {
            const result = action['extractHashtags']('Hello #world #test post');
            expect(result).toEqual(['world', 'test']);
        });

        it('should return empty array for no hashtags', () => {
            const result = action['extractHashtags']('Hello world');
            expect(result).toEqual([]);
        });

        it('should lowercase hashtags', () => {
            const result = action['extractHashtags']('#Hello #WORLD');
            expect(result).toEqual(['hello', 'world']);
        });
    });

    describe('normalizePost', () => {
        it('should normalize Buffer post to common format', () => {
            const bufferPost = {
                id: 'post1',
                profile_id: 'prof1',
                text: 'Hello Buffer!',
                sent_at: 1718444400,
                profile_service: 'twitter',
                status: 'sent',
                user_id: 'u1',
                media: {
                    picture: 'https://example.com/pic.jpg',
                    link: 'https://example.com/link'
                }
            };

            const result = action['normalizePost'](bufferPost);
            expect(result.id).toBe('post1');
            expect(result.platform).toBe('Buffer');
            expect(result.profileId).toBe('prof1');
            expect(result.content).toBe('Hello Buffer!');
            expect(result.mediaUrls).toContain('https://example.com/pic.jpg');
            expect(result.mediaUrls).toContain('https://example.com/link');
            expect(result.publishedAt).toBeInstanceOf(Date);
        });

        it('should handle post with no media', () => {
            const bufferPost = {
                id: 'post2',
                profile_id: 'prof1',
                text: 'No media',
                sent_at: 1718444400,
                profile_service: 'twitter',
                status: 'sent'
            };

            const result = action['normalizePost'](bufferPost);
            expect(result.mediaUrls).toEqual([]);
        });

        it('should handle post with scheduled date', () => {
            const bufferPost = {
                id: 'post3',
                profile_id: 'prof1',
                text: 'Scheduled',
                sent_at: 1718444400,
                due_at: 1718530800,
                profile_service: 'twitter',
                status: 'pending'
            };

            const result = action['normalizePost'](bufferPost);
            expect(result.scheduledFor).toBeInstanceOf(Date);
        });
    });

    describe('normalizeAnalytics', () => {
        it('should normalize Buffer analytics', () => {
            const bufferStats = {
                reach: 1000,
                clicks: 50,
                favorites: 200,
                mentions: 30,
                retweets: 40,
                shares: 10,
                comments: 20
            };

            const result = action['normalizeAnalytics'](bufferStats);
            expect(result.impressions).toBe(1000);
            expect(result.clicks).toBe(50);
            expect(result.likes).toBe(200);
            expect(result.shares).toBe(10);
            expect(result.comments).toBe(20); // comments takes priority over mentions
            expect(result.reach).toBe(1000);
        });

        it('should handle empty stats', () => {
            const result = action['normalizeAnalytics']({});
            expect(result.impressions).toBe(0);
            expect(result.clicks).toBe(0);
            expect(result.likes).toBe(0);
            expect(result.shares).toBe(0);
        });
    });

    describe('mapBufferError', () => {
        it('should map 401 to INVALID_TOKEN', () => {
            expect(action['mapBufferError']({ response: { status: 401, data: {} } })).toBe('INVALID_TOKEN');
        });

        it('should map 429 to RATE_LIMIT', () => {
            expect(action['mapBufferError']({ response: { status: 429, data: {} } })).toBe('RATE_LIMIT');
        });

        it('should map 403 to INSUFFICIENT_PERMISSIONS', () => {
            expect(action['mapBufferError']({ response: { status: 403, data: {} } })).toBe('INSUFFICIENT_PERMISSIONS');
        });

        it('should map 404 to POST_NOT_FOUND', () => {
            expect(action['mapBufferError']({ response: { status: 404, data: {} } })).toBe('POST_NOT_FOUND');
        });

        it('should map media errors to INVALID_MEDIA', () => {
            expect(action['mapBufferError']({
                response: { status: 400, data: { error: 'invalid media format' } }
            })).toBe('INVALID_MEDIA');
        });

        it('should default to PLATFORM_ERROR', () => {
            expect(action['mapBufferError']({ response: { status: 500, data: {} } })).toBe('PLATFORM_ERROR');
        });

        it('should return PLATFORM_ERROR for no response', () => {
            expect(action['mapBufferError']({})).toBe('PLATFORM_ERROR');
        });
    });
});

describe('LinkedInBaseAction', () => {
    class TestLinkedInAction extends LinkedInBaseAction {
        protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
            return { Success: true, ResultCode: 'SUCCESS' };
        }
    }

    let action: TestLinkedInAction;

    beforeEach(() => {
        action = new TestLinkedInAction();
    });

    describe('platformName', () => {
        it('should return LinkedIn', () => {
            expect(action['platformName']).toBe('LinkedIn');
        });
    });

    describe('apiBaseUrl', () => {
        it('should return LinkedIn API URL', () => {
            expect(action['apiBaseUrl']).toBe('https://api.linkedin.com/v2');
        });
    });

    describe('normalizeAnalytics', () => {
        it('should normalize LinkedIn analytics', () => {
            const analytics = {
                totalShareStatistics: {
                    impressionCount: 5000,
                    clickCount: 200,
                    engagement: 0.04,
                    likeCount: 150,
                    commentCount: 30,
                    shareCount: 20,
                    uniqueImpressionsCount: 4000
                }
            };

            const result = action['normalizeAnalytics'](analytics);
            expect(result.impressions).toBe(5000);
            expect(result.clicks).toBe(200);
            expect(result.likes).toBe(150);
            expect(result.comments).toBe(30);
            expect(result.shares).toBe(20);
            expect(result.reach).toBe(4000);
        });

        it('should handle missing statistics', () => {
            const result = action['normalizeAnalytics']({});
            expect(result.impressions).toBe(0);
            expect(result.clicks).toBe(0);
            expect(result.likes).toBe(0);
        });
    });

    describe('handleLinkedInError', () => {
        it('should throw for 401 errors', () => {
            const error = {
                response: { status: 401, data: {} },
                request: {},
                message: 'Unauthorized'
            };

            expect(() => action['handleLinkedInError'](error as never)).toThrow('Unauthorized');
        });

        it('should throw for 403 errors', () => {
            const error = {
                response: { status: 403, data: {} },
                request: {},
                message: 'Forbidden'
            };

            expect(() => action['handleLinkedInError'](error as never)).toThrow('Forbidden');
        });

        it('should throw for 404 errors', () => {
            const error = {
                response: { status: 404, data: {} },
                request: {},
                message: 'Not Found'
            };

            expect(() => action['handleLinkedInError'](error as never)).toThrow('Not Found');
        });

        it('should throw for 429 errors', () => {
            const error = {
                response: { status: 429, data: {} },
                request: {},
                message: 'Too Many Requests'
            };

            expect(() => action['handleLinkedInError'](error as never)).toThrow('Rate Limit Exceeded');
        });

        it('should throw for network errors', () => {
            const error = {
                request: {},
                message: 'Network Error'
            };

            expect(() => action['handleLinkedInError'](error as never)).toThrow('Network Error');
        });

        it('should throw for request setup errors', () => {
            const error = {
                message: 'Request setup failed'
            };

            expect(() => action['handleLinkedInError'](error as never)).toThrow('Request Error');
        });
    });

    describe('parseRateLimitHeaders', () => {
        it('should parse LinkedIn-specific rate limit headers', () => {
            const headers = {
                'x-app-rate-limit-remaining': '80',
                'x-app-rate-limit-limit': '100',
                'x-member-rate-limit-remaining': '90',
                'x-member-rate-limit-limit': '100'
            };

            const result = action['parseRateLimitHeaders'](headers);
            expect(result).not.toBeNull();
            expect(result!.remaining).toBe(80); // min(80, 90)
            expect(result!.limit).toBe(100); // min(100, 100)
            expect(result!.reset).toBeInstanceOf(Date);
        });

        it('should use more restrictive limit', () => {
            const headers = {
                'x-app-rate-limit-remaining': '50',
                'x-app-rate-limit-limit': '200',
                'x-member-rate-limit-remaining': '10',
                'x-member-rate-limit-limit': '100'
            };

            const result = action['parseRateLimitHeaders'](headers);
            expect(result).not.toBeNull();
            expect(result!.remaining).toBe(10); // min(50, 10)
            expect(result!.limit).toBe(100); // min(200, 100)
        });

        it('should return null when headers are missing', () => {
            const result = action['parseRateLimitHeaders']({});
            expect(result).toBeNull();
        });
    });

    describe('normalizePost', () => {
        it('should normalize LinkedIn share to common format', () => {
            const linkedInShare = {
                id: 'share1',
                author: 'urn:li:person:abc',
                created: { actor: 'urn:li:person:abc', time: 1718444400000 },
                firstPublishedAt: 1718444400000,
                lifecycleState: 'PUBLISHED',
                specificContent: {
                    'com.linkedin.ugc.ShareContent': {
                        shareCommentary: { text: 'Hello LinkedIn!' },
                        shareMediaCategory: 'NONE'
                    }
                },
                visibility: {
                    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
                }
            };

            const result = action['normalizePost'](linkedInShare);
            expect(result.id).toBe('share1');
            expect(result.platform).toBe('LinkedIn');
            expect(result.profileId).toBe('urn:li:person:abc');
            expect(result.content).toBe('Hello LinkedIn!');
            expect(result.publishedAt).toBeInstanceOf(Date);
        });

        it('should extract media URLs from share', () => {
            const linkedInShare = {
                id: 'share2',
                author: 'urn:li:person:abc',
                created: { actor: 'urn:li:person:abc', time: 1718444400000 },
                lifecycleState: 'PUBLISHED',
                specificContent: {
                    'com.linkedin.ugc.ShareContent': {
                        shareCommentary: { text: 'Post with media' },
                        shareMediaCategory: 'IMAGE',
                        media: [
                            { status: 'READY', media: 'urn:li:digitalmediaAsset:123' }
                        ]
                    }
                },
                visibility: {
                    'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
                }
            };

            const result = action['normalizePost'](linkedInShare);
            expect(result.mediaUrls).toContain('urn:li:digitalmediaAsset:123');
        });
    });

    describe('validateMediaFile', () => {
        it('should accept supported image types', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.jpg',
                    mimeType: 'image/jpeg',
                    data: Buffer.from('test'),
                    size: 1024
                });
            }).not.toThrow();
        });

        it('should accept webp format', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.webp',
                    mimeType: 'image/webp',
                    data: Buffer.from('test'),
                    size: 1024
                });
            }).not.toThrow();
        });

        it('should reject unsupported types', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.bmp',
                    mimeType: 'image/bmp',
                    data: Buffer.from('test'),
                    size: 1024
                });
            }).toThrow('Unsupported media type');
        });

        it('should reject files over 10MB', () => {
            expect(() => {
                action['validateMediaFile']({
                    filename: 'test.jpg',
                    mimeType: 'image/jpeg',
                    data: Buffer.from('test'),
                    size: 11 * 1024 * 1024
                });
            }).toThrow('File size exceeds limit');
        });
    });
});

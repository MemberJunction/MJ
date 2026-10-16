import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FLUX3VideoGenerator, FLUX3_VIDEO_DIMENSIONS } from '../flux3-video.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const C2PA_UUID_BYTES = Buffer.from([
    0xd8, 0xfe, 0xc3, 0xd6,
    0x1b, 0x0e,
    0x48, 0x3c,
    0x92, 0x97,
    0x58, 0x28, 0x87, 0x7e, 0xc4, 0x81,
]);

function makeBox(type: string, payload: Buffer): Buffer {
    const size = 8 + payload.length;
    const header = Buffer.alloc(8);
    header.writeUInt32BE(size, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, payload]);
}

function makeMp4Fixture(withC2pa: boolean): Buffer {
    const ftyp = makeBox('ftyp', Buffer.from('isom0000', 'ascii'));
    const mdat = makeBox('mdat', Buffer.from('video-frame-bytes', 'ascii'));
    if (!withC2pa) {
        return Buffer.concat([ftyp, mdat]);
    }
    const uuidBox = makeBox('uuid', Buffer.concat([C2PA_UUID_BYTES, Buffer.from('c2pa-manifest')]));
    return Buffer.concat([ftyp, uuidBox, mdat]);
}

describe('FLUX3VideoGenerator', () => {
    let generator: FLUX3VideoGenerator;

    beforeEach(() => {
        vi.clearAllMocks();
        generator = new FLUX3VideoGenerator('test-bfl-key');
    });

    describe('GenerateVideo request bodies', () => {
        it('builds exact t2v bodies for draft, standard, and high quality tiers without seed', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        id: 'vid-1',
                        polling_url: 'https://api.us.bfl.ai/v1/get_result?id=vid-1',
                        cost: 25,
                    }),
            });

            // 1. Draft quality -> resolution: 'hd', draft: true, generate_audio: false by default
            const draftJob = await generator.GenerateVideo({
                Prompt: 'A fox running through dawn mist',
                Mode: 'TextToVideo',
                DurationSeconds: 5,
                AspectRatio: '16:9',
                Quality: 'draft',
                Seed: 42,
            });
            expect(draftJob).toEqual({
                JobID: 'https://api.us.bfl.ai/v1/get_result?id=vid-1',
                Status: 'Pending',
            });
            const [draftUrl, draftOpts] = mockFetch.mock.calls[0];
            expect(draftUrl).toBe('https://api.bfl.ai/v1/flux-3-video');
            expect(draftOpts.headers['x-key']).toBe('test-bfl-key');
            expect(JSON.parse(draftOpts.body)).toEqual({
                mode: 't2v',
                prompt: 'A fox running through dawn mist',
                aspect_ratio: '16:9',
                duration: 5,
                resolution: 'hd',
                draft: true,
                generate_audio: false,
            });

            // 2. Standard quality -> resolution: 'fhd', no draft field, WantAudio: true -> generate_audio: true
            await generator.GenerateVideo({
                Prompt: 'Ocean waves at sunset',
                Mode: 'TextToVideo',
                DurationSeconds: 10,
                AspectRatio: '21:9',
                Quality: 'standard',
                WantAudio: true,
            });
            expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
                mode: 't2v',
                prompt: 'Ocean waves at sunset',
                aspect_ratio: '21:9',
                duration: 10,
                resolution: 'fhd',
                generate_audio: true,
            });

            // 3. High quality -> resolution: 'qhd', no draft field
            await generator.GenerateVideo({
                Prompt: 'Alpine mountain pass',
                Mode: 'TextToVideo',
                DurationSeconds: 15,
                AspectRatio: '9:16',
                Quality: 'high',
            });
            expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({
                mode: 't2v',
                prompt: 'Alpine mountain pass',
                aspect_ratio: '9:16',
                duration: 15,
                resolution: 'qhd',
                generate_audio: false,
            });
        });

        it('builds exact i2v bodies with [seconds, image] keyframe pairs and plain ReferenceImages list', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        id: 'vid-i2v',
                        polling_url: 'https://api.bfl.ai/v1/get_result?id=vid-i2v',
                    }),
            });

            // Timestamped keyframe pairs
            await generator.GenerateVideo({
                Prompt: 'Seed grows into a tree',
                Mode: 'ImageToVideo',
                DurationSeconds: 10,
                AspectRatio: '16:9',
                Quality: 'standard',
                Keyframes: [
                    { Seconds: 0, Image: { URL: 'https://example.com/seed.png' } },
                    { Seconds: 4.5, Image: { Data: Buffer.from('sapling-bytes'), MimeType: 'image/png' } },
                    { Seconds: 10, Image: { Data: 'dHJlZS1iYXNlNjQ=', MimeType: 'image/png' } },
                ],
            });
            expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
                mode: 'i2v',
                prompt: 'Seed grows into a tree',
                aspect_ratio: '16:9',
                duration: 10,
                resolution: 'fhd',
                generate_audio: false,
                keyframes: [
                    [0, 'https://example.com/seed.png'],
                    [4.5, Buffer.from('sapling-bytes').toString('base64')],
                    [10, 'dHJlZS1iYXNlNjQ='],
                ],
            });

            // Plain ReferenceImages list
            await generator.GenerateVideo({
                Prompt: 'Push forward through the trees',
                Mode: 'ImageToVideo',
                DurationSeconds: 6,
                AspectRatio: '1:1',
                Quality: 'draft',
                ReferenceImages: [
                    { URL: 'https://example.com/start.jpg' },
                    { Data: Buffer.from('end-image'), MimeType: 'image/jpeg' },
                ],
            });
            expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({
                mode: 'i2v',
                prompt: 'Push forward through the trees',
                aspect_ratio: '1:1',
                duration: 6,
                resolution: 'hd',
                draft: true,
                generate_audio: false,
                keyframes: ['https://example.com/start.jpg', Buffer.from('end-image').toString('base64')],
            });
        });

        it('builds exact v2v body for Continuation mode', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        id: 'vid-v2v',
                        polling_url: 'https://api.bfl.ai/v1/get_result?id=vid-v2v',
                    }),
            });

            await generator.GenerateVideo({
                Prompt: 'Continue following the herd across the river',
                Mode: 'Continuation',
                DurationSeconds: 8,
                AspectRatio: '16:9',
                Quality: 'standard',
                SourceVideo: { URL: 'https://example.com/prior.mp4' },
                WantAudio: true,
            });
            expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
                mode: 'v2v',
                prompt: 'Continue following the herd across the river',
                aspect_ratio: '16:9',
                duration: 8,
                resolution: 'fhd',
                generate_audio: true,
                start_video: 'https://example.com/prior.mp4',
            });
        });
    });

    describe('Pre-request validation refusals (zero fetch calls)', () => {
        it('refuses VideoToVideo, references on t2v, out-of-range durations, unsupported aspect 4:5, 11 keyframes, and empty i2v inputs with zero fetch calls', async () => {
            const invalidCases = [
                {
                    label: 'VideoToVideo mode',
                    params: {
                        Prompt: 'Edit clip',
                        Mode: 'VideoToVideo' as const,
                        DurationSeconds: 5,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                        SourceVideo: { URL: 'https://example.com/clip.mp4' },
                    },
                },
                {
                    label: 'ReferenceImages on TextToVideo',
                    params: {
                        Prompt: 'A fox',
                        Mode: 'TextToVideo' as const,
                        DurationSeconds: 5,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                        ReferenceImages: [{ URL: 'https://example.com/ref.png' }],
                    },
                },
                {
                    label: 'duration 4 (< 5)',
                    params: {
                        Prompt: 'Too short',
                        Mode: 'TextToVideo' as const,
                        DurationSeconds: 4,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                    },
                },
                {
                    label: 'duration 21 (> 20 on t2v)',
                    params: {
                        Prompt: 'Too long',
                        Mode: 'TextToVideo' as const,
                        DurationSeconds: 21,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                    },
                },
                {
                    label: 'duration 16 (> 15 on v2v Continuation)',
                    params: {
                        Prompt: 'Too long continuation',
                        Mode: 'Continuation' as const,
                        DurationSeconds: 16,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                        SourceVideo: { URL: 'https://example.com/clip.mp4' },
                    },
                },
                {
                    label: 'unsupported aspect ratio 4:5',
                    params: {
                        Prompt: 'Portrait',
                        Mode: 'TextToVideo' as const,
                        DurationSeconds: 5,
                        AspectRatio: '4:5',
                        Quality: 'standard' as const,
                    },
                },
                {
                    label: '11 keyframes on i2v',
                    params: {
                        Prompt: 'Too many keyframes',
                        Mode: 'ImageToVideo' as const,
                        DurationSeconds: 10,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                        Keyframes: Array.from({ length: 11 }, (_, i) => ({
                            Seconds: i * 0.5,
                            Image: { URL: `https://example.com/kf-${i}.png` },
                        })),
                    },
                },
                {
                    label: 'no keyframes or reference images on i2v',
                    params: {
                        Prompt: 'Missing i2v images',
                        Mode: 'ImageToVideo' as const,
                        DurationSeconds: 5,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                    },
                },
                {
                    label: 'keyframe timestamp > duration',
                    params: {
                        Prompt: 'Out-of-bounds keyframe',
                        Mode: 'ImageToVideo' as const,
                        DurationSeconds: 5,
                        AspectRatio: '16:9',
                        Quality: 'standard' as const,
                        Keyframes: [{ Seconds: 6, Image: { URL: 'https://example.com/kf.png' } }],
                    },
                },
            ];

            for (const testCase of invalidCases) {
                const job = await generator.GenerateVideo(testCase.params);
                expect(job.Status, testCase.label).toBe('Failed');
                expect(job.ErrorInfo?.errorType, testCase.label).toBe('InvalidRequest');
                expect(job.ErrorInfo?.severity, testCase.label).toBe('Fatal');
                expect(job.ErrorInfo?.canFailover, testCase.label).toBe(false);
            }

            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe('Submit HTTP errors and cancellation', () => {
        it('preserves httpStatusCode 429 on submit failure for failover and returns Cancelled on abort', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                text: () => Promise.resolve('Rate limit exceeded'),
            });

            const rateLimitedJob = await generator.GenerateVideo({
                Prompt: 'Rate limited scene',
                Mode: 'TextToVideo',
                DurationSeconds: 5,
                AspectRatio: '16:9',
                Quality: 'standard',
            });

            expect(rateLimitedJob.Status).toBe('Failed');
            expect(rateLimitedJob.ErrorInfo?.httpStatusCode).toBe(429);
            expect(rateLimitedJob.ErrorInfo?.errorType).toBe('RateLimit');
            expect(rateLimitedJob.ErrorInfo?.canFailover).toBe(true);

            // Abort during submit
            const controller = new AbortController();
            mockFetch.mockImplementationOnce(() => {
                controller.abort(new Error('User stopped render'));
                const abortErr = new Error('The operation was aborted');
                abortErr.name = 'AbortError';
                return Promise.reject(abortErr);
            });

            const cancelledJob = await generator.GenerateVideo({
                Prompt: 'Cancelled scene',
                Mode: 'TextToVideo',
                DurationSeconds: 5,
                AspectRatio: '16:9',
                Quality: 'standard',
                CancellationToken: controller.signal,
            });

            expect(cancelledJob.Status).toBe('Cancelled');
            expect(cancelledJob.ErrorInfo?.canFailover).toBe(false);
        });
    });

    describe('GetVideoGenerationStatus polling, URL guard, status map, and Ready download', () => {
        it('refuses non-.bfl.ai or http:// jobIds with zero fetch calls', async () => {
            const badHost = await generator.GetVideoGenerationStatus('https://evil.example.com/get_result?id=1');
            expect(badHost.Status).toBe('Failed');
            expect(badHost.ErrorInfo?.errorType).toBe('InvalidRequest');

            const badScheme = await generator.GetVideoGenerationStatus('http://api.bfl.ai/v1/get_result?id=1');
            expect(badScheme.Status).toBe('Failed');
            expect(badScheme.ErrorInfo?.errorType).toBe('InvalidRequest');

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('maps Pending, Reasoning, Generating, moderation reasons, No Card Generated, Error, and Task not found', async () => {
            const jobId = 'https://api.eu.bfl.ai/v1/get_result?id=job-status';

            const cases: Array<{
                bflStatus: string;
                details?: Record<string, unknown>;
                expectedStatus: string;
                expectedMessageContains?: string;
            }> = [
                { bflStatus: 'Pending', expectedStatus: 'Pending' },
                { bflStatus: 'Reasoning', expectedStatus: 'Running' },
                { bflStatus: 'Generating', expectedStatus: 'Running' },
                {
                    bflStatus: 'Content Moderated',
                    details: { 'Moderation Reasons': ['Safety', 'Violence'] },
                    expectedStatus: 'Failed',
                    expectedMessageContains: 'Content Moderated (Safety, Violence)',
                },
                {
                    bflStatus: 'No Card Generated',
                    expectedStatus: 'Failed',
                    expectedMessageContains: 'No Card Generated',
                },
                {
                    bflStatus: 'Error',
                    expectedStatus: 'Failed',
                    expectedMessageContains: 'Error',
                },
                {
                    bflStatus: 'Task not found',
                    expectedStatus: 'Failed',
                    expectedMessageContains: 'Task not found',
                },
            ];

            for (const c of cases) {
                mockFetch.mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ id: 'job-status', status: c.bflStatus, details: c.details }),
                });
                const res = await generator.GetVideoGenerationStatus(jobId);
                expect(res.Status).toBe(c.expectedStatus);
                if (c.expectedMessageContains) {
                    expect(res.ErrorMessage).toContain(c.expectedMessageContains);
                }
            }

            expect(mockFetch.mock.calls[0][0]).toBe(jobId);
            expect(mockFetch.mock.calls[0][1].headers['x-key']).toBe('test-bfl-key');
        });

        it('downloads Ready video without x-key, populates dimensions from table, reports settled/submit cost, and detects C2PA', async () => {
            const pollingUrl = 'https://api.us.bfl.ai/v1/get_result?id=vid-ready-1';
            const deliveryUrl = 'https://delivery-us1.bfl.ai/results/vid-ready-1.mp4';

            // 1. Submit job (16:9 standard -> fhd 1920x1088, 8s, submit cost 80 credits)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        id: 'vid-ready-1',
                        polling_url: pollingUrl,
                        cost: 80,
                    }),
            });

            const submitJob = await generator.GenerateVideo({
                Prompt: 'Cinematic mountain flight',
                Mode: 'TextToVideo',
                DurationSeconds: 8,
                AspectRatio: '16:9',
                Quality: 'standard',
            });
            expect(submitJob.JobID).toBe(pollingUrl);

            // 2. Poll returns Ready with settled cost 120 credits and C2PA mp4 fixture
            const mp4WithC2pa = makeMp4Fixture(true);
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            id: 'vid-ready-1',
                            status: 'Ready',
                            cost: 120,
                            result: { sample: deliveryUrl },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    headers: new Headers({ 'content-type': 'video/mp4' }),
                    arrayBuffer: () =>
                        Promise.resolve(
                            mp4WithC2pa.buffer.slice(
                                mp4WithC2pa.byteOffset,
                                mp4WithC2pa.byteOffset + mp4WithC2pa.byteLength,
                            ),
                        ),
                });

            const readyJob = await generator.GetVideoGenerationStatus(pollingUrl);
            expect(readyJob.Status).toBe('Succeeded');
            expect(Buffer.isBuffer(readyJob.Video?.Data)).toBe(true);
            expect(readyJob.Video?.URL).toBe(deliveryUrl);
            expect(readyJob.Video?.MimeType).toBe('video/mp4');
            expect(readyJob.Video?.DurationSeconds).toBe(8);
            expect(readyJob.Video?.Width).toBe(FLUX3_VIDEO_DIMENSIONS['16:9'].fhd.width);
            expect(readyJob.Video?.Height).toBe(FLUX3_VIDEO_DIMENSIONS['16:9'].fhd.height);
            expect(readyJob.Usage?.unitKind).toBe('Seconds');
            expect(readyJob.Usage?.inputUnits).toBe(0);
            expect(readyJob.Usage?.outputUnits).toBe(8);
            expect(readyJob.Usage?.cost).toBe(1.2);
            expect(readyJob.Usage?.costCurrency).toBe('USD');
            expect(readyJob.Provenance?.C2PA).toBe(true);

            // Verify delivery download did NOT include x-key header
            const [downloadUrl, downloadOpts] = mockFetch.mock.calls[2];
            expect(downloadUrl).toBe(deliveryUrl);
            expect(downloadOpts?.headers).toBeUndefined();

            // 3. Submit a second job where Ready omits settled cost -> falls back to submit cost, and C2PA is false
            const pollingUrl2 = 'https://api.us.bfl.ai/v1/get_result?id=vid-ready-2';
            const mp4WithoutC2pa = makeMp4Fixture(false);
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            id: 'vid-ready-2',
                            polling_url: pollingUrl2,
                            cost: 45,
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            id: 'vid-ready-2',
                            status: 'Ready',
                            result: { sample: deliveryUrl },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    headers: new Headers({ 'content-type': 'video/mp4' }),
                    arrayBuffer: () =>
                        Promise.resolve(
                            mp4WithoutC2pa.buffer.slice(
                                mp4WithoutC2pa.byteOffset,
                                mp4WithoutC2pa.byteOffset + mp4WithoutC2pa.byteLength,
                            ),
                        ),
                });

            await generator.GenerateVideo({
                Prompt: 'Silent draft clip',
                Mode: 'TextToVideo',
                DurationSeconds: 5,
                AspectRatio: '9:16',
                Quality: 'draft',
            });
            const readyJob2 = await generator.GetVideoGenerationStatus(pollingUrl2);
            expect(readyJob2.Status).toBe('Succeeded');
            expect(readyJob2.Video?.Width).toBe(704);
            expect(readyJob2.Video?.Height).toBe(1280);
            expect(readyJob2.Usage?.cost).toBe(0.45);
            expect(readyJob2.Provenance?.C2PA).toBe(false);
        });

        it('rejects on poll 503, rejects on Ready download 502 while preserving remembered size/cost for retry, and maps unknown status to Running', async () => {
            const pollingUrl = 'https://api.us.bfl.ai/v1/get_result?id=vid-retry-1';
            const deliveryUrl = 'https://delivery-us1.bfl.ai/results/vid-retry-1.mp4';
            const mp4WithC2pa = makeMp4Fixture(true);

            // 1. Submit job (16:9 standard -> fhd 1920x1088, 6s, submit cost 72 credits)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        id: 'vid-retry-1',
                        polling_url: pollingUrl,
                        cost: 72,
                    }),
            });

            await generator.GenerateVideo({
                Prompt: 'Retry resilience clip',
                Mode: 'TextToVideo',
                DurationSeconds: 6,
                AspectRatio: '16:9',
                Quality: 'standard',
            });

            // 2. Unknown status ('Upscaling') maps to Running
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () =>
                    Promise.resolve({
                        id: 'vid-retry-1',
                        status: 'Upscaling',
                    }),
            });
            const unknownStatusJob = await generator.GetVideoGenerationStatus(pollingUrl);
            expect(unknownStatusJob.Status).toBe('Running');

            // 3. Poll HTTP 503 rejects so the runner's transient error budget retries
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 503,
                text: () => Promise.resolve('Service Unavailable'),
            });
            await expect(generator.GetVideoGenerationStatus(pollingUrl)).rejects.toThrow(
                /BFL poll error \(503\)/,
            );

            // 4. Ready poll whose delivery download returns 502 rejects without deleting remembered size/cost
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            id: 'vid-retry-1',
                            status: 'Ready',
                            result: { sample: deliveryUrl },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 502,
                    text: () => Promise.resolve('Bad Gateway'),
                });
            await expect(generator.GetVideoGenerationStatus(pollingUrl)).rejects.toThrow(
                /Failed to download video from delivery URL \(502\)/,
            );

            // 5. Next poll returns Ready + 200 download -> Succeeded with remembered table size and submit cost
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            id: 'vid-retry-1',
                            status: 'Ready',
                            result: { sample: deliveryUrl },
                        }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    headers: new Headers({ 'content-type': 'video/mp4' }),
                    arrayBuffer: () =>
                        Promise.resolve(
                            mp4WithC2pa.buffer.slice(
                                mp4WithC2pa.byteOffset,
                                mp4WithC2pa.byteOffset + mp4WithC2pa.byteLength,
                            ),
                        ),
                });

            const succeededJob = await generator.GetVideoGenerationStatus(pollingUrl);
            expect(succeededJob.Status).toBe('Succeeded');
            expect(succeededJob.Video?.Width).toBe(1920);
            expect(succeededJob.Video?.Height).toBe(1088);
            expect(succeededJob.Video?.DurationSeconds).toBe(6);
            expect(succeededJob.Usage?.cost).toBe(0.72);
            expect(succeededJob.Usage?.costCurrency).toBe('USD');
        });
    });
});

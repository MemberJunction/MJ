import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
    FakeRenderDriver,
    VideoRenderDriverBase,
    VideoRenderError,
} from '../index.js';
import {
    CreateMinimalBundle,
    CreateMinimalRenderRequest,
    MINIMAL_BUNDLE_HEIGHT,
    MINIMAL_BUNDLE_WIDTH,
} from './fixtures/minimal-bundle.js';
import { DescribeRenderDriverContract } from './render-driver-contract.js';

DescribeRenderDriverContract('FakeRenderDriver', () => new FakeRenderDriver());

describe('FakeRenderDriver additional behavior', () => {
    it('is NOT registered in MJGlobal.ClassFactory', () => {
        const lookup = MJGlobal.Instance.ClassFactory.TryCreateInstance<VideoRenderDriverBase>(
            VideoRenderDriverBase,
            'FakeRenderDriver',
        );
        expect(lookup.Resolved).toBe(false);
    });

    it('surfaces scripted CheckIssues in Check and blocks Render when an Error issue is scripted', async () => {
        const driver = new FakeRenderDriver({
            CheckIssues: [
                {
                    Code: 'MJ_SAFE_AREA',
                    Category: 'SafeArea',
                    Severity: 'Error',
                    Message: 'Scripted safe-area violation for test.',
                    Selector: '#headline',
                },
            ],
        });

        const checkRes = await driver.Check({
            Bundle: CreateMinimalBundle(),
            Width: MINIMAL_BUNDLE_WIDTH,
            Height: MINIMAL_BUNDLE_HEIGHT,
        });
        expect(checkRes.Passed).toBe(false);
        expect(checkRes.BlockRender).toBe(true);
        expect(checkRes.Issues.map((i) => i.Code)).toContain('MJ_SAFE_AREA');

        await expect(driver.Render(CreateMinimalRenderRequest())).rejects.toMatchObject({
            name: 'VideoRenderError',
            Code: 'LintBlocked',
        } satisfies Partial<VideoRenderError>);
    });

    it('returns scripted Health when provided', async () => {
        const driver = new FakeRenderDriver({
            Health: {
                Healthy: false,
                NodeVersion: 'v22.0.0',
                HyperFramesVersion: '0.8.134',
                Errors: ['Scripted health failure'],
            },
        });

        const health = await driver.Health();
        expect(health.Healthy).toBe(false);
        expect(health.Errors).toEqual(['Scripted health failure']);
    });
});

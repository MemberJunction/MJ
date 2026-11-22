import { afterEach, describe, expect, it } from 'vitest';
import {
    CODE_FALLBACK_LIMITS,
    IsValidContainerImage,
    IsValidContainerRuntime,
    LimitsConfigResolver,
    NormalizeLimitsInput,
    ValidateLimitsConfig,
} from '../generic/limitsConfig';

describe('Isolation ContainerRuntime & ContainerImage Security Validation (CR-3)', () => {
    afterEach(() => {
        LimitsConfigResolver.Instance.ClearMjConfigLimits();
    });

    it('allowlists ContainerRuntime to docker or podman and validates OCI ContainerImage syntax', () => {
        expect(IsValidContainerRuntime('docker')).toBe(true);
        expect(IsValidContainerRuntime('podman')).toBe(true);
        expect(IsValidContainerRuntime('/bin/sh')).toBe(false);
        expect(IsValidContainerRuntime('bash')).toBe(false);
        expect(IsValidContainerRuntime('')).toBe(false);

        expect(IsValidContainerImage('node:20-alpine')).toBe(true);
        expect(IsValidContainerImage('ghcr.io/memberjunction/runner:v1.2.3@sha256:abcdef0123456789')).toBe(true);
        expect(IsValidContainerImage('--privileged')).toBe(false);
        expect(IsValidContainerImage('-v=/:/host')).toBe(false);
        expect(IsValidContainerImage('node:20 ..')).toBe(false);
        expect(IsValidContainerImage('node:20;rm -rf /')).toBe(false);
        expect(IsValidContainerImage('node:20/../evil')).toBe(false);
        expect(IsValidContainerImage('')).toBe(false);
    });

    it('rejects untrusted ContainerRuntime and unsafe ContainerImage in NormalizeLimitsInput and ValidateLimitsConfig', () => {
        const normalized = NormalizeLimitsInput({
            Isolation: {
                ContainerRuntime: '/bin/sh',
                ContainerImage: '--privileged',
                WorkerTimeoutMs: 15_000,
            },
        });
        expect(normalized.Isolation?.ContainerRuntime).toBeUndefined();
        expect(normalized.Isolation?.ContainerImage).toBeUndefined();
        expect(normalized.Isolation?.WorkerTimeoutMs).toBe(15_000);

        const badRuntimeValidation = ValidateLimitsConfig({
            ...CODE_FALLBACK_LIMITS,
            Isolation: {
                ...CODE_FALLBACK_LIMITS.Isolation,
                ContainerRuntime: '/bin/sh',
            },
        });
        expect(badRuntimeValidation.Valid).toBe(false);
        expect(badRuntimeValidation.Issues.some((i) => i.Key === 'Isolation.ContainerRuntime')).toBe(true);

        const badImageValidation = ValidateLimitsConfig({
            ...CODE_FALLBACK_LIMITS,
            Isolation: {
                ...CODE_FALLBACK_LIMITS.Isolation,
                ContainerImage: '-v=/:/host',
            },
        });
        expect(badImageValidation.Valid).toBe(false);
        expect(badImageValidation.Issues.some((i) => i.Key === 'Isolation.ContainerImage')).toBe(true);
    });

    it('blocks Tier-3/4/5 limitsOverride payloads from overriding host-governed ContainerRuntime and ContainerImage', () => {
        const resolved = LimitsConfigResolver.Resolve({
            MjConfig: {
                Isolation: {
                    ContainerRuntime: 'podman',
                    ContainerImage: 'node:22-alpine',
                },
            },
            AgentOrWorkflowMetadata: {
                Isolation: {
                    ContainerRuntime: 'docker',
                    ContainerImage: 'custom-tier3:latest',
                    WorkerTimeoutMs: 45_000,
                },
            },
            UserAgentPolicy: {
                Isolation: {
                    ContainerRuntime: 'docker',
                    ContainerImage: 'custom-tier4:latest',
                },
            },
            RunOverride: {
                Isolation: {
                    ContainerRuntime: '/bin/sh',
                    ContainerImage: '--privileged',
                    WorkerTimeoutMs: 30_000,
                },
            },
        });

        expect(resolved.Limits.Isolation.ContainerRuntime).toBe('podman');
        expect(resolved.Provenance['Isolation.ContainerRuntime'].SourceTier).toBe('MjConfig');
        expect(resolved.Limits.Isolation.ContainerImage).toBe('node:22-alpine');
        expect(resolved.Provenance['Isolation.ContainerImage'].SourceTier).toBe('MjConfig');
        expect(resolved.Limits.Isolation.WorkerTimeoutMs).toBe(30_000);
    });
});

import { describe, expect, it } from 'vitest';
import { BaseImageGenerator, BaseVideoGenerator, GetAIAPIKeyGlobal } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import {
    RegisterFakeAPIKeys,
    RegisterFakeImageGenerator,
    RegisterFakeVideoGenerator,
    SCRIPTED_API_KEY,
} from '../checks/video-studio-fakes';

describe('video-studio-fakes', () => {
    it('RegisterFakeAPIKeys returns SCRIPTED_API_KEY while active and restores base AIAPIKeys on restore() even when no custom AIAPIKeys was registered before', () => {
        const beforeKey = GetAIAPIKeyGlobal('OpenAILLM');
        expect(beforeKey).not.toBe(SCRIPTED_API_KEY);

        const restore = RegisterFakeAPIKeys(['OpenAILLM']);
        try {
            expect(GetAIAPIKeyGlobal('OpenAILLM')).toBe(SCRIPTED_API_KEY);
            expect(GetAIAPIKeyGlobal('GoogleVeoVideoGenerator')).toBeUndefined();
        } finally {
            restore();
        }

        const afterKey = GetAIAPIKeyGlobal('OpenAILLM');
        expect(afterKey).not.toBe(SCRIPTED_API_KEY);
        expect(afterKey).toBe(beforeKey);
    });

    it('RegisterFakeImageGenerator registers a refusing image generator and increments SubmitCount on GenerateImage', async () => {
        const fake = RegisterFakeImageGenerator();
        try {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseImageGenerator>(
                BaseImageGenerator,
                'OpenAIImageGenerator',
                SCRIPTED_API_KEY,
            );
            expect(instance).toBe(fake.Driver);
            expect(fake.Driver.SubmitCount).toBe(0);
            await expect(instance!.GenerateImage({ prompt: 'test' })).rejects.toThrow(
                'The scripted image driver is not armed',
            );
            expect(fake.Driver.SubmitCount).toBe(1);
        } finally {
            fake.restore();
        }
    });

    it('RegisterFakeVideoGenerator increments SubmitCount and rejects when GenerateVideo is called while unarmed', async () => {
        const fake = RegisterFakeVideoGenerator();
        try {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseVideoGenerator>(
                BaseVideoGenerator,
                'GoogleVeoVideoGenerator',
                SCRIPTED_API_KEY,
            );
            expect(instance).toBe(fake.Driver);
            expect(fake.Driver.SubmitCount).toBe(0);
            await expect(
                instance!.GenerateVideo({ Prompt: 'test clip', DurationSeconds: 4 }),
            ).rejects.toThrow('The scripted video driver is not armed');
            expect(fake.Driver.SubmitCount).toBe(1);
        } finally {
            fake.restore();
        }
    });
});

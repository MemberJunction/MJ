import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { AITextToSpeechRunResult } from '@memberjunction/ai-prompts';
import { MJRoomSpeechSynthesizer, type TextToSpeechRunnerLike } from '../room-audio/room-speech-synthesizer';
import { BuildWav } from './room-audio-test-helpers';

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  return { ...actual, LogError: vi.fn() };
});

const user = { ID: 'user-1', Name: 'Alice', Email: 'alice@example.com' } as unknown as UserInfo;

function runner(result: Partial<AITextToSpeechRunResult>): TextToSpeechRunnerLike {
  return { RunTextToSpeech: vi.fn(async () => ({ Success: true, ExecutionTimeMS: 1, ...result }) as AITextToSpeechRunResult) };
}

describe('MJRoomSpeechSynthesizer', () => {
  it('runs text-to-speech with the configured voice and model as the user, and decodes the audio', async () => {
    const wav = Buffer.from(BuildWav({ SampleRate: 24000, BitsPerSample: 16, Channels: [[0.5, 0.5]] }));
    const tts = runner({ SpeechResult: { success: true, content: '', data: wav } });
    const synthesizer = new MJRoomSpeechSynthesizer({ Voice: 'alloy', ModelID: 'model-1' }, tts);
    const audio = await synthesizer.Synthesize('Please hold.', user);
    expect(tts.RunTextToSpeech).toHaveBeenCalledWith(expect.objectContaining({ text: 'Please hold.', voice: 'alloy', ModelID: 'model-1', ContextUser: user }));
    expect(audio?.SampleRate).toBe(24000);
    expect(audio?.Pcm.length).toBe(2);
  });

  it('returns null when the run fails or returns no audio', async () => {
    expect(await new MJRoomSpeechSynthesizer({ Voice: 'v' }, runner({ Success: false, ErrorMessage: 'no model' })).Synthesize('x', user)).toBeNull();
    expect(await new MJRoomSpeechSynthesizer({ Voice: 'v' }, runner({})).Synthesize('x', user)).toBeNull();
  });

  it('returns null when the audio cannot be decoded', async () => {
    const tts = runner({ SpeechResult: { success: true, content: '', data: Buffer.from([1, 2, 3, 4]) } });
    expect(await new MJRoomSpeechSynthesizer({ Voice: 'v' }, tts).Synthesize('x', user)).toBeNull();
  });

  it('needs a voice', () => {
    expect(() => new MJRoomSpeechSynthesizer({ Voice: ' ' }, runner({}))).toThrow(/Voice/);
  });
});

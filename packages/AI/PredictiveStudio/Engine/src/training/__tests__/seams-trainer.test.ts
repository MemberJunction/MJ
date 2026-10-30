import { describe, it, expect } from 'vitest';
import type { TrainerFailed, TrainerRequest, TrainerResult } from '@memberjunction/predictive-studio-core';
import { MLSidecar, SidecarError, TrainerResultMalformedError } from '@memberjunction/predictive-studio-sidecar';
import { TrainerRequestFixture } from './fixtures/trainer-request.fixture';
import { MJSidecarTrainer } from '../seams';

/** The managed child dying mid-request: the attempt fails and the sidecar is no longer running. */
class ChildDied extends Error {}

/**
 * An MLSidecar whose RunTrainer replays queued outcomes, with a managed-mode lifecycle: Start brings a stopped sidecar
 * up (and counts), a {@link ChildDied} outcome takes it down, and RunTrainer on a stopped sidecar throws as the real
 * client does. No process, no HTTP.
 */
class StubSidecar extends MLSidecar {
  public Calls = 0;
  public Starts = 0;
  public Spawns = 0;
  private alive = false;
  constructor(private readonly outcomes: ReadonlyArray<TrainerResult | Error>, private readonly failSpawns = 0) {
    super({ url: 'http://127.0.0.1:9' });
  }
  public override async Start(): Promise<void> {
    this.Starts += 1;
    if (this.alive) return;
    this.Spawns += 1;
    if (this.Spawns <= this.failSpawns) throw new Error('Python process exited with code 1 before becoming ready');
    this.alive = true;
  }
  public override async RunTrainer(_req: TrainerRequest): Promise<TrainerResult> {
    if (!this.alive) throw new Error('MLSidecar is not running. Call Start() first.');
    const next = this.outcomes[this.Calls];
    this.Calls += 1;
    if (next === undefined) throw new Error('no outcome queued');
    if (next instanceof ChildDied) this.alive = false;
    if (next instanceof Error) throw next;
    return next;
  }
}

const REQ = TrainerRequestFixture.Build(60, 2);
const RESULT: TrainerFailed = {
  status: 'failed', trainingRunId: TrainerRequestFixture.RunID, stage: 'inner-cv', message: 'candidate x', computeSeconds: 1.5,
};

describe('MJSidecarTrainer.RunTrainer (bounded retries, then failed at stage timeout)', () => {
  it('retries a transport failure and returns the next answer', async () => {
    const s = new StubSidecar([new Error('socket hang up'), RESULT]);
    expect(await new MJSidecarTrainer(s).RunTrainer(REQ)).toEqual(RESULT);
    expect(s.Calls).toBe(2);
  });

  it('retries a 5xx answer from the sidecar', async () => {
    const s = new StubSidecar([new SidecarError(503, 'busy'), RESULT]);
    expect(await new MJSidecarTrainer(s).RunTrainer(REQ)).toEqual(RESULT);
    expect(s.Calls).toBe(2);
  });

  it('respawns a managed sidecar that died during an attempt, and the retry succeeds', async () => {
    const s = new StubSidecar([new ChildDied('socket hang up'), RESULT]);
    expect(await new MJSidecarTrainer(s).RunTrainer(REQ)).toEqual(RESULT);
    expect(s.Spawns).toBe(2);
    expect(s.Calls).toBe(2);
  });

  it('counts a failed respawn as that attempt failing and retries it', async () => {
    const s = new StubSidecar([RESULT], 1);
    expect(await new MJSidecarTrainer(s).RunTrainer(REQ)).toEqual(RESULT);
    expect(s.Spawns).toBe(2);
    expect(s.Calls).toBe(1);
  });

  it('ends failed at stage timeout after maxRetries + 1 attempts, naming the last error and the wall seconds spent', async () => {
    const s = new StubSidecar([new Error('timed out'), new SidecarError(500, 'boom'), new Error('timed out again')]);
    const ticks = [1_000, 3_500];   // the seam's clock (milliseconds) when the first attempt starts and after the last ends
    const r = await new MJSidecarTrainer(s, () => ticks.shift() ?? 3_500).RunTrainer(REQ);
    expect(s.Calls).toBe(3);
    expect(r).toEqual({
      status: 'failed',
      trainingRunId: TrainerRequestFixture.RunID,
      stage: 'timeout',
      message: 'sidecar gave no result after 3 attempt(s): timed out again',
      computeSeconds: 2.5,
    });
  });

  it('makes exactly one attempt when maxRetries is 0', async () => {
    const s = new StubSidecar([new Error('socket hang up'), RESULT]);
    const r = await new MJSidecarTrainer(s).RunTrainer(TrainerRequestFixture.Build(60, 0));
    expect(s.Calls).toBe(1);
    expect(r.status).toBe('failed');
  });

  it('does not retry a refused request (4xx) and rethrows it', async () => {
    const s = new StubSidecar([new SidecarError(400, '{"detail":"ranking across families"}'), RESULT]);
    await expect(new MJSidecarTrainer(s).RunTrainer(REQ)).rejects.toMatchObject({ name: 'SidecarError', Status: 400 });
    expect(s.Calls).toBe(1);
  });

  it('does not retry a malformed answer and rethrows it', async () => {
    const s = new StubSidecar([new TrainerResultMalformedError(['codeVersion: Required']), RESULT]);
    await expect(new MJSidecarTrainer(s).RunTrainer(REQ)).rejects.toBeInstanceOf(TrainerResultMalformedError);
    expect(s.Calls).toBe(1);
  });

  it('starts the sidecar before every attempt, spawning it only once while it stays up', async () => {
    const s = new StubSidecar([RESULT, RESULT]);
    const trainer = new MJSidecarTrainer(s);
    await trainer.RunTrainer(REQ);
    await trainer.RunTrainer(REQ);
    expect(s.Starts).toBe(2);
    expect(s.Spawns).toBe(1);
  });
});

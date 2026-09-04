import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from './message-list.component';

/**
 * Spec for how the message list publishes pending artifacts.
 *
 * Two behaviours here have no other coverage and both failed review at least once:
 *
 * 1. Only artifacts that genuinely need a round trip are announced. `LazyArtifactInfo.isLoaded`
 *    answers that; publishing every artifact and filtering downstream instead re-announced loaded
 *    ones on every refresh, which flashed a placeholder above a rendered card.
 * 2. A stale in-flight load must not clobber a newer one, INCLUDING when the newer refresh cleared
 *    the artifacts entirely — the generation counter has to advance on that path too.
 *
 * Constructed off the prototype: the method under test only touches `artifactMap`, the generation
 * map and the two change detectors, and a real MessageListComponent needs the whole graph.
 * (Co-located as .dom.test.ts because importing the component pulls the Angular graph
 * the node project can't load.)
 */
describe('MessageListComponent — publishing pending artifacts', () => {
  type Instance = {
    artifacts: { artifact: { ID: string }; version: { ID: string } }[];
    artifact?: { ID: string };
    artifactVersion?: { ID: string };
    pendingArtifacts: { artifactId: string; artifactName: string; visibility: string }[];
  };

  const info = (id: string, isLoaded: boolean) => {
    const artifact = { ID: id };
    const version = { ID: `${id}-v1` };
    return {
      artifactId: id,
      artifactVersionId: version.ID,
      artifactName: `Artifact ${id}`,
      visibility: 'Always',
      versionNumber: 1,
      isLoaded,
      getArtifact: () => Promise.resolve(artifact),
      getVersion: () => Promise.resolve(version),
    };
  };

  /** Like `info`, but the artifact load holds until the returned `release` is called. */
  const deferredInfo = (id: string) => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const base = info(id, false);
    return {
      info: { ...base, getArtifact: () => gate.then(() => ({ ID: id })) },
      release,
    };
  };

  const listWith = (messageId: string, infos: unknown[]) => {
    const c = Object.create(MessageListComponent.prototype) as MessageListComponent;
    Object.assign(c as unknown as Record<string, unknown>, {
      artifactMap: new Map([[messageId, infos]]),
      _artifactLoadGeneration: new WeakMap<object, number>(),
      cdRef: { detectChanges: vi.fn() },
    });
    return c;
  };

  const instance = (): Instance => ({ artifacts: [], pendingArtifacts: [] });
  const childCd = () => ({ detectChanges: vi.fn(), destroyed: false });

  const apply = (c: MessageListComponent, inst: Instance, id: string, cd: unknown) =>
    (c as unknown as {
      applyArtifactsToInstance(i: Instance, m: string, r: unknown): void;
    }).applyArtifactsToInstance(inst, id, cd);

  it('announces an artifact that still needs loading', () => {
    const c = listWith('m1', [info('a', false)]);
    const inst = instance();
    apply(c, inst, 'm1', childCd());
    expect(inst.pendingArtifacts.map(p => p.artifactId)).toEqual(['a']);
  });

  // The regression that flashed a placeholder above a rendered card once per second.
  it('does NOT announce an artifact whose rows are already in hand', () => {
    const c = listWith('m1', [info('a', true)]);
    const inst = instance();
    apply(c, inst, 'm1', childCd());
    expect(inst.pendingArtifacts).toEqual([]);
  });

  it('announces only the subset still loading', () => {
    const c = listWith('m1', [info('loaded', true), info('inflight', false)]);
    const inst = instance();
    apply(c, inst, 'm1', childCd());
    expect(inst.pendingArtifacts.map(p => p.artifactId)).toEqual(['inflight']);
  });

  it('carries the name and visibility so the placeholder can label itself', () => {
    const c = listWith('m1', [info('a', false)]);
    const inst = instance();
    apply(c, inst, 'm1', childCd());
    expect(inst.pendingArtifacts[0]).toMatchObject({ artifactName: 'Artifact a', visibility: 'Always' });
  });

  it('advances the generation on the clear path, so a stale load cannot repaint a removed artifact', () => {
    const c = listWith('m1', [info('a', false)]);
    const inst = instance();
    apply(c, inst, 'm1', childCd());
    const gen = (c as unknown as { _artifactLoadGeneration: WeakMap<object, number> })._artifactLoadGeneration;
    const afterPublish = gen.get(inst);

    // The artifact disappears from the map, e.g. it was deleted.
    (c as unknown as { artifactMap: Map<string, unknown[]> }).artifactMap.set('m1', []);
    apply(c, inst, 'm1', childCd());

    expect(gen.get(inst)).toBeGreaterThan(afterPublish!);
    expect(inst.pendingArtifacts).toEqual([]);
    expect(inst.artifacts).toEqual([]);
  });

  // The guard the generation counter exists for. Refresh 1 starts loading artifact A. Before it
  // settles, A is removed from the map and refresh 2 clears the message. When refresh 1's stale
  // load finally lands, it must NOT repaint A — that is the whole point of the counter, and a
  // version that only bumped it without comparing it on settle passed every other case here.
  it('drops a stale load that settles after a newer refresh cleared the message', async () => {
    const stale = deferredInfo('a');
    const c = listWith('m1', [stale.info]);
    const inst = instance();
    const cd = childCd();

    apply(c, inst, 'm1', cd);
    expect(inst.pendingArtifacts.map(p => p.artifactId)).toEqual(['a']);

    (c as unknown as { artifactMap: Map<string, unknown[]> }).artifactMap.set('m1', []);
    apply(c, inst, 'm1', cd);
    expect(inst.artifacts).toEqual([]);

    stale.release();
    await new Promise(r => setTimeout(r, 0));

    expect(inst.artifacts).toEqual([]);
  });

  it('clears the legacy single inputs when the artifacts go away', () => {
    const c = listWith('m1', []);
    const inst = instance();
    inst.artifact = { ID: 'stale' };
    inst.artifactVersion = { ID: 'stale-v1' };
    apply(c, inst, 'm1', childCd());
    expect(inst.artifact).toBeUndefined();
    expect(inst.artifactVersion).toBeUndefined();
  });

  it('does not touch a destroyed child view', () => {
    const c = listWith('m1', [info('a', false)]);
    const cd = { detectChanges: vi.fn(), destroyed: true };
    apply(c, instance(), 'm1', cd);
    expect(cd.detectChanges).not.toHaveBeenCalled();
  });
});

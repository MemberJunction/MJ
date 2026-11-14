/**
 * Gate G3.2 "R1 → S7.1" (owner PR 4, phase 3): a Published R1 model whose stored artifact bytes are replaced with
 * another Published R1 model's is refused at load with ARTIFACT_HASH_MISMATCH, and the refusal names both the
 * registered SHA-256 and the hash of the bytes found, 1 of 1 (FM-14). The two models hold out different row fractions,
 * so their artifacts differ; equal hashes would make the swap undetectable by construction, so they are an error.
 */
import { IntegrationCheckRegistry, type NamedCheck } from '@memberjunction/testing-integration';
import { ArtifactObjects, UnitFixtures } from '@memberjunction/predictive-studio-truth-suite';
import { PsGate } from './ps-gates/ps-gate-fixture';
import { PsGateRegistry } from './ps-gates/ps-gate-registry';

export const PsGateR1S71Checks: NamedCheck[] = [
  {
    Id: 'ps-gate-r1-s7-1.G3.2', Name: 'G3.2 R1 → S7.1: a Published model whose artifact bytes are swapped is refused by SHA-256 mismatch, naming both hashes', RequiresMutation: true,
    Fn: async (ctx) => {
      const h = await PsGate.Harness(ctx);
      const r1 = await h.EnsureLoaded({ Kind: 'scenario', ID: 'R1', Seed: UnitFixtures.ScenarioBaseSeed('R1') });
      const first = await PsGateRegistry.PublishedR1Model(h, 'G3.2 first', 0.25);
      const second = await PsGateRegistry.PublishedR1Model(h, 'G3.2 second', 0.3);
      const [firstRow, secondRow] = await Promise.all([h.ReadModel(first), h.ReadModel(second)]);
      const registered = firstRow.ArtifactSha256;
      const swappedIn = secondRow.ArtifactSha256;
      if (!registered || !swappedIn) throw new Error(`G3.2: a fixture model has no registered SHA-256 (first ${registered}, second ${swappedIn})`);
      if (registered.toLowerCase() === swappedIn.toLowerCase()) throw new Error(`G3.2: both fixture models registered the same SHA-256 ${registered}, so a swap cannot be detected`);
      await ArtifactObjects.CopyStoredObject(h, second, first);
      const swapped = await h.Score(first, PsGateRegistry.ScoreAll(r1));
      const message = (swapped.ErrorMessage || '').toLowerCase();
      const namesBoth = message.includes(registered.toLowerCase()) && message.includes(swappedIn.toLowerCase());
      const refused = !swapped.Ok && swapped.RefusalCode === 'ARTIFACT_HASH_MISMATCH' && namesBoth ? 1 : 0;
      PsGate.Assert({
        Passed: refused === 1,
        Measured: { refused, refusalCode: swapped.RefusalCode, namesBothHashes: namesBoth, scored: swapped.Scored, registered, swappedIn },
        Detail: `refused by SHA-256 mismatch, ${refused} of 1: the swapped artifact ${swapped.Ok ? `scored ${swapped.Scored} of ${r1.RowCount} rows` : `was refused ${swapped.RefusalCode ?? 'without a refusal code'}`}`
          + `${swapped.Ok ? '' : `, ${namesBoth ? 'naming' : 'not naming'} both hashes`}`,
      });
    },
  },
];

for (const c of PsGateR1S71Checks) IntegrationCheckRegistry.Instance.Register(c);
IntegrationCheckRegistry.Instance.RegisterLifecycle('ps-gate-r1-s7-1', PsGate.Lifecycle);

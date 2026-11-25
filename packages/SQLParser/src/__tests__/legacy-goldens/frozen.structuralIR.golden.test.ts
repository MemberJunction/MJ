/**
 * FROZEN legacy goldens: the structural parser IR.
 *
 * Methods: ParseToIR, RenderIR (of ParseToIR).
 *
 * Exported with no runtime caller (COMPAT-MAP §1.3). The `QueryIR` / `CTENode` / `Fragment` shapes
 * are public types; whether they become a façade over the new parser or stay as they are, their
 * output must stay byte-identical until 7.0.
 *
 * Stored as SHA-256 hashes per entry (`<set>/FrozenStructuralIR.sha256.json`); a mismatch prints
 * the entry Id and its full actual output.
 */
import { describe, it } from 'vitest';
import { ParseToIR, RenderIR } from '../../structuralParser.js';
import { DialectFor, ExpectHashGolden, GoldenSets } from './harness.js';
import type { GoldenMethod } from './harness.js';

const METHODS: GoldenMethod[] = [
    { Name: 'ParseToIR', Run: e => ParseToIR(e.SQL, DialectFor(e)) },
    { Name: 'RenderIR', Run: e => RenderIR(ParseToIR(e.SQL, DialectFor(e)), DialectFor(e)) },
];

describe.each(GoldenSets())('frozen structural-IR goldens ($Name corpus)', set => {
    it('ParseToIR and RenderIR are unchanged', async () => {
        await ExpectHashGolden(set, 'FrozenStructuralIR', METHODS);
    });
});

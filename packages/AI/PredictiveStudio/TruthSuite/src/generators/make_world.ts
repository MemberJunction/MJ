// make_world.ts — usage: node --import tsx src/generators/make_world.ts fixtures/worlds/W1-signal.json <outDir> [--seeds 100,101,…] [--emit-metadata]
//
// Generates a Loom planted-truth world (binary renewal panel) using the ENGINE as a library
// (recurringDecision + emitMetadata), never the CLI: the CLI has no churn, no censoring, no parent-field overwrite
// and no time-scoped aggregates.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GenLib, type JoiningWorldPerson, type WorldRunArgs } from './gen_lib';
import { Loom, type LoomIdentityService } from './loom';
import type { WorldDomain, WorldSpec } from './types';

/** One row of a world's `rows.csv` (the `MembershipYear` entity). */
type MembershipYearRow = {
  ID: string; PersonID: string; Year: number; StartDate: string; Plan: 'Premium' | 'Basic';
  EventsAttended: number; IncomeK: number; AutoRenew: number; Region: string;
  PostalCode: string | null; MemberNumber: string | null;
  Noise1: number; Noise2: number; Noise3: number; Noise4: number; Noise5: number;
  Renewed: number | null; Status: 'Pending' | 'Renewed' | 'Lapsed' | null;
  PersonStatusNow: JoiningWorldPerson['Status'] | null; WorldID: string; Seed: number;
};

/** One row of a world's `truth.csv`: the planted renewal probability and the draw. */
type WorldTruthRow = { MembershipYearID: string; Cycle: number; TrueP: number; Drawn: number; Censored: number };

/** A person-cycle's membership-year features, drawn from its own stream. */
interface MembershipFeatures { Events: number; Premium: boolean; Noise: number[] }

/** The calibrated cohort context of one cycle. */
interface CycleContext { b0: number }

/** The oracle's scores: the planted probabilities scored against the drawn outcomes. */
interface WorldOracle { auc: number | null; brier: number; logLoss: number }

/** One generated seed of a world. */
interface WorldSeed {
  People: JoiningWorldPerson[];
  Rows: MembershipYearRow[];
  Truth: WorldTruthRow[];
  InterceptByCycle: Partial<Record<number, number>>;
}

/** The binary renewal world generator (W1..W8). */
export class WorldGenerator {
  private static readonly EV_VALUES = [0, 1, 2, 3, 4, 5, 6, 8];
  private static readonly EV_WEIGHTS = [30, 20, 15, 12, 9, 6, 5, 3];

  /** Generate every requested seed of the world named on the command line. */
  public static async Main(argv: readonly string[]): Promise<void> {
    const args = GenLib.ParseWorldArgs<WorldSpec>(argv);
    for (const seed of args.Seeds) await WorldGenerator.writeSeed(args, seed);
  }

  /** Generate one seed into `<outDir>/seed-<seed>`: rows, truth, people and the manifest. */
  private static async writeSeed(args: WorldRunArgs<WorldSpec>, seed: number): Promise<void> {
    const { Spec: spec, Domain: domain } = args;
    const dir = path.join(args.OutDir, `seed-${seed}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const { People: people, Rows: rows, Truth: truth, InterceptByCycle: interceptByCycle } = WorldGenerator.buildSeed(spec, domain, seed);
    if (args.EmitMetadata) {
      await Loom.Engine.emitMetadata({ outputDir: path.join(dir, 'metadata'), domain, data: { Person: GenLib.PersonRecords(people), MembershipYear: rows } });
    }
    GenLib.WriteCsv(path.join(dir, 'rows.csv'), rows, { TrailingNewline: false });
    GenLib.WriteCsv(path.join(dir, 'truth.csv'), truth, { TrailingNewline: false });
    GenLib.WriteCsv(path.join(dir, 'people.csv'), GenLib.PeopleCsvRows(people, spec.id, seed), { TrailingNewline: false });
    const observed = rows.filter((r) => r.Renewed !== null);
    const oracle = WorldGenerator.oracle(truth);
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
      ...spec, seed, oracle, rowCount: rows.length,
      positiveRate: observed.reduce((s, r) => s + (r.Renewed || 0), 0) / observed.length,
      interceptByCycle, netPostEraShift: WorldGenerator.netPostEraShift(spec, interceptByCycle),
    }, null, 2));
    console.log(spec.id, seed, rows.length, 'rows', JSON.stringify(oracle));
  }

  /** The beta of feature `name` in `cycle`: the era override from `era.fromCycle` on, else the spec's beta. */
  private static betaFor(spec: WorldSpec, name: string, cycle: number): number {
    const override = spec.era.fromCycle !== null && cycle >= spec.era.fromCycle ? spec.era.betaOverrides[name] : undefined;
    return override !== undefined ? override : (spec.betas[name] || 0);
  }

  /** The era's intercept shift in `cycle` (0 before the era). */
  private static shift(spec: WorldSpec, cycle: number): number {
    return spec.era.fromCycle !== null && cycle >= spec.era.fromCycle ? spec.era.deltaIntercept : 0;
  }

  /** The person-cycle's features, deterministic per (person, cycle), so calling it twice draws the same values. */
  private static featuresOf(seed: number, person: JoiningWorldPerson, cycle: number): MembershipFeatures {
    const r = GenLib.CreateRng(seed, `my:${person.ID}:${cycle}`);
    const events = GenLib.PickWeighted(r, WorldGenerator.EV_VALUES, WorldGenerator.EV_WEIGHTS);
    const premium = r.bernoulli(0.3);
    const noise = [0, 1, 2, 3, 4].map(() => r.int(0, 9));
    return { Events: events, Premium: premium, Noise: noise };
  }

  /** The person-cycle's linear score (without the cycle intercept). */
  private static scoreOf(spec: WorldSpec, seed: number, person: JoiningWorldPerson, cycle: number): number {
    const f = WorldGenerator.featuresOf(seed, person, cycle);
    return WorldGenerator.betaFor(spec, 'EventsAttended', cycle) * f.Events + WorldGenerator.betaFor(spec, 'Premium', cycle) * (f.Premium ? 1 : 0)
      + WorldGenerator.betaFor(spec, 'AutoRenew', cycle) * (person.AutoRenew ? 1 : 0) + WorldGenerator.betaFor(spec, 'IncomeK', cycle) * person.IncomeK;
  }

  /** Generate one seed: the people, their renewal decisions per cycle, and the truth behind each decision. */
  private static buildSeed(spec: WorldSpec, domain: WorldDomain, seed: number): WorldSeed {
    const ids = GenLib.WorldIds(domain);
    const people = GenLib.MakePeople(seed, spec.nPersons, ids, domain.name, spec.cycles);
    const result: WorldSeed = { People: people, Rows: [], Truth: [], InterceptByCycle: {} };
    const scoreOf = (p: JoiningWorldPerson, c: number): number => WorldGenerator.scoreOf(spec, seed, p, c);
    const shift = (c: number): number => WorldGenerator.shift(spec, c);
    Loom.Engine.recurringDecision<JoiningWorldPerson, CycleContext>({
      seed, cycles: spec.cycles, target: spec.target,
      cohortOf: (c) => people.filter((p) => p.JoinCycle <= c && (!spec.churn || p.Status === 'Active')),
      prepareCohortContext: (cohort, c) => ({ b0: Loom.Engine.calibrateIntercept(cohort.map((p) => scoreOf(p, c)), spec.target) + shift(c) }),
      scoreOf,
      baselineShift: shift,
      streamKey: (p, c) => `renew:${p.ID}:${c}`,
      onDecision: (p, c, yes, ctx) => {
        if (!ctx) throw new Error(`recurringDecision gave no cohort context for cycle ${c}`);
        WorldGenerator.recordDecision(spec, seed, ids, domain, result, p, c, yes, ctx);
      },
    });
    WorldGenerator.applyPersonStatus(spec, result);
    return result;
  }

  /** Append the row and truth of one renewal decision; with churn, a lapser exits (Person.Status updated in place). */
  private static recordDecision(spec: WorldSpec, seed: number, ids: LoomIdentityService, domain: WorldDomain, result: WorldSeed,
    p: JoiningWorldPerson, c: number, yes: boolean, ctx: CycleContext): void {
    result.InterceptByCycle[c] = ctx.b0;   // ctx.b0 is identical for every row in the cycle; the manifest records it
    const f = WorldGenerator.featuresOf(seed, p, c);
    const trueP = Loom.Engine.sigmoid(ctx.b0 + WorldGenerator.scoreOf(spec, seed, p, c));
    const censored = c === spec.cycles[spec.cycles.length - 1] && spec.censorLastCycle !== 'none';
    const renewed = censored ? (spec.censorLastCycle === 'zero' ? 0 : null) : (yes ? 1 : 0);
    const id = ids.MintId(domain.name, 'MembershipYear', [p.ID, String(c)]);
    result.Rows.push({
      ID: id, PersonID: p.ID, Year: c, StartDate: `${c}-01-01`, Plan: f.Premium ? 'Premium' : 'Basic',
      EventsAttended: f.Events, IncomeK: p.IncomeK, AutoRenew: p.AutoRenew ? 1 : 0, Region: p.Region,
      PostalCode: spec.extraNoise.PostalCode400 ? p.PostalCode : null,
      MemberNumber: spec.extraNoise.MemberNumberUnique ? `MN-${id}` : null,
      Noise1: f.Noise[0], Noise2: f.Noise[1], Noise3: f.Noise[2], Noise4: f.Noise[3], Noise5: f.Noise[4],
      Renewed: renewed,
      Status: spec.leaks.statusOnRow ? (censored ? 'Pending' : yes ? 'Renewed' : 'Lapsed') : null,
      PersonStatusNow: null, WorldID: spec.id, Seed: seed,
    });
    result.Truth.push({ MembershipYearID: id, Cycle: c, TrueP: trueP, Drawn: yes ? 1 : 0, Censored: censored ? 1 : 0 });
    if (spec.churn && !yes && !censored) p.Status = 'Lapsed';
  }

  /**
   * The person-status leak: with `personStatusInPlace`, every row carries the person's status now (what a join to
   * today's Person row returns); without it, every person is reset to Active.
   */
  private static applyPersonStatus(spec: WorldSpec, result: WorldSeed): void {
    if (spec.leaks.personStatusInPlace) {
      const status = new Map(result.People.map((p) => [p.ID, p.Status]));
      for (const r of result.Rows) r.PersonStatusNow = status.get(r.PersonID) || null;
    } else {
      for (const p of result.People) p.Status = 'Active';
    }
  }

  /** The oracle's AUC, Brier score and log loss over the observed (uncensored) decisions. */
  private static oracle(truth: readonly WorldTruthRow[]): WorldOracle {
    const obs = truth.filter((t) => t.Censored === 0);
    const pos = obs.filter((t) => t.Drawn === 1).map((t) => t.TrueP);
    const neg = obs.filter((t) => t.Drawn === 0).map((t) => t.TrueP);
    const auc = GenLib.AucWithTies(pos, neg);
    const brier = obs.reduce((s, t) => s + (t.TrueP - t.Drawn) ** 2, 0) / obs.length;
    const ll = -obs.reduce((s, t) => s + (t.Drawn ? Math.log(t.TrueP) : Math.log(1 - t.TrueP)), 0) / obs.length;
    return { auc, brier, logLoss: ll };
  }

  /** Mean post-era intercept minus mean pre-era intercept; null without an era or without cycles on both sides. */
  private static netPostEraShift(spec: WorldSpec, interceptByCycle: Partial<Record<number, number>>): number | null {
    const fromCycle = spec.era.fromCycle;
    if (fromCycle === null) return null;
    const intercepts = (cycles: number[]): number[] => cycles.map((c) => interceptByCycle[c]).filter((v): v is number => v !== undefined);
    const pre = intercepts(spec.cycles.filter((c) => c < fromCycle));
    const post = intercepts(spec.cycles.filter((c) => c >= fromCycle));
    const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    return pre.length && post.length ? mean(post) - mean(pre) : null;
  }
}

await WorldGenerator.Main(process.argv);

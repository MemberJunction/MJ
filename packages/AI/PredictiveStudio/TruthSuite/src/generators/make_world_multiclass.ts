// make_world_multiclass.ts — usage: node --import tsx src/generators/make_world_multiclass.ts fixtures/worlds/W9-multiclass.json <outDir> [--seeds 42,43,…] [--emit-metadata]
//
// Generates the W9 event-attendance world: Attended / NoShow / Cancelled via TWO SEQUENTIAL logits,
// using recurringDecision() twice (Loom engine as a library).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GenLib, type WorldRunArgs } from './gen_lib';
import { Loom, type LoomIdentityService } from './loom';
import type { MulticlassBetas, MulticlassWorldSpec, WorldDomain } from './types';

/** One event registration, with the two sequential draws recorded on it. */
interface Registration {
  ID: string;
  PersonID: string;
  EventDate: string;
  TicketTier: 'Standard' | 'VIP';
  DaysRegisteredBefore: number;
  PriorAttendance: number;
  Cycle: number;
  Attended: boolean;
  Cancelled: boolean;
}

/** The registrations after both draws, with the per-cycle intercepts of both logits. */
interface DrawnRegistrations {
  Registrations: Registration[];
  B0Attend: Partial<Record<number, number>>;
  B0Cancel: Partial<Record<number, number>>;
}

/** The drawn class of a registration. */
type AttendanceOutcome = 'Attended' | 'NoShow' | 'Cancelled';

/** One row of W9's `rows.csv` (the `EventRegistration` entity). */
type RegistrationRow = {
  ID: string; PersonID: string; EventDate: string; TicketTier: Registration['TicketTier'];
  DaysRegisteredBefore: number; PriorAttendance: number; Outcome: AttendanceOutcome; WorldID: string; Seed: number;
};

/** One row of W9's `truth.csv`: the planted class probabilities and the drawn class. */
type RegistrationTruthRow = {
  EventRegistrationID: string; Cycle: number;
  TrueP_Attended: number; TrueP_NoShow: number; TrueP_Cancelled: number; DrawnClass: AttendanceOutcome;
};

/** The truth column holding each class's planted probability. */
type ClassProbabilityKey = 'TrueP_Attended' | 'TrueP_NoShow' | 'TrueP_Cancelled';

/** The oracle's scores: multiclass log loss and one-vs-rest AUC per class. */
interface MulticlassOracle { logLoss: number; aucByClass: Record<AttendanceOutcome, number | null> }

/** The calibrated cohort context of one cycle. */
interface CycleContext { b0: number }

/** The W9 multiclass event-attendance world generator. */
export class MulticlassWorldGenerator {
  private static readonly TIER_VALUES: Registration['TicketTier'][] = ['Standard', 'VIP'];
  private static readonly TIER_WEIGHTS = [70, 30];
  private static readonly DAYS_VALUES = [1, 3, 7, 14, 30, 60, 90];
  private static readonly DAYS_WEIGHTS = [8, 12, 18, 22, 20, 12, 8];
  private static readonly PRIOR_VALUES = [0, 1, 2, 3, 4, 5];
  private static readonly PRIOR_WEIGHTS = [30, 25, 20, 13, 8, 4];

  /** Generate every requested seed of the world named on the command line. */
  public static async Main(argv: readonly string[]): Promise<void> {
    const args = GenLib.ParseWorldArgs<MulticlassWorldSpec>(argv);
    for (const seed of args.Seeds) await MulticlassWorldGenerator.writeSeed(args, seed);
  }

  /** Generate one seed into `<outDir>/seed-<seed>`: rows, truth, people and the manifest. */
  private static async writeSeed(args: WorldRunArgs<MulticlassWorldSpec>, seed: number): Promise<void> {
    const { Spec: spec, Domain: domain } = args;
    const dir = path.join(args.OutDir, `seed-${seed}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const ids = GenLib.WorldIds(domain);
    const people = GenLib.MakePeople(seed, spec.nPersons, ids, domain.name);
    const regs = MulticlassWorldGenerator.drawOutcomes(spec, seed, MulticlassWorldGenerator.makeRegistrations(spec, seed, ids, domain, people.map((p) => p.ID)));
    const { rows, truth } = MulticlassWorldGenerator.buildRows(spec, seed, regs);
    if (args.EmitMetadata) {
      await Loom.Engine.emitMetadata({ outputDir: path.join(dir, 'metadata'), domain, data: { Person: GenLib.PersonRecords(people), EventRegistration: rows } });
    }
    GenLib.WriteCsv(path.join(dir, 'rows.csv'), rows, { TrailingNewline: false });
    GenLib.WriteCsv(path.join(dir, 'truth.csv'), truth, { TrailingNewline: false });
    GenLib.WriteCsv(path.join(dir, 'people.csv'), GenLib.PeopleCsvRows(people, spec.id, seed), { TrailingNewline: false });
    const classCounts = rows.reduce<Partial<Record<AttendanceOutcome, number>>>((a, r) => { a[r.Outcome] = (a[r.Outcome] || 0) + 1; return a; }, {});
    const classRates = Object.fromEntries(Object.entries(classCounts).map(([k, v]) => [k, v / rows.length]));
    const oracle = MulticlassWorldGenerator.oracle(truth);
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ...spec, seed, oracle, rowCount: rows.length, classRates }, null, 2));
    console.log(spec.id, seed, rows.length, 'rows', JSON.stringify({ classRates, oracle }));
  }

  /** The linear score of one of the two logits (`attend` or `cancel` betas) for a registration. */
  private static score(b: MulticlassBetas, reg: Registration): number {
    return b.TicketTierVIP * (reg.TicketTier === 'VIP' ? 1 : 0) + b.DaysRegisteredBefore * reg.DaysRegisteredBefore + b.PriorAttendance * reg.PriorAttendance;
  }

  /** Every person's registration in every cycle, each drawn from its own `reg:<person>:<cycle>` stream. */
  private static makeRegistrations(spec: MulticlassWorldSpec, seed: number, ids: LoomIdentityService, domain: WorldDomain,
    personIds: readonly string[]): Map<number, Registration[]> {
    const regsByCycle = new Map<number, Registration[]>();
    for (const c of spec.cycles) {
      regsByCycle.set(c, personIds.map((personId): Registration => {
        const r = GenLib.CreateRng(seed, `reg:${personId}:${c}`);
        const tier = GenLib.PickWeighted(r, MulticlassWorldGenerator.TIER_VALUES, MulticlassWorldGenerator.TIER_WEIGHTS);
        const days = GenLib.PickWeighted(r, MulticlassWorldGenerator.DAYS_VALUES, MulticlassWorldGenerator.DAYS_WEIGHTS);
        const prior = GenLib.PickWeighted(r, MulticlassWorldGenerator.PRIOR_VALUES, MulticlassWorldGenerator.PRIOR_WEIGHTS);
        return {
          ID: ids.MintId(domain.name, 'EventRegistration', [personId, String(c)]),
          PersonID: personId, EventDate: `${c}-06-15`, TicketTier: tier, DaysRegisteredBefore: days, PriorAttendance: prior,
          Cycle: c, Attended: false, Cancelled: false,
        };
      }));
    }
    return regsByCycle;
  }

  /** The cycle's registrations (every cycle has an entry: makeRegistrations sets one per spec cycle). */
  private static regsOf(regsByCycle: Map<number, Registration[]>, cycle: number): Registration[] {
    const regs = regsByCycle.get(cycle);
    if (!regs) throw new Error(`no registrations for cycle ${cycle}`);
    return regs;
  }

  /**
   * Draw the two sequential outcomes: attend (every registration), then cancel (registrations that did not attend).
   * Returns the per-cycle calibrated intercepts of both logits with the registrations, in cycle order.
   */
  private static drawOutcomes(spec: MulticlassWorldSpec, seed: number, regsByCycle: Map<number, Registration[]>): DrawnRegistrations {
    const b0Attend: Partial<Record<number, number>> = {};
    const b0Cancel: Partial<Record<number, number>> = {};
    const attendScore = (reg: Registration): number => MulticlassWorldGenerator.score(spec.betas.attend, reg);
    const cancelScore = (reg: Registration): number => MulticlassWorldGenerator.score(spec.betas.cancel, reg);
    Loom.Engine.recurringDecision<Registration, CycleContext>({
      seed, cycles: spec.cycles, target: spec.targets.attend,
      cohortOf: (c) => MulticlassWorldGenerator.regsOf(regsByCycle, c),
      prepareCohortContext: (cohort, c) => { const b0 = Loom.Engine.calibrateIntercept(cohort.map(attendScore), spec.targets.attend); b0Attend[c] = b0; return { b0 }; },
      scoreOf: attendScore,
      streamKey: (reg) => `attend:${reg.ID}`,
      onDecision: (reg, _c, yes) => { reg.Attended = yes; },
    });
    Loom.Engine.recurringDecision<Registration, CycleContext>({
      seed, cycles: spec.cycles, target: spec.targets.cancelGivenNoAttend,
      cohortOf: (c) => MulticlassWorldGenerator.regsOf(regsByCycle, c).filter((r) => !r.Attended),
      prepareCohortContext: (cohort, c) => { const b0 = Loom.Engine.calibrateIntercept(cohort.map(cancelScore), spec.targets.cancelGivenNoAttend); b0Cancel[c] = b0; return { b0 }; },
      scoreOf: cancelScore,
      streamKey: (reg) => `cancel:${reg.ID}`,
      onDecision: (reg, _c, yes) => { reg.Cancelled = yes; },
    });
    for (const c of spec.cycles) {
      if (b0Cancel[c] === undefined) {
        b0Cancel[c] = Loom.Engine.calibrateIntercept(MulticlassWorldGenerator.regsOf(regsByCycle, c).map(cancelScore), spec.targets.cancelGivenNoAttend);
      }
    }
    return { Registrations: spec.cycles.flatMap((c) => MulticlassWorldGenerator.regsOf(regsByCycle, c)), B0Attend: b0Attend, B0Cancel: b0Cancel };
  }

  /** The rows and the planted class probabilities of every registration. */
  private static buildRows(spec: MulticlassWorldSpec, seed: number, drawn: DrawnRegistrations): { rows: RegistrationRow[]; truth: RegistrationTruthRow[] } {
    const rows: RegistrationRow[] = [];
    const truth: RegistrationTruthRow[] = [];
    for (const reg of drawn.Registrations) {
      const c = reg.Cycle;
      const p1 = Loom.Engine.sigmoid(MulticlassWorldGenerator.interceptOf(drawn.B0Attend, c) + MulticlassWorldGenerator.score(spec.betas.attend, reg));
      const p2 = Loom.Engine.sigmoid(MulticlassWorldGenerator.interceptOf(drawn.B0Cancel, c) + MulticlassWorldGenerator.score(spec.betas.cancel, reg));
      const outcome: AttendanceOutcome = reg.Attended ? 'Attended' : (reg.Cancelled ? 'Cancelled' : 'NoShow');
      rows.push({
        ID: reg.ID, PersonID: reg.PersonID, EventDate: reg.EventDate, TicketTier: reg.TicketTier,
        DaysRegisteredBefore: reg.DaysRegisteredBefore, PriorAttendance: reg.PriorAttendance,
        Outcome: outcome, WorldID: spec.id, Seed: seed,
      });
      truth.push({
        EventRegistrationID: reg.ID, Cycle: c,
        TrueP_Attended: p1, TrueP_NoShow: (1 - p1) * (1 - p2), TrueP_Cancelled: (1 - p1) * p2,
        DrawnClass: outcome,
      });
    }
    return { rows, truth };
  }

  /** The cycle's calibrated intercept (drawOutcomes sets one per spec cycle for both logits). */
  private static interceptOf(b0ByCycle: Partial<Record<number, number>>, cycle: number): number {
    const b0 = b0ByCycle[cycle];
    if (b0 === undefined) throw new Error(`no calibrated intercept for cycle ${cycle}`);
    return b0;
  }

  /** One-vs-rest AUC of class `classLabel`, scored by its planted probability. */
  private static auc1v1(truth: readonly RegistrationTruthRow[], classProbKey: ClassProbabilityKey, classLabel: AttendanceOutcome): number | null {
    const pos = truth.filter((t) => t.DrawnClass === classLabel).map((t) => t[classProbKey]);
    const neg = truth.filter((t) => t.DrawnClass !== classLabel).map((t) => t[classProbKey]);
    return GenLib.AucWithTies(pos, neg);
  }

  /** The oracle's multiclass log loss and per-class AUC. */
  private static oracle(truth: readonly RegistrationTruthRow[]): MulticlassOracle {
    const logLoss = -truth.reduce((s, t) => {
      const p = t.DrawnClass === 'Attended' ? t.TrueP_Attended : t.DrawnClass === 'NoShow' ? t.TrueP_NoShow : t.TrueP_Cancelled;
      return s + Math.log(Math.max(p, 1e-15));
    }, 0) / truth.length;
    return {
      logLoss,
      aucByClass: {
        Attended: MulticlassWorldGenerator.auc1v1(truth, 'TrueP_Attended', 'Attended'),
        NoShow: MulticlassWorldGenerator.auc1v1(truth, 'TrueP_NoShow', 'NoShow'),
        Cancelled: MulticlassWorldGenerator.auc1v1(truth, 'TrueP_Cancelled', 'Cancelled'),
      },
    };
  }
}

await MulticlassWorldGenerator.Main(process.argv);

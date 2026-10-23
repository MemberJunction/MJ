// gen_lib.ts — the shared primitives of the planted-truth generators (Loom-backed RNG and IDs, CSV, world setup).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SafeJSONParse } from '@memberjunction/global';
import { TruthSuite } from '../registry/load';
import { Loom, type LoomIdentityService, type LoomRng } from './loom';
import type { CsvRow, CsvValue, WorldDomain, WorldSpecBase } from './types';

/** Options of {@link GenLib.WriteCsv}. */
export interface CsvWriteOptions {
  /** Column order; defaults to the keys of the first row. */
  Columns?: readonly string[];
  /**
   * End the file with a newline (default true). The world generators write without one: their golden hashes
   * (fixtures/golden-hashes.json) pin files that end at the last row.
   */
  TrailingNewline?: boolean;
}

/** One generated world person (the `Person` entity of the worlds domain). */
export interface WorldPerson {
  ID: string;
  MemberNumber: string;
  Region: string;
  PostalCode: string;
  IncomeK: number;
  AutoRenew: boolean;
  Status: 'Active' | 'Lapsed';
}

/** A world person plus the cycle they join in (binary renewal worlds only). */
export interface JoiningWorldPerson extends WorldPerson {
  JoinCycle: number;
}

/** The parsed command line of a world generator: `<spec.json> <outDir> [--seeds a,b,…] [--emit-metadata]`. */
export interface WorldRunArgs<TSpec extends WorldSpecBase> {
  Spec: TSpec;
  OutDir: string;
  Domain: WorldDomain;
  Seeds: number[];
  EmitMetadata: boolean;
}

/** Mints a scenario row ID from an entity kind and business-key parts. */
export type ScenarioIdMinter = (kind: string, parts: readonly string[]) => string;

/** Shared primitives of the planted-truth generators. */
export class GenLib {
  private static readonly REGION_VALUES = ['NA', 'EU', 'APAC', 'LATAM'];
  private static readonly REGION_WEIGHTS = [50, 25, 15, 10];
  private static readonly INCOME_VALUES = [20, 35, 50, 65, 80, 100, 130, 170];
  private static readonly INCOME_WEIGHTS = [10, 18, 22, 18, 12, 10, 6, 4];

  /** A Loom RNG stream for `seed` and `streamKey`. */
  public static CreateRng(seed: number, streamKey: string): LoomRng {
    return Loom.Engine.createRng(seed, streamKey);
  }

  /** A minter of scenario IDs in namespace `namespace`, keyed by `S<seed>` plus the given parts. */
  public static Ids(namespace: string, seed: number): ScenarioIdMinter {
    const service = new Loom.Engine.IdentityService();
    service.RegisterNamespace('ps-scenarios', namespace);
    return (kind, parts) => service.MintId('ps-scenarios', kind, [`S${seed}`, ...parts]);
  }

  /** `x` rounded to `digits` decimal places. */
  public static Round(x: number, digits = 6): number {
    const f = 10 ** digits;
    return Math.round(x * f) / f;
  }

  /** A weighted pick of one of `values`, `weights[i]` being the weight of `values[i]`. */
  public static PickWeighted<T>(rng: LoomRng, values: readonly T[], weights: readonly number[]): T {
    return rng.pickWeighted(values.map((value, i) => ({ value, weight: weights[i] })));
  }

  /** Parse a JSON file, throwing when it does not parse. */
  public static ReadJson<T>(file: string): T {
    const parsed = SafeJSONParse<T>(readFileSync(file, 'utf8'));
    if (parsed === null) throw new Error(`${file} is not valid JSON`);
    return parsed;
  }

  /**
   * Write `rows` as CSV. Null and absent cells are empty; a string holding a comma, quote or newline is quoted with
   * its quotes doubled.
   */
  public static WriteCsv(filePath: string, rows: ReadonlyArray<CsvRow>, options: CsvWriteOptions = {}): void {
    const columns = options.Columns || Object.keys(rows[0]);
    const lines = [columns.join(','), ...rows.map((row) => columns.map((c) => GenLib.csvCell(row[c])).join(','))];
    const trailer = options.TrailingNewline === false ? '' : '\n';
    writeFileSync(filePath, lines.join('\n') + trailer);
  }

  private static csvCell(value: CsvValue | undefined): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' && /[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return String(value);
  }

  /** Parse a world generator's command line and load its spec and the worlds domain. */
  public static ParseWorldArgs<TSpec extends WorldSpecBase>(argv: readonly string[]): WorldRunArgs<TSpec> {
    const spec = GenLib.ReadJson<TSpec>(argv[2]);
    const seedsIdx = argv.indexOf('--seeds');
    return {
      Spec: spec,
      OutDir: path.resolve(argv[3]),
      Domain: GenLib.LoadWorldDomain(),
      Seeds: seedsIdx !== -1 ? argv[seedsIdx + 1].split(',').map(Number) : [...spec.seeds, spec.freshSeed],
      EmitMetadata: argv.includes('--emit-metadata'),
    };
  }

  /** The worlds domain (fixtures/worlds-domain/domain.json), each field's `name` defaulted to its key. */
  public static LoadWorldDomain(): WorldDomain {
    const domain = GenLib.ReadJson<WorldDomain>(path.join(TruthSuite.Root(), 'fixtures', 'worlds-domain', 'domain.json'));
    for (const entity of Object.values(domain.entities)) {
      for (const [key, field] of Object.entries(entity.fields)) field.name ||= key;
    }
    return domain;
  }

  /** A fresh ID service with the worlds domain's namespace registered. */
  public static WorldIds(domain: WorldDomain): LoomIdentityService {
    const ids = new Loom.Engine.IdentityService();
    ids.RegisterNamespace(domain.name, domain.namespace);
    return ids;
  }

  /**
   * The world's people, drawn in order from the `people` stream. With `joinCycles`, each person also draws a join
   * cycle among the first three cycles; the draw comes last per person, so worlds without join cycles draw the same
   * people as worlds with them.
   */
  public static MakePeople(seed: number, nPersons: number, ids: LoomIdentityService, domainName: string): WorldPerson[];
  public static MakePeople(seed: number, nPersons: number, ids: LoomIdentityService, domainName: string, joinCycles: readonly number[]): JoiningWorldPerson[];
  public static MakePeople(seed: number, nPersons: number, ids: LoomIdentityService, domainName: string, joinCycles?: readonly number[]): WorldPerson[] {
    const rng = GenLib.CreateRng(seed, 'people');
    return Array.from({ length: nPersons }, (_, i) => {
      const person: WorldPerson = {
        ID: ids.MintId(domainName, 'Person', [`S${seed}`, `P${i}`]),
        MemberNumber: `M${seed}-${100000 + i}`,
        Region: GenLib.PickWeighted(rng, GenLib.REGION_VALUES, GenLib.REGION_WEIGHTS),
        PostalCode: `PC${rng.int(10000, 10399)}`,
        IncomeK: GenLib.PickWeighted(rng, GenLib.INCOME_VALUES, GenLib.INCOME_WEIGHTS),
        AutoRenew: rng.bernoulli(0.35),
        Status: 'Active',
      };
      if (!joinCycles) return person;
      const joining: JoiningWorldPerson = { ...person, JoinCycle: joinCycles[Math.floor(rng.next() * Math.min(3, joinCycles.length))] };
      return joining;
    });
  }

  /** The people as `Person` records (no join cycle), for Loom's metadata emitter. */
  public static PersonRecords(people: readonly WorldPerson[]): CsvRow[] {
    return people.map((p) => ({
      ID: p.ID, MemberNumber: p.MemberNumber, Region: p.Region, PostalCode: p.PostalCode,
      IncomeK: p.IncomeK, AutoRenew: p.AutoRenew, Status: p.Status,
    }));
  }

  /** The `people.csv` rows of a world seed. */
  public static PeopleCsvRows(people: readonly WorldPerson[], worldId: string, seed: number): CsvRow[] {
    return people.map((p) => ({
      ID: p.ID, MemberNumber: p.MemberNumber, Region: p.Region, PostalCode: p.PostalCode,
      IncomeK: p.IncomeK, AutoRenew: p.AutoRenew ? 1 : 0, Status: p.Status, WorldID: worldId, Seed: seed,
    }));
  }

  /** AUC of scores `pos` (positives) against `neg` (negatives), ties sharing their average rank; null when a side is empty. */
  public static AucWithTies(pos: readonly number[], neg: readonly number[]): number | null {
    if (pos.length === 0 || neg.length === 0) return null;
    const values: Array<[number, number]> = [...pos.map((p): [number, number] => [p, 1]), ...neg.map((p): [number, number] => [p, 0])]
      .sort((a, b) => a[0] - b[0]);
    const n = values.length;
    const ranks = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && values[j + 1][0] === values[i][0]) j++;
      const avgRank = (i + 1 + (j + 1)) / 2;
      for (let k = i; k <= j; k++) ranks[k] = avgRank;
      i = j + 1;
    }
    let rankSum = 0;
    values.forEach(([, y], idx) => { if (y === 1) rankSum += ranks[idx]; });
    return (rankSum - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
  }
}

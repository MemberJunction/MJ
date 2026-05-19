// Dirty Schema Generator — programmatic degradation of a clean state.json
//
// Takes a clean DBAutoDoc state.json (e.g., from the AdventureWorks benchmark)
// and applies one or more degradations that mimic real-world messy schemas:
//
//   - inconsistent-naming  : per-table, randomly switch column naming convention
//                            (PascalCase ↔ snake_case ↔ camelCase ↔ kebab-case)
//   - abbreviated-names    : compress common token sequences (BusinessEntity → BE, etc.)
//   - cryptic-names        : replace some columns with vendor-style cryptic names (col1, fld_x)
//   - drop-fk-declarations : clear all isForeignKey + foreignKeyReferences fields
//   - typo                 : introduce single-character typos in ~5% of column names
//   - mixed-systems        : prefix random subsets of tables with system markers
//                            (mc_, hs_, sf_) to simulate cross-system integration
//
// Deterministic — seeded RNG so the same input + seed produces the same output.
// Usage:
//   node dirty-schema-generator.mjs <input-state.json> <output-state.json> \
//        --modes=inconsistent-naming,drop-fk-declarations \
//        --seed=42

import { readFile, writeFile } from 'node:fs/promises';

// ─── Deterministic RNG (mulberry32) ────────────────────────────────────────
function rng(seed) {
    let t = seed >>> 0;
    return function () {
        t |= 0;
        t = (t + 0x6d2b79f5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function choice(rand, arr) {
    return arr[Math.floor(rand() * arr.length)];
}

// ─── Tokenization / formatting ─────────────────────────────────────────────
function tokenize(s) {
    if (!s) return [];
    return s
        .replace(/[_\-.\s/]+/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
}

const FORMATTERS = {
    PascalCase: (toks) => toks.map((t) => t[0].toUpperCase() + t.slice(1).toLowerCase()).join(''),
    snake_case: (toks) => toks.map((t) => t.toLowerCase()).join('_'),
    camelCase: (toks) =>
        toks
            .map((t, i) =>
                i === 0 ? t.toLowerCase() : t[0].toUpperCase() + t.slice(1).toLowerCase(),
            )
            .join(''),
    'kebab-case': (toks) => toks.map((t) => t.toLowerCase()).join('-'),
};
const FORMAT_KEYS = Object.keys(FORMATTERS);

// ─── Common abbreviations ──────────────────────────────────────────────────
const ABBREVIATIONS = {
    business: 'bus',
    businessentity: 'be',
    customer: 'cust',
    transaction: 'txn',
    address: 'addr',
    description: 'desc',
    modified: 'mod',
    reference: 'ref',
    product: 'prod',
    organization: 'org',
    location: 'loc',
    territory: 'terr',
    employee: 'emp',
    department: 'dept',
    history: 'hist',
    archive: 'arch',
    inventory: 'inv',
    quantity: 'qty',
    purchase: 'pur',
    sales: 'sal',
    order: 'ord',
    number: 'num',
    identifier: 'id',
    category: 'cat',
    subcategory: 'subcat',
    rate: 'rt',
    currency: 'curr',
    document: 'doc',
};

function abbreviate(name, rand) {
    const toks = tokenize(name);
    if (toks.length === 0) return name;
    const transformed = toks.map((t) => {
        const key = t.toLowerCase();
        if (ABBREVIATIONS[key] && rand() < 0.7) return ABBREVIATIONS[key];
        return t;
    });
    return FORMATTERS.PascalCase(transformed);
}

// ─── Degradations ──────────────────────────────────────────────────────────
function applyInconsistentNaming(state, rand) {
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            // Pick one naming convention per table (different from original) to enforce inconsistency
            const fmt = choice(rand, FORMAT_KEYS);
            const formatter = FORMATTERS[fmt];
            for (const col of table.columns) {
                if (col.isPrimaryKey) continue; // leave PKs alone to avoid breaking joins
                const toks = tokenize(col.name);
                if (toks.length === 0) continue;
                col.name = formatter(toks);
            }
        }
    }
    return state;
}

function applyAbbreviation(state, rand) {
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            for (const col of table.columns) {
                if (col.isPrimaryKey) continue;
                col.name = abbreviate(col.name, rand);
            }
        }
    }
    return state;
}

function applyCrypticNames(state, rand) {
    let counter = 0;
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            for (const col of table.columns) {
                if (col.isPrimaryKey) continue;
                if (rand() < 0.15) {
                    // 15% chance to mangle into vendor-style cryptic name
                    col.name = `fld_${(counter++).toString(36)}`;
                }
            }
        }
    }
    return state;
}

function applyDropFkDeclarations(state) {
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            for (const col of table.columns) {
                col.isForeignKey = false;
                delete col.foreignKeyReferences;
            }
            table.dependsOn = [];
            table.dependents = [];
        }
    }
    // Also clear DBAutoDoc's discovered FK output so the pipeline doesn't see them
    if (state.phases?.keyDetection?.discovered) {
        state.phases.keyDetection.discovered.foreignKeys = [];
    }
    return state;
}

function applyTypos(state, rand) {
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            for (const col of table.columns) {
                if (col.isPrimaryKey) continue;
                if (rand() < 0.05 && col.name.length > 3) {
                    // 5% of columns get a single-character typo
                    const idx = 1 + Math.floor(rand() * (col.name.length - 2));
                    const chars = col.name.split('');
                    // Swap with neighbor
                    const next = idx + 1;
                    [chars[idx], chars[next]] = [chars[next], chars[idx]];
                    col.name = chars.join('');
                }
            }
        }
    }
    return state;
}

function applyMixedSystems(state, rand) {
    const SYSTEMS = ['mc', 'hs', 'sf', 'mj'];
    for (const schema of state.schemas) {
        for (const table of schema.tables) {
            if (rand() < 0.3) {
                const sys = choice(rand, SYSTEMS);
                table.name = `${sys}_${table.name}`;
            }
        }
    }
    return state;
}

const MODES = {
    'inconsistent-naming': applyInconsistentNaming,
    'abbreviated-names': applyAbbreviation,
    'cryptic-names': applyCrypticNames,
    'drop-fk-declarations': applyDropFkDeclarations,
    typo: applyTypos,
    'mixed-systems': applyMixedSystems,
};

// ─── Driver ────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error(
            'Usage: dirty-schema-generator.mjs <input.json> <output.json> [--modes=mode1,mode2] [--seed=N]',
        );
        console.error('Available modes:', Object.keys(MODES).join(', '));
        process.exit(1);
    }
    const [inputPath, outputPath, ...flags] = args;
    let modes = Object.keys(MODES); // default: apply all
    let seed = 42;
    for (const f of flags) {
        if (f.startsWith('--modes=')) modes = f.slice(8).split(',').filter(Boolean);
        else if (f.startsWith('--seed=')) seed = parseInt(f.slice(7), 10) || 42;
    }
    const rand = rng(seed);

    console.log(`Reading ${inputPath} ...`);
    const state = JSON.parse(await readFile(inputPath, 'utf-8'));

    const originalColumnCount = state.schemas.reduce(
        (a, s) => a + s.tables.reduce((b, t) => b + t.columns.length, 0),
        0,
    );

    for (const mode of modes) {
        if (!MODES[mode]) {
            console.error(`Unknown mode: ${mode}`);
            continue;
        }
        console.log(`  Applying ${mode} ...`);
        MODES[mode](state, rand);
    }

    // Track degradation provenance so the comparison script can identify the run
    state.__dirtySchemaProvenance = {
        sourceFile: inputPath,
        modes,
        seed,
        appliedAt: new Date().toISOString(),
        originalColumnCount,
    };

    await writeFile(outputPath, JSON.stringify(state, null, 2));
    console.log(
        `Wrote ${outputPath} (${state.schemas.length} schemas, ${originalColumnCount} columns).`,
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

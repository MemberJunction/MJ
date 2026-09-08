/**
 * Hash-keyed DB snapshot / restore for db-setup (DR-B1a).
 *
 * The regression DB is a deterministic function of (migrations, AssociationDB
 * SQL, MJ build version). Rebuilding it every stack lifecycle re-pays
 * CREATE + AssociationDB (10k+ rows) + migrate + codegen ×2 ≈ 4–6 min. This
 * keys a native SQL Server backup by a content hash of those inputs:
 *
 *   restore  → if a backup whose hash matches the CURRENT inputs (and the
 *              server version) exists in the snapshot volume, RESTORE it
 *              (seconds) and exit 0. Otherwise exit 3 (caller does a full
 *              rebuild). Any real error also exits non-zero so the caller
 *              falls back to a clean rebuild.
 *   backup   → BACKUP the freshly-built DB into the snapshot volume keyed by the
 *              same hash, and write a sidecar meta.json (hash + server version).
 *   hash     → print the current hash (debugging).
 *
 * Restoring every run also gives PRISTINE data — no cross-run contamination
 * from a prior run's test writes. Metadata (apps/prompts/tests/suites) is pushed
 * at RUNTIME (DR-B5), so snapshots stay metadata-independent: editing a test or
 * prompt never invalidates the snapshot.
 *
 * The .bak lives on a volume mounted at the SAME path (SNAPSHOT_DIR) in both
 * this container (for existence checks + meta) and sqlserver (which physically
 * reads/writes the file via BACKUP/RESTORE TO/FROM DISK).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { connect } = require('./lib/db.cjs');

const SNAPSHOT_DIR = process.env.SNAPSHOT_DIR || '/snapshots';
const APP_DIR = process.env.APP_DIR || '/app';
const DB_NAME = process.env.DB_DATABASE || 'MemberJunction_Test';
const DATA_DIR = process.env.MSSQL_DATA_DIR || '/var/opt/mssql/data';
// Long enough for a multi-GB BACKUP/RESTORE with compression.
const OP_TIMEOUT_MS = 600000;

// Inputs whose content determines the schema/demo state (NOT metadata — that's
// pushed at runtime). Relative to APP_DIR; missing dirs are skipped.
const HASH_INPUT_DIRS = ['migrations', 'Demos/AssociationDB'];
const HASH_INPUT_EXTS = new Set(['.sql', '.md', '.sh', '.json', '.csv']);

/** Stable sha256 over the schema inputs + the MJ build version. */
function computeHash() {
    const h = crypto.createHash('sha256');
    for (const rel of HASH_INPUT_DIRS) {
        const root = path.join(APP_DIR, rel);
        if (!fs.existsSync(root)) continue;
        for (const file of walkSorted(root)) {
            if (!HASH_INPUT_EXTS.has(path.extname(file).toLowerCase())) continue;
            h.update(path.relative(APP_DIR, file));
            h.update(fs.readFileSync(file));
        }
    }
    h.update('version:' + readBuildVersion());
    return h.digest('hex').slice(0, 16);
}

/** All files under `dir`, depth-first, path-sorted for determinism. */
function walkSorted(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const fp = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkSorted(fp));
        else out.push(fp);
    }
    return out;
}

/** MJ monorepo version — a proxy for CodeGen behavior across releases. */
function readBuildVersion() {
    try {
        return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version || 'unknown';
    } catch {
        return 'unknown';
    }
}

const paths = (hash) => ({
    bak: path.join(SNAPSHOT_DIR, `mj-${hash}.bak`),
    meta: path.join(SNAPSHOT_DIR, `mj-${hash}.meta.json`),
});

async function serverVersion(pool) {
    const r = await pool.request().query("SELECT CAST(SERVERPROPERTY('ProductVersion') AS varchar(64)) AS v");
    return r.recordset[0].v;
}

/** RESTORE if a matching, version-compatible snapshot exists. */
async function restore() {
    const hash = computeHash();
    const { bak, meta } = paths(hash);
    if (!fs.existsSync(bak) || !fs.existsSync(meta)) {
        console.log(`  No snapshot for hash ${hash} — full rebuild needed.`);
        return 3;
    }
    const metaObj = JSON.parse(fs.readFileSync(meta, 'utf8'));
    let pool;
    try {
        pool = await connect({ withDatabase: false });
        const version = await serverVersion(pool);
        if (metaObj.serverVersion !== version) {
            console.log(`  Snapshot server version ${metaObj.serverVersion} != current ${version} — full rebuild needed.`);
            return 3;
        }
        // Discover the .bak's logical file names so the MOVE is robust.
        const files = await pool.request().input('p', bak)
            .query('RESTORE FILELISTONLY FROM DISK = @p');
        const dataLogical = files.recordset.find(f => f.Type === 'D')?.LogicalName;
        const logLogical = files.recordset.find(f => f.Type === 'L')?.LogicalName;
        if (!dataLogical || !logLogical) {
            console.log('  Could not read logical file names from backup — full rebuild.');
            return 3;
        }
        // Take the DB offline-exclusive if it already exists (app services are not
        // yet connected during db-setup, but be defensive).
        await pool.request().batch(
            `IF DB_ID('${DB_NAME}') IS NOT NULL
                 ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`
        );
        const req = pool.request();
        req.timeout = OP_TIMEOUT_MS;
        await req.batch(
            `RESTORE DATABASE [${DB_NAME}] FROM DISK = N'${bak}'
                 WITH REPLACE,
                      MOVE N'${dataLogical}' TO N'${path.join(DATA_DIR, DB_NAME + '.mdf')}',
                      MOVE N'${logLogical}'  TO N'${path.join(DATA_DIR, DB_NAME + '_log.ldf')}';
             ALTER DATABASE [${DB_NAME}] SET MULTI_USER;`
        );
        console.log(`  ✓ Restored ${DB_NAME} from snapshot ${hash} (pristine).`);
        return 0;
    } catch (err) {
        console.log(`  Snapshot restore failed (${err.message}) — falling back to full rebuild.`);
        // Drop a half-restored DB so the rebuild's CREATE starts clean.
        try {
            await pool.request().batch(
                `IF DB_ID('${DB_NAME}') IS NOT NULL
                 BEGIN
                     ALTER DATABASE [${DB_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                     DROP DATABASE [${DB_NAME}];
                 END`
            );
        } catch { /* best-effort */ }
        return 3;
    } finally {
        if (pool) await pool.close().catch(() => {});
    }
}

/** BACKUP the freshly-built DB, keyed by the current hash. */
async function backup() {
    const hash = computeHash();
    const { bak, meta } = paths(hash);
    let pool;
    try {
        fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
        pool = await connect({ withDatabase: false });
        const version = await serverVersion(pool);
        const req = pool.request();
        req.timeout = OP_TIMEOUT_MS;
        await req.batch(
            `BACKUP DATABASE [${DB_NAME}] TO DISK = N'${bak}'
                 WITH INIT, FORMAT, COMPRESSION, COPY_ONLY, NAME = N'mj-regression ${hash}';`
        );
        // Write the sidecar AFTER a successful backup so a partial .bak is never
        // treated as valid (restore requires BOTH files).
        fs.writeFileSync(meta, JSON.stringify({ hash, serverVersion: version, dbName: DB_NAME }, null, 2));
        console.log(`  ✓ Snapshot saved: ${bak} (server ${version})`);
        return 0;
    } catch (err) {
        console.log(`  WARNING: snapshot backup failed (non-fatal): ${err.message}`);
        return 0; // never fail the build over a snapshot-save problem
    } finally {
        if (pool) await pool.close().catch(() => {});
    }
}

async function main() {
    const cmd = process.argv[2];
    if (cmd === 'hash') {
        console.log(computeHash());
        return 0;
    }
    if (cmd === 'restore') return restore();
    if (cmd === 'backup') return backup();
    console.error(`usage: db-snapshot.cjs <hash|restore|backup>`);
    return 2;
}

main().then((code) => process.exit(code)).catch((err) => {
    console.error(err);
    process.exit(1);
});

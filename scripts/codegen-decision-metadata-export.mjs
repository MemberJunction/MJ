#!/usr/bin/env node
/**
 * scripts/codegen-decision-metadata-export.mjs
 *
 * One-time backfill exporter for CodeGen decision metadata (§3.5, C7).
 * Reads decision columns from a reference database (or in-memory snapshot) and
 * writes one file per entity using the shared decision-metadata-format.
 *
 * CLI Usage:
 *   node scripts/codegen-decision-metadata-export.mjs --reference "<conn>" --out metadata/entities/decisions --schemas __mj
 */
import path from 'path';
import { fileURLToPath } from 'url';
import {
  formatDecisionRecordData,
  getDecisionFileName,
  buildEntityLookup,
  buildFieldLookup,
  buildSettingLookup,
  buildAppEntityLookup,
  buildDecisionComments,
  writeIfChanged
} from '../packages/CodeGenLib/dist/index.js';
import { ordinalCompare } from '@memberjunction/global';

function isTrue(val) {
  return val === true || val === 1 || val === '1';
}

function isFalse(val) {
  return val === false || val === 0 || val === '0';
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Core export logic. Callable directly or via CLI.
 */
export async function exportDecisionMetadata({
  snapshot,
  referenceConn,
  outDir = 'metadata/entities/decisions',
  schemas,
  dryRun = false,
  log = console.log
}) {
  let entities = [];
  let entityFields = [];
  let entitySettings = [];
  let applicationEntities = [];

  if (snapshot) {
    entities = [...(snapshot.entities || [])];
    entityFields = [...(snapshot.entityFields || [])];
    entitySettings = [...(snapshot.entitySettings || [])];
    applicationEntities = [...(snapshot.applicationEntities || [])];
  } else if (referenceConn) {
    const sql = (await import('mssql')).default;
    const pool = await sql.connect(referenceConn);

    try {
      const entRes = await pool.request().query(`
        SELECT ID, Name, SchemaName, Icon, Description, AutoUpdateDescription,
               AllowUserSearchAPI, AutoUpdateAllowUserSearchAPI,
               FullTextSearchEnabled, AutoUpdateFullTextSearch,
               SupportsGeoCoding, AutoUpdateSupportsGeoCoding
        FROM [__mj].[vwEntities]
      `);
      entities = entRes.recordset;

      const fldRes = await pool.request().query(`
        SELECT ID, EntityID, Name, Sequence, DisplayName, AutoUpdateDisplayName,
               Category, AutoUpdateCategory, GeneratedFormSection, ExtendedType, AutoUpdateExtendedType,
               CodeType, Description, AutoUpdateDescription, DefaultInView, AutoUpdateDefaultInView,
               IncludeInUserSearchAPI, AutoUpdateIncludeInUserSearchAPI,
               UserSearchPredicateAPI, AutoUpdateUserSearchPredicate,
               IsNameField, AutoUpdateIsNameField, FullTextSearchEnabled, AutoUpdateFullTextSearch
        FROM [__mj].[vwEntityFields]
      `);
      entityFields = fldRes.recordset;

      const setRes = await pool.request().query(`
        SELECT ID, EntityID, Name, Value
        FROM [__mj].[vwEntitySettings]
        WHERE Name IN ('FieldCategoryInfo', 'FieldCategoryIcons')
      `);
      entitySettings = setRes.recordset;

      const appRes = await pool.request().query(`
        SELECT ae.ID, ae.ApplicationID, ae.EntityID, a.Name AS Application,
               ae.DefaultForNewUser, ae.AutoUpdateDefaultForNewUser
        FROM [__mj].[vwApplicationEntities] ae
        INNER JOIN [__mj].[vwApplications] a ON ae.ApplicationID = a.ID
      `);
      applicationEntities = appRes.recordset;
    } finally {
      await pool.close();
    }
  } else {
    throw new Error('Either snapshot or referenceConn must be provided.');
  }

  // Normalize schemas filter
  let schemaSet = new Set();
  if (schemas) {
    if (Array.isArray(schemas)) {
      schemaSet = new Set(schemas.map(s => s.trim().toLowerCase()));
    } else if (typeof schemas === 'string') {
      schemaSet = new Set(schemas.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    }
  }

  // Filter entities by schema if specified
  const filteredEntities = entities.filter(e => {
    if (schemaSet.size === 0) return true;
    const schema = (e.SchemaName || 'dbo').trim().toLowerCase();
    return schemaSet.has(schema);
  });

  // Sort entities deterministically: SchemaName, then Name
  filteredEntities.sort((a, b) => {
    const sCmp = ordinalCompare(a.SchemaName || '', b.SchemaName || '');
    if (sCmp !== 0) return sCmp;
    return ordinalCompare(a.Name || '', b.Name || '');
  });

  const summary = {
    totalEntities: filteredEntities.length,
    totalFieldRecords: 0,
    totalSettingRecords: 0,
    totalAppEntityRecords: 0,
    columnCounts: {},
    filesWritten: 0,
    filesUnchanged: 0,
    exportedFiles: []
  };

  function incCol(col) {
    summary.columnCounts[col] = (summary.columnCounts[col] || 0) + 1;
  }

  for (const entity of filteredEntities) {
    const entityFieldsObj = {
      Name: entity.Name
    };

    if (isNonEmptyString(entity.Icon)) {
      entityFieldsObj.Icon = entity.Icon.trim();
      incCol('entity.Icon');
    }
    if (isTrue(entity.AllowUserSearchAPI)) {
      entityFieldsObj.AllowUserSearchAPI = true;
      incCol('entity.AllowUserSearchAPI');
    }
    if (isTrue(entity.FullTextSearchEnabled)) {
      entityFieldsObj.FullTextSearchEnabled = true;
      incCol('entity.FullTextSearchEnabled');
    }
    if (isTrue(entity.SupportsGeoCoding)) {
      entityFieldsObj.SupportsGeoCoding = true;
      incCol('entity.SupportsGeoCoding');
    }
    if (isFalse(entity.AutoUpdateDescription) && isNonEmptyString(entity.Description)) {
      entityFieldsObj.Description = entity.Description.trim();
      incCol('entity.Description');
    }
    if (isFalse(entity.AutoUpdateAllowUserSearchAPI)) {
      entityFieldsObj.AutoUpdateAllowUserSearchAPI = false;
      incCol('entity.AutoUpdateAllowUserSearchAPI');
    }
    if (isFalse(entity.AutoUpdateFullTextSearch)) {
      entityFieldsObj.AutoUpdateFullTextSearch = false;
      incCol('entity.AutoUpdateFullTextSearch');
    }
    if (isFalse(entity.AutoUpdateSupportsGeoCoding)) {
      entityFieldsObj.AutoUpdateSupportsGeoCoding = false;
      incCol('entity.AutoUpdateSupportsGeoCoding');
    }
    if (isFalse(entity.AutoUpdateDescription)) {
      entityFieldsObj.AutoUpdateDescription = false;
      incCol('entity.AutoUpdateDescription');
    }

    // Related Entity Fields
    const matchingFields = entityFields.filter(f =>
      (f.EntityID && entity.ID && f.EntityID === entity.ID) ||
      (f.EntityName && entity.Name && f.EntityName === entity.Name)
    );

    // Sort fields deterministically: Sequence ASC, then Name ASC
    matchingFields.sort((a, b) => {
      const seqA = a.Sequence ?? 0;
      const seqB = b.Sequence ?? 0;
      if (seqA !== seqB) return seqA - seqB;
      return ordinalCompare(a.Name || '', b.Name || '');
    });

    const fieldRecords = [];
    for (const f of matchingFields) {
      const fObj = {
        Name: f.Name,
        DisplayName: f.DisplayName || f.Name
      };
      incCol('fields.DisplayName');

      if (isFalse(f.AutoUpdateDescription) && isNonEmptyString(f.Description)) {
        fObj.Description = f.Description.trim();
        incCol('fields.Description');
      }
      if (isNonEmptyString(f.Category)) {
        fObj.Category = f.Category.trim();
        incCol('fields.Category');
      }
      if (isNonEmptyString(f.GeneratedFormSection)) {
        fObj.GeneratedFormSection = f.GeneratedFormSection.trim();
        incCol('fields.GeneratedFormSection');
      }
      if (isNonEmptyString(f.ExtendedType)) {
        fObj.ExtendedType = f.ExtendedType.trim();
        incCol('fields.ExtendedType');
      }
      if (isNonEmptyString(f.CodeType)) {
        fObj.CodeType = f.CodeType.trim();
        incCol('fields.CodeType');
      }
      if (isTrue(f.DefaultInView)) {
        fObj.DefaultInView = true;
        incCol('fields.DefaultInView');
      }
      if (isTrue(f.IncludeInUserSearchAPI)) {
        fObj.IncludeInUserSearchAPI = true;
        incCol('fields.IncludeInUserSearchAPI');
      }
      if (isNonEmptyString(f.UserSearchPredicateAPI)) {
        fObj.UserSearchPredicateAPI = f.UserSearchPredicateAPI.trim();
        incCol('fields.UserSearchPredicateAPI');
      }
      if (isTrue(f.IsNameField)) {
        fObj.IsNameField = true;
        incCol('fields.IsNameField');
      }
      if (isTrue(f.FullTextSearchEnabled)) {
        fObj.FullTextSearchEnabled = true;
        incCol('fields.FullTextSearchEnabled');
      }

      // AutoUpdate* flags present only when 0 / false
      if (isFalse(f.AutoUpdateDisplayName)) {
        fObj.AutoUpdateDisplayName = false;
        incCol('fields.AutoUpdateDisplayName');
      }
      if (isFalse(f.AutoUpdateCategory)) {
        fObj.AutoUpdateCategory = false;
        incCol('fields.AutoUpdateCategory');
      }
      if (isFalse(f.AutoUpdateExtendedType)) {
        fObj.AutoUpdateExtendedType = false;
        incCol('fields.AutoUpdateExtendedType');
      }
      if (isFalse(f.AutoUpdateDefaultInView)) {
        fObj.AutoUpdateDefaultInView = false;
        incCol('fields.AutoUpdateDefaultInView');
      }
      if (isFalse(f.AutoUpdateIncludeInUserSearchAPI)) {
        fObj.AutoUpdateIncludeInUserSearchAPI = false;
        incCol('fields.AutoUpdateIncludeInUserSearchAPI');
      }
      if (isFalse(f.AutoUpdateUserSearchPredicate)) {
        fObj.AutoUpdateUserSearchPredicate = false;
        incCol('fields.AutoUpdateUserSearchPredicate');
      }
      if (isFalse(f.AutoUpdateIsNameField)) {
        fObj.AutoUpdateIsNameField = false;
        incCol('fields.AutoUpdateIsNameField');
      }
      if (isFalse(f.AutoUpdateFullTextSearch)) {
        fObj.AutoUpdateFullTextSearch = false;
        incCol('fields.AutoUpdateFullTextSearch');
      }
      if (isFalse(f.AutoUpdateDescription)) {
        fObj.AutoUpdateDescription = false;
        incCol('fields.AutoUpdateDescription');
      }

      fieldRecords.push({
        fields: fObj,
        primaryKey: { ID: buildFieldLookup(entity.Name, f.Name) }
      });
      summary.totalFieldRecords++;
    }

    // Related Entity Settings
    const matchingSettings = entitySettings.filter(s =>
      ((s.EntityID && entity.ID && s.EntityID === entity.ID) ||
       (s.EntityName && entity.Name && s.EntityName === entity.Name)) &&
      (s.Name === 'FieldCategoryInfo' || s.Name === 'FieldCategoryIcons')
    );

    matchingSettings.sort((a, b) => ordinalCompare(a.Name || '', b.Name || ''));

    const settingRecords = [];
    for (const s of matchingSettings) {
      let val = s.Value;
      if (typeof val === 'string') {
        try {
          val = JSON.parse(val);
        } catch {
          // Keep raw string if not JSON
        }
      }
      settingRecords.push({
        fields: {
          Name: s.Name,
          Value: val
        },
        primaryKey: { ID: buildSettingLookup(entity.Name, s.Name) }
      });
      incCol(`settings.${s.Name}`);
      summary.totalSettingRecords++;
    }

    // Related Application Entities
    const matchingAppEntities = applicationEntities.filter(ae =>
      (ae.EntityID && entity.ID && ae.EntityID === entity.ID) ||
      (ae.EntityName && entity.Name && ae.EntityName === entity.Name)
    );

    matchingAppEntities.sort((a, b) => ordinalCompare(a.Application || '', b.Application || ''));

    const appEntityRecords = [];
    for (const ae of matchingAppEntities) {
      const appObj = {};
      if (isTrue(ae.DefaultForNewUser)) {
        appObj.DefaultForNewUser = true;
        incCol('appEntities.DefaultForNewUser');
      }
      if (isFalse(ae.AutoUpdateDefaultForNewUser)) {
        appObj.AutoUpdateDefaultForNewUser = false;
        incCol('appEntities.AutoUpdateDefaultForNewUser');
      }

      if (Object.keys(appObj).length > 0) {
        appEntityRecords.push({
          fields: appObj,
          primaryKey: { ID: buildAppEntityLookup(ae.Application || '', entity.Name) }
        });
        summary.totalAppEntityRecords++;
      }
    }

    const decisionRecord = {
      _comments: buildDecisionComments(entity.Name, entity.SchemaName),
      fields: entityFieldsObj,
      primaryKey: { ID: buildEntityLookup(entity.Name) }
    };

    const relatedEntities = {};
    if (fieldRecords.length > 0) {
      relatedEntities['MJ: Entity Fields'] = fieldRecords;
    }
    if (settingRecords.length > 0) {
      relatedEntities['MJ: Entity Settings'] = settingRecords;
    }
    if (appEntityRecords.length > 0) {
      relatedEntities['MJ: Application Entities'] = appEntityRecords;
    }

    if (Object.keys(relatedEntities).length > 0) {
      decisionRecord.relatedEntities = relatedEntities;
    }

    const formattedContent = formatDecisionRecordData([decisionRecord]);
    const fileName = getDecisionFileName(entity.SchemaName, entity.Name);
    const filePath = path.join(outDir, fileName);

    summary.exportedFiles.push({
      fileName,
      filePath,
      content: formattedContent
    });

    if (!dryRun) {
      const written = await writeIfChanged(filePath, formattedContent);
      if (written) {
        summary.filesWritten++;
      } else {
        summary.filesUnchanged++;
      }
    } else {
      summary.filesWritten++;
    }
  }

  log(`[Decision Metadata Export] Summary:`);
  log(`  Entities exported:    ${summary.totalEntities}`);
  log(`  Entity Fields:        ${summary.totalFieldRecords}`);
  log(`  Entity Settings:      ${summary.totalSettingRecords}`);
  log(`  Application Entities: ${summary.totalAppEntityRecords}`);
  log(`  Files written:        ${summary.filesWritten}`);
  log(`  Files unchanged:      ${summary.filesUnchanged}`);
  log(`  Column-level decision counts:`);
  for (const [col, count] of Object.entries(summary.columnCounts).sort((a, b) => ordinalCompare(a[0], b[0]))) {
    log(`    ${col.padEnd(35)}: ${count}`);
  }

  return summary;
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

function parseArgs(args) {
  const result = {
    reference: null,
    out: 'metadata/entities/decisions',
    schemas: '__mj',
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--reference' && i + 1 < args.length) {
      result.reference = args[++i];
    } else if (arg === '--out' && i + 1 < args.length) {
      result.out = args[++i];
    } else if (arg === '--schemas' && i + 1 < args.length) {
      result.schemas = args[++i];
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    }
  }
  return result;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(`
Usage: node scripts/codegen-decision-metadata-export.mjs [options]

Options:
  --reference <conn>   Reference database connection string (MSSQL) [REQUIRED]
  --out <dir>          Output directory (default: metadata/entities/decisions)
  --schemas <schemas>  Comma-separated list of schema names (default: __mj)
  --dry-run            Simulate export without writing files
  --help, -h           Show this help message
`);
    process.exit(0);
  }

  if (!options.reference) {
    console.error('Error: --reference connection string is required when running as a CLI script.');
    process.exit(1);
  }

  try {
    await exportDecisionMetadata({
      referenceConn: options.reference,
      outDir: options.out,
      schemas: options.schemas,
      dryRun: options.dryRun,
      log: console.log
    });
    console.log('Export completed successfully.');
  } catch (err) {
    console.error('Export failed:', err);
    process.exit(1);
  }
}

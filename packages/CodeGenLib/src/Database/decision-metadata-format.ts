import fs from 'fs-extra';
import path from 'path';
import { ordinalCompare } from '@memberjunction/global';
import { EntityFieldExtendedType } from '@memberjunction/core';
import { canonicalJSONStringify } from '../Misc/util';

/**
 * Standard comment block placed at the top of generated decision metadata files.
 */
export function buildDecisionComments(entityName: string, schemaName: string): string[] {
  const schema = (schemaName || 'dbo').trim();
  return [
    `CodeGen decision record for ${entityName} (schema ${schema}). Written by CodeGen; edit by hand to`,
    `override — CodeGen never rewrites a value that exists (plan §3). CodeGen-owned columns`,
    `(Type, Length, Sequence, AllowsNull, RelatedEntityID, …) are deliberately absent.`
  ];
}

/**
 * Entity-level decision columns managed by CodeGen.
 */
export const ALLOWED_ENTITY_DECISION_COLUMNS = new Set([
  'Icon',
  'AllowUserSearchAPI',
  'FullTextSearchEnabled',
  'SupportsGeoCoding',
  'AutoUpdateAllowUserSearchAPI',
  'AutoUpdateFullTextSearch',
  'AutoUpdateSupportsGeoCoding'
]);

/**
 * Field-level decision columns managed by CodeGen.
 */
export const ALLOWED_FIELD_DECISION_COLUMNS = new Set([
  'DisplayName',
  'Category',
  'GeneratedFormSection',
  'ExtendedType',
  'CodeType',
  'DefaultInView',
  'IncludeInUserSearchAPI',
  'UserSearchPredicateAPI',
  'IsNameField',
  'FullTextSearchEnabled',
  'AutoUpdateDisplayName',
  'AutoUpdateCategory',
  'AutoUpdateExtendedType',
  'AutoUpdateDefaultInView',
  'AutoUpdateIncludeInUserSearchAPI',
  'AutoUpdateUserSearchPredicate',
  'AutoUpdateIsNameField',
  'AutoUpdateFullTextSearch'
]);

/**
 * EntitySetting names managed by CodeGen decisions.
 */
export const ALLOWED_SETTING_DECISION_NAMES = new Set([
  'FieldCategoryInfo',
  'FieldCategoryIcons'
]);

/**
 * ApplicationEntity columns managed by CodeGen decisions.
 */
export const ALLOWED_APP_ENTITY_DECISION_COLUMNS = new Set([
  'DefaultForNewUser',
  'AutoUpdateDefaultForNewUser'
]);

/**
 * Columns that must NEVER be authored in decision metadata records.
 * Saving any of these would trigger schema sync fight or validation failures.
 */
export const DISALLOWED_COLUMNS = new Set([
  'Description',
  'Type',
  'Length',
  'Precision',
  'Scale',
  'Sequence',
  'AllowsNull',
  'DefaultValue',
  'IsPrimaryKey',
  'IsUnique',
  'IsVirtual',
  'IsComputed',
  'AutoIncrement',
  'ValueListType',
  'RelatedEntityID',
  'RelatedEntityFieldName',
  'Configuration',
  'JSONType',
  'JSONTypeDefinition',
  'JSONTypeIsArray'
]);

/**
 * Converts an entity name to a safe, deterministic kebab-case slug for filenames.
 * E.g. "MJ: Entities" -> "mj-entities", "Company Integrations" -> "company-integrations".
 */
export function toEntitySlug(entityName: string): string {
  return (entityName ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Constructs the filename for an entity's decision metadata file.
 * Format: .<schema>.<entity-slug>.json
 */
export function getDecisionFileName(schemaName: string, entityName: string): string {
  const cleanSchema = (schemaName || 'dbo')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-');
  const slug = toEntitySlug(entityName);
  return `.${cleanSchema}.${slug}.json`;
}

// ─── Lookup Primary Key Helpers ──────────────────────────────────────────────

export function buildEntityLookup(entityName: string): string {
  return `@lookup:MJ: Entities.Name=${entityName}`;
}

export function buildFieldLookup(entityName: string, fieldName: string): string {
  return `@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=${entityName}&Name=${fieldName}`;
}

export function buildSettingLookup(entityName: string, settingName: string): string {
  return `@lookup:MJ: Entity Settings.EntityID=@lookup:MJ: Entities.Name=${entityName}&Name=${settingName}`;
}

export function buildAppEntityLookup(appName: string, entityName: string): string {
  return `@lookup:MJ: Application Entities.ApplicationID=@lookup:MJ: Applications.Name=${appName}&EntityID=@lookup:MJ: Entities.Name=${entityName}`;
}

// ─── Record Shapes ───────────────────────────────────────────────────────────

export interface FieldDecisionRecord {
  fields: {
    Name: string;
    DisplayName?: string;
    Category?: string | null;
    GeneratedFormSection?: string | null;
    ExtendedType?: EntityFieldExtendedType | null;
    CodeType?: string | null;
    DefaultInView?: boolean;
    IncludeInUserSearchAPI?: boolean;
    UserSearchPredicateAPI?: string | null;
    IsNameField?: boolean;
    FullTextSearchEnabled?: boolean;
    [key: string]: unknown;
  };
  _comments?: string[];
  primaryKey: { ID: string };
  sync?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SettingDecisionRecord {
  fields: {
    Name: string;
    Value: Record<string, unknown>;
    [key: string]: unknown;
  };
  _comments?: string[];
  primaryKey: { ID: string };
  sync?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ApplicationEntityDecisionRecord {
  fields: {
    Application?: string;
    Entity?: string;
    DefaultForNewUser?: boolean;
    AutoUpdateDefaultForNewUser?: boolean;
    [key: string]: unknown;
  };
  _comments?: string[];
  primaryKey: { ID: string };
  sync?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DecisionRecord {
  _comments?: string[];
  fields: {
    Name: string;
    Icon?: string | null;
    AllowUserSearchAPI?: boolean;
    FullTextSearchEnabled?: boolean;
    SupportsGeoCoding?: boolean;
    [key: string]: unknown;
  };
  relatedEntities?: {
    'MJ: Entity Fields'?: FieldDecisionRecord[];
    'MJ: Entity Settings'?: SettingDecisionRecord[];
    'MJ: Application Entities'?: ApplicationEntityDecisionRecord[];
    [key: string]: unknown;
  };
  primaryKey: { ID: string };
  sync?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Normalization & Formatting ──────────────────────────────────────────────

const KNOWN_RECORD_KEYS = ['_comments', 'fields', 'relatedEntities', 'primaryKey', 'sync', '__mj_sync_notes', 'deleteRecord'];

const FIELD_ORDER_PREFERENCE = [
  'Name',
  'DisplayName',
  'Description',
  'Category',
  'GeneratedFormSection',
  'ExtendedType',
  'CodeType',
  'DefaultInView',
  'IncludeInUserSearchAPI',
  'UserSearchPredicateAPI',
  'IsNameField',
  'FullTextSearchEnabled'
];

const ENTITY_ORDER_PREFERENCE = [
  'Name',
  'Description',
  'Icon',
  'AllowUserSearchAPI',
  'FullTextSearchEnabled',
  'SupportsGeoCoding'
];

function sortObjectKeysByOrder(obj: Record<string, unknown>, preferredOrder: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const remainingKeys = Object.keys(obj).filter(k => !preferredOrder.includes(k)).sort(ordinalCompare);

  for (const key of preferredOrder) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }
  for (const key of remainingKeys) {
    result[key] = obj[key];
  }
  return result;
}

function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Preserve _comments first if present
  if (record._comments !== undefined) {
    result._comments = record._comments;
  }

  // Known keys in canonical order
  for (const key of KNOWN_RECORD_KEYS) {
    if (key === '_comments') continue; // handled above
    if (record[key] !== undefined) {
      if (key === 'fields' && record.fields && typeof record.fields === 'object') {
        const fieldsObj = record.fields as Record<string, unknown>;
        // If it's a field record
        if ('DisplayName' in fieldsObj || 'Category' in fieldsObj || 'ExtendedType' in fieldsObj) {
          result.fields = sortObjectKeysByOrder(fieldsObj, FIELD_ORDER_PREFERENCE);
        } else if ('Icon' in fieldsObj || 'AllowUserSearchAPI' in fieldsObj) {
          result.fields = sortObjectKeysByOrder(fieldsObj, ENTITY_ORDER_PREFERENCE);
        } else if ('Value' in fieldsObj && typeof fieldsObj.Value === 'object' && fieldsObj.Value !== null) {
          result.fields = {
            Name: fieldsObj.Name,
            Value: JSON.parse(canonicalJSONStringify(fieldsObj.Value))
          };
        } else {
          result.fields = fieldsObj;
        }
      } else if (key === 'relatedEntities' && record.relatedEntities && typeof record.relatedEntities === 'object') {
        const rel = record.relatedEntities as Record<string, unknown>;
        const normalizedRel: Record<string, unknown> = {};
        const relKeys = Object.keys(rel).sort((a, b) => {
          // Standard MemberJunction child order
          const standardOrder = ['MJ: Entity Fields', 'MJ: Entity Settings', 'MJ: Application Entities'];
          const idxA = standardOrder.indexOf(a);
          const idxB = standardOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return ordinalCompare(a, b);
        });

        for (const relKey of relKeys) {
          const list = rel[relKey];
          if (Array.isArray(list)) {
            normalizedRel[relKey] = list.map(item => normalizeRecord(item as Record<string, unknown>));
          } else {
            normalizedRel[relKey] = list;
          }
        }
        result.relatedEntities = normalizedRel;
      } else {
        result[key] = record[key];
      }
    }
  }

  // Any other unknown top-level keys
  for (const key of Object.keys(record)) {
    if (!KNOWN_RECORD_KEYS.includes(key) && result[key] === undefined) {
      result[key] = record[key];
    }
  }

  return result;
}

/**
 * Formats decision record(s) into deterministic JSON byte-identical to JsonWriteHelper.
 * 2-space indentation, no trailing newline.
 */
export function formatDecisionRecordData(data: DecisionRecord | DecisionRecord[]): string {
  const normalized = Array.isArray(data)
    ? data.map(item => normalizeRecord(item as unknown as Record<string, unknown>))
    : normalizeRecord(data as unknown as Record<string, unknown>);

  return JSON.stringify(normalized, null, 2);
}

/**
 * Writes content to a file only if the content differs from the existing file on disk.
 * Preserves mtime when content is unchanged.
 * Returns true if file was written, false if unchanged.
 */
export async function writeIfChanged(filePath: string, content: string): Promise<boolean> {
  try {
    if (await fs.pathExists(filePath)) {
      const existing = await fs.readFile(filePath, 'utf8');
      if (existing === content) {
        return false;
      }
    }
  } catch {
    // If read fails for any reason, proceed to write
  }

  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
  return true;
}

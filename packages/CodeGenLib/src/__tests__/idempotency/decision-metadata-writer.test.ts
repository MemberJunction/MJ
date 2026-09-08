import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { DecisionMetadataWriter } from '../../Database/decision-metadata-writer';
import {
   formatDecisionRecordData,
   buildEntityLookup,
   buildFieldLookup,
   buildSettingLookup,
   buildAppEntityLookup,
   writeIfChanged,
   DecisionRecord
} from '../../Database/decision-metadata-format';
import { configInfo } from '../../Config/config';
import { JsonWriteHelper } from '../../../../MetadataSync/src/lib/json-write-helper';

describe('T14 — Decision Metadata Writer & Formatter (C7, §3.5)', () => {
   let tmpDir: string;
   let origMetaDir: string | undefined;
   let origDecisionConfig: any;

   beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-decision-test-'));
      origMetaDir = configInfo.metadataDirectory;
      origDecisionConfig = configInfo.decisionMetadata;

      // Create fake metadata root with entities/.mj-sync.json
      const entitiesDir = path.join(tmpDir, 'entities');
      await fs.ensureDir(entitiesDir);
      await fs.writeJson(path.join(entitiesDir, '.mj-sync.json'), { entity: 'MJ: Entities' });

      configInfo.metadataDirectory = tmpDir;
      configInfo.decisionMetadata = { enabled: true };

      DecisionMetadataWriter.Instance.clear();
   });

   afterEach(async () => {
      configInfo.metadataDirectory = origMetaDir;
      configInfo.decisionMetadata = origDecisionConfig;
      await fs.remove(tmpDir);
   });

   it('shared formatter produces byte-identical output to JsonWriteHelper', async () => {
      const record: DecisionRecord = {
         _comments: ['Test comment 1', 'Test comment 2'],
         fields: {
            Name: 'MJ: Entities',
            Icon: 'fa-solid fa-table',
            AllowUserSearchAPI: true,
            SupportsGeoCoding: false
         },
         relatedEntities: {
            'MJ: Entity Fields': [
               {
                  fields: {
                     Name: 'SubtypeSelector',
                     DisplayName: 'Subtype Selector',
                     Category: 'Subtype Configuration',
                     GeneratedFormSection: 'Category',
                     ExtendedType: 'JSON',
                     CodeType: null,
                     DefaultInView: false,
                     IncludeInUserSearchAPI: false,
                     UserSearchPredicateAPI: 'Contains',
                     IsNameField: false
                  },
                  primaryKey: {
                     ID: buildFieldLookup('MJ: Entities', 'SubtypeSelector')
                  }
               }
            ],
            'MJ: Entity Settings': [
               {
                  fields: {
                     Name: 'FieldCategoryInfo',
                     Value: {
                        General: { description: 'General fields', icon: 'fa-solid fa-folder' }
                     }
                  },
                  primaryKey: {
                     ID: buildSettingLookup('MJ: Entities', 'FieldCategoryInfo')
                  }
               }
            ]
         },
         primaryKey: {
            ID: buildEntityLookup('MJ: Entities')
         }
      };

      const ourFormatted = formatDecisionRecordData([record]);

      // Write with JsonWriteHelper to compare
      const helperFilePath = path.join(tmpDir, 'helper-output.json');
      await JsonWriteHelper.writeOrderedRecordData(helperFilePath, [record as any]);
      const helperContent = await fs.readFile(helperFilePath, 'utf8');

      expect(ourFormatted).toBe(helperContent);
      expect(ourFormatted.endsWith('\n')).toBe(false); // No trailing newline
   });

   it('lookup keys match exact required formats', () => {
      expect(buildEntityLookup('MJ: Entities')).toBe('@lookup:MJ: Entities.Name=MJ: Entities');
      expect(buildFieldLookup('MJ: Entities', 'SubtypeSelector')).toBe(
         '@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=MJ: Entities&Name=SubtypeSelector'
      );
      expect(buildSettingLookup('MJ: Entities', 'FieldCategoryInfo')).toBe(
         '@lookup:MJ: Entity Settings.EntityID=@lookup:MJ: Entities.Name=MJ: Entities&Name=FieldCategoryInfo'
      );
      expect(buildAppEntityLookup('Core App', 'Customer')).toBe(
         '@lookup:MJ: Application Entities.ApplicationID=@lookup:MJ: Applications.Name=Core App&EntityID=@lookup:MJ: Entities.Name=Customer'
      );
   });

   it('drops disallowed columns and Description with counter increment', () => {
      const writer = DecisionMetadataWriter.Instance;

      writer.recordFieldDecision('Customer', 'Notes', 'Description', 'A description');
      writer.recordFieldDecision('Customer', 'Notes', 'Type', 'nvarchar');
      writer.recordFieldDecision('Customer', 'Notes', 'Length', 500);
      writer.recordFieldDecision('Customer', 'Notes', 'Sequence', 3);
      writer.recordFieldDecision('Customer', 'Notes', 'AllowsNull', true);

      expect(writer.droppedDisallowedColumnCount).toBe(5);

      // Permitted decision column
      writer.recordFieldDecision('Customer', 'Notes', 'DisplayName', 'Special Notes');
      expect(writer.droppedDisallowedColumnCount).toBe(5);
   });

   it('flushEntity writes decision file with deterministic name and structure', async () => {
      const writer = DecisionMetadataWriter.Instance;

      writer.recordEntityDecision('MJ: Entities', 'Icon', 'fa-solid fa-table');
      writer.recordFieldDecision('MJ: Entities', 'SubtypeSelector', 'DisplayName', 'Subtype Selector');
      writer.recordFieldDecision('MJ: Entities', 'SubtypeSelector', 'Category', 'Subtype Configuration');
      writer.recordFieldDecision('MJ: Entities', 'SubtypeSelector', 'ExtendedType', 'JSON');
      writer.recordFieldDecision('MJ: Entities', 'SubtypeSelector', 'CodeType', null);
      writer.recordEntitySetting('MJ: Entities', 'FieldCategoryInfo', {
         General: { icon: 'fa-folder' }
      });

      const entity = {
         Name: 'MJ: Entities',
         SchemaName: '__mj',
         Fields: [
            { Name: 'ID', Sequence: 1 },
            { Name: 'Name', Sequence: 2 },
            { Name: 'SubtypeSelector', Sequence: 3 }
         ]
      };

      await writer.flushEntity(entity);

      expect(writer.recordsWrittenCount).toBe(1);

      const filePath = path.join(tmpDir, 'entities', 'decisions', '.__mj.mj-entities.json');
      expect(await fs.pathExists(filePath)).toBe(true);

      const content = await fs.readJson(filePath);
      expect(content[0].fields.Name).toBe('MJ: Entities');
      expect(content[0].fields.Icon).toBe('fa-solid fa-table');
      expect(content[0].relatedEntities['MJ: Entity Fields'][0].fields.DisplayName).toBe('Subtype Selector');
      expect(content[0].relatedEntities['MJ: Entity Fields'][0].fields.CodeType).toBeNull();
   });

   it('flushEntity removes dropped/renamed fields from existing decision file', async () => {
      const writer = DecisionMetadataWriter.Instance;
      const decisionsDir = path.join(tmpDir, 'entities', 'decisions');
      await fs.ensureDir(decisionsDir);

      const existingRecord: DecisionRecord = {
         fields: { Name: 'Customer' },
         primaryKey: { ID: buildEntityLookup('Customer') },
         relatedEntities: {
            'MJ: Entity Fields': [
               {
                  fields: { Name: 'ActiveStatus', Category: 'Status' },
                  primaryKey: { ID: buildFieldLookup('Customer', 'ActiveStatus') }
               },
               {
                  fields: { Name: 'DroppedColumn', Category: 'Obsolete' },
                  primaryKey: { ID: buildFieldLookup('Customer', 'DroppedColumn') }
               }
            ]
         }
      };

      const filePath = path.join(decisionsDir, '.dbo.customer.json');
      await fs.writeJson(filePath, [existingRecord]);

      // Current live schema only has ActiveStatus, not DroppedColumn
      const entity = {
         Name: 'Customer',
         SchemaName: 'dbo',
         Fields: [{ Name: 'ActiveStatus', Sequence: 1 }]
      };

      await writer.flushEntity(entity);

      expect(writer.recordsRemovedCount).toBe(1);

      const updated = await fs.readJson(filePath);
      const fieldNames = updated[0].relatedEntities['MJ: Entity Fields'].map((f: any) => f.fields.Name);
      expect(fieldNames).toEqual(['ActiveStatus']);
      expect(fieldNames).not.toContain('DroppedColumn');
   });

   it('writeIfChanged leaves mtime untouched when content has not changed', async () => {
      const filePath = path.join(tmpDir, 'unchanged-test.json');
      const content = '{\n  "test": true\n}';

      await fs.writeFile(filePath, content, 'utf8');
      const origStat = await fs.stat(filePath);

      // Small delay to ensure any mtime change would be detectable
      await new Promise(res => setTimeout(res, 50));

      const written = await writeIfChanged(filePath, content);
      expect(written).toBe(false);

      const newStat = await fs.stat(filePath);
      expect(newStat.mtimeMs).toBe(origStat.mtimeMs);
   });

   it('a run that decides nothing writes nothing when no file exists', async () => {
      const writer = DecisionMetadataWriter.Instance;
      const entity = {
         Name: 'UnchangedEntity',
         SchemaName: 'dbo',
         Fields: [{ Name: 'ID', Sequence: 1 }]
      };

      await writer.flushEntity(entity);

      expect(writer.recordsWrittenCount).toBe(0);
      const filePath = path.join(tmpDir, 'entities', 'decisions', '.dbo.unchangedentity.json');
      expect(await fs.pathExists(filePath)).toBe(false);
   });

   it('skips writing and increments recordsSkippedCount when decision metadata is disabled', async () => {
      configInfo.decisionMetadata = { enabled: false };
      const writer = DecisionMetadataWriter.Instance;

      writer.recordFieldDecision('Customer', 'Notes', 'Category', 'Details');

      const entity = {
         Name: 'Customer',
         SchemaName: 'dbo',
         Fields: [{ Name: 'Notes', Sequence: 1 }]
      };

      await writer.flushEntity(entity);

      expect(writer.recordsWrittenCount).toBe(0);
      expect(writer.recordsSkippedCount).toBeGreaterThan(0);
   });
});

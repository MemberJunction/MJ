/**
 * Tests for the EntityNameScanner, HtmlEntityNameScanner, and MetadataNameScanner.
 *
 * These tests exercise the pure `scanXxxFile` and `fixXxxFile` functions directly,
 * avoiding filesystem/glob dependencies by providing source text inline.
 */
import { describe, it, expect } from 'vitest';
import { scanFile, fixFile } from '../EntityNameScanner/EntityNameScanner';
import { scanHtmlFile, fixHtmlFile } from '../EntityNameScanner/HtmlEntityNameScanner';
import { scanMetadataFile, fixMetadataFile } from '../EntityNameScanner/MetadataNameScanner';

// ---------------------------------------------------------------------------
// Shared rename map used across all tests
// ---------------------------------------------------------------------------
function makeRenameMap(): Map<string, string> {
    const map = new Map<string, string>();
    map.set('Actions', 'MJ: Actions');
    map.set('Entities', 'MJ: Entities');
    map.set('Users', 'MJ: Users');
    map.set('Templates', 'MJ: Templates');
    map.set('Conversations', 'MJ: Conversations');
    map.set('Queries', 'MJ: Queries');
    map.set('Libraries', 'MJ: Libraries');
    map.set('Lists', 'MJ: Lists');
    map.set('Roles', 'MJ: Roles');
    map.set('AI Vendors', 'MJ: AI Vendors');
    map.set('Dashboards', 'MJ: Dashboards');
    return map;
}

// ============================================================================
// TypeScript EntityNameScanner
// ============================================================================
describe('EntityNameScanner (TypeScript)', () => {
    const renameMap = makeRenameMap();

    // ---- Method call patterns ----

    describe('Method call detection', () => {
        it('should detect GetEntityObject with old entity name', () => {
            const src = `const e = md.GetEntityObject<ActionEntity>('Actions');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Actions');
            expect(findings[0].NewName).toBe('MJ: Actions');
            expect(findings[0].PatternKind).toBe('GetEntityObject');
        });

        it('should detect OpenEntityRecord with old entity name', () => {
            const src = `this.OpenEntityRecord('Entities', someId);`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Entities');
            expect(findings[0].NewName).toBe('MJ: Entities');
            expect(findings[0].PatternKind).toBe('OpenEntityRecord');
        });

        it('should detect EntityByName with old entity name', () => {
            const src = `const c = md.EntityByName('Conversations');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Conversations');
            expect(findings[0].NewName).toBe('MJ: Conversations');
            expect(findings[0].PatternKind).toBe('EntityNameMethod');
        });

        it('should detect navigateToEntity with old entity name', () => {
            const src = `this.navigateToEntity('Libraries', libId);`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Libraries');
            expect(findings[0].PatternKind).toBe('EntityNameMethod');
        });

        it('should NOT flag already-prefixed names', () => {
            const src = `const e = md.GetEntityObject<ActionEntity>('MJ: Actions');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(0);
        });

        it('should NOT flag variable arguments to entity methods', () => {
            const src = `const e = md.GetEntityObject(entityName);`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });

    // ---- Property assignment patterns ----

    describe('EntityName property assignment', () => {
        it('should detect EntityName property with old name', () => {
            const src = `const config = { EntityName: 'Actions' };`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Actions');
            expect(findings[0].PatternKind).toBe('EntityNameProperty');
        });

        it('should NOT flag non-entity property assignments', () => {
            const src = `const config = { SomeProp: 'Actions' };`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });

    // ---- Name comparison patterns ----

    describe('Comparison patterns', () => {
        it('should detect .Entity === "OldName"', () => {
            const src = `if (item.Entity === 'Actions') { }`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].PatternKind).toBe('NameComparison');
        });

        it('should detect .LinkedEntity === "OldName"', () => {
            const src = `if (this.LinkedEntity === 'Queries') { }`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].PatternKind).toBe('NameComparison');
        });

        it('should detect .EntityInfo.Name === "OldName" (Case 5)', () => {
            const src = `const t = this.PendingRecords.filter(p => p.entityObject.EntityInfo.Name === 'Templates');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Templates');
            expect(findings[0].PatternKind).toBe('NameComparison');
        });

        it('should detect .Entities.find(e => e.Name === "OldName") (Case 6)', () => {
            const src = `const e = md.Entities.find(e => e.Name === 'Entities');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Entities');
            expect(findings[0].PatternKind).toBe('NameComparison');
        });

        it('should detect .Entities.filter(e => e.Name !== "OldName") (Case 6)', () => {
            const src = `const filtered = md.Entities.filter(e => e.Name !== 'Templates');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Templates');
        });

        it('should NOT flag bare .Name === on non-entity objects (false positive prevention)', () => {
            // This is the Action params false positive case: p.Name === 'Users'
            const src = `const match = params.find(p => p.Name === 'Users');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(0);
        });

        it('should NOT flag ResourceType .Name comparisons (false positive prevention)', () => {
            const src = `const rt = ResourceTypes.find(rt => rt.Name === 'Dashboards');`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(0);
        });

        it('should NOT flag random .Name comparisons', () => {
            const src = `if (user.Name === 'Actions') doSomething();`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });

    // ---- RegisterClass patterns ----

    describe('RegisterClass decorator', () => {
        it('should detect @RegisterClass(BaseEntity, "OldName")', () => {
            const src = `
@RegisterClass(BaseEntity, 'Actions')
class ActionEntity extends BaseEntity { }
`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].PatternKind).toBe('RegisterClass');
        });

        it('should also flag @RegisterClass with non-BaseEntity first arg', () => {
            // The scanner catches ALL @RegisterClass decorators, not just BaseEntity ones.
            // If an entity was renamed, any RegisterClass referencing the old name should update.
            const src = `
@RegisterClass(SomeOtherBase, 'Actions')
class ActionComponent { }
`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].PatternKind).toBe('RegisterClass');
        });
    });

    // ---- Multiple findings in one file ----

    describe('Multiple findings', () => {
        it('should find multiple entity names in one file', () => {
            const src = `
const e1 = md.GetEntityObject<ActionEntity>('Actions');
const e2 = md.EntityByName('Users');
this.navigateToEntity('Templates', id);
`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(3);
            expect(findings.map(f => f.OldName).sort()).toEqual(['Actions', 'Templates', 'Users']);
        });
    });

    // ---- Fixer ----

    describe('fixFile', () => {
        it('should replace old names with new names at correct positions', () => {
            const src = `const e = md.GetEntityObject<ActionEntity>('Actions');`;
            const findings = scanFile('test.ts', src, renameMap);
            const fixed = fixFile(src, findings);
            expect(fixed).toContain("'MJ: Actions'");
            expect(fixed).not.toContain("'Actions'");
        });

        it('should handle multiple fixes without corrupting offsets', () => {
            const src = `
const e1 = md.GetEntityObject<ActionEntity>('Actions');
const e2 = md.EntityByName('Users');
`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(2);

            const fixed = fixFile(src, findings);
            expect(fixed).toContain("'MJ: Actions'");
            expect(fixed).toContain("'MJ: Users'");
            // Original old names should be gone
            expect(fixed).not.toMatch(/'Actions'/);
            expect(fixed).not.toMatch(/'Users'/);
        });

        it('should preserve surrounding code', () => {
            const src = `const x = md.GetEntityObject<ActionEntity>('Actions'); // comment`;
            const findings = scanFile('test.ts', src, renameMap);
            const fixed = fixFile(src, findings);
            expect(fixed).toBe(`const x = md.GetEntityObject<ActionEntity>('MJ: Actions'); // comment`);
        });

        it('should preserve double-quote style', () => {
            const src = `const x = md.EntityByName("Users");`;
            const findings = scanFile('test.ts', src, renameMap);
            const fixed = fixFile(src, findings);
            expect(fixed).toContain('"MJ: Users"');
        });
    });

    // ---- Quick-check optimization ----

    describe('Quick-check optimization', () => {
        it('should return empty for files with no matching strings', () => {
            const src = `const x = 42; function foo() { return 'hello'; }`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });
});

// ============================================================================
// HTML EntityNameScanner
// ============================================================================
describe('HtmlEntityNameScanner', () => {
    const renameMap = makeRenameMap();

    describe('Method call detection in templates', () => {
        it('should detect navigateToEntity in (click) binding', () => {
            const src = `<div (click)="navigateToEntity('Actions', item.ID)">Click</div>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Actions');
            expect(findings[0].NewName).toBe('MJ: Actions');
        });

        it('should detect OpenEntityRecord in template', () => {
            const src = `<a (click)="OpenEntityRecord('Entities', record.ID)">Open</a>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Entities');
        });

        it('should detect openEntityRecord (lowercase)', () => {
            const src = `<a (click)="openEntityRecord('Users', id)">Open</a>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Users');
        });

        it('should detect RowsEntityName attribute', () => {
            const src = `<mj-grid RowsEntityName="Users"></mj-grid>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Users');
        });

        it('should detect JoinEntityName attribute', () => {
            const src = `<mj-grid JoinEntityName="Roles"></mj-grid>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Roles');
        });

        it('should NOT flag already-prefixed names', () => {
            const src = `<div (click)="navigateToEntity('MJ: Actions', item.ID)">Click</div>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });

    describe('fixHtmlFile', () => {
        it('should replace old names in method calls', () => {
            const src = `<div (click)="navigateToEntity('Actions', item.ID)">Click</div>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            const fixed = fixHtmlFile(src, findings);
            expect(fixed).toContain("navigateToEntity('MJ: Actions'");
        });

        it('should replace old names in attribute values', () => {
            const src = `<mj-grid RowsEntityName="Users"></mj-grid>`;
            const findings = scanHtmlFile('test.html', src, renameMap);
            const fixed = fixHtmlFile(src, findings);
            expect(fixed).toContain('RowsEntityName="MJ: Users"');
        });
    });
});

// ============================================================================
// Metadata EntityNameScanner
// ============================================================================
describe('MetadataNameScanner', () => {
    const renameMap = makeRenameMap();

    describe('@lookup: directive detection', () => {
        it('should detect @lookup: entity name', () => {
            const src = JSON.stringify({
                fields: {
                    EntityID: '@lookup:Entities.ID=Dashboards'
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            // Should find 'Entities' as the lookup entity name
            const entityFinding = findings.find(f => f.OldName === 'Entities');
            expect(entityFinding).toBeDefined();
            expect(entityFinding!.NewName).toBe('MJ: Entities');
        });

        it('should detect @lookup: value when lookup entity is Entities', () => {
            const src = JSON.stringify({
                fields: {
                    EntityID: '@lookup:MJ: Entities.Name=Dashboards'
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            // Should find 'Dashboards' as the lookup value
            const dashboardFinding = findings.find(f => f.OldName === 'Dashboards');
            expect(dashboardFinding).toBeDefined();
        });

        it('should NOT flag already-prefixed lookup entity names', () => {
            const src = JSON.stringify({
                fields: {
                    EntityID: '@lookup:MJ: Entities.Name=MJ: Dashboards'
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });

    describe('Folder config detection', () => {
        it('should detect entity field in .mj-sync.json', () => {
            const src = JSON.stringify({
                entity: 'Dashboards',
                primaryKey: { ID: '123' }
            }, null, 2);
            const findings = scanMetadataFile('.mj-sync.json', src, renameMap);
            const finding = findings.find(f => f.OldName === 'Dashboards');
            expect(finding).toBeDefined();
        });

        it('should detect entityName field in config', () => {
            const src = JSON.stringify({
                entityName: 'Actions',
                someProp: 'value'
            }, null, 2);
            const findings = scanMetadataFile('.mj-folder.json', src, renameMap);
            const finding = findings.find(f => f.OldName === 'Actions');
            expect(finding).toBeDefined();
        });
    });

    describe('relatedEntities key detection', () => {
        it('should detect old entity name as relatedEntities key', () => {
            const src = JSON.stringify({
                fields: { Name: 'Test' },
                relatedEntities: {
                    'Actions': [],
                    'MJ: Templates': []
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            const finding = findings.find(f => f.OldName === 'Actions');
            expect(finding).toBeDefined();
        });

        it('should NOT flag already-prefixed relatedEntities keys', () => {
            const src = JSON.stringify({
                relatedEntities: {
                    'MJ: Actions': [],
                    'MJ: Templates': []
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });

    describe('fields.Name in Entities folder', () => {
        it('should detect old entity name in Name field when isEntitiesFolder=true', () => {
            const src = JSON.stringify({
                fields: {
                    Name: 'Actions',
                    Description: 'Some description'
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap, true);
            const finding = findings.find(f => f.OldName === 'Actions');
            expect(finding).toBeDefined();
        });

        it('should NOT detect fields.Name when isEntitiesFolder=false', () => {
            const src = JSON.stringify({
                fields: {
                    Name: 'Actions',
                    Description: 'Some description'
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap, false);
            const nameFinding = findings.find(f => f.OldName === 'Actions' && f.PatternKind === 'FieldsName');
            expect(nameFinding).toBeUndefined();
        });
    });

    describe('fixMetadataFile', () => {
        it('should replace old names in lookup directives', () => {
            const src = JSON.stringify({
                fields: {
                    EntityID: '@lookup:Entities.ID=Dashboards'
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            const fixed = fixMetadataFile(src, findings);
            expect(fixed).toContain('MJ: Entities');
        });

        it('should replace old names in relatedEntities keys', () => {
            const src = JSON.stringify({
                relatedEntities: {
                    'Actions': [{ id: '1' }]
                }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            const fixed = fixMetadataFile(src, findings);
            expect(fixed).toContain('"MJ: Actions"');
            expect(fixed).not.toMatch(/"Actions"/);
        });
    });

    describe('Quick-check optimization', () => {
        it('should return empty for files with no matching strings', () => {
            const src = JSON.stringify({
                fields: { Name: 'SomethingNotInMap', Value: 42 }
            }, null, 2);
            const findings = scanMetadataFile('test.json', src, renameMap);
            expect(findings).toHaveLength(0);
        });
    });
});

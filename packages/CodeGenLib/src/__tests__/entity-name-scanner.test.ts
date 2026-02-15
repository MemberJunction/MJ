/**
 * Tests for the EntityNameScanner, HtmlEntityNameScanner, and MetadataNameScanner.
 *
 * These tests exercise the pure `scanXxxFile` and `fixXxxFile` functions directly,
 * avoiding filesystem/glob dependencies by providing source text inline.
 *
 * Tests cover all three replacement strategies:
 * 1. Regex-based class name renames (ActionEntity → MJActionEntity)
 * 2. Regex-based multi-word entity name renames ('AI Models' → 'MJ: AI Models')
 * 3. AST-based single-word entity name renames ('Actions' → 'MJ: Actions')
 */
import { describe, it, expect } from 'vitest';
import {
    scanFile,
    fixFile,
    buildClassRenameRules,
    buildMultiWordNameRules,
    loadEmbeddedRenameMap,
    ENTITY_RENAME_MAP,
    type RegexRule,
    type MultiWordNameRule,
} from '../EntityNameScanner/EntityNameScanner';
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

// Small set of class rename rules for testing
function makeClassRules(): RegexRule[] {
    return buildClassRenameRules([
        {
            oldName: 'Actions', newName: 'MJ: Actions', nameChanged: true,
            oldClassName: 'Action', newClassName: 'MJAction', classNameChanged: true,
            oldCodeName: 'Actions', newCodeName: 'MJActions', codeNameChanged: true,
        },
        {
            oldName: 'AI Models', newName: 'MJ: AI Models', nameChanged: true,
            oldClassName: 'AIModel', newClassName: 'MJAIModel', classNameChanged: true,
            oldCodeName: 'AIModels', newCodeName: 'MJAIModels', codeNameChanged: true,
        },
        {
            oldName: 'Action Params', newName: 'MJ: Action Params', nameChanged: true,
            oldClassName: 'ActionParam', newClassName: 'MJActionParam', classNameChanged: true,
            oldCodeName: 'ActionParams', newCodeName: 'MJActionParams', codeNameChanged: true,
        },
        {
            oldName: 'Action Libraries', newName: 'MJ: Action Libraries', nameChanged: true,
            oldClassName: 'ActionLibrary', newClassName: 'MJActionLibrary', classNameChanged: true,
            oldCodeName: 'ActionLibraries', newCodeName: 'MJActionLibraries', codeNameChanged: true,
        },
        {
            oldName: 'Action Result Codes', newName: 'MJ: Action Result Codes', nameChanged: true,
            oldClassName: 'ActionResultCode', newClassName: 'MJActionResultCode', classNameChanged: true,
            oldCodeName: 'ActionResultCodes', newCodeName: 'MJActionResultCodes', codeNameChanged: true,
        },
        {
            oldName: 'Users', newName: 'MJ: Users', nameChanged: true,
            oldClassName: 'User', newClassName: 'MJUser', classNameChanged: true,
            oldCodeName: 'Users', newCodeName: 'MJUsers', codeNameChanged: true,
        },
        {
            oldName: 'Entity Fields', newName: 'MJ: Entity Fields', nameChanged: true,
            oldClassName: 'EntityField', newClassName: 'MJEntityField', classNameChanged: true,
            oldCodeName: 'EntityFields', newCodeName: 'MJEntityFields', codeNameChanged: true,
        },
    ]);
}

// Small set of multi-word entity name rules for testing
function makeMultiWordRules(): MultiWordNameRule[] {
    return buildMultiWordNameRules([
        {
            oldName: 'AI Models', newName: 'MJ: AI Models', nameChanged: true,
            oldClassName: 'AIModel', newClassName: 'MJAIModel', classNameChanged: true,
            oldCodeName: 'AIModels', newCodeName: 'MJAIModels', codeNameChanged: true,
        },
        {
            oldName: 'Action Params', newName: 'MJ: Action Params', nameChanged: true,
            oldClassName: 'ActionParam', newClassName: 'MJActionParam', classNameChanged: true,
            oldCodeName: 'ActionParams', newCodeName: 'MJActionParams', codeNameChanged: true,
        },
        {
            oldName: 'AI Vendors', newName: 'MJ: AI Vendors', nameChanged: true,
            oldClassName: 'AIVendor', newClassName: 'MJAIVendor', classNameChanged: true,
            oldCodeName: 'AIVendors', newCodeName: 'MJAIVendors', codeNameChanged: true,
        },
        {
            oldName: 'Entity Fields', newName: 'MJ: Entity Fields', nameChanged: true,
            oldClassName: 'EntityField', newClassName: 'MJEntityField', classNameChanged: true,
            oldCodeName: 'EntityFields', newCodeName: 'MJEntityFields', codeNameChanged: true,
        },
    ]);
}

// ============================================================================
// TypeScript EntityNameScanner — Strategy 3: AST single-word entity names
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

        it('should detect GetEntityObjectByRecord', () => {
            const src = `const e = md.GetEntityObjectByRecord('Users', record);`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
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

        it('should detect item.EntityName = assignment', () => {
            const src = `item.EntityName = 'Users';`;
            const findings = scanFile('test.ts', src, renameMap);
            expect(findings).toHaveLength(1);
            expect(findings[0].OldName).toBe('Users');
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

    describe('fixFile (AST-based)', () => {
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
// Strategy 1: Class Name Renames (regex-based)
// ============================================================================
describe('EntityNameScanner — Class Name Renames', () => {
    const renameMap = makeRenameMap();
    const classRules = makeClassRules();

    describe('Class name detection', () => {
        it('should detect import of old class name', () => {
            const src = `import { ActionEntity, ActionParamEntity } from '@memberjunction/core-entities';`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            expect(classFindings.length).toBeGreaterThanOrEqual(2);
            expect(classFindings.map(f => f.OldName)).toContain('ActionEntity');
            expect(classFindings.map(f => f.OldName)).toContain('ActionParamEntity');
        });

        it('should detect class name in type annotation', () => {
            const src = `private _resultCodes: ActionResultCodeEntity[] = null;`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            expect(classFindings).toHaveLength(1);
            expect(classFindings[0].OldName).toBe('ActionResultCodeEntity');
            expect(classFindings[0].NewName).toBe('MJActionResultCodeEntity');
        });

        it('should detect class name in extends clause', () => {
            const src = `export class ActionEntityExtended extends ActionEntity { }`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            // Should find both: the class name reference and the extends reference
            expect(classFindings.length).toBeGreaterThanOrEqual(1);
            expect(classFindings.some(f => f.OldName === 'ActionEntity')).toBe(true);
        });

        it('should detect class name in generic type parameter', () => {
            const src = `const e = await md.GetEntityObject<AIModelEntity>('MJ: AI Models');`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            expect(classFindings).toHaveLength(1);
            expect(classFindings[0].OldName).toBe('AIModelEntity');
            expect(classFindings[0].NewName).toBe('MJAIModelEntity');
        });

        it('should detect Schema suffix variants', () => {
            const src = `const schema = AIModelSchema;`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            expect(classFindings).toHaveLength(1);
            expect(classFindings[0].OldName).toBe('AIModelSchema');
            expect(classFindings[0].NewName).toBe('MJAIModelSchema');
        });

        it('should detect EntityType suffix variants', () => {
            const src = `type MyType = ActionEntityType;`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            expect(classFindings).toHaveLength(1);
            expect(classFindings[0].OldName).toBe('ActionEntityType');
            expect(classFindings[0].NewName).toBe('MJActionEntityType');
        });

        it('should NOT rename class names inside file path strings', () => {
            // The negative lookbehind for / and . prevents matching inside paths
            const src = `import { X } from './custom/ActionEntity';`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            // The path portion should not be renamed (lookbehind (?<![/.]) )
            expect(classFindings.every(f => {
                const charBefore = src[f.StartPos - 1];
                return charBefore !== '/' && charBefore !== '.';
            })).toBe(true);
        });

        it('should NOT rename already-prefixed class names', () => {
            const src = `import { MJActionEntity } from '@memberjunction/core-entities';`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
            // MJActionEntity should not match ActionEntity rule because word boundary
            // won't match since MJ precedes Action
            expect(classFindings).toHaveLength(0);
        });
    });

    describe('fixFile (class names)', () => {
        it('should rename class imports correctly', () => {
            const src = `import { ActionEntity, ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const fixed = fixFile(src, findings);
            expect(fixed).toContain('MJActionEntity');
            expect(fixed).toContain('MJActionLibraryEntity');
            expect(fixed).toContain('MJActionParamEntity');
            expect(fixed).toContain('MJActionResultCodeEntity');
            expect(fixed).not.toMatch(/\bActionEntity\b/);
        });

        it('should rename class in extends clause', () => {
            const src = `export class ActionEntityExtended extends ActionEntity { }`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const fixed = fixFile(src, findings);
            expect(fixed).toContain('extends MJActionEntity');
        });

        it('should rename class in type annotations', () => {
            const src = `private _params: ActionParamEntity[] = null;`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const fixed = fixFile(src, findings);
            expect(fixed).toContain('MJActionParamEntity[]');
        });

        it('should rename generics', () => {
            const src = `const e = await md.GetEntityObject<AIModelEntity>('MJ: AI Models');`;
            const findings = scanFile('test.ts', src, renameMap, classRules);
            const fixed = fixFile(src, findings);
            expect(fixed).toContain('GetEntityObject<MJAIModelEntity>');
        });
    });
});

// ============================================================================
// Strategy 2: Multi-word Entity Name Renames (regex-based)
// ============================================================================
describe('EntityNameScanner — Multi-word Entity Names', () => {
    const renameMap = makeRenameMap();
    const multiWordRules = makeMultiWordRules();

    describe('Multi-word entity name detection', () => {
        it('should detect multi-word name in single quotes', () => {
            const src = `const r = await rv.RunView({ EntityName: 'AI Models' });`;
            const findings = scanFile('test.ts', src, renameMap, undefined, multiWordRules);
            const multiWordFindings = findings.filter(f => f.PatternKind === 'MultiWordEntityName');
            expect(multiWordFindings).toHaveLength(1);
            expect(multiWordFindings[0].OldName).toBe('AI Models');
            expect(multiWordFindings[0].NewName).toBe('MJ: AI Models');
        });

        it('should detect multi-word name in double quotes', () => {
            const src = `const r = await rv.RunView({ EntityName: "AI Vendors" });`;
            const findings = scanFile('test.ts', src, renameMap, undefined, multiWordRules);
            const multiWordFindings = findings.filter(f => f.PatternKind === 'MultiWordEntityName');
            expect(multiWordFindings).toHaveLength(1);
            expect(multiWordFindings[0].OldName).toBe('AI Vendors');
        });

        it('should detect multi-word name in backticks', () => {
            const src = 'const n = `Action Params`;';
            const findings = scanFile('test.ts', src, renameMap, undefined, multiWordRules);
            const multiWordFindings = findings.filter(f => f.PatternKind === 'MultiWordEntityName');
            expect(multiWordFindings).toHaveLength(1);
            expect(multiWordFindings[0].OldName).toBe('Action Params');
        });

        it('should NOT detect already-prefixed multi-word names', () => {
            const src = `const r = { EntityName: 'MJ: AI Models' };`;
            const findings = scanFile('test.ts', src, renameMap, undefined, multiWordRules);
            const multiWordFindings = findings.filter(f => f.PatternKind === 'MultiWordEntityName');
            expect(multiWordFindings).toHaveLength(0);
        });

        it('should detect multiple multi-word names in one file', () => {
            const src = `
const a = { EntityName: 'AI Models' };
const b = { EntityName: 'AI Vendors' };
const c = { EntityName: 'Action Params' };
`;
            const findings = scanFile('test.ts', src, renameMap, undefined, multiWordRules);
            const multiWordFindings = findings.filter(f => f.PatternKind === 'MultiWordEntityName');
            expect(multiWordFindings).toHaveLength(3);
        });
    });

    describe('fixFile (multi-word entity names)', () => {
        it('should replace multi-word names in quotes', () => {
            const src = `const r = await rv.RunView({ EntityName: 'AI Models' });`;
            const findings = scanFile('test.ts', src, renameMap, undefined, multiWordRules);
            const fixed = fixFile(src, findings);
            expect(fixed).toContain("'MJ: AI Models'");
            expect(fixed).not.toContain("'AI Models'");
        });
    });
});

// ============================================================================
// Combined: All Three Strategies Together
// ============================================================================
describe('EntityNameScanner — All Strategies Combined', () => {
    const renameMap = makeRenameMap();
    const classRules = makeClassRules();
    const multiWordRules = makeMultiWordRules();

    it('should detect class names, multi-word names, and single-word names together', () => {
        const src = `
import { ActionEntity, ActionParamEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseEntity, 'Actions')
export class ActionEntityExtended extends ActionEntity {
    async load() {
        const params = await rv.RunView<ActionParamEntity>({ EntityName: 'Action Params' });
        const users = md.GetEntityObject<UserEntity>('Users');
    }
}
`;
        const findings = scanFile('test.ts', src, renameMap, classRules, multiWordRules);

        const classFindings = findings.filter(f => f.PatternKind === 'ClassName');
        const multiWordFindings = findings.filter(f => f.PatternKind === 'MultiWordEntityName');
        const astFindings = findings.filter(f =>
            f.PatternKind !== 'ClassName' && f.PatternKind !== 'MultiWordEntityName'
        );

        expect(classFindings.length).toBeGreaterThan(0);
        expect(multiWordFindings).toHaveLength(1); // 'Action Params'
        expect(astFindings.length).toBeGreaterThan(0); // 'Actions' in @RegisterClass, 'Users' in GetEntityObject
    });

    it('should fix all three types without corrupting offsets', () => {
        const src = `import { ActionEntity, ActionParamEntity } from '@memberjunction/core-entities';
const e = md.GetEntityObject<ActionEntity>('Actions');
const p = await rv.RunView<ActionParamEntity>({ EntityName: 'Action Params' });`;
        const findings = scanFile('test.ts', src, renameMap, classRules, multiWordRules);
        const fixed = fixFile(src, findings);

        // Class names
        expect(fixed).toContain('MJActionEntity');
        expect(fixed).toContain('MJActionParamEntity');

        // Multi-word entity name
        expect(fixed).toContain("'MJ: Action Params'");

        // Single-word entity name (AST-based)
        expect(fixed).toContain("'MJ: Actions'");

        // Original code structure preserved
        expect(fixed).toContain("import {");
        expect(fixed).toContain("from '@memberjunction/core-entities'");
    });

    it('should handle the ActionEntity-Extended.ts pattern from real codebase', () => {
        // This mirrors the actual file the user pointed out
        const src = `import { BaseEntity, CodeNameFromString } from "@memberjunction/core";
import { ActionEntity, ActionLibraryEntity, ActionParamEntity, ActionResultCodeEntity } from "@memberjunction/core-entities";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseEntity, 'Actions')
export class ActionEntityExtended extends ActionEntity {
    public get CodeName(): string {
        return CodeNameFromString(this.Name);
    }

    private _resultCodes: ActionResultCodeEntity[] = null;
    public get ResultCodes(): ActionResultCodeEntity[] {
        return this._resultCodes;
    }

    private _params: ActionParamEntity[] = null;
    public get Params(): ActionParamEntity[] {
        return this._params;
    }

    private _libs: ActionLibraryEntity[] = null;
    public get Libraries(): ActionLibraryEntity[] {
        return this._libs;
    }
}`;
        const findings = scanFile('test.ts', src, renameMap, classRules, multiWordRules);
        const fixed = fixFile(src, findings);

        // Class names should be updated
        expect(fixed).toContain('import { MJActionEntity, MJActionLibraryEntity, MJActionParamEntity, MJActionResultCodeEntity }');
        expect(fixed).toContain('extends MJActionEntity');
        expect(fixed).toContain('_resultCodes: MJActionResultCodeEntity[]');
        expect(fixed).toContain('get ResultCodes(): MJActionResultCodeEntity[]');
        expect(fixed).toContain('_params: MJActionParamEntity[]');
        expect(fixed).toContain('get Params(): MJActionParamEntity[]');
        expect(fixed).toContain('_libs: MJActionLibraryEntity[]');
        expect(fixed).toContain('get Libraries(): MJActionLibraryEntity[]');

        // Entity name in @RegisterClass should be updated
        expect(fixed).toContain("@RegisterClass(BaseEntity, 'MJ: Actions')");
    });
});

// ============================================================================
// Duplicate Prevention: Multi-word names should NOT produce AST + regex overlap
// ============================================================================
describe('EntityNameScanner — Duplicate Prevention', () => {
    // Include multi-word names in BOTH renameMap and multiWordRules to simulate
    // what would happen if the full map were passed to the AST scanner.
    it('should not produce duplicate findings when multi-word name is in both maps', () => {
        const renameMap = new Map<string, string>();
        renameMap.set('AI Models', 'MJ: AI Models');  // multi-word in AST map
        renameMap.set('Actions', 'MJ: Actions');       // single-word

        const multiWordRules = makeMultiWordRules();

        const src = `const r = await rv.RunView({ EntityName: 'AI Models' });`;
        const findings = scanFile('test.ts', src, renameMap, undefined, multiWordRules);

        // Should find 'AI Models' via multi-word regex
        const multiWordFindings = findings.filter(f => f.PatternKind === 'MultiWordEntityName');
        expect(multiWordFindings).toHaveLength(1);

        // Should ALSO find via AST since it's in the renameMap — but these overlap.
        // In the real scanEntityNames() entry point, multi-word names are filtered out
        // of the AST map to prevent this. Here we verify the raw behavior.
        const allAIModelFindings = findings.filter(f => f.OldName === 'AI Models');
        // At minimum we get the regex finding; AST may or may not find it depending on context
        expect(allAIModelFindings.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT corrupt output when fixFile receives overlapping multi-word + AST findings', () => {
        // This is the critical test: pass multi-word names in BOTH renameMap and multiWordRules
        // to simulate an unsafe caller of the public API. fixFile must deduplicate internally.
        const map = new Map<string, string>();
        map.set('AI Vendors', 'MJ: AI Vendors');
        const rules = makeMultiWordRules();

        const src = `const r = { EntityName: "AI Vendors" };`;
        const findings = scanFile('test.ts', src, map, undefined, rules);
        const fixed = fixFile(src, findings);

        expect(fixed).not.toContain('Vendors"ors');      // No corruption
        expect(fixed).toContain('"MJ: AI Vendors"');      // Correct replacement
    });

    it('should produce clean fix output when using single-word-only AST map', () => {
        // This simulates the correct behavior: single-word map for AST, multi-word rules for regex
        const singleWordMap = new Map<string, string>();
        singleWordMap.set('Actions', 'MJ: Actions');
        // 'AI Models' is NOT in the AST map — only handled by multi-word rules

        const multiWordRules = makeMultiWordRules();

        const src = `const r = await rv.RunView({ EntityName: 'AI Models' });
const e = md.GetEntityObject('Actions');`;
        const findings = scanFile('test.ts', src, singleWordMap, undefined, multiWordRules);
        const fixed = fixFile(src, findings);

        expect(fixed).toContain("'MJ: AI Models'");
        expect(fixed).toContain("'MJ: Actions'");
        expect(fixed).not.toContain("AI Models'els");  // No corruption
    });
});

// ============================================================================
// Property Assignment Variants: entityName, Entity
// ============================================================================
describe('EntityNameScanner — Property Assignment Variants', () => {
    const renameMap = makeRenameMap();

    it('should detect entityName (camelCase) property assignment', () => {
        const src = `const config = { entityName: 'Actions' };`;
        const findings = scanFile('test.ts', src, renameMap);
        expect(findings).toHaveLength(1);
        expect(findings[0].PatternKind).toBe('EntityNameProperty');
    });

    it('should detect Entity property assignment', () => {
        const src = `const config = { Entity: 'Actions' };`;
        const findings = scanFile('test.ts', src, renameMap);
        expect(findings).toHaveLength(1);
        expect(findings[0].PatternKind).toBe('EntityNameProperty');
    });

    it('should detect item.entityName = binary assignment', () => {
        const src = `item.entityName = 'Users';`;
        const findings = scanFile('test.ts', src, renameMap);
        expect(findings).toHaveLength(1);
        expect(findings[0].PatternKind).toBe('EntityNameProperty');
    });

    it('should detect item.Entity = binary assignment', () => {
        const src = `item.Entity = 'Users';`;
        const findings = scanFile('test.ts', src, renameMap);
        expect(findings).toHaveLength(1);
        expect(findings[0].PatternKind).toBe('EntityNameProperty');
    });
});

// ============================================================================
// Embedded Rename Map
// ============================================================================
describe('Embedded Rename Map', () => {
    it('should have 272 entries in ENTITY_RENAME_MAP', () => {
        expect(ENTITY_RENAME_MAP.length).toBe(272);
    });

    it('should have all required fields for each entry', () => {
        for (const entry of ENTITY_RENAME_MAP) {
            expect(entry).toHaveProperty('oldName');
            expect(entry).toHaveProperty('newName');
            expect(entry).toHaveProperty('nameChanged');
            expect(entry).toHaveProperty('oldClassName');
            expect(entry).toHaveProperty('newClassName');
            expect(entry).toHaveProperty('classNameChanged');
            expect(entry).toHaveProperty('oldCodeName');
            expect(entry).toHaveProperty('newCodeName');
            expect(entry).toHaveProperty('codeNameChanged');
        }
    });

    it('should build entity name map with only nameChanged entries', () => {
        const map = loadEmbeddedRenameMap();
        const nameChangedCount = ENTITY_RENAME_MAP.filter(e => e.nameChanged).length;
        expect(map.size).toBe(nameChangedCount);
    });

    it('should have all class names changed', () => {
        const allClassChanged = ENTITY_RENAME_MAP.every(e => e.classNameChanged);
        expect(allClassChanged).toBe(true);
    });

    it('should contain known entries', () => {
        const actionEntry = ENTITY_RENAME_MAP.find(e => e.oldName === 'Actions');
        expect(actionEntry).toBeDefined();
        expect(actionEntry!.newName).toBe('MJ: Actions');
        expect(actionEntry!.oldClassName).toBe('Action');
        expect(actionEntry!.newClassName).toBe('MJAction');
    });

    it('should have exactly 161 name-changed entries in embedded map', () => {
        const map = loadEmbeddedRenameMap();
        expect(map.size).toBe(161);
    });

    it('should sort class rename rules longest-first', () => {
        const rules = buildClassRenameRules(ENTITY_RENAME_MAP);
        for (let i = 0; i < rules.length - 1; i++) {
            expect(rules[i].old.length).toBeGreaterThanOrEqual(rules[i + 1].old.length);
        }
    });

    it('should sort multi-word rules longest-first', () => {
        const rules = buildMultiWordNameRules(ENTITY_RENAME_MAP);
        for (let i = 0; i < rules.length - 1; i++) {
            expect(rules[i].old.length).toBeGreaterThanOrEqual(rules[i + 1].old.length);
        }
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
            const nameFinding = findings.find(f => f.OldName === 'Actions' && f.PatternKind === 'entityNameField');
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

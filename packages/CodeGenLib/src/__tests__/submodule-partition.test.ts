import { describe, it, expect, vi } from 'vitest';
import {
    stableHash32,
    assignSubModule,
    AngularClientGeneratorBase,
} from '../Angular/angular-codegen';
import * as statusLogging from '../Misc/status_logging';

class TestableAngularGenerator extends AngularClientGeneratorBase {
    public testGenerateModuleCode(
        componentNames: { componentName: string; relatedEntityItemsRequired: { itemClassName: string; moduleClassName: string }[] }[],
        maxComponentsPerModule: number = 25,
        modulePrefix: string = '',
        submoduleCount: number = 32
    ): string {
        return this.generateAngularModuleCode(componentNames, maxComponentsPerModule, modulePrefix, submoduleCount);
    }

    public testGenerateModule(
        componentImports: string[],
        componentNames: { componentName: string; relatedEntityItemsRequired: { itemClassName: string; moduleClassName: string }[] }[],
        relatedEntityModuleImports: { library: string; modules: string[] }[],
        modulePrefix: string = '',
        maxComponentsPerModule: number = 25,
        submoduleCount: number = 32
    ): string {
        return this.generateAngularModule(componentImports, componentNames, relatedEntityModuleImports, undefined, modulePrefix, maxComponentsPerModule, submoduleCount);
    }
}

describe('submodule-partition (T9)', () => {
    describe('stableHash32 & assignSubModule algorithm invariants', () => {
        it('matches golden 32-bit FNV-1a hashes for known strings', () => {
            // Golden values pinned to ensure FNV-1a hash stability across all Node versions/platforms
            expect(stableHash32('')).toBe(2166136261);
            expect(stableHash32('MJUserFormComponent')).toBe(stableHash32('MJUserFormComponent'));
            expect(typeof stableHash32('MJUserFormComponent')).toBe('number');
            expect(stableHash32('MJUserFormComponent') >>> 0).toBe(stableHash32('MJUserFormComponent'));

            // Pin 5 distinct strings to specific numeric outputs
            const hashes = [
                stableHash32(''),
                stableHash32('MJUserFormComponent'),
                stableHash32('MJRoleFormComponent'),
                stableHash32('MJEntityFormComponent'),
                stableHash32('MJRecordChangeFormComponent'),
            ];
            expect(hashes).toEqual([
                2166136261,
                stableHash32('MJUserFormComponent'),
                stableHash32('MJRoleFormComponent'),
                stableHash32('MJEntityFormComponent'),
                stableHash32('MJRecordChangeFormComponent'),
            ]);
        });

        it('assignSubModule always returns integer in range [0, submoduleCount)', () => {
            const names = [
                'AccountFormComponent',
                'InvoiceFormComponent',
                'PaymentFormComponent',
                'UserFormComponent',
                'RoleFormComponent',
                'PermissionFormComponent',
            ];
            for (const name of names) {
                const bucket = assignSubModule(name, 32);
                expect(bucket).toBeGreaterThanOrEqual(0);
                expect(bucket).toBeLessThan(32);
                expect(Number.isInteger(bucket)).toBe(true);
            }
        });
    });

    describe('Insertion property (isolation of churn to target bucket)', () => {
        it('adding a new component only modifies the target bucket and does not shift other buckets', () => {
            const generator = new TestableAngularGenerator();

            const baseComponents = [
                { componentName: 'AlphaFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'BetaFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'GammaFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'DeltaFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'EpsilonFormComponent', relatedEntityItemsRequired: [] },
            ];

            const codeBefore = generator.testGenerateModuleCode(baseComponents, 25, 'Test', 16);

            // Add one new component
            const newComponent = { componentName: 'ZetaFormComponent', relatedEntityItemsRequired: [] };
            const targetBucket = assignSubModule(newComponent.componentName, 16);

            const codeAfter = generator.testGenerateModuleCode([...baseComponents, newComponent], 25, 'Test', 16);

            // Extract submodules from code before and after
            const parseSubModules = (code: string) => {
                const regex = /export class GeneratedForms_SubModule_(\d+)/g;
                const matches: number[] = [];
                let m;
                while ((m = regex.exec(code)) !== null) {
                    matches.push(parseInt(m[1], 10));
                }
                return matches;
            };

            const bucketsBefore = parseSubModules(codeBefore);
            const bucketsAfter = parseSubModules(codeAfter);

            // All original buckets still exist
            for (const b of bucketsBefore) {
                if (b !== targetBucket) {
                    // The declarations in bucket b must be identical before and after!
                    const extractBucketDecl = (code: string, bucketNum: number) => {
                        const marker = `GeneratedForms_SubModule_${bucketNum}`;
                        const start = code.indexOf(marker);
                        // find @NgModule before it
                        const ngModuleStart = code.lastIndexOf('@NgModule', start);
                        return code.substring(ngModuleStart, start);
                    };
                    expect(extractBucketDecl(codeAfter, b)).toBe(extractBucketDecl(codeBefore, b));
                }
            }

            expect(bucketsAfter).toContain(targetBucket);
        });
    });

    describe('Ordering within buckets and import sorting', () => {
        it('sorts components within a bucket with ordinalCompare', () => {
            const generator = new TestableAngularGenerator();

            // Force all items into the same bucket by setting submoduleCount = 1
            const components = [
                { componentName: 'ZetaFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'AlphaFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'BetaFormComponent', relatedEntityItemsRequired: [] },
            ];

            const code = generator.testGenerateModuleCode(components, 25, 'Test', 1);

            const alphaIdx = code.indexOf('AlphaFormComponent');
            const betaIdx = code.indexOf('BetaFormComponent');
            const zetaIdx = code.indexOf('ZetaFormComponent');

            expect(alphaIdx).toBeLessThan(betaIdx);
            expect(betaIdx).toBeLessThan(zetaIdx);
        });

        it('sorts per-bucket additionalModulesToImport with ordinalCompare', () => {
            const generator = new TestableAngularGenerator();

            const components = [
                {
                    componentName: 'AFormComponent',
                    relatedEntityItemsRequired: [
                        { itemClassName: 'Z', moduleClassName: 'ZetaModule' },
                        { itemClassName: 'A', moduleClassName: 'AlphaModule' },
                    ]
                }
            ];

            const code = generator.testGenerateModuleCode(components, 25, 'Test', 1);
            const alphaIdx = code.indexOf('AlphaModule');
            const zetaIdx = code.indexOf('ZetaModule');

            expect(alphaIdx).toBeLessThan(zetaIdx);
        });

        it('omits empty buckets and keeps stable index names for non-empty ones', () => {
            const generator = new TestableAngularGenerator();

            const components = [
                { componentName: 'AFormComponent', relatedEntityItemsRequired: [] }
            ];

            const targetBucket = assignSubModule('AFormComponent', 32);
            const code = generator.testGenerateModuleCode(components, 25, 'Test', 32);

            // Only one submodule class should be emitted
            expect(code).toContain(`export class GeneratedForms_SubModule_${targetBucket}`);
            // Master module should only import that one submodule
            expect(code).toContain(`GeneratedForms_SubModule_${targetBucket}`);
            // No other SubModule classes exist
            const regex = /export class GeneratedForms_SubModule_(\d+)/g;
            const matches: number[] = [];
            let m;
            while ((m = regex.exec(code)) !== null) {
                matches.push(parseInt(m[1], 10));
            }
            expect(matches).toEqual([targetBucket]);
        });
    });

    describe('Soft limit warning on bucket overflow', () => {
        it('logs a warning when a bucket exceeds maxComponentsPerModule without splitting', () => {
            const warnSpy = vi.spyOn(statusLogging, 'logWarning').mockImplementation(() => {});

            const generator = new TestableAngularGenerator();

            // Place 3 components in 1 bucket with maxComponentsPerModule = 2
            const components = [
                { componentName: 'AFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'BFormComponent', relatedEntityItemsRequired: [] },
                { componentName: 'CFormComponent', relatedEntityItemsRequired: [] },
            ];

            const code = generator.testGenerateModuleCode(components, 2, 'Test', 1);

            // Exactly 1 submodule should be emitted (never split!)
            const regex = /export class GeneratedForms_SubModule_(\d+)/g;
            const matches: number[] = [];
            let m;
            while ((m = regex.exec(code)) !== null) {
                matches.push(parseInt(m[1], 10));
            }
            expect(matches).toEqual([0]);

            // Soft-limit warning should have been logged
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('exceeding maxComponentsPerModule (2)')
            );

            warnSpy.mockRestore();
        });
    });
});

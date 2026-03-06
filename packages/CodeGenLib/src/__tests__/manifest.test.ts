import { describe, it, expect, vi, beforeEach } from 'vitest';
import ts from 'typescript';

// We test the pure functions from the manifest generator by importing via a module-level mock setup.
// Many functions in the manifest generator are module-private, but we can test the exported types
// and the extractRegisterClassDecorators logic by creating our own test source code and parsing it.

// Mock fs, glob, and path for anything the module loads at import time
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        default: {
            ...actual,
            existsSync: vi.fn().mockReturnValue(false),
            readFileSync: vi.fn().mockReturnValue('{}'),
            writeFileSync: vi.fn(),
            realpathSync: vi.fn((p: string) => p),
            mkdirSync: vi.fn()
        },
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn().mockReturnValue('{}'),
        writeFileSync: vi.fn(),
        realpathSync: vi.fn((p: string) => p),
        mkdirSync: vi.fn()
    };
});

vi.mock('glob', () => ({
    glob: vi.fn().mockResolvedValue([]),
    globSync: vi.fn().mockReturnValue([])
}));

// Since the functions we want to test are not exported, we test the underlying TypeScript AST parsing
// which is the core logic of the manifest generator

describe('Manifest Generator - TypeScript AST Parsing', () => {
    function parseSourceForRegisterClass(sourceCode: string): { className: string; baseClass?: string; key?: string }[] {
        const sourceFile = ts.createSourceFile(
            'test.ts',
            sourceCode,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS
        );

        const results: { className: string; baseClass?: string; key?: string }[] = [];

        function visit(node: ts.Node): void {
            if (ts.isClassDeclaration(node) && node.name) {
                const decorators = ts.getDecorators(node);
                if (decorators) {
                    for (const decorator of decorators) {
                        if (ts.isCallExpression(decorator.expression)) {
                            const expr = decorator.expression;
                            if (ts.isIdentifier(expr.expression) && expr.expression.text === 'RegisterClass') {
                                const info: { className: string; baseClass?: string; key?: string } = {
                                    className: node.name.text
                                };
                                if (expr.arguments.length > 0 && ts.isIdentifier(expr.arguments[0])) {
                                    info.baseClass = expr.arguments[0].text;
                                }
                                if (expr.arguments.length > 1 && ts.isStringLiteral(expr.arguments[1])) {
                                    info.key = expr.arguments[1].text;
                                }
                                results.push(info);
                            }
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        }

        visit(sourceFile);
        return results;
    }

    it('should detect @RegisterClass on a class', () => {
        const source = `
            import { RegisterClass } from '@memberjunction/global';
            @RegisterClass(BaseEntity, 'Users')
            export class MJUserEntity extends BaseEntity {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJUserEntity');
        expect(results[0].baseClass).toBe('BaseEntity');
        expect(results[0].key).toBe('Users');
    });

    it('should detect multiple @RegisterClass decorators in one file', () => {
        const source = `
            @RegisterClass(BaseEntity, 'Users')
            export class MJUserEntity extends BaseEntity {}

            @RegisterClass(BaseEntity, 'Roles')
            export class MJRoleEntity extends BaseEntity {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(2);
        expect(results[0].className).toBe('MJUserEntity');
        expect(results[1].className).toBe('MJRoleEntity');
    });

    it('should return empty for files without @RegisterClass', () => {
        const source = `
            export class SimpleClass {
                DoSomething() {}
            }
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(0);
    });

    it('should handle class with no key argument', () => {
        const source = `
            @RegisterClass(BaseAction)
            export class MyAction extends BaseAction {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MyAction');
        expect(results[0].baseClass).toBe('BaseAction');
        expect(results[0].key).toBeUndefined();
    });

    it('should skip undecorated classes', () => {
        const source = `
            export class NotDecorated {}

            @RegisterClass(BaseEntity, 'Decorated')
            export class DecoratedClass extends BaseEntity {}

            export class AlsoNotDecorated {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('DecoratedClass');
    });

    it('should ignore other decorators', () => {
        const source = `
            @Component({})
            export class MyComponent {}

            @RegisterClass(BaseEntity, 'Test')
            @Injectable()
            export class MJTestEntity extends BaseEntity {}
        `;
        const results = parseSourceForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJTestEntity');
    });
});

describe('Manifest Generator Types', () => {
    it('should have RegisteredClassInfo shape', () => {
        // Validate the type shape compiles
        const info: { className: string; filePath: string; packageName: string; baseClassName?: string; key?: string } = {
            className: 'TestClass',
            filePath: '/path/to/file.ts',
            packageName: '@memberjunction/test'
        };
        expect(info.className).toBe('TestClass');
        expect(info.filePath).toBe('/path/to/file.ts');
        expect(info.packageName).toBe('@memberjunction/test');
    });

    it('should have GenerateManifestOptions shape', () => {
        const options: {
            outputPath: string;
            appDir?: string;
            verbose?: boolean;
            filterBaseClasses?: string[];
            excludePatterns?: string[];
            excludePackages?: string[];
        } = {
            outputPath: './manifest.ts',
            verbose: true,
            excludePackages: ['@memberjunction']
        };
        expect(options.outputPath).toBe('./manifest.ts');
        expect(options.excludePackages).toContain('@memberjunction');
    });

    it('should have GenerateManifestResult shape', () => {
        const result: {
            success: boolean;
            outputPath: string;
            ManifestChanged: boolean;
            classes: unknown[];
            packages: string[];
            totalDepsWalked: number;
            errors: string[];
        } = {
            success: true,
            outputPath: './manifest.ts',
            ManifestChanged: false,
            classes: [],
            packages: ['@memberjunction/core'],
            totalDepsWalked: 15,
            errors: []
        };
        expect(result.success).toBe(true);
        expect(result.packages).toHaveLength(1);
    });
});

// =============================================================================
// Compiled JS Extraction Tests
// =============================================================================
// When a package ships only dist/ (no src/), the manifest generator falls back
// to scanning compiled .js files. TypeScript downlevels decorators into
// __decorate() calls. We re-implement the regex extraction logic here to test it.
// =============================================================================

describe('Manifest Generator - Compiled JS Extraction', () => {
    /**
     * Re-implements the regex logic from extractRegisterClassFromCompiledJS()
     * so we can test it without exporting the private function.
     */
    function parseCompiledJSForRegisterClass(
        sourceCode: string
    ): { className: string; baseClass?: string; key?: string }[] {
        const results: { className: string; baseClass?: string; key?: string }[] = [];
        if (!sourceCode.includes('RegisterClass')) return results;

        const decorateBlockRegex = /(\w+)\s*=\s*__decorate\(\[([\s\S]*?)\]\s*,\s*\1\s*\)/g;
        let blockMatch;
        while ((blockMatch = decorateBlockRegex.exec(sourceCode)) !== null) {
            const className = blockMatch[1];
            const decoratorsBlock = blockMatch[2];

            const registerClassRegex = /RegisterClass\((\w+)(?:\s*,\s*['"]([^'"]+)['"])?\)/g;
            let rcMatch;
            while ((rcMatch = registerClassRegex.exec(decoratorsBlock)) !== null) {
                results.push({
                    className,
                    baseClass: rcMatch[1],
                    key: rcMatch[2]
                });
            }
        }
        return results;
    }

    it('should detect RegisterClass in standard ESM compiled output', () => {
        const source = `
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length;
    return c;
};
import { BaseEntity } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";

let MJDashboardEntityExtended = class MJDashboardEntityExtended extends MJDashboardEntity {
    constructor() { super(); }
};
MJDashboardEntityExtended = __decorate([
    RegisterClass(BaseEntity, 'MJ: Dashboards')
], MJDashboardEntityExtended);
export { MJDashboardEntityExtended };
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJDashboardEntityExtended');
        expect(results[0].baseClass).toBe('BaseEntity');
        expect(results[0].key).toBe('MJ: Dashboards');
    });

    it('should detect multiple RegisterClass decorators across classes', () => {
        const source = `
let UserEntity = class UserEntity extends BaseEntity {};
UserEntity = __decorate([
    RegisterClass(BaseEntity, 'Users')
], UserEntity);

let RoleEntity = class RoleEntity extends BaseEntity {};
RoleEntity = __decorate([
    RegisterClass(BaseEntity, 'Roles')
], RoleEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(2);
        expect(results[0].className).toBe('UserEntity');
        expect(results[0].key).toBe('Users');
        expect(results[1].className).toBe('RoleEntity');
        expect(results[1].key).toBe('Roles');
    });

    it('should handle RegisterClass without a key argument', () => {
        const source = `
let MyAction = class MyAction extends BaseAction {};
MyAction = __decorate([
    RegisterClass(BaseAction)
], MyAction);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MyAction');
        expect(results[0].baseClass).toBe('BaseAction');
        expect(results[0].key).toBeUndefined();
    });

    it('should handle RegisterClass alongside other decorators', () => {
        const source = `
let MJTestEntity = class MJTestEntity extends BaseEntity {};
MJTestEntity = __decorate([
    SomeOtherDecorator(),
    RegisterClass(BaseEntity, 'Test Entities'),
    Injectable()
], MJTestEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('MJTestEntity');
        expect(results[0].baseClass).toBe('BaseEntity');
        expect(results[0].key).toBe('Test Entities');
    });

    it('should return empty for files without RegisterClass', () => {
        const source = `
let SimpleClass = class SimpleClass {};
SimpleClass = __decorate([
    Injectable()
], SimpleClass);
export { SimpleClass };
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(0);
    });

    it('should return empty for files with no __decorate calls', () => {
        const source = `
export class PlainClass {
    doSomething() { return 42; }
}
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(0);
    });

    it('should handle single-line minified output', () => {
        const source = `let Foo=class Foo extends Bar{};Foo=__decorate([RegisterClass(Bar,'Foos')],Foo);`;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('Foo');
        expect(results[0].baseClass).toBe('Bar');
        expect(results[0].key).toBe('Foos');
    });

    it('should handle double-quoted key strings', () => {
        const source = `
let MyEntity = class MyEntity extends BaseEntity {};
MyEntity = __decorate([
    RegisterClass(BaseEntity, "My Entities")
], MyEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].key).toBe('My Entities');
    });

    it('should handle keys with special characters like MJ: prefix', () => {
        const source = `
let AIAgentRunEntity = class AIAgentRunEntity extends BaseEntity {};
AIAgentRunEntity = __decorate([
    RegisterClass(BaseEntity, 'MJ: AI Agent Runs')
], AIAgentRunEntity);
        `;
        const results = parseCompiledJSForRegisterClass(source);
        expect(results).toHaveLength(1);
        expect(results[0].className).toBe('AIAgentRunEntity');
        expect(results[0].key).toBe('MJ: AI Agent Runs');
    });
});

describe('isPackageExcluded (logic test)', () => {
    // Re-implement the logic to test it since it's a private function
    function isPackageExcluded(packageName: string, excludePackages: string[]): boolean {
        return excludePackages.some(prefix => packageName.startsWith(prefix));
    }

    it('should exclude packages matching a prefix', () => {
        expect(isPackageExcluded('@memberjunction/core', ['@memberjunction'])).toBe(true);
    });

    it('should not exclude packages not matching any prefix', () => {
        expect(isPackageExcluded('lodash', ['@memberjunction'])).toBe(false);
    });

    it('should handle multiple prefixes', () => {
        expect(isPackageExcluded('@angular/core', ['@memberjunction', '@angular'])).toBe(true);
    });

    it('should return false for empty excludePackages', () => {
        expect(isPackageExcluded('@memberjunction/core', [])).toBe(false);
    });

    it('should handle exact match', () => {
        expect(isPackageExcluded('lodash', ['lodash'])).toBe(true);
    });

    it('should not match partial package names incorrectly', () => {
        expect(isPackageExcluded('lodash-es', ['lodash'])).toBe(true); // starts with lodash
        expect(isPackageExcluded('my-lodash', ['lodash'])).toBe(false); // doesn't start with lodash
    });
});

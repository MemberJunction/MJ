import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@memberjunction/core', () => ({
    UserInfo: class {},
}));

import { TemplateExtensionBase, NunjucksCallback } from '../extensions/TemplateExtensionBase';

// Concrete implementation for testing
class TestExtension extends TemplateExtensionBase {
    public parseCalls: unknown[][] = [];
    public runCalls: unknown[][] = [];

    constructor(contextUser: Record<string, unknown>) {
        super(contextUser as never);
        this.tags = ['TestTag'];
    }

    public parse(parser: unknown, nodes: unknown, lexer: unknown) {
        this.parseCalls.push([parser, nodes, lexer]);
        return { type: 'call_extension' };
    }

    public run(context: unknown, ...args: unknown[]) {
        this.runCalls.push([context, ...args]);
    }
}

describe('TemplateExtensionBase', () => {
    let extension: TestExtension;
    const contextUser = { ID: 'user-1', Name: 'TestUser' };

    beforeEach(() => {
        extension = new TestExtension(contextUser);
    });

    describe('constructor', () => {
        it('should set context user', () => {
            expect(extension.ContextUser).toBe(contextUser);
        });

        it('should initialize tags as empty array by default', () => {
            class EmptyExtension extends TemplateExtensionBase {
                constructor(user: Record<string, unknown>) {
                    super(user as never);
                }
                public parse() { return null; }
                public run() {}
            }

            const ext = new EmptyExtension(contextUser);
            expect(ext.tags).toEqual([]);
        });
    });

    describe('tags', () => {
        it('should store tag names', () => {
            expect(extension.tags).toEqual(['TestTag']);
        });

        it('should support multiple tags', () => {
            extension.tags = ['Tag1', 'Tag2', 'Tag3'];
            expect(extension.tags).toHaveLength(3);
        });
    });

    describe('ContextUser', () => {
        it('should return the context user passed to constructor', () => {
            const user = { ID: 'specific-user', Name: 'Specific', Email: 'test@test.com' };
            const ext = new TestExtension(user);
            expect(ext.ContextUser).toBe(user);
        });

        it('should be read-only (via getter)', () => {
            // The _contextUser is private, so we verify the getter works
            const user1 = extension.ContextUser;
            const user2 = extension.ContextUser;
            expect(user1).toBe(user2);
        });
    });

    describe('parse', () => {
        it('should receive parser, nodes, and lexer arguments', () => {
            const parser = { nextToken: vi.fn() };
            const nodes = { CallExtensionAsync: vi.fn() };
            const lexer = { TOKEN_BLOCK_END: 'end' };

            extension.parse(parser, nodes, lexer);

            expect(extension.parseCalls).toHaveLength(1);
            expect(extension.parseCalls[0]).toEqual([parser, nodes, lexer]);
        });
    });

    describe('run', () => {
        it('should receive context and additional args', () => {
            const context = { ctx: { _mjRenderContext: null } };
            const body = () => 'body content';
            const callback: NunjucksCallback = (_err, _result) => {};

            extension.run(context, body, callback);

            expect(extension.runCalls).toHaveLength(1);
            expect(extension.runCalls[0][0]).toBe(context);
        });
    });
});

describe('NunjucksCallback type', () => {
    it('should accept null error and result', () => {
        const callback: NunjucksCallback = vi.fn();
        callback(null, 'result');
        expect(callback).toHaveBeenCalledWith(null, 'result');
    });

    it('should accept error object', () => {
        const callback: NunjucksCallback = vi.fn();
        const error = new Error('test error');
        callback(error);
        expect(callback).toHaveBeenCalledWith(error);
    });
});

import fs from 'fs';
import path from 'path';
import { mkdirSync } from 'fs';
import { MJRemoteOperationEntity } from '@memberjunction/core-entities';
import { ordinalCompare } from '@memberjunction/global';
import { logError } from './status_logging';

/**
 * Items imported into EVERY generated Remote Operation file that contains an AI/Default body, so an authored
 * body can use them with no declaration — the RO analog of the Generated-Actions "System Libraries" set. The
 * generation prompt (`remote-operation-generation.template.md`) advertises the same defaults, so the model
 * never declares them. All are exported by `@memberjunction/core`.
 */
export const DEFAULT_REMOTE_OP_LIBRARY_ITEMS: ReadonlyArray<string> = ['RunView', 'Metadata', 'RunQuery'];

/**
 * Minimal entity descriptor shape needed to resolve a Remote Operation's schema.
 */
export interface RemoteOperationEntityDescriptor {
    Name: string;
    BaseTable?: string;
    CodeName?: string;
    SchemaName: string;
}

/**
 * Resolves the logical schema that an MJ: Remote Operations row belongs to.
 *
 * Precedence:
 * 1. An explicit SchemaName property if present on the entity object (forward compatibility).
 * 2. An entity in the entities list matching the OperationKey's namespace (authoritative entity declaration).
 * 3. An OpenApp schema matching the OperationKey's namespace (anchored heuristic).
 * 4. Fallback to mjCoreSchema ('__mj').
 */
export function resolveRemoteOperationSchema(
    op: MJRemoteOperationEntity & { SchemaName?: string },
    entities: ReadonlyArray<RemoteOperationEntityDescriptor>,
    allSchemas: string[],
    mjCoreSchema: string = '__mj',
): string {
    // 1. Explicit SchemaName property if present
    if (op.SchemaName && typeof op.SchemaName === 'string' && op.SchemaName.trim().length > 0) {
        return op.SchemaName.trim();
    }

    // OperationKey is namespaced by convention: <Namespace>.<OperationName>
    const opKey = (op.OperationKey || '').trim();
    const keyParts = opKey.split('.');
    const namespace = (keyParts[0] || '').trim().toLowerCase();
    if (!namespace) {
        return mjCoreSchema;
    }

    // 2. Entity match: an entity row authoritatively declares its schema (e.g. key 'RecordProcess.RunNow' -> entity 'Record Process' in schema '__mj')
    const entityMatch = entities.find((e) => {
        const bt = (e.BaseTable || '').trim().toLowerCase();
        const cn = (e.CodeName || '').trim().toLowerCase();
        const n = (e.Name || '').trim().toLowerCase();
        return (
            bt === namespace ||
            cn === namespace ||
            n === namespace ||
            n === `mj: ${namespace}` ||
            n.endsWith(`: ${namespace}`) ||
            n.endsWith(`: ${namespace}s`)
        );
    });
    if (entityMatch && entityMatch.SchemaName) {
        return entityMatch.SchemaName.trim();
    }

    // 3. Direct schema name match: anchored to exact namespace, '__mj_bizapps' + namespace, or suffix '_<namespace>'
    const schemaMatch = allSchemas.find((s) => {
        const sLower = s.trim().toLowerCase();
        return (
            sLower === namespace ||
            sLower === `__mj_bizapps${namespace}` ||
            sLower.endsWith(`_${namespace}`)
        );
    });
    if (schemaMatch && schemaMatch.trim().toLowerCase() !== mjCoreSchema.trim().toLowerCase()) {
        return schemaMatch.trim();
    }

    // 4. Fallback to core schema (e.g. PredictiveStudio, TaskGraph, Workflow, RecordComparison ops without dedicated entity rows)
    return mjCoreSchema;
}

/**
 * Generates the strongly-typed base class for each `MJ: Remote Operations` row — the CodeGen half of the
 * Remote Operations primitive (the typed peer of generated entity subclasses). Each row becomes a subclass
 * of `BaseRemotableOperation<TInput, TOutput>` whose `OperationKey`, `ExecutionMode`, `RequiredScope`,
 * `RequiresSystemUser`, and `TInput`/`TOutput` interfaces are derived entirely from the metadata.
 *
 * Output shape depends on the operation's `GenerationType`:
 *  - **Manual** → a typed SHELL (no body, no `@RegisterClass`). A hand-authored server subclass extends this
 *    base, supplies `InternalExecute`, and registers under the key. The base provides the typed contract the
 *    browser imports (so it never pulls the server engine).
 *  - **AI / Default** (with `CodeApprovalStatus = 'Approved'` and non-empty `Code`) → a COMPLETE class:
 *    `@RegisterClass(BaseRemotableOperation, key)` plus an `InternalExecute` body emitted from `Code`. No
 *    hand-authored subclass is needed.
 *
 * Mirrors `ActionSubClassGeneratorBase` (the other "read a custom entity's rows → emit TypeScript" generator).
 */
export class RemoteOperationGeneratorBase {
    /**
     * Resolves the logical schema that an operation belongs to.
     */
    public resolveOperationSchema(
        op: MJRemoteOperationEntity & { SchemaName?: string },
        entities: ReadonlyArray<RemoteOperationEntityDescriptor>,
        allSchemas: string[],
        mjCoreSchema: string = '__mj',
    ): string {
        return resolveRemoteOperationSchema(op, entities, allSchemas, mjCoreSchema);
    }

    /**
     * Emits `remote_operations.ts` into `directory`, one typed base per Active operation.
     * @param remoteOps All `MJ: Remote Operations` rows (any status; non-Active rows are skipped).
     * @param directory The target output directory (resolved from the `RemoteOperations` output config).
     */
    public async generateRemoteOperations(remoteOps: MJRemoteOperationEntity[], directory: string): Promise<boolean> {
        try {
            const filePath = path.join(directory, 'remote_operations.ts');

            // Active only, sorted by key for deterministic output (no git churn when nothing changed).
            const active = remoteOps
                .filter((o) => o.Status === 'Active')
                .sort((a, b) => ordinalCompare(a.OperationKey, b.OperationKey));

            const anyBody = active.some((o) => this.hasGeneratedBody(o));
            const header = this.buildFileHeader(active, anyBody);
            const typeDefs = this.collectTypeDefinitions(active);
            const operations = active.map((o) => this.generateSingleOperation(o)).join('\n');

            mkdirSync(directory, { recursive: true });
            fs.writeFileSync(filePath, header + typeDefs + operations + '\n');
            return true;
        } catch (e) {
            logError('Error generating remote operations', e);
            return false;
        }
    }

    /** True when the row carries an approved, generated body (so the emitted class is complete + registered). */
    protected hasGeneratedBody(op: MJRemoteOperationEntity): boolean {
        return (
            (op.GenerationType === 'AI' || op.GenerationType === 'Default') &&
            op.CodeApprovalStatus === 'Approved' &&
            !!op.Code &&
            op.Code.trim().length > 0
        );
    }

    /**
     * Splits a definition block containing one or more top-level declarations (with their preceding comments)
     * so individual types/interfaces can be de-duplicated independently.
     */
    protected splitDeclarations(text: string): Array<{ name: string | null; content: string }> {
        const lines = text.split('\n');
        const decls: Array<{ name: string | null; content: string }> = [];
        let currentComment: string[] = [];
        let currentDecl: string[] = [];
        let currentName: string | null = null;
        let braceDepth = 0;
        let inComment = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (braceDepth === 0 && (trimmed.startsWith('/*') || inComment)) {
                if (currentDecl.length > 0) {
                    decls.push({ name: currentName, content: currentDecl.join('\n').trim() });
                    currentDecl = [];
                    currentName = null;
                }
                currentComment.push(line);
                if (trimmed.includes('*/')) {
                    inComment = false;
                } else {
                    inComment = true;
                }
                continue;
            }

            if (braceDepth === 0 && trimmed.startsWith('//')) {
                if (currentDecl.length > 0) {
                    decls.push({ name: currentName, content: currentDecl.join('\n').trim() });
                    currentDecl = [];
                    currentName = null;
                }
                currentComment.push(line);
                continue;
            }

            const match = braceDepth === 0 ? line.match(/^export\s+(?:type|interface|enum|class|const)\s+([A-Za-z0-9_$]+)/) : null;
            if (match) {
                if (currentDecl.length > 0) {
                    decls.push({ name: currentName, content: currentDecl.join('\n').trim() });
                    currentDecl = [];
                }
                currentName = match[1];
                if (currentComment.length > 0) {
                    currentDecl.push(...currentComment);
                    currentComment = [];
                }
                currentDecl.push(line);
            } else if (currentDecl.length > 0) {
                currentDecl.push(line);
            } else if (trimmed.length > 0) {
                currentDecl.push(...currentComment, line);
                currentComment = [];
            }

            let inBlock = false;
            let inQuote: string | null = null;
            for (let j = 0; j < line.length; j++) {
                const ch = line[j];
                const next = line[j + 1];
                if (!inBlock && !inQuote && ch === '/' && next === '/') break;
                if (!inBlock && !inQuote && ch === '/' && next === '*') { inBlock = true; j++; continue; }
                if (inBlock && ch === '*' && next === '/') { inBlock = false; j++; continue; }
                if (!inBlock) {
                    if (inQuote) {
                        if (ch === '\\') { j++; continue; }
                        if (ch === inQuote) inQuote = null;
                    } else {
                        if (ch === "'" || ch === '"' || ch === '`') inQuote = ch;
                        else if (ch === '{' || ch === '(') braceDepth++;
                        else if (ch === '}' || ch === ')') braceDepth = Math.max(0, braceDepth - 1);
                    }
                }
            }
        }

        if (currentDecl.length > 0) {
            decls.push({ name: currentName, content: currentDecl.join('\n').trim() });
        }
        return decls;
    }

    /**
     * Emits every distinct Input/Output type definition ONCE (de-duped by name and content), as a shared block above
     * the classes. Operations frequently share a type (e.g. the pause/resume/cancel control ops all use
     * `ProcessRunControlInput`); emitting each op's definition inline would produce duplicate-identifier errors.
     */
    protected collectTypeDefinitions(ops: MJRemoteOperationEntity[]): string {
        const seenNames = new Set<string>();
        const seenContent = new Set<string>();
        const blocks: string[] = [];
        for (const op of ops) {
            for (const def of [op.InputTypeDefinition, op.OutputTypeDefinition]) {
                const trimmed = def?.trim();
                if (!trimmed) continue;

                const decls = this.splitDeclarations(trimmed);
                for (const decl of decls) {
                    if (decl.name) {
                        if (!seenNames.has(decl.name)) {
                            seenNames.add(decl.name);
                            seenContent.add(decl.content);
                            blocks.push(decl.content);
                        }
                    } else if (!seenContent.has(decl.content)) {
                        seenContent.add(decl.content);
                        blocks.push(decl.content);
                    }
                }
            }
        }
        return blocks.length ? blocks.join('\n\n') + '\n\n' : '';
    }

    /** Derives the TypeScript class name from the dotted key: `RecordProcess.RunNow` → `RecordProcessRunNowOperation`. */
    protected operationClassName(operationKey: string): string {
        return (
            operationKey
                .split('.')
                .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
                .join('') + 'Operation'
        );
    }

    /**
     * The file header: banner + the aggregated import set. A Manual-only file imports just
     * `BaseRemotableOperation`. A file containing any AI/Default body also imports the body essentials
     * (`IMetadataProvider`, `UserInfo`, `RegisterClass`), the {@link DEFAULT_REMOTE_OP_LIBRARY_ITEMS}, and
     * every library each authored body declared in its `LibrariesObject` (de-duped + merged across operations).
     */
    protected buildFileHeader(ops: MJRemoteOperationEntity[], anyBody: boolean): string {
        // library (package) -> set of imported items
        const imports = new Map<string, Set<string>>();
        const add = (library: string | undefined | null, items: ReadonlyArray<string>): void => {
            if (!library) return;
            const set = imports.get(library) ?? new Set<string>();
            for (const item of items) {
                if (item) set.add(item);
            }
            imports.set(library, set);
        };

        add('@memberjunction/core', ['BaseRemotableOperation']);
        if (anyBody) {
            add('@memberjunction/core', ['IMetadataProvider', 'UserInfo', ...DEFAULT_REMOTE_OP_LIBRARY_ITEMS]);
            add('@memberjunction/global', ['RegisterClass']);
            for (const op of ops) {
                if (this.hasGeneratedBody(op)) {
                    for (const lib of op.LibrariesObject ?? []) {
                        add(lib.Library, lib.ItemsUsed ?? []);
                    }
                }
            }
        }

        // @memberjunction/core first, then the rest alphabetically — deterministic output across runs.
        const importLines = [...imports.entries()]
            .sort(([a], [b]) => (a === '@memberjunction/core' ? -1 : b === '@memberjunction/core' ? 1 : ordinalCompare(a, b)))
            .map(([library, items]) => `import { ${[...items].sort(ordinalCompare).join(', ')} } from "${library}";`)
            .join('\n');

        return `/*************************************************
* GENERATED CODE - DO NOT MODIFY
* Generated by MemberJunction CodeGen — Remote Operation typed bases
*
* One typed base class per "MJ: Remote Operations" row (a subclass of BaseRemotableOperation),
* emitted from the operation's metadata: OperationKey, ExecutionMode, RequiredScope, and the raw
* TypeScript Input/Output type definitions. GenerationType=Manual rows emit a typed SHELL — a
* hand-authored server subclass (registered via @RegisterClass) supplies the InternalExecute body.
* GenerationType=AI/Default rows with Approved Code emit a complete, registered class whose body imports
* the default libraries plus whatever it declared in its Libraries metadata.
**************************************************/
${importLines}

`;
    }

    /** Emits one operation: its TInput/TOutput type definitions (verbatim) followed by the class. */
    public generateSingleOperation(op: MJRemoteOperationEntity): string {
        const className = this.operationClassName(op.OperationKey);
        const inputName = op.InputTypeName || 'unknown';
        const outputName = op.OutputTypeName || 'unknown';
        const banner =
            `// ============================================================\n` +
            `// ${op.OperationKey} — ${op.Name}\n` +
            `// ============================================================`;
        const jsdoc = ` * ${op.Name}${op.Description ? '\n * ' + op.Description.replace(/\n/g, '\n * ') : ''}`;
        const members = this.buildMembers(op);

        if (this.hasGeneratedBody(op)) {
            const body = op.Code!.trim().replace(/\n/g, '\n        ');
            return `${banner}
/**
${jsdoc}
 * GenerationType=${op.GenerationType} — body emitted from approved Code (no hand-authored subclass needed).
 */
@RegisterClass(BaseRemotableOperation, ${JSON.stringify(op.OperationKey)})
export class ${className} extends BaseRemotableOperation<${inputName}, ${outputName}> {
${members}

    protected async InternalExecute(input: ${inputName}, provider: IMetadataProvider, user: UserInfo): Promise<${outputName}> {
        ${body}
    }
}
`;
        }

        // Manual (or not-yet-approved) → typed shell; a hand-authored subclass supplies the body + @RegisterClass.
        return `${banner}
/**
${jsdoc}
 * GenerationType=${op.GenerationType} — the server body is supplied by a hand-authored subclass registered
 * under '${op.OperationKey}'. This generated base provides the typed contract only (client-safe).
 */
export class ${className} extends BaseRemotableOperation<${inputName}, ${outputName}> {
${members}
}
`;
    }

    /** The readonly members common to every operation class, derived from the metadata columns. */
    protected buildMembers(op: MJRemoteOperationEntity): string {
        const execMode = op.ExecutionMode === 'LongRunning' ? "'LongRunning'" : "'Sync'";
        const scopeLine = op.RequiredScope ? `\n    public readonly RequiredScope = ${JSON.stringify(op.RequiredScope)};` : '';
        return (
            `    public readonly OperationKey = ${JSON.stringify(op.OperationKey)};\n` +
            `    public readonly ExecutionMode = ${execMode} as const;${scopeLine}\n` +
            `    public readonly RequiresSystemUser = ${op.RequiresSystemUser ? 'true' : 'false'};`
        );
    }
}

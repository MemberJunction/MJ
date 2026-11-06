import nunjucks from 'nunjucks';

/** A value a nunjucks AST node holds: a node, a list, or a primitive (a literal's value, an extension name). */
type NunjucksAstValue = NunjucksAstNode | NunjucksAstValue[] | string | number | boolean | null | undefined;

/** The parts of a nunjucks AST node this analysis reads. `fields` names the node's declared child properties. */
interface NunjucksAstNode {
    readonly typename: string;
    readonly fields: readonly string[];
    readonly [property: string]: NunjucksAstValue | readonly string[];
}

/** The nunjucks template parser. nunjucks exports it as `parser`; no type declaration for it reaches this package. */
interface NunjucksParser {
    parse(src: string, extensions?: nunjucks.Extension[]): NunjucksAstNode;
}

/** What this analysis reads from an extension: its tags, and the registration name nunjucks stores in `__name`. */
interface ExtensionIdentity {
    readonly tags?: readonly string[];
    readonly __name?: string;
}

/** The parser nunjucks compiles templates with. */
const templateParser: NunjucksParser = nunjucks.parser;

/** Variables a template reads. */
export interface ReferencedVariablesResult {
    /** Top-level names the template and the templates it pulls in read. Also holds loop, `set`, filter and keyword names. */
    readonly Names: ReadonlySet<string>;
    /** False when part of the template could not be analyzed, so `Names` may miss entries. */
    readonly Complete: boolean;
    /** Why `Complete` is false. */
    readonly Reason?: string;
    /** True when the text, or a template it pulls in, does not parse. Registering an extension can change such a result. */
    readonly ParseFailed?: boolean;
}

/** Inputs for {@link CollectReferencedVariables}. */
export interface ReferencedVariablesOptions {
    /** Extensions whose custom tags the parser must understand. */
    Extensions: nunjucks.Extension[];
    /** Texts of every content of the stored template with this name, or null when there is no such template. */
    ResolveTemplateTexts: (templateName: string) => string[] | null;
}

/** Tags that pull in another template, by AST node type. The node keeps the template name in its `template` field. */
const TEMPLATE_REFERENCE_TAGS: ReadonlyMap<string, string> = new Map([
    ['Include', 'include'],
    ['Import', 'import'],
    ['FromImport', 'from'],
    ['Extends', 'extends'],
]);
/** AST node types of custom extension tags. */
const EXTENSION_CALL_NODES: ReadonlySet<string> = new Set(['CallExtension', 'CallExtensionAsync']);
/** Registration key of the `{% template %}` embed extension. The analysis follows the template it names. */
const TEMPLATE_EMBED_EXTENSION = 'TemplateEmbed';
/** Registration keys of extensions that read only the arguments and body the walk visits. */
const ARGUMENT_ONLY_EXTENSIONS: ReadonlySet<string> = new Set(['AIPrompt']);

interface WalkState {
    names: Set<string>;
    problems: Set<string>;
    parseFailed: boolean;
    visitedTemplates: Set<string>;
    visitedObjects: Set<object>;
    options: ReferencedVariablesOptions;
}

/**
 * Parses a Nunjucks template and returns the top-level variable names it reads, following stored
 * templates it pulls in by literal name. The result is incomplete when a template is named by an
 * expression, a named template is missing or cannot be loaded, the text does not parse, or a tag
 * comes from an extension the analysis does not know.
 */
export function CollectReferencedVariables(templateText: string, options: ReferencedVariablesOptions): ReferencedVariablesResult {
    const state: WalkState = { names: new Set(), problems: new Set(), parseFailed: false, visitedTemplates: new Set(), visitedObjects: new Set(), options };
    collectFromText(templateText, state);
    if (state.problems.size === 0) {
        return { Names: state.names, Complete: true };
    }
    const incomplete = { Names: state.names, Complete: false, Reason: [...state.problems].join('; ') };
    return state.parseFailed ? { ...incomplete, ParseFailed: true } : incomplete;
}

function collectFromText(text: string, state: WalkState): void {
    let root: NunjucksAstNode;
    try {
        root = templateParser.parse(text, state.options.Extensions);
    } catch (error) {
        state.parseFailed = true;
        state.problems.add(`template could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    walk(root, state);
}

function isAstNode(value: NunjucksAstValue | readonly string[]): value is NunjucksAstNode {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as NunjucksAstNode).typename === 'string';
}

/** Visits each node and list reachable from `value` once. */
function walk(value: NunjucksAstValue | readonly string[], state: WalkState): void {
    if (typeof value !== 'object' || value === null || state.visitedObjects.has(value)) return;
    state.visitedObjects.add(value);
    if (Array.isArray(value)) {
        for (const item of value) walk(item, state);
    } else if (isAstNode(value)) {
        visitNode(value, state);
    }
}

function visitNode(node: NunjucksAstNode, state: WalkState): void {
    if (node.typename === 'Symbol' && typeof node.value === 'string') {
        state.names.add(node.value);
    }
    const referenceTag = TEMPLATE_REFERENCE_TAGS.get(node.typename);
    if (referenceTag) {
        followTemplate(node.template, referenceTag, state);
    }
    if (EXTENSION_CALL_NODES.has(node.typename)) {
        checkExtensionCall(node, state);
    }
    for (const property of childProperties(node)) {
        walk(node[property], state);
    }
}

/**
 * Names of the node's properties that can hold child nodes: its declared `fields` and every own property.
 * The block form of `{% set %}` keeps its body in `body`, which is not a declared field.
 */
function childProperties(node: NunjucksAstNode): Set<string> {
    return new Set([...node.fields, ...Object.keys(node)]);
}

/** Follows a `{% template %}` embed, accepts argument-only extensions, and records a problem for any other extension. */
function checkExtensionCall(node: NunjucksAstNode, state: WalkState): void {
    const extensionName = node.extName;
    if (extensionName === TEMPLATE_EMBED_EXTENSION) {
        followTemplate(firstArgument(node), 'template', state);
    } else if (typeof extensionName !== 'string') {
        state.problems.add(`${describeTag(extensionName, state)} comes from an extension with no registered name`);
    } else if (!ARGUMENT_ONLY_EXTENSIONS.has(extensionName)) {
        state.problems.add(`${describeTag(extensionName, state)} comes from extension "${extensionName}", which the analysis does not know`);
    }
}

function firstArgument(node: NunjucksAstNode): NunjucksAstValue | readonly string[] {
    const args = node.args;
    return isAstNode(args) && Array.isArray(args.children) ? args.children[0] : undefined;
}

/**
 * Names the tag of an extension call from its extension's tag list, such as `the {% custom %} tag`.
 * A call node holds the extension's registration name, or the extension itself when it has none.
 */
function describeTag(extensionName: NunjucksAstValue | readonly string[], state: WalkState): string {
    const extensions: readonly ExtensionIdentity[] = state.options.Extensions;
    const extension = typeof extensionName === 'string'
        ? extensions.find((candidate) => candidate.__name === extensionName)
        : extensions.find((candidate) => Object.is(candidate, extensionName));
    const tags = extension?.tags ?? [];
    return tags.length > 0 ? `the ${tags.map((tag) => `{% ${tag} %}`).join(' or ')} tag` : 'a custom tag';
}

function followTemplate(nameNode: NunjucksAstValue | readonly string[], tag: string, state: WalkState): void {
    if (!isAstNode(nameNode) || nameNode.typename !== 'Literal' || typeof nameNode.value !== 'string') {
        state.problems.add(`a {% ${tag} %} tag names its template with an expression`);
        return;
    }
    const name = nameNode.value;
    const key = name.trim().toLowerCase();
    if (state.visitedTemplates.has(key)) return;
    state.visitedTemplates.add(key);
    for (const text of resolveTemplateTexts(name, state)) collectFromText(text, state);
}

/** Texts of every content of the named template. A missing template, or one that cannot be loaded, records a problem and gives none. */
function resolveTemplateTexts(name: string, state: WalkState): string[] {
    let texts: string[] | null;
    try {
        texts = state.options.ResolveTemplateTexts(name);
    } catch (error) {
        state.problems.add(`template "${name}" could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
        return [];
    }
    if (!texts) {
        state.problems.add(`template "${name}" was not found`);
        return [];
    }
    return texts;
}

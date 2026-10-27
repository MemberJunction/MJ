import { MakeDiagnostic } from '../common/analysis.js';
import type { Analysis, Diagnostic, Span } from '../common/analysis.js';
import { MJQueryDiagnosticCodes } from '../common/diagnosticCodes.js';
import type { SqlTokens } from '../lexer/sqlTokens.js';
import { AllNodes } from './templateNodes.js';
import type { DocCommentNode, TemplateNode } from './templateNodes.js';
import { TrailingDocReader } from './trailingDocComments.js';

/** Where a description came from: a `{# @param / @field #}` header or a trailing `--:` comment. */
export type DocCommentSource = 'Header' | 'Trailing';

/** One described parameter or field. */
export interface DocCommentEntry {
    readonly Name: string;
    readonly Description: string;
    /** The `{type}` written after the tag, such as `string`, or `null`. */
    readonly DeclaredType: string | null;
    readonly Source: DocCommentSource;
    /** The tag line or trailing comment. */
    readonly Span: Span;
    readonly NameSpan: Span;
}

/** The descriptions written into a template. */
export interface TemplateDocComments {
    /** The text before the first tag of the first doc comment, or `null`. */
    readonly Summary: string | null;
    /** `@param` descriptions. */
    readonly Parameters: readonly DocCommentEntry[];
    /** `@field` descriptions and trailing `--:` descriptions, header entries first. */
    readonly Fields: readonly DocCommentEntry[];
}

/** One line of a comment body, with its offset in the text. */
interface CommentLine {
    readonly Text: string;
    readonly Start: number;
}

/** A tag being read: its line and the description lines gathered so far. */
interface OpenTag {
    readonly Tag: string;
    readonly Line: CommentLine;
    readonly Rest: string;
    readonly RestStart: number;
    readonly Continuation: string[];
}

const TAG_LINE = /^(\s*\*?\s*)@(\w+)\b\s*/;
const NAMED_TAGS: ReadonlySet<string> = new Set(['param', 'field']);
const TYPE_PREFIX = /^\{([^}]*)\}\s*/;
const NAME_FORMS = /^("([^"]+)"|\[([^\]]+)\]|`([^`]+)`|([A-Za-z_@#][\w@#$]*))\s*(?:-\s+)?/;

/** Reads the doc comments of a template: `{# @param / @field #}` headers and trailing `--:` comments. */
export class DocCommentReader {
    private readonly diagnostics: Diagnostic[] = [];
    private readonly parameters: DocCommentEntry[] = [];
    private readonly fields: DocCommentEntry[] = [];
    private summary: string | null = null;

    private constructor() {}

    /**
     * Reads every doc comment.
     * @param parameterNames - The template's parameters; an `@param` naming anything else is reported.
     */
    static Read(nodes: readonly TemplateNode[], tokens: SqlTokens, parameterNames: readonly string[]): Analysis<TemplateDocComments> {
        const reader = new DocCommentReader();
        for (const node of AllNodes(nodes)) if (node.Kind === 'DocComment') reader.readHeader(node);
        const trailing = TrailingDocReader.Read(tokens);
        reader.diagnostics.push(...trailing.Diagnostics);
        for (const entry of trailing.Entries) reader.add(reader.fields, entry);
        reader.checkParameters(parameterNames);
        const value: TemplateDocComments = { Summary: reader.summary, Parameters: reader.parameters, Fields: reader.fields };
        return { Value: value, Complete: true, Diagnostics: reader.diagnostics };
    }

    private readHeader(node: DocCommentNode): void {
        const lines = splitLines(node.Body, node.BodySpan.Start);
        const summaryLines: string[] = [];
        let open: OpenTag | null = null;
        let sawTag = false;
        for (const line of lines) {
            const tag = TAG_LINE.exec(line.Text);
            if (tag === null) {
                const text = line.Text.replace(/^\s*\*?\s?/, '').trimEnd();
                if (open) open.Continuation.push(text);
                else summaryLines.push(text);
                continue;
            }
            if (open) this.finishTag(open);
            sawTag = true;
            open = { Tag: tag[2], Line: line, Rest: line.Text.substring(tag[0].length), RestStart: line.Start + tag[0].length, Continuation: [] };
        }
        if (open) this.finishTag(open);
        if (sawTag && this.summary === null) {
            const text = summaryLines.join('\n').trim();
            this.summary = text.length > 0 ? text : null;
        }
    }

    private finishTag(open: OpenTag): void {
        const lineSpan = { Start: open.Line.Start, End: open.Line.Start + open.Line.Text.length };
        if (!NAMED_TAGS.has(open.Tag)) {
            this.diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.DocUnknownTag, 'Warning', lineSpan,
                `@${open.Tag} is not a doc-comment tag; it is ignored.`, 'Use @param Name description or @field Name description.'));
            return;
        }
        const entry = this.parseNamedTag(open, lineSpan);
        if (entry) this.add(open.Tag === 'param' ? this.parameters : this.fields, entry);
    }

    private parseNamedTag(open: OpenTag, lineSpan: Span): DocCommentEntry | null {
        const typeMatch = TYPE_PREFIX.exec(open.Rest);
        const afterType = typeMatch ? typeMatch[0].length : 0;
        const rest = open.Rest.substring(afterType);
        const name = NAME_FORMS.exec(rest);
        if (name === null) {
            this.diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.DocMissingName, 'Warning', lineSpan,
                `@${open.Tag} needs a name.`, `Write @${open.Tag} Name description.`));
            return null;
        }
        const nameText = name[2] ?? name[3] ?? name[4] ?? name[5];
        const nameStart = open.RestStart + afterType + (name[1].length - nameText.length > 0 ? 1 : 0);
        const description = [rest.substring(name[0].length).trim(), ...open.Continuation].join('\n').trim();
        return {
            Name: nameText, Description: description, DeclaredType: typeMatch ? typeMatch[1].trim() : null, Source: 'Header',
            Span: lineSpan, NameSpan: { Start: nameStart, End: nameStart + nameText.length },
        };
    }

    /** Adds an entry unless the name is already described; a second description is reported. */
    private add(list: DocCommentEntry[], entry: DocCommentEntry): void {
        const existing = list.find(e => e.Name.toLowerCase() === entry.Name.toLowerCase());
        if (!existing) {
            list.push(entry);
            return;
        }
        this.diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.DocDuplicate, 'Warning', entry.Span,
            `"${entry.Name}" is already described; this description is ignored.`, 'Describe each parameter and field once.'));
    }

    private checkParameters(parameterNames: readonly string[]): void {
        for (const entry of this.parameters) {
            if (parameterNames.includes(entry.Name)) continue;
            this.diagnostics.push(MakeDiagnostic(MJQueryDiagnosticCodes.DocUnknownParameter, 'Warning', entry.NameSpan,
                `@param ${entry.Name} does not name a parameter of this query.`, 'Fix the name, or remove the description.'));
        }
    }
}

function splitLines(body: string, start: number): CommentLine[] {
    const lines: CommentLine[] = [];
    let at = 0;
    for (const part of body.split('\n')) {
        lines.push({ Text: part.replace(/\r$/, ''), Start: start + at });
        at += part.length + 1;
    }
    return lines;
}

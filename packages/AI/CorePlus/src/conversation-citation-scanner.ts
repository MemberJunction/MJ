/**
 * Pure, dependency-free scanner for markdown code-protected ranges and
 * `[[EntityName|RecordID|DisplayName]]` / `[[EntityName|RecordID]]` wiki-citation tokens.
 *
 * Kept separate from `conversation-citations.ts` so `ConversationUtility.ToPlainText` can
 * strip wiki citations without introducing a circular dependency with `conversation-citations.ts`.
 */

export interface TextRange {
    Start: number;
    End: number;
}

export interface RawWikiCitationMatch {
    StartIndex: number;
    EndIndex: number;
    RawToken: string;
    EntityName: string;
    RecordID: string;
    DisplayName: string;
    HasExplicitDisplayName: boolean;
    Keys: Record<string, string | number>;
}

/**
 * Finds all character ranges `[Start, End)` inside fenced code blocks (``` / ~~~)
 * and inline backtick code spans so citation parsers never touch code examples.
 */
export function FindMarkdownCodeRanges(text: string): TextRange[] {
    if (!text) return [];

    const ranges: TextRange[] = [];
    const len = text.length;
    let i = 0;

    while (i < len) {
        // Check for fenced code block at start of text or immediately after a newline
        const atLineStart = i === 0 || text[i - 1] === '\n';
        if (atLineStart) {
            let lineCursor = i;
            let leadingSpaces = 0;
            while (lineCursor < len && text[lineCursor] === ' ' && leadingSpaces < 3) {
                lineCursor++;
                leadingSpaces++;
            }
            const fenceChar = text[lineCursor];
            if (fenceChar === '`' || fenceChar === '~') {
                let fenceLen = 0;
                while (lineCursor + fenceLen < len && text[lineCursor + fenceLen] === fenceChar) {
                    fenceLen++;
                }
                if (fenceLen >= 3) {
                    // Info string for backtick fences must not contain backticks (CommonMark)
                    const lineEnd = text.indexOf('\n', lineCursor + fenceLen);
                    const infoStr = lineEnd === -1
                        ? text.slice(lineCursor + fenceLen)
                        : text.slice(lineCursor + fenceLen, lineEnd);
                    if (fenceChar === '~' || !infoStr.includes('`')) {
                        const blockStart = i;
                        let scanPos = lineEnd === -1 ? len : lineEnd + 1;
                        let blockEnd = len;

                        while (scanPos < len) {
                            const nextNl = text.indexOf('\n', scanPos);
                            const rowEnd = nextNl === -1 ? len : nextNl;
                            const row = text.slice(scanPos, rowEnd).replace(/\r$/, '');
                            const closeMatch = row.match(
                                fenceChar === '`' ? /^ {0,3}(`{3,})[ \t]*$/ : /^ {0,3}(~{3,})[ \t]*$/
                            );
                            if (closeMatch && closeMatch[1].length >= fenceLen) {
                                blockEnd = nextNl === -1 ? len : nextNl + 1;
                                break;
                            }
                            scanPos = nextNl === -1 ? len : nextNl + 1;
                        }

                        ranges.push({ Start: blockStart, End: blockEnd });
                        i = blockEnd;
                        continue;
                    }
                }
            }
        }

        // Check for inline code span (run of N backticks closed by an exact run of N backticks)
        if (text[i] === '`') {
            const spanStart = i;
            let tickCount = 0;
            while (i < len && text[i] === '`') {
                tickCount++;
                i++;
            }

            let search = i;
            let matchedEnd = -1;
            while (search < len) {
                if (text[search] === '`') {
                    let closeCount = 0;
                    while (search + closeCount < len && text[search + closeCount] === '`') {
                        closeCount++;
                    }
                    if (closeCount === tickCount) {
                        matchedEnd = search + closeCount;
                        break;
                    }
                    search += closeCount;
                } else {
                    search++;
                }
            }

            if (matchedEnd !== -1) {
                ranges.push({ Start: spanStart, End: matchedEnd });
                i = matchedEnd;
            }
            continue;
        }

        i++;
    }

    return ranges;
}

/** Returns true if character offset `pos` lies within any protected code range. */
export function IsIndexInCodeRange(pos: number, codeRanges: readonly TextRange[]): boolean {
    for (const range of codeRanges) {
        if (pos < range.Start) {
            return false;
        }
        if (pos >= range.Start && pos < range.End) {
            return true;
        }
    }
    return false;
}

/**
 * Parses the RecordID segment of a wiki citation into a primary-key map.
 * Supports single primary keys (e.g. UUID or numeric ID -> `{ ID: recordId }`)
 * as well as composite keys (`Key1=Val1;Key2=Val2` -> `{ Key1: 'Val1', Key2: 'Val2' }`).
 */
export function ParseWikiCitationKeys(recordId: string): Record<string, string | number> {
    const trimmed = recordId.trim();
    if (!trimmed) {
        return {};
    }

    if (trimmed.includes('=')) {
        const parsed: Record<string, string | number> = {};
        const segments = trimmed.split(';');
        for (const segment of segments) {
            const eqIdx = segment.indexOf('=');
            if (eqIdx <= 0) continue;
            const key = segment.slice(0, eqIdx).trim();
            const val = segment.slice(eqIdx + 1).trim();
            if (key && val) {
                parsed[key] = val;
            }
        }
        if (Object.keys(parsed).length > 0) {
            return parsed;
        }
    }

    return { ID: trimmed };
}

/**
 * Scans `text` for valid `[[EntityName|RecordID|DisplayName]]` and `[[EntityName|RecordID]]`
 * wiki-citation tokens outside fenced code blocks and inline code spans.
 */
export function ScanWikiCitationTokens(
    text: string,
    precomputedCodeRanges?: readonly TextRange[]
): RawWikiCitationMatch[] {
    if (!text || !text.includes('[[')) {
        return [];
    }

    const codeRanges = precomputedCodeRanges ?? FindMarkdownCodeRanges(text);
    const matches: RawWikiCitationMatch[] = [];
    const regex = /\[\[([^\]\[\r\n]+)\]\]/g;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const startIndex = match.index;
        const rawToken = match[0];
        const endIndex = startIndex + rawToken.length;

        if (IsIndexInCodeRange(startIndex, codeRanges)) {
            continue;
        }

        const inner = match[1];
        const parts = inner.split('|');
        if (parts.length < 2) {
            continue;
        }

        const entityName = parts[0].trim();
        const recordId = parts[1].trim();
        if (!entityName || !recordId) {
            continue;
        }

        const rawDisplayName = parts.length >= 3 ? parts.slice(2).join('|').trim() : '';
        const hasExplicitDisplayName = rawDisplayName.length > 0;
        const displayName = hasExplicitDisplayName ? rawDisplayName : entityName;
        const keys = ParseWikiCitationKeys(recordId);

        matches.push({
            StartIndex: startIndex,
            EndIndex: endIndex,
            RawToken: rawToken,
            EntityName: entityName,
            RecordID: recordId,
            DisplayName: displayName,
            HasExplicitDisplayName: hasExplicitDisplayName,
            Keys: keys,
        });
    }

    return matches;
}

/**
 * Replaces `[[EntityName|RecordID|DisplayName]]` and `[[EntityName|RecordID]]` tokens
 * outside markdown code blocks/spans with their plain-text display name.
 */
export function ReplaceWikiCitationsWithPlainText(text: string): string {
    const matches = ScanWikiCitationTokens(text);
    if (matches.length === 0) {
        return text;
    }

    let result = text;
    for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i];
        result = result.substring(0, m.StartIndex) + m.DisplayName + result.substring(m.EndIndex);
    }
    return result;
}

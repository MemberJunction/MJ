import {
    EntityInfo,
    IMetadataProvider,
    IRunQueryProvider,
    LogError,
    Metadata,
    ProjectEntityValueRowsForUser,
    QueryInfo,
    RunQuery,
    RunView,
    RunViewParams,
    StripServerOnlyRunQueryParams,
    UserInfo
} from '@memberjunction/core';
import { BaseSingleton, EscapeSQLString, GetGlobalObjectStore, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { ArtifactPermissionEngine } from './ArtifactPermissionDelegate';
import {
    ArtifactAiFormulaCellRequest,
    ArtifactEvaluateAiFormulaOperation
} from '../generated/remote_operations.js';
import { MAX_AI_FORMULA_BATCH_CELLS } from './operations/ArtifactEvaluateAiFormulaOperation';
import {
    BuildBlockIdentityBinding,
    ComputeFrozenSnapshotHash,
    DocumentBlockColumn,
    DocumentBlockExecutionResult,
    DocumentBlockMode,
    DocumentBlockSpec,
    DocumentLiveBlockEngine,
    FrozenBlockSnapshot,
    FrozenSnapshotIdentityBinding,
    ValidateFrozenBlockSnapshot
} from './DocumentLiveBlockEngine';

/**
 * Alias for {@link FrozenBlockSnapshot} used across document and spreadsheet freeze flows (`C2`).
 */
export type DocumentFrozenSnapshot = FrozenBlockSnapshot;

interface RegexAsciiBitSet {
    m0: number;
    m1: number;
    m2: number;
    m3: number;
    nonAsciiSpace: boolean;
    nonAsciiOther: boolean;
}

interface RegexAtomCharSet {
    cs: RegexAsciiBitSet;
    ci: RegexAsciiBitSet;
}

function createEmptyBitSet(): RegexAsciiBitSet {
    return {
        m0: 0,
        m1: 0,
        m2: 0,
        m3: 0,
        nonAsciiSpace: false,
        nonAsciiOther: false
    };
}

function createAllBitSet(): RegexAsciiBitSet {
    return {
        m0: -1,
        m1: -1,
        m2: -1,
        m3: -1,
        nonAsciiSpace: true,
        nonAsciiOther: true
    };
}

function cloneBitSet(src: RegexAsciiBitSet): RegexAsciiBitSet {
    return {
        m0: src.m0,
        m1: src.m1,
        m2: src.m2,
        m3: src.m3,
        nonAsciiSpace: src.nonAsciiSpace,
        nonAsciiOther: src.nonAsciiOther
    };
}

function invertBitSet(src: RegexAsciiBitSet): RegexAsciiBitSet {
    return {
        m0: ~src.m0,
        m1: ~src.m1,
        m2: ~src.m2,
        m3: ~src.m3,
        nonAsciiSpace: !src.nonAsciiSpace,
        nonAsciiOther: !src.nonAsciiOther
    };
}

function unionBitSets(a: RegexAsciiBitSet, b: RegexAsciiBitSet): RegexAsciiBitSet {
    return {
        m0: a.m0 | b.m0,
        m1: a.m1 | b.m1,
        m2: a.m2 | b.m2,
        m3: a.m3 | b.m3,
        nonAsciiSpace: a.nonAsciiSpace || b.nonAsciiSpace,
        nonAsciiOther: a.nonAsciiOther || b.nonAsciiOther
    };
}

function bitSetsOverlap(a: RegexAsciiBitSet, b: RegexAsciiBitSet): boolean {
    if (((a.m0 & b.m0) | (a.m1 & b.m1) | (a.m2 & b.m2) | (a.m3 & b.m3)) !== 0) {
        return true;
    }
    if (a.nonAsciiSpace && b.nonAsciiSpace) {
        return true;
    }
    if (a.nonAsciiOther && b.nonAsciiOther) {
        return true;
    }
    return false;
}

function setCodePointInBitSet(bs: RegexAsciiBitSet, code: number): void {
    if (code >= 0 && code < 32) {
        bs.m0 |= 1 << code;
    } else if (code >= 32 && code < 64) {
        bs.m1 |= 1 << (code - 32);
    } else if (code >= 64 && code < 96) {
        bs.m2 |= 1 << (code - 64);
    } else if (code >= 96 && code < 128) {
        bs.m3 |= 1 << (code - 96);
    } else if (
        code === 0x00a0 ||
        code === 0x1680 ||
        (code >= 0x2000 && code <= 0x200a) ||
        code === 0x2028 ||
        code === 0x2029 ||
        code === 0x202f ||
        code === 0x205f ||
        code === 0x3000 ||
        code === 0xfeff
    ) {
        bs.nonAsciiSpace = true;
    } else {
        bs.nonAsciiOther = true;
    }
}

function createEmptyAtomSet(): RegexAtomCharSet {
    return {
        cs: createEmptyBitSet(),
        ci: createEmptyBitSet()
    };
}

function createWildcardAtomSet(): RegexAtomCharSet {
    return {
        cs: createAllBitSet(),
        ci: createAllBitSet()
    };
}

function cloneAtomSet(src: RegexAtomCharSet | null): RegexAtomCharSet | null {
    if (!src) return null;
    return {
        cs: cloneBitSet(src.cs),
        ci: cloneBitSet(src.ci)
    };
}

function classifySingleRegexChar(ch: string): RegexAtomCharSet {
    const out = createEmptyAtomSet();
    const code = ch.charCodeAt(0);
    setCodePointInBitSet(out.cs, code);
    setCodePointInBitSet(out.ci, code);
    if (code >= 65 && code <= 90) {
        setCodePointInBitSet(out.ci, code + 32);
    } else if (code >= 97 && code <= 122) {
        setCodePointInBitSet(out.ci, code - 32);
    } else if (code >= 128) {
        const lower = ch.toLowerCase();
        const upper = ch.toUpperCase();
        if (lower.length === 1) setCodePointInBitSet(out.ci, lower.charCodeAt(0));
        if (upper.length === 1) setCodePointInBitSet(out.ci, upper.charCodeAt(0));
    }
    return out;
}

function buildDigitBitSet(): RegexAsciiBitSet {
    const bs = createEmptyBitSet();
    for (let c = 48; c <= 57; c++) setCodePointInBitSet(bs, c);
    return bs;
}

function buildWordBitSet(): RegexAsciiBitSet {
    const bs = buildDigitBitSet();
    for (let c = 65; c <= 90; c++) setCodePointInBitSet(bs, c);
    for (let c = 97; c <= 122; c++) setCodePointInBitSet(bs, c);
    setCodePointInBitSet(bs, 95);
    return bs;
}

function buildSpaceBitSet(): RegexAsciiBitSet {
    const bs = createEmptyBitSet();
    for (const c of [9, 10, 11, 12, 13, 32]) setCodePointInBitSet(bs, c);
    bs.nonAsciiSpace = true;
    return bs;
}

function classifyEscapedRegexAtom(esc: string): RegexAtomCharSet {
    switch (esc) {
        case 'd': {
            const d = buildDigitBitSet();
            return { cs: d, ci: cloneBitSet(d) };
        }
        case 'D': {
            const notD = invertBitSet(buildDigitBitSet());
            return { cs: notD, ci: cloneBitSet(notD) };
        }
        case 'w': {
            const wCs = buildWordBitSet();
            const wCi = cloneBitSet(wCs);
            wCi.nonAsciiOther = true;
            return { cs: wCs, ci: wCi };
        }
        case 'W': {
            const notW = invertBitSet(buildWordBitSet());
            return { cs: notW, ci: cloneBitSet(notW) };
        }
        case 's': {
            const s = buildSpaceBitSet();
            return { cs: s, ci: cloneBitSet(s) };
        }
        case 'S': {
            const notS = invertBitSet(buildSpaceBitSet());
            return { cs: notS, ci: cloneBitSet(notS) };
        }
        case 't':
            return classifySingleRegexChar('\t');
        case 'r':
            return classifySingleRegexChar('\r');
        case 'n':
            return classifySingleRegexChar('\n');
        case 'f':
            return classifySingleRegexChar('\f');
        case 'v':
            return classifySingleRegexChar('\v');
        case '0':
            return classifySingleRegexChar('\0');
        default:
            return classifySingleRegexChar(esc);
    }
}

function unionAtomSets(a: RegexAtomCharSet | null, b: RegexAtomCharSet | null): RegexAtomCharSet | null {
    if (!a) return cloneAtomSet(b);
    if (!b) return cloneAtomSet(a);
    return {
        cs: unionBitSets(a.cs, b.cs),
        ci: unionBitSets(a.ci, b.ci)
    };
}

function regexAtomSetsOverlap(a: RegexAtomCharSet, b: RegexAtomCharSet): boolean {
    return bitSetsOverlap(a.cs, b.cs) || bitSetsOverlap(a.ci, b.ci);
}

function parseRegexQuantifierAt(
    pattern: string,
    idx: number
): { min: number; max: number; hasQuantifier: boolean; nextIdx: number; invalidRange: boolean } {
    if (idx >= pattern.length) {
        return { min: 1, max: 1, hasQuantifier: false, nextIdx: idx, invalidRange: false };
    }
    const ch = pattern[idx];
    let min = 1;
    let max = 1;
    let nextIdx = idx;
    if (ch === '*') {
        min = 0;
        max = Number.POSITIVE_INFINITY;
        nextIdx = idx + 1;
    } else if (ch === '+') {
        min = 1;
        max = Number.POSITIVE_INFINITY;
        nextIdx = idx + 1;
    } else if (ch === '?') {
        min = 0;
        max = 1;
        nextIdx = idx + 1;
    } else if (ch === '{') {
        const braceMatch = /^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(idx));
        if (!braceMatch) {
            return { min: 1, max: 1, hasQuantifier: false, nextIdx: idx, invalidRange: false };
        }
        min = parseInt(braceMatch[1], 10);
        if (braceMatch[2] === undefined) {
            max = min;
        } else if (braceMatch[2] === '') {
            max = Number.POSITIVE_INFINITY;
        } else {
            max = parseInt(braceMatch[2], 10);
        }
        if (min > 64 || (Number.isFinite(max) && max > 64) || max < min) {
            return { min, max, hasQuantifier: true, nextIdx: idx + braceMatch[0].length, invalidRange: true };
        }
        nextIdx = idx + braceMatch[0].length;
    } else {
        return { min: 1, max: 1, hasQuantifier: false, nextIdx: idx, invalidRange: false };
    }
    // Optional lazy/possessive modifier '?'
    if (nextIdx < pattern.length && pattern[nextIdx] === '?') {
        nextIdx++;
    }
    return { min, max, hasQuantifier: true, nextIdx, invalidRange: false };
}

/**
 * Validates that a user- or agent-supplied regular expression is safe against:
 * 1. Exponential star-height / nested quantifiers (`(a+)+`, `(a?)+`, `(a+){2,}`),
 * 2. Overlapping or non-deterministic quantified alternations (`(a|a)*`, `(a|aa)+`, `(ab|a)*`, `(\d|[0-9])+`),
 *    while permitting deterministic pairwise-disjoint quantified alternations (`(a|b)*c`, `(foo|bar)+`),
 * 3. Backreferences (`\1`..`\9`, `\k<...>`), lookbehinds, and quantified lookarounds,
 * 4. Polynomial `O(N^2)` / `O(N^3)` backtracking from overlapping quantified tokens without a
 *    mandatory disjoint separator (`\d+\d+\d+$`, `\w+.*\w+$`, `a+b*a+`, `.*foo.*bar`) (`E8`).
 */
export function IsSafeUserRegex(pattern: string, flags?: string): boolean {
    if (!pattern || typeof pattern !== 'string' || pattern.length > 256) {
        return false;
    }
    try {
        new RegExp(pattern, flags);
    } catch {
        return false;
    }

    interface GroupFrame {
        hasInnerQuantifier: boolean;
        hasInnerAssertion: boolean;
        hasAlternation: boolean;
        isLookaround: boolean;
        entryActiveSet: RegexAtomCharSet | null;
        branchesCombinedSet: RegexAtomCharSet | null;
        groupAtomSet: RegexAtomCharSet;
        completedBranchFirstSets: RegexAtomCharSet[];
        currentBranchFirstSet: RegexAtomCharSet | null;
        currentBranchAtomCount: number;
        allInnerGroupsDeterministic: boolean;
    }

    const groupStack: GroupFrame[] = [];
    let activeRepeatingSet: RegexAtomCharSet | null = null;
    let totalRepeatingQuantifiers = 0;
    let totalBranchingConstructs = 0;

    const markCurrentGroupQuantifier = (): void => {
        if (groupStack.length > 0) {
            groupStack[groupStack.length - 1].hasInnerQuantifier = true;
        }
    };

    const markCurrentGroupAssertion = (): void => {
        if (groupStack.length > 0) {
            groupStack[groupStack.length - 1].hasInnerAssertion = true;
        }
    };

    const mergeIntoCurrentGroupAtom = (atom: RegexAtomCharSet): void => {
        if (groupStack.length > 0) {
            const top = groupStack[groupStack.length - 1];
            const u = unionAtomSets(top.groupAtomSet, atom);
            if (u) {
                top.groupAtomSet = u;
            }
        }
    };

    const recordRequiredStartAtomInCurrentBranch = (firstAtom: RegexAtomCharSet | null, min: number): void => {
        if (groupStack.length === 0) return;
        const top = groupStack[groupStack.length - 1];
        if (min >= 1) {
            if (top.currentBranchAtomCount === 0 && firstAtom) {
                top.currentBranchFirstSet = cloneAtomSet(firstAtom);
            }
            top.currentBranchAtomCount++;
        }
    };

    const applyAtomWithQuantifier = (atom: RegexAtomCharSet, min: number, max: number, hasQuant: boolean): boolean => {
        if (hasQuant) {
            markCurrentGroupQuantifier();
        }
        recordRequiredStartAtomInCurrentBranch(atom, min);
        if (max > min) {
            totalBranchingConstructs++;
            if (totalBranchingConstructs > 10) {
                return false;
            }
        }
        mergeIntoCurrentGroupAtom(atom);
        const isRepeating = max > 1 && max > min;
        if (isRepeating) {
            totalRepeatingQuantifiers++;
            if (totalRepeatingQuantifiers > 6) {
                return false;
            }
            if (activeRepeatingSet && regexAtomSetsOverlap(activeRepeatingSet, atom)) {
                return false;
            }
            if (min === 0) {
                activeRepeatingSet = unionAtomSets(activeRepeatingSet, atom);
            } else {
                activeRepeatingSet = cloneAtomSet(atom);
            }
            return true;
        }
        // Non-repeating atom (either unquantified min=1,max=1, fixed {k}, or optional ? min=0,max=1)
        if (min >= 1 && activeRepeatingSet && !regexAtomSetsOverlap(activeRepeatingSet, atom)) {
            activeRepeatingSet = null;
        }
        return true;
    };

    let i = 0;
    while (i < pattern.length) {
        const ch = pattern[i];

        // Anchors & zero-width assertions
        if (ch === '^' || ch === '$') {
            markCurrentGroupAssertion();
            i++;
            continue;
        }

        // Escape sequence outside character class
        if (ch === '\\') {
            if (i + 1 >= pattern.length) {
                return false;
            }
            const next = pattern[i + 1];
            // Reject backreferences \1..\9 and named backreferences \k<...>
            if ((next >= '1' && next <= '9') || next === 'k') {
                return false;
            }
            // Word boundaries \b / \B are zero-width
            if (next === 'b' || next === 'B') {
                markCurrentGroupAssertion();
                i += 2;
                continue;
            }
            let afterEsc = i + 2;
            let atom: RegexAtomCharSet;
            if (
                (next === 'x' && /^[0-9A-Fa-f]{2}/.test(pattern.slice(afterEsc))) ||
                (next === 'u' && /^[0-9A-Fa-f]{4}/.test(pattern.slice(afterEsc)))
            ) {
                const hexLen = next === 'x' ? 2 : 4;
                const code = parseInt(pattern.slice(afterEsc, afterEsc + hexLen), 16);
                afterEsc += hexLen;
                atom = classifySingleRegexChar(String.fromCharCode(code));
            } else if (next === 'u' && pattern[afterEsc] === '{') {
                const uBrace = /^\{([0-9A-Fa-f]{1,6})\}/.exec(pattern.slice(afterEsc));
                if (!uBrace) return false;
                afterEsc += uBrace[0].length;
                const code = parseInt(uBrace[1], 16);
                atom = code <= 0xffff ? classifySingleRegexChar(String.fromCharCode(code)) : createWildcardAtomSet();
            } else if (next === 'p' || next === 'P') {
                const propMatch = /^\{[^}]*\}/.exec(pattern.slice(afterEsc));
                if (propMatch) afterEsc += propMatch[0].length;
                atom = createWildcardAtomSet();
            } else {
                atom = classifyEscapedRegexAtom(next);
            }
            const q = parseRegexQuantifierAt(pattern, afterEsc);
            if (q.invalidRange) return false;
            if (!applyAtomWithQuantifier(atom, q.min, q.max, q.hasQuantifier)) return false;
            i = q.nextIdx;
            continue;
        }

        // Character class [...]
        if (ch === '[') {
            let j = i + 1;
            let negated = false;
            if (j < pattern.length && pattern[j] === '^') {
                negated = true;
                j++;
            }
            const classBodyStart = j;
            let classSet = createEmptyAtomSet();

            const readClassEscape = (
                idx: number
            ): { nextIdx: number; codePoint: number | null; atomSet: ReturnType<typeof createEmptyAtomSet> } | null => {
                if (idx + 1 >= pattern.length) return null;
                const esc = pattern[idx + 1];
                let afterEsc = idx + 2;
                if (esc === 'x') {
                    const hex = pattern.slice(afterEsc, afterEsc + 2);
                    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
                    const code = parseInt(hex, 16);
                    return { nextIdx: afterEsc + 2, codePoint: code, atomSet: classifySingleRegexChar(String.fromCharCode(code)) };
                }
                if (esc === 'u') {
                    if (pattern[afterEsc] === '{') {
                        const uBrace = /^\{([0-9A-Fa-f]{1,6})\}/.exec(pattern.slice(afterEsc));
                        if (!uBrace) return null;
                        const code = parseInt(uBrace[1], 16);
                        if (code > 0x10ffff) return null;
                        return {
                            nextIdx: afterEsc + uBrace[0].length,
                            codePoint: code,
                            atomSet: code <= 0xffff ? classifySingleRegexChar(String.fromCharCode(code)) : createWildcardAtomSet()
                        };
                    }
                    const hex = pattern.slice(afterEsc, afterEsc + 4);
                    if (!/^[0-9A-Fa-f]{4}$/.test(hex)) return null;
                    const code = parseInt(hex, 16);
                    return { nextIdx: afterEsc + 4, codePoint: code, atomSet: classifySingleRegexChar(String.fromCharCode(code)) };
                }
                const controlEscapes: Record<string, number> = {
                    b: 8,
                    t: 9,
                    n: 10,
                    v: 11,
                    f: 12,
                    r: 13,
                    '0': 0
                };
                if (Object.hasOwn(controlEscapes, esc)) {
                    const code = controlEscapes[esc];
                    return { nextIdx: afterEsc, codePoint: code, atomSet: classifySingleRegexChar(String.fromCharCode(code)) };
                }
                const escSet = classifyEscapedRegexAtom(esc);
                const isShorthandClass = esc === 'd' || esc === 'D' || esc === 'w' || esc === 'W' || esc === 's' || esc === 'S' || esc === 'p' || esc === 'P';
                if ((esc === 'p' || esc === 'P') && pattern[afterEsc] === '{') {
                    const propMatch = /^\{[^}]*\}/.exec(pattern.slice(afterEsc));
                    if (propMatch) afterEsc += propMatch[0].length;
                }
                return {
                    nextIdx: afterEsc,
                    codePoint: isShorthandClass ? null : esc.charCodeAt(0),
                    atomSet: escSet
                };
            };

            while (j < pattern.length) {
                const c = pattern[j];
                if (c === ']' && j > classBodyStart) {
                    j++;
                    break;
                }
                let startParsed: { nextIdx: number; codePoint: number | null; atomSet: ReturnType<typeof createEmptyAtomSet> } | null = null;
                if (c === '\\') {
                    startParsed = readClassEscape(j);
                    if (!startParsed) return false;
                } else {
                    startParsed = {
                        nextIdx: j + 1,
                        codePoint: c.charCodeAt(0),
                        atomSet: classifySingleRegexChar(c)
                    };
                }

                if (
                    startParsed.codePoint !== null &&
                    startParsed.nextIdx + 1 < pattern.length &&
                    pattern[startParsed.nextIdx] === '-' &&
                    pattern[startParsed.nextIdx + 1] !== ']'
                ) {
                    const endStartIdx = startParsed.nextIdx + 1;
                    let endCode: number | null = null;
                    let afterRangeIdx = endStartIdx + 1;
                    if (pattern[endStartIdx] === '\\') {
                        const endParsed = readClassEscape(endStartIdx);
                        if (!endParsed) return false;
                        endCode = endParsed.codePoint;
                        afterRangeIdx = endParsed.nextIdx;
                    } else {
                        endCode = pattern[endStartIdx].charCodeAt(0);
                    }
                    if (endCode !== null) {
                        const startCode = startParsed.codePoint;
                        const span = Math.min(256, Math.max(0, endCode - startCode));
                        for (let k = 0; k <= span; k++) {
                            const rangeCharSet = classifySingleRegexChar(String.fromCharCode(startCode + k));
                            classSet = unionAtomSets(classSet, rangeCharSet) ?? classSet;
                        }
                        j = afterRangeIdx;
                        continue;
                    }
                }

                classSet = unionAtomSets(classSet, startParsed.atomSet) ?? classSet;
                j = startParsed.nextIdx;
            }

            if (negated) {
                classSet = {
                    cs: invertBitSet(classSet.cs),
                    ci: invertBitSet(classSet.ci)
                };
            }

            const q = parseRegexQuantifierAt(pattern, j);
            if (q.invalidRange) return false;
            if (!applyAtomWithQuantifier(classSet, q.min, q.max, q.hasQuantifier)) return false;
            i = q.nextIdx;
            continue;
        }

        // Group open (...)
        if (ch === '(') {
            let headerLen = 1;
            let isLookaround = false;
            if (pattern[i + 1] === '?') {
                if (pattern[i + 2] === ':') {
                    headerLen = 3;
                } else if (pattern[i + 2] === '=' || pattern[i + 2] === '!') {
                    headerLen = 3;
                    isLookaround = true;
                } else if (pattern[i + 2] === '<' && (pattern[i + 3] === '=' || pattern[i + 3] === '!')) {
                    // Reject lookbehinds in user regexes
                    return false;
                } else if (pattern[i + 2] === '<') {
                    const namedMatch = /^\?<[^>]+>/.exec(pattern.slice(i + 1));
                    if (!namedMatch) return false;
                    headerLen = 1 + namedMatch[0].length;
                } else {
                    return false;
                }
            }
            groupStack.push({
                hasInnerQuantifier: false,
                hasInnerAssertion: false,
                hasAlternation: false,
                isLookaround,
                entryActiveSet: cloneAtomSet(activeRepeatingSet),
                branchesCombinedSet: null,
                groupAtomSet: createEmptyAtomSet(),
                completedBranchFirstSets: [],
                currentBranchFirstSet: null,
                currentBranchAtomCount: 0,
                allInnerGroupsDeterministic: true
            });
            i += headerLen;
            continue;
        }

        // Alternation |
        if (ch === '|') {
            totalBranchingConstructs++;
            if (totalBranchingConstructs > 10) {
                return false;
            }
            if (groupStack.length > 0) {
                const top = groupStack[groupStack.length - 1];
                top.hasAlternation = true;
                if (top.currentBranchAtomCount === 0 || !top.currentBranchFirstSet) {
                    top.allInnerGroupsDeterministic = false;
                } else {
                    top.completedBranchFirstSets.push(top.currentBranchFirstSet);
                }
                top.currentBranchFirstSet = null;
                top.currentBranchAtomCount = 0;
                top.branchesCombinedSet = unionAtomSets(top.branchesCombinedSet, activeRepeatingSet);
                activeRepeatingSet = cloneAtomSet(top.entryActiveSet);
            } else {
                // Top-level alternation resets active repeating set per independent top-level branch
                activeRepeatingSet = null;
            }
            i++;
            continue;
        }

        // Group close )
        if (ch === ')') {
            const closed = groupStack.pop();
            if (!closed) return false;
            const q = parseRegexQuantifierAt(pattern, i + 1);
            if (q.invalidRange) return false;

            if (closed.isLookaround) {
                // Reject lookaheads containing inner quantifiers or followed by quantifiers
                if (closed.hasInnerQuantifier || q.hasQuantifier) {
                    return false;
                }
                markCurrentGroupAssertion();
                activeRepeatingSet = cloneAtomSet(closed.entryActiveSet);
                i = q.nextIdx;
                continue;
            }

            let closedIsDeterministic =
                !closed.hasInnerQuantifier &&
                !closed.hasInnerAssertion &&
                closed.allInnerGroupsDeterministic &&
                closed.currentBranchAtomCount >= 1 &&
                closed.currentBranchFirstSet !== null;

            let closedCombinedFirstSet: RegexAtomCharSet | null = closed.currentBranchFirstSet;
            if (closed.hasAlternation) {
                if (closedIsDeterministic && closed.currentBranchFirstSet) {
                    const allBranchStarts = [...closed.completedBranchFirstSets, closed.currentBranchFirstSet];
                    for (let a = 0; a < allBranchStarts.length && closedIsDeterministic; a++) {
                        for (let b = a + 1; b < allBranchStarts.length; b++) {
                            if (regexAtomSetsOverlap(allBranchStarts[a], allBranchStarts[b])) {
                                closedIsDeterministic = false;
                                break;
                            }
                        }
                    }
                    let combinedFirst: RegexAtomCharSet | null = null;
                    for (const fs of allBranchStarts) {
                        combinedFirst = unionAtomSets(combinedFirst, fs);
                    }
                    closedCombinedFirstSet = combinedFirst;
                } else {
                    closedIsDeterministic = false;
                    closedCombinedFirstSet = null;
                }
            }

            // Reject star-height > 1 or non-deterministic / overlapping quantified alternation
            if (q.max > 1 && (closed.hasInnerQuantifier || !closedIsDeterministic)) {
                return false;
            }

            const endOfBranchesSet = closed.hasAlternation
                ? unionAtomSets(closed.branchesCombinedSet, activeRepeatingSet)
                : activeRepeatingSet;

            if (q.max > q.min) {
                totalBranchingConstructs++;
                if (totalBranchingConstructs > 10) return false;
            }

            if (q.max > 1 && q.max > q.min) {
                // Repeating simple group or deterministic pairwise-disjoint alternation group
                totalRepeatingQuantifiers++;
                if (totalRepeatingQuantifiers > 6) return false;
                if (closed.entryActiveSet && regexAtomSetsOverlap(closed.entryActiveSet, closed.groupAtomSet)) {
                    return false;
                }
                activeRepeatingSet =
                    q.min === 0
                        ? unionAtomSets(closed.entryActiveSet, closed.groupAtomSet)
                        : cloneAtomSet(closed.groupAtomSet);
            } else if (q.min === 0) {
                // Optional group (...)? -> union of skipping vs taking the group
                activeRepeatingSet = unionAtomSets(closed.entryActiveSet, endOfBranchesSet);
            } else {
                // Non-repeating group with min >= 1: if every branch consumes >= 1 atom disjoint from entryActiveSet, clear it
                if (
                    closedCombinedFirstSet &&
                    closed.allInnerGroupsDeterministic &&
                    closed.currentBranchAtomCount >= 1 &&
                    closed.entryActiveSet &&
                    !regexAtomSetsOverlap(closed.entryActiveSet, closedCombinedFirstSet) &&
                    !closed.hasInnerQuantifier
                ) {
                    activeRepeatingSet = null;
                } else {
                    activeRepeatingSet = endOfBranchesSet;
                }
            }

            if (q.hasQuantifier || closed.hasInnerQuantifier) {
                markCurrentGroupQuantifier();
            }
            if (!closedIsDeterministic && groupStack.length > 0) {
                groupStack[groupStack.length - 1].allInnerGroupsDeterministic = false;
            }
            if (closed.hasInnerAssertion) {
                markCurrentGroupAssertion();
            }
            recordRequiredStartAtomInCurrentBranch(closedCombinedFirstSet, q.min);
            mergeIntoCurrentGroupAtom(closed.groupAtomSet);
            i = q.nextIdx;
            continue;
        }

        // Wildcard dot .
        if (ch === '.') {
            const dotAtom = createWildcardAtomSet();
            const q = parseRegexQuantifierAt(pattern, i + 1);
            if (q.invalidRange) return false;
            if (!applyAtomWithQuantifier(dotAtom, q.min, q.max, q.hasQuantifier)) return false;
            i = q.nextIdx;
            continue;
        }

        // Ordinary literal character
        const litAtom = classifySingleRegexChar(ch);
        const q = parseRegexQuantifierAt(pattern, i + 1);
        if (q.invalidRange) return false;
        if (!applyAtomWithQuantifier(litAtom, q.min, q.max, q.hasQuantifier)) return false;
        i = q.nextIdx;
    }

    return groupStack.length === 0;
}

/**
 * Compiles a user-supplied regex pattern after validating it with {@link IsSafeUserRegex},
 * returning `null` if invalid or unsafe (`E8`).
 */
export function CompileSafeUserRegex(pattern: string, flags?: string): RegExp | null {
    if (!IsSafeUserRegex(pattern, flags)) {
        return null;
    }
    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
}

/**
 * Detailed outcome returned by {@link SafeRegexSearchDetailed} (`R6-6`, `R7-3`).
 */
export interface SafeRegexSearchResult {
    Matched: boolean;
    TimedOut: boolean;
    InputTooLong: boolean;
}

/**
 * Optional host-provided preemptive regex sandbox executor (e.g. `node:vm` in server packages)
 * evaluated against the **entire unmodified** input string (`R7-3`).
 */
export type SafeRegexSandboxExecutor = (
    regex: RegExp,
    input: string,
    maxDurationMs: number
) => { Matched: boolean; TimedOut: boolean };

/**
 * Result returned by a {@link SafeRegexBatchSandboxExecutor} (`R9-4`).
 */
export interface SafeRegexBatchSandboxResult {
    Matches: boolean[];
    TimedOut: boolean;
    TimedOutIndex?: number;
}

/**
 * Optional host-provided batched preemptive regex sandbox executor (e.g. `node:vm` in server packages)
 * that tests a batch of whole candidate strings in a single sandbox invocation (`R8-6`, `R9-4`).
 */
export type SafeRegexBatchSandboxExecutor = (
    regex: RegExp,
    inputs: readonly string[],
    maxDurationMs: number
) => SafeRegexBatchSandboxResult;

const SAFE_REGEX_SANDBOX_STORE_KEY = '___MJ_SAFE_REGEX_SANDBOX_EXECUTOR___';
const SAFE_REGEX_BATCH_SANDBOX_STORE_KEY = '___MJ_SAFE_REGEX_BATCH_SANDBOX_EXECUTOR___';

/**
 * Registers (or clears when `null`) a process-wide {@link SafeRegexSandboxExecutor} in
 * `MJGlobal.Instance.GetGlobalObjectStore()` so server packages can provide preemptive
 * `node:vm` timeout enforcement without leaking `node:*` imports into browser bundles (`R7-3`).
 */
export function RegisterSafeRegexSandboxExecutor(executor: SafeRegexSandboxExecutor | null): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (!store) return;
    if (executor) {
        store[SAFE_REGEX_SANDBOX_STORE_KEY] = executor;
    } else {
        delete store[SAFE_REGEX_SANDBOX_STORE_KEY];
    }
}

/**
 * Retrieves the currently registered {@link SafeRegexSandboxExecutor}, or `null` if none is registered.
 */
export function GetSafeRegexSandboxExecutor(): SafeRegexSandboxExecutor | null {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    const candidate = store?.[SAFE_REGEX_SANDBOX_STORE_KEY];
    return typeof candidate === 'function' ? (candidate as SafeRegexSandboxExecutor) : null;
}

/**
 * Registers (or clears when `null`) a process-wide {@link SafeRegexBatchSandboxExecutor} in
 * `MJGlobal.Instance.GetGlobalObjectStore()` so server packages can amortize `node:vm` boundary
 * overhead across hundreds of cells/lines per batch (`R8-6`).
 */
export function RegisterSafeRegexBatchSandboxExecutor(executor: SafeRegexBatchSandboxExecutor | null): void {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    if (!store) return;
    if (executor) {
        store[SAFE_REGEX_BATCH_SANDBOX_STORE_KEY] = executor;
    } else {
        delete store[SAFE_REGEX_BATCH_SANDBOX_STORE_KEY];
    }
}

/**
 * Retrieves the currently registered {@link SafeRegexBatchSandboxExecutor}, or `null` if none is registered (`R8-6`).
 */
export function GetSafeRegexBatchSandboxExecutor(): SafeRegexBatchSandboxExecutor | null {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    const candidate = store?.[SAFE_REGEX_BATCH_SANDBOX_STORE_KEY];
    return typeof candidate === 'function' ? (candidate as SafeRegexBatchSandboxExecutor) : null;
}

interface CompiledSafeRegexPlan {
    cleanRx: RegExp;
    isLinearGuaranteed: boolean;
    hasQuantifiedAlternation: boolean;
}

const SAFE_REGEX_VALIDATION_CACHE_STORE_KEY = '___MJ_SPREADSHEET_SAFE_REGEX_VALIDATION_CACHE';
function getSafeRegexValidationCache(): WeakMap<RegExp, CompiledSafeRegexPlan | false> {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    let cache = store[SAFE_REGEX_VALIDATION_CACHE_STORE_KEY] as
        | WeakMap<RegExp, CompiledSafeRegexPlan | false>
        | undefined;
    if (!cache) {
        cache = new WeakMap<RegExp, CompiledSafeRegexPlan | false>();
        store[SAFE_REGEX_VALIDATION_CACHE_STORE_KEY] = cache;
    }
    return cache;
}

/**
 * Pure-ECMAScript WHATWG-compliant UTF-8 encoder fallback for bare VMs without `TextEncoder` or `Buffer`.
 * Replaces any lone high or low UTF-16 surrogate with `0xEF 0xBF 0xBD` (`U+FFFD`).
 */
export function EncodeUtf8Fallback(str: string): Uint8Array {
    const out: number[] = [];
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 0x80) {
            out.push(code);
        } else if (code < 0x800) {
            out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code >= 0xd800 && code <= 0xdbff) {
            if (i + 1 < str.length) {
                const next = str.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    const cp = 0x10000 + (((code & 0x3ff) << 10) | (next & 0x3ff));
                    out.push(
                        0xf0 | (cp >> 18),
                        0x80 | ((cp >> 12) & 0x3f),
                        0x80 | ((cp >> 6) & 0x3f),
                        0x80 | (cp & 0x3f)
                    );
                    i++;
                    continue;
                }
            }
            out.push(0xef, 0xbf, 0xbd);
        } else if (code >= 0xdc00 && code <= 0xdfff) {
            out.push(0xef, 0xbf, 0xbd);
        } else {
            out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
    }
    return new Uint8Array(out);
}

/**
 * Pure-ECMAScript WHATWG §8.1.1 UTF-8 decoder fallback (`fatal: false`) for bare VMs without `TextDecoder` or `Buffer`.
 * Validates continuation bytes, rejects overlongs, UTF-16 surrogates, and `> U+10FFFF`, emitting `\uFFFD` per
 * invalid maximal subpart without consuming valid follow bytes.
 */
export function DecodeUtf8Fallback(bytes: Uint8Array): string {
    const chunks: string[] = [];
    let chunk = '';
    let codePoint = 0;
    let bytesSeen = 0;
    let bytesNeeded = 0;
    let lowerBoundary = 0x80;
    let upperBoundary = 0xbf;

    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (bytesNeeded === 0) {
            if (byte <= 0x7f) {
                chunk += String.fromCharCode(byte);
            } else if (byte >= 0xc2 && byte <= 0xdf) {
                bytesNeeded = 1;
                codePoint = byte & 0x1f;
            } else if (byte >= 0xe0 && byte <= 0xef) {
                if (byte === 0xe0) lowerBoundary = 0xa0;
                else if (byte === 0xed) upperBoundary = 0x9f;
                bytesNeeded = 2;
                codePoint = byte & 0x0f;
            } else if (byte >= 0xf0 && byte <= 0xf4) {
                if (byte === 0xf0) lowerBoundary = 0x90;
                else if (byte === 0xf4) upperBoundary = 0x8f;
                bytesNeeded = 3;
                codePoint = byte & 0x07;
            } else {
                chunk += '\ufffd';
            }
        } else if (byte < lowerBoundary || byte > upperBoundary) {
            codePoint = 0;
            bytesNeeded = 0;
            bytesSeen = 0;
            lowerBoundary = 0x80;
            upperBoundary = 0xbf;
            chunk += '\ufffd';
            i--;
        } else {
            lowerBoundary = 0x80;
            upperBoundary = 0xbf;
            codePoint = (codePoint << 6) | (byte & 0x3f);
            bytesSeen++;
            if (bytesSeen === bytesNeeded) {
                chunk += codePoint <= 0xffff ? String.fromCharCode(codePoint) : String.fromCodePoint(codePoint);
                codePoint = 0;
                bytesNeeded = 0;
                bytesSeen = 0;
            }
        }
        if (chunk.length >= 8192) {
            chunks.push(chunk);
            chunk = '';
        }
    }
    if (bytesNeeded !== 0) {
        chunk += '\ufffd';
    }
    if (chunk.length > 0) {
        chunks.push(chunk);
    }
    return chunks.join('');
}

function computeUtf8ByteLength(str: string): number {
    if (typeof Buffer !== 'undefined') {
        return Buffer.byteLength(str, 'utf8');
    }
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str).length;
    }
    let bytes = 0;
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 0x80) {
            bytes += 1;
        } else if (code < 0x800) {
            bytes += 2;
        } else if (code >= 0xd800 && code <= 0xdbff) {
            if (i + 1 < str.length) {
                const next = str.charCodeAt(i + 1);
                if (next >= 0xdc00 && next <= 0xdfff) {
                    bytes += 4;
                    i++;
                    continue;
                }
            }
            bytes += 3;
        } else {
            bytes += 3;
        }
    }
    return bytes;
}

function encodeUtf8Bytes(str: string): Uint8Array {
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(str);
    }
    if (typeof Buffer !== 'undefined') {
        return new Uint8Array(Buffer.from(str, 'utf8'));
    }
    return EncodeUtf8Fallback(str);
}

function decodeUtf8Bytes(bytes: Uint8Array): string {
    if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder('utf-8').decode(bytes);
    }
    if (typeof Buffer !== 'undefined') {
        return Buffer.from(bytes).toString('utf8');
    }
    return DecodeUtf8Fallback(bytes);
}

function analyzeSafeRegexRuntimeProfile(
    source: string,
    multiline: boolean
): { isLinearGuaranteed: boolean; hasQuantifiedAlternation: boolean } {
    let escaped = false;
    let inCharClass = false;
    let charClassFirstPos = -1;
    let hasTopLevelAlternation = false;
    let repeatingQuantifierCount = 0;
    let hasQuantifiedAlternation = false;
    const parenStack: Array<{ hasPipe: boolean }> = [];

    const readBraceQuantifierRepeating = (posAfterOpenBrace: number): { endIdx: number; repeating: boolean } | null => {
        let j = posAfterOpenBrace;
        let minStr = '';
        while (j < source.length && source[j] >= '0' && source[j] <= '9') {
            minStr += source[j++];
        }
        if (minStr.length === 0 || j >= source.length) return null;
        if (source[j] === '}') {
            const exact = parseInt(minStr, 10);
            return { endIdx: j, repeating: false && exact > 1 };
        }
        if (source[j] !== ',') return null;
        j++;
        let maxStr = '';
        while (j < source.length && source[j] >= '0' && source[j] <= '9') {
            maxStr += source[j++];
        }
        if (j >= source.length || source[j] !== '}') return null;
        const minVal = parseInt(minStr, 10);
        const maxVal = maxStr.length === 0 ? Infinity : parseInt(maxStr, 10);
        return { endIdx: j, repeating: maxVal > minVal && maxVal > 1 };
    };

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (inCharClass) {
            if (ch === ']' && i > charClassFirstPos) {
                inCharClass = false;
            }
            continue;
        }
        if (ch === '[') {
            inCharClass = true;
            charClassFirstPos = source[i + 1] === '^' ? i + 2 : i + 1;
            continue;
        }
        if (ch === '(') {
            parenStack.push({ hasPipe: false });
        } else if (ch === '|') {
            if (parenStack.length === 0) {
                hasTopLevelAlternation = true;
            } else {
                parenStack[parenStack.length - 1].hasPipe = true;
            }
        } else if (ch === ')') {
            const closedGroup = parenStack.pop();
            const nextCh = source[i + 1];
            if (closedGroup?.hasPipe) {
                if (nextCh === '*' || nextCh === '+') {
                    hasQuantifiedAlternation = true;
                } else if (nextCh === '{') {
                    const braceInfo = readBraceQuantifierRepeating(i + 2);
                    if (braceInfo?.repeating) {
                        hasQuantifiedAlternation = true;
                    }
                }
            }
        } else if (ch === '*' || ch === '+') {
            repeatingQuantifierCount++;
        } else if (ch === '{') {
            const braceInfo = readBraceQuantifierRepeating(i + 1);
            if (braceInfo) {
                if (braceInfo.repeating) {
                    repeatingQuantifierCount++;
                }
                i = braceInfo.endIdx;
            }
        }
    }

    const anchoredStart = !multiline && !hasTopLevelAlternation && source.startsWith('^');
    const isLinearGuaranteed =
        repeatingQuantifierCount === 0 ||
        (anchoredStart && repeatingQuantifierCount <= 1 && !hasQuantifiedAlternation);

    return { isLinearGuaranteed, hasQuantifiedAlternation };
}

function getOrCompileSafeRegexPlan(regex: RegExp): CompiledSafeRegexPlan | false {
    const cache = getSafeRegexValidationCache();
    const cached = cache.get(regex);
    if (cached !== undefined) {
        return cached;
    }
    if (!IsSafeUserRegex(regex.source, regex.flags)) {
        cache.set(regex, false);
        return false;
    }
    const cleanFlags = regex.flags.replace(/[gy]/g, () => '');
    const cleanRx = new RegExp(regex.source, cleanFlags);
    const profile = analyzeSafeRegexRuntimeProfile(regex.source, regex.multiline);
    const plan: CompiledSafeRegexPlan = {
        cleanRx,
        isLinearGuaranteed: profile.isLinearGuaranteed,
        hasQuantifiedAlternation: profile.hasQuantifiedAlternation
    };
    cache.set(regex, plan);
    return plan;
}

/**
 * Executes a validated user regex against the **entire unmodified** `input` string — never slicing
 * into windows and never rewriting `^`, `$`, or `\b` anchors (`R7-3`).
 *
 * - Enforces `maxInputBytes` (default `65536` bytes).
 * - Uses the registered {@link SafeRegexSandboxExecutor} (e.g. `node:vm` in `@memberjunction/ai-agents`)
 *   for preemptive `maxDurationMs` enforcement on arbitrary whole strings up to `maxInputBytes`.
 * - When no sandbox executor is registered (browser / standalone runtime), runs linear-guaranteed
 *   patterns on the full string up to `maxInputBytes` and bounds quantified whole-string evaluation
 *   to safe whole-input lengths (`4096` chars, or `1536` chars for quantified alternation) while
 *   marking longer inputs as `{ InputTooLong: true }` rather than returning false window results.
 */
export function SafeRegexSearchDetailed(
    regex: RegExp,
    input: string,
    maxDurationMs: number = 20,
    maxInputBytes: number = 65536
): SafeRegexSearchResult {
    if (typeof input !== 'string') {
        return { Matched: false, TimedOut: false, InputTooLong: false };
    }
    if (input.length > maxInputBytes) {
        return { Matched: false, TimedOut: false, InputTooLong: true };
    }
    if (input.length * 3 > maxInputBytes) {
        const byteLen = computeUtf8ByteLength(input);
        if (byteLen > maxInputBytes) {
            return { Matched: false, TimedOut: false, InputTooLong: true };
        }
    }

    const plan = getOrCompileSafeRegexPlan(regex);
    if (plan === false) {
        return { Matched: false, TimedOut: false, InputTooLong: false };
    }

    if (input.length <= 256 || plan.isLinearGuaranteed) {
        plan.cleanRx.lastIndex = 0;
        return { Matched: plan.cleanRx.test(input), TimedOut: false, InputTooLong: false };
    }

    const sandboxExecutor = GetSafeRegexSandboxExecutor();
    if (sandboxExecutor) {
        const res = sandboxExecutor(plan.cleanRx, input, Math.max(1, maxDurationMs));
        return { Matched: res.Matched, TimedOut: res.TimedOut, InputTooLong: false };
    }

    const unsandboxedSafeMaxChars = plan.hasQuantifiedAlternation ? 1536 : 4096;
    if (input.length > unsandboxedSafeMaxChars) {
        return { Matched: false, TimedOut: false, InputTooLong: true };
    }

    plan.cleanRx.lastIndex = 0;
    return { Matched: plan.cleanRx.test(input), TimedOut: false, InputTooLong: false };
}

/**
 * Time- and byte-bounded boolean wrapper around {@link SafeRegexSearchDetailed} (`E8`, `R6-6`).
 */
export function SafeRegexTest(
    regex: RegExp,
    candidate: string,
    maxInputLength = 65536,
    maxDurationMs = 20
): boolean {
    return SafeRegexSearchDetailed(regex, candidate, maxDurationMs, maxInputLength).Matched;
}

/**
 * Detailed result of evaluating a batch of candidate strings against a user regex (`R8-6`, `R9-4`).
 */
export interface SafeRegexBatchDetailedResult {
    Matches: boolean[];
    TimedOut: boolean;
    TimedOutIndex?: number;
    InputTooLong: boolean[];
}

/**
 * Evaluates a validated user regex against a batch of unmodified candidate strings (`R8-6`),
 * running short (`<= 256` chars) and linear-guaranteed patterns natively in `O(N)` and sending
 * all remaining `<= maxInputBytes` candidates to {@link SafeRegexBatchSandboxExecutor} in a single
 * sandbox call bounded by `batchTimeoutMs`.
 */
export function SafeRegexSearchBatchDetailed(
    regex: RegExp,
    inputs: readonly string[],
    batchTimeoutMs: number = 40,
    maxInputBytes: number = 65536
): SafeRegexBatchDetailedResult {
    const matches = new Array<boolean>(inputs.length).fill(false);
    const inputTooLong = new Array<boolean>(inputs.length).fill(false);
    if (inputs.length === 0) {
        return { Matches: matches, InputTooLong: inputTooLong, TimedOut: false };
    }

    const plan = getOrCompileSafeRegexPlan(regex);
    if (plan === false) {
        for (let i = 0; i < inputs.length; i++) {
            const inp = inputs[i];
            if (
                typeof inp === 'string' &&
                (inp.length > maxInputBytes ||
                    (inp.length * 3 > maxInputBytes && computeUtf8ByteLength(inp) > maxInputBytes))
            ) {
                inputTooLong[i] = true;
            }
        }
        return { Matches: matches, InputTooLong: inputTooLong, TimedOut: false };
    }

    const pendingIndices: number[] = [];
    const pendingTexts: string[] = [];

    for (let i = 0; i < inputs.length; i++) {
        const inp = inputs[i];
        if (typeof inp !== 'string') {
            continue;
        }
        if (inp.length > maxInputBytes) {
            inputTooLong[i] = true;
            continue;
        }
        if (inp.length * 3 > maxInputBytes && computeUtf8ByteLength(inp) > maxInputBytes) {
            inputTooLong[i] = true;
            continue;
        }
        if (inp.length <= 256 || plan.isLinearGuaranteed) {
            plan.cleanRx.lastIndex = 0;
            matches[i] = plan.cleanRx.test(inp);
            continue;
        }
        pendingIndices.push(i);
        pendingTexts.push(inp);
    }

    if (pendingIndices.length === 0) {
        return { Matches: matches, InputTooLong: inputTooLong, TimedOut: false };
    }

    const batchExecutor = GetSafeRegexBatchSandboxExecutor();
    if (batchExecutor) {
        const execRes = batchExecutor(plan.cleanRx, pendingTexts, Math.max(1, batchTimeoutMs));
        const origTimedOutIdx =
            execRes.TimedOut &&
            typeof execRes.TimedOutIndex === 'number' &&
            execRes.TimedOutIndex >= 0 &&
            execRes.TimedOutIndex < pendingIndices.length
                ? pendingIndices[execRes.TimedOutIndex]
                : undefined;
        const copyLimit = execRes.TimedOut
            ? (typeof execRes.TimedOutIndex === 'number' && execRes.TimedOutIndex >= 0 ? execRes.TimedOutIndex : 0)
            : pendingTexts.length;
        for (let j = 0; j < copyLimit && j < pendingIndices.length; j++) {
            matches[pendingIndices[j]] = Boolean(execRes.Matches[j]);
        }
        return {
            Matches: matches,
            InputTooLong: inputTooLong,
            TimedOut: execRes.TimedOut,
            TimedOutIndex: origTimedOutIdx
        };
    }

    const singleExecutor = GetSafeRegexSandboxExecutor();
    if (singleExecutor) {
        const startedAt = Date.now();
        let anyTimedOut = false;
        let timedOutIdx: number | undefined;
        for (let k = 0; k < pendingIndices.length; k++) {
            const elapsed = Date.now() - startedAt;
            const rem = batchTimeoutMs - elapsed;
            if (rem <= 0) {
                anyTimedOut = true;
                timedOutIdx = pendingIndices[k];
                break;
            }
            const r = singleExecutor(plan.cleanRx, pendingTexts[k], Math.max(1, rem));
            matches[pendingIndices[k]] = r.Matched;
            if (r.TimedOut) {
                anyTimedOut = true;
                timedOutIdx = pendingIndices[k];
                break;
            }
        }
        return { Matches: matches, InputTooLong: inputTooLong, TimedOut: anyTimedOut, TimedOutIndex: timedOutIdx };
    }

    const unsandboxedSafeMaxChars = plan.hasQuantifiedAlternation ? 1536 : 4096;
    const startedAt = Date.now();
    let anyTimedOut = false;
    let timedOutIdx: number | undefined;
    for (let k = 0; k < pendingIndices.length; k++) {
        const txt = pendingTexts[k];
        if (txt.length > unsandboxedSafeMaxChars) {
            inputTooLong[pendingIndices[k]] = true;
            continue;
        }
        if (Date.now() - startedAt > batchTimeoutMs) {
            anyTimedOut = true;
            timedOutIdx = pendingIndices[k];
            break;
        }
        plan.cleanRx.lastIndex = 0;
        matches[pendingIndices[k]] = plan.cleanRx.test(txt);
    }
    return { Matches: matches, InputTooLong: inputTooLong, TimedOut: anyTimedOut, TimedOutIndex: timedOutIdx };
}

/**
 * Supported value display formats for MJ Sheets cells (`§ 6.3`).
 */
export type SpreadsheetCellFormatType =
    | 'general'
    | 'number'
    | 'currency'
    | 'percent'
    | 'integer'
    | 'date'
    | 'datetime'
    | 'text';

/**
 * Cell formatting and visual style properties.
 */
export interface SpreadsheetCellStyleSpec {
    /** Bold font weight. */
    Bold?: boolean;
    /** Italic font style. */
    Italic?: boolean;
    /** Semantic or CSS color token for text. */
    TextColor?: string;
    /** Semantic or CSS color token for background fill. */
    BackgroundColor?: string;
    /** Horizontal text alignment. */
    HorizontalAlign?: 'left' | 'center' | 'right';
    /** High-level format category. */
    FormatType?: SpreadsheetCellFormatType;
    /** Excel-compatible `numFmt` pattern (e.g. `'$#,##0.00'`, `'0.0%'`, `'#,##0'`, `'yyyy-mm-dd'`). */
    NumberFormatPattern?: string;
}

/**
 * Primitive scalar value stored or computed in a spreadsheet cell.
 */
export type SpreadsheetCellValue = string | number | boolean | null;

/**
 * Specification for a single populated cell in a worksheet (`§ 6.2`).
 *
 * Formulas are stored both in human-readable A1 notation (`Formula`) and against
 * stable row/column IDs (`FormulaStable`) so concurrent row/column insertions
 * and formula edits over Yjs never corrupt cell references (`Accept #1`).
 */
export interface SpreadsheetCellSpec {
    /** Stable row identifier (`SpreadsheetRowSpec.RowID`). */
    RowID: string;
    /** Stable column identifier (`SpreadsheetColumnSpec.ColumnID`). */
    ColumnID: string;
    /** Current A1 coordinate (e.g. `'B2'`). */
    Address: string;
    /** Raw scalar literal when not a formula cell. */
    RawValue: SpreadsheetCellValue;
    /** Display A1 formula starting with `'='` (e.g. `'=SUM(B2:B9)'`). */
    Formula?: string | null;
    /**
     * Stable-ID formula representation (`@CELL(rowId,colId)` / `@RANGE(r1,c1,r2,c2)`)
     * used to reconstruct `Formula` after row or column insertions/deletions (`§ 6.2`, `Accept #1`).
     */
    FormulaStable?: string | null;
    /** Latest evaluated value (or error code such as `'#DIV/0!'`, `'#REF!'`, `'#MJ_ACCESS_DENIED!'`). */
    ComputedValue?: SpreadsheetCellValue;
    /** Formatted string representation rendered in the grid. */
    DisplayValue?: string;
    /** Optional style & number format metadata. */
    Style?: SpreadsheetCellStyleSpec;
    /** Optional data validation error message when the cell violates a worksheet validation rule. */
    ValidationError?: string | null;
    /** True when an `=MJ.QUERY` or `=MJ.VIEW` formula was refused due to viewer RLS/entity/query permissions. */
    AccessDenied?: boolean;
    /** Detailed error message when evaluation or viewer permission check fails. */
    ErrorMessage?: string | null;
    /** Anchor cell coordinate (`'B2'`) when this cell was populated by a multi-cell `=MJ.*` spill. */
    SpilledFrom?: string | null;
    /** Multi-cell OOXML array/spill range (`'I6:I8'`) owned by this anchor cell (`R8-8`). */
    SpillRange?: string | null;
    /** Anchor cell coordinate (`'I6'`) when this cell was imported as a child of a multi-cell OOXML dynamic-array spill or legacy CSE array (`R8-8`). */
    ArrayMaster?: string | null;
    /** Bound `SpreadsheetLiveTableSpec.TableID` when this cell was populated by a live table (`B4`). */
    LiveTableID?: string | null;
    /** Optional plain-text cell note. */
    Note?: string | null;
    /** Input content hash stored when an opt-in `=MJ.AI(...)` formula was last evaluated (`§5.2b`). */
    AiInputHash?: string | null;
}

/**
 * Governance lock rule protecting a rectangular range on a worksheet (`§6.2`).
 */
export interface SpreadsheetProtectedRangeSpec {
    /** Stable unique ID for this protection rule. */
    RangeID: string;
    /** Canonical A1 cell or rectangular range (e.g. `'A1:D10'`). */
    Range: string;
    /** `UserInfo.ID` of the creator/owner who locked this range. */
    LockedByUserID: string;
    /** Optional human-readable description shown in lock banners/tooltips. */
    Description?: string;
    /** When true, users with `CanEdit` artifact permission may still edit cells inside the range. */
    AllowEditors?: boolean;
    /** ISO 8601 timestamp when the range was locked. */
    LockedAt?: string;
}

/**
 * Authorization context supplied when mutating worksheet cells with {@link SpreadsheetProtectedRangeSpec} enforcement.
 */
export interface SpreadsheetCellEditContext {
    /** Acting user ID performing the edit. */
    UserID?: string | null;
    /** Artifact owner/creator user ID (always allowed to edit or unlock). */
    OwnerUserID?: string | null;
    /** True when actor holds editor permission on the artifact. */
    IsEditor?: boolean;
    /** Internal import/system bypass flag. */
    BypassProtection?: boolean;
}

/**
 * XML metadata preserved from OOXML import for lossless round-tripping.
 */
interface SpreadsheetCellXmlMeta {
    fType?: string;
    fRef?: string | null;
    cmAttr?: string | null;
    openAttrs?: string;
    sAttr?: string | null;
    vmAttr?: string | null;
    formulaDirty?: boolean;
}

const CELL_XML_META_STORE_KEY = '___MJ_SPREADSHEET_CELL_XML_META';
function getCellXmlMetaMap(): WeakMap<SpreadsheetCellSpec, SpreadsheetCellXmlMeta> {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    let map = store[CELL_XML_META_STORE_KEY] as WeakMap<SpreadsheetCellSpec, SpreadsheetCellXmlMeta> | undefined;
    if (!map) {
        map = new WeakMap<SpreadsheetCellSpec, SpreadsheetCellXmlMeta>();
        store[CELL_XML_META_STORE_KEY] = map;
    }
    return map;
}

function copyCellXmlMeta(fromCell: SpreadsheetCellSpec, toCell: SpreadsheetCellSpec): void {
    const cellXmlMeta = getCellXmlMetaMap();
    const meta = cellXmlMeta.get(fromCell);
    if (meta) {
        cellXmlMeta.set(toCell, { ...meta });
    }
}

/**
 * Stable row descriptor (`§ 6.2`).
 */
export interface SpreadsheetRowSpec {
    /** Immutable unique ID for this row within the worksheet. */
    RowID: string;
    /** 1-based row number (`1`, `2`, ...). */
    Index: number;
    /** Optional row height in pixels. */
    Height?: number;
    /** True when hidden by user or active filter. */
    Hidden?: boolean;
}

/**
 * Stable column descriptor (`§ 6.2`).
 */
export interface SpreadsheetColumnSpec {
    /** Immutable unique ID for this column within the worksheet. */
    ColumnID: string;
    /** 1-based column number (`1 = A`, `2 = B`, ...). */
    Index: number;
    /** Column letter code (`'A'`, `'B'`, ..., `'AA'`). */
    Letter: string;
    /** Optional custom column label. */
    Header?: string;
    /** Optional width in characters/pixels (Excel column width units, default 14). */
    Width?: number;
    /** True when hidden. */
    Hidden?: boolean;
}

/**
 * Active sort specification on a worksheet.
 */
export interface SpreadsheetSortSpec {
    /** Column letter to sort by (e.g. `'B'`). */
    ColumnLetter: string;
    /** Sort direction. */
    Direction: 'asc' | 'desc';
    /** Number of header rows at the top of the sheet excluded from sorting (default 1). */
    HeaderRows?: number;
}

/**
 * Active filter criterion on a worksheet column.
 */
export interface SpreadsheetFilterSpec {
    /** Column letter to filter on (e.g. `'A'`). */
    ColumnLetter: string;
    /** Filter operator. */
    Operator: 'equals' | 'contains' | 'gt' | 'lt' | 'notEmpty';
    /** Filter comparison value. */
    Value: string;
    /** Number of header rows at top of sheet always kept visible (default 1). */
    HeaderRows?: number;
}

/**
 * Data validation rule applied to a cell range.
 */
export interface SpreadsheetValidationRuleSpec {
    /** Unique rule ID. */
    RuleID: string;
    /** Target A1 range (e.g. `'C2:C50'`). */
    Range: string;
    /** Validation rule type. */
    RuleType: 'list' | 'numberRange' | 'notEmpty';
    /** Allowed values when `RuleType === 'list'`. */
    AllowedValues?: string[];
    /** Minimum numeric value when `RuleType === 'numberRange'`. */
    MinValue?: number;
    /** Maximum numeric value when `RuleType === 'numberRange'`. */
    MaxValue?: number;
    /** Custom error message shown when violated. */
    ErrorMessage?: string;
}

/**
 * Conditional formatting rule applied to a cell range.
 */
export interface SpreadsheetConditionalFormatRuleSpec {
    /** Unique rule ID. */
    RuleID: string;
    /** Target A1 range (e.g. `'D2:D50'`). */
    Range: string;
    /** Comparison operator. */
    Operator: 'gt' | 'lt' | 'eq' | 'between' | 'contains';
    /** Primary threshold value. */
    Value1: string | number;
    /** Upper bound when `Operator === 'between'`. */
    Value2?: number;
    /** Semantic highlight tone mapped to `--mj-status-*` tokens. */
    HighlightTone: 'success' | 'warning' | 'danger' | 'info';
}

/**
 * Calculated formula column attached to a live data table (`§ 6.3`).
 * When the bound view/query refreshes and expands/contracts rows, each calculated column's
 * `FormulaTemplate` (using `{ROW}` for the 1-based worksheet row number) is automatically
 * filled down for every data row.
 */
export interface SpreadsheetCalculatedColumnSpec {
    /** Column heading written in the table's header row. */
    Header: string;
    /** Formula template where `{ROW}` is replaced with each data row's 1-based row number (e.g. `'=B{ROW}*C{ROW}'`). */
    FormulaTemplate: string;
    /** Optional format type applied to the calculated cells. */
    FormatType?: SpreadsheetCellFormatType;
    /** Optional Excel number format pattern (e.g. `'$#,##0.00'`). */
    NumberFormatPattern?: string;
}

/**
 * Range source bound to an MJ `EntityView` or `SavedQuery` (`§ 6.3`, `D10`, `Accept #2`).
 */
export interface SpreadsheetLiveTableSpec {
    /** Unique identifier for this live table binding. */
    TableID: string;
    /** Display title for the bound table. */
    Title: string;
    /** Source kind (`'EntityView'` or `'SavedQuery'`). */
    SourceType: 'EntityView' | 'SavedQuery';
    /** Target MJ entity name when `SourceType === 'EntityView'`. */
    EntityName?: string;
    /** Optional saved `MJ: User Views` ID. */
    ViewID?: string;
    /** Optional saved `MJ: User Views` name. */
    ViewName?: string;
    /** Optional structured filter when `SourceType === 'EntityView'`. */
    ExtraFilter?: string;
    /** Optional explicit field list. */
    Fields?: string[];
    /** Target `MJ: Queries` ID when `SourceType === 'SavedQuery'`. */
    QueryID?: string;
    /** Target `MJ: Queries` name when `SourceType === 'SavedQuery'`. */
    QueryName?: string;
    /** Caller-settable query parameters (`IsServerSet` parameters are stripped automatically). */
    QueryParameters?: Record<string, string | number | boolean | null>;
    /** Maximum rows to fetch (default 100). */
    MaxRows?: number;
    /** Top-left A1 cell where headers (and rows below) are written (default `'A1'`). */
    AnchorCell: string;
    /** Whether to write a header row at `AnchorCell` (default `true`). */
    IncludeHeaders?: boolean;
    /** `'Live'` (viewer-scoped refresh) or `'Frozen'` (static snapshot per `O5`). */
    Mode: DocumentBlockMode;
    /** Captured snapshot when `Mode === 'Frozen'`. */
    FrozenSnapshot?: FrozenBlockSnapshot | null;
    /** Calculated formula columns appended to the right of the bound source columns. */
    CalculatedColumns?: SpreadsheetCalculatedColumnSpec[];
    /** ISO timestamp of last live execution. */
    LastRefreshedAt?: string | null;
    /** Number of data rows written on the last refresh. */
    LastRowCount?: number;
    /** Number of columns (source fields + calculated columns) written on the last refresh. */
    LastColumnCount?: number;
    /** True when the current viewer was denied access to the underlying entity/view/query. */
    AccessDenied?: boolean;
    /** Error or access-denied message from the last execution. */
    LastError?: string | null;
}

/**
 * Supported chart visualization types for MJ Sheets range charts (`§ 6.3`).
 */
export type SpreadsheetChartType = 'bar' | 'line' | 'pie' | 'area';

/**
 * Chart specification bound to a cell range on a worksheet (`§ 6.3`, `Accept #5`).
 */
export interface SpreadsheetChartSpec {
    /** Unique chart ID (`'chart-1'`, etc.). */
    ChartID: string;
    /** Chart title. */
    Title: string;
    /** Chart visualization type. */
    ChartType: SpreadsheetChartType;
    /** Worksheet ID owning the source range. */
    SheetID: string;
    /** A1 range or comma-separated range union feeding the chart (e.g. `'A1:C6'` or `'A1:A6,D1:D6'`). */
    SourceRange: string;
    /** Anchor cell where the floating chart card sits on the worksheet (e.g. `'E2'`). */
    PositionCell: string;
    /** Where the chart renders: `'dock'` in the bottom strip (default) or `'sheet'` floating over the grid. */
    Placement?: 'dock' | 'sheet';
    /** Optional horizontal pixel offset within the grid canvas when `Placement === 'sheet'`. */
    OffsetX?: number;
    /** Optional vertical pixel offset within the grid canvas when `Placement === 'sheet'`. */
    OffsetY?: number;
    /** Optional width in pixels. */
    WidthPx?: number;
    /** Optional height in pixels. */
    HeightPx?: number;
    /** Whether to display the series legend (default `true`). */
    ShowLegend?: boolean;
    /** Header row handling (`'auto'` detects automatically, `true` uses first row/col as labels, `false` treats all as data). */
    HasHeaderRow?: boolean | 'auto';
    /** Series orientation (`'columns'` = each column is a series, `'rows'` = each row is a series). Default `'columns'`. */
    SeriesOrientation?: 'columns' | 'rows';
    /** Zero-based index within the extracted grid for the category/X-axis column (or row when `SeriesOrientation === 'rows'`). */
    CategoryColumnIndex?: number;
    /** Zero-based grid column (or transposed row) indices to include as plotted numeric series. Omit or empty for all numeric series. */
    IncludedSeriesIndices?: number[];
    /** Whether to render value data labels directly on chart bars/points/slices. */
    ShowDataLabels?: boolean;
}

/**
 * Evaluated chart dataset extracted from a worksheet range (`Accept #5`).
 */
export interface SpreadsheetChartDataset {
    ChartID: string;
    Title: string;
    ChartType: SpreadsheetChartType;
    SheetID: string;
    SourceRange: string;
    Categories: string[];
    Series: Array<{ Name: string; Values: number[]; ColumnIndex?: number }>;
    Columns: DocumentBlockColumn[];
    Rows: Array<Record<string, string | number>>;
    RevisionHash: string;
    /** Detected columns (or transposed rows when `SeriesOrientation === 'rows'`) available in the source range. */
    DetectedColumns?: Array<{ Index: number; Name: string; IsNumeric: boolean }>;
    /** Effective header detection result after applying `HasHeaderRow`. */
    EffectiveHasHeaderRow?: boolean;
}

/**
 * Embedded OLE `Artifact` (such as an interactive `Whiteboard`) anchored on a worksheet (`§ 3.4.1`).
 */
export interface SpreadsheetEmbeddedArtifactSpec {
    /** Unique embed ID within the worksheet. */
    EmbedID: string;
    /** Display title. */
    Title: string;
    /** Target `MJ: Artifacts` ID. */
    ArtifactID: string;
    /** Optional pinned `MJ: Artifact Versions` ID. */
    ArtifactVersionID?: string | null;
    /** Target artifact type name (e.g. `'Whiteboard'`). */
    ArtifactTypeName: string;
    /** Viewer plugin driver class (e.g. `'WhiteboardArtifactViewerPlugin'`). */
    DriverClass?: string;
    /** Anchor cell coordinate on the worksheet (e.g. `'F2'`). */
    AnchorCell: string;
    /** Width in pixels. */
    WidthPx: number;
    /** Height in pixels. */
    HeightPx: number;
    /** Whether inline editing is enabled. */
    AllowInlineEdit: boolean;
    /** Latest inline JSON payload (e.g. serialized Whiteboard state). */
    InlineContentJSON?: string | null;
}

/**
 * Workbook-level named range (`§ 6.3`).
 */
export interface SpreadsheetNamedRangeSpec {
    /** Identifier usable inside formulas (e.g. `'TaxRate'` or `'Q1Revenue'`). */
    Name: string;
    /** Worksheet ID containing the range. */
    SheetID: string;
    /** A1 cell or range (e.g. `'B2'` or `'B2:B10'`). */
    Range: string;
    /** Optional description. */
    Description?: string;
}

/**
 * Single worksheet tab in an MJ Sheets workbook (`§ 6.2`).
 */
export interface WorksheetSpec {
    /** Stable unique ID for this worksheet tab. */
    SheetID: string;
    /** Tab display name (up to 31 chars for Excel compatibility). */
    Name: string;
    /** Ordered list of rows with stable `RowID`s. */
    Rows: SpreadsheetRowSpec[];
    /** Ordered list of columns with stable `ColumnID`s. */
    Columns: SpreadsheetColumnSpec[];
    /** Map of A1 coordinate (`'A1'`, `'B2'`) to cell specification. */
    Cells: Record<string, SpreadsheetCellSpec>;
    /** Number of frozen top rows. */
    FrozenRows: number;
    /** Number of frozen left columns. */
    FrozenColumns: number;
    /** Optional active sort configuration. */
    SortSpec?: SpreadsheetSortSpec | null;
    /** Active column filter criteria. */
    FilterSpecs: SpreadsheetFilterSpec[];
    /** Data validation rules. */
    ValidationRules: SpreadsheetValidationRuleSpec[];
    /** Conditional formatting rules. */
    ConditionalFormats: SpreadsheetConditionalFormatRuleSpec[];
    /** Range sources bound to MJ Views or Queries. */
    LiveTables: SpreadsheetLiveTableSpec[];
    /** Embedded range charts. */
    Charts: SpreadsheetChartSpec[];
    /** Embedded OLE Artifact / Whiteboard objects. */
    EmbeddedArtifacts: SpreadsheetEmbeddedArtifactSpec[];
    /** Protected cell/range rules enforced against unauthorized edits (`§6.2`). */
    ProtectedRanges?: SpreadsheetProtectedRangeSpec[];
    /** Merged cell regions in canonical A1 notation (e.g. `['A1:C1', 'B3:D5']`). */
    MergeRanges?: string[];
    /** Former dynamic-array spill / CSE array child coordinates cleared after import (`R8-8`). */
    ClearedSpillChildren?: string[];
}

/**
 * Complete multi-tab MJ Sheets workbook specification (`§ 6.2`).
 */
export interface WorkbookSpec {
    /** Stable workbook ID. */
    WorkbookID: string;
    /** Workbook title. */
    Title: string;
    /** Currently active worksheet ID. */
    ActiveSheetID: string;
    /** Ordered worksheets. */
    Worksheets: WorksheetSpec[];
    /** Workbook-level named ranges. */
    NamedRanges: SpreadsheetNamedRangeSpec[];
    /** Persisted preferred height (px) of the docked bottom strip containing charts, live tables, and embedded canvases. */
    PreferredObjectsPaneHeightPx?: number;
    /** ISO creation timestamp. */
    CreatedAt: string;
    /** ISO last-modified timestamp. */
    UpdatedAt: string;
}

/**
 * Parsed representation of an `=MJ.QUERY(...)`, `=MJ.VIEW(...)`, or `=MJ.IMPORTRANGE(...)` custom function call (`§ 6.3`, `§ 7.2`, `§ 4.2`).
 */
export interface ParsedMjCustomFunctionCall {
    /** Function kind (`'QUERY'`, `'VIEW'`, `'IMPORTRANGE'`, or `'AI'`). */
    Kind: 'QUERY' | 'VIEW' | 'IMPORTRANGE' | 'AI';
    /** Query name/ID (`QUERY`), Entity name (`VIEW`), target Artifact ID/Name (`IMPORTRANGE`), or prompt (`AI`). */
    PrimaryTarget: string;
    /** View name/ID (`VIEW`) or `'Sheet!A1:D20'` range string (`IMPORTRANGE`). */
    SecondaryTarget?: string;
    /** Positional or key=value arguments passed to the function. */
    Arguments: SpreadsheetCellValue[];
    /** Structured key-value parameters extracted from arguments. */
    NamedParameters: Record<string, SpreadsheetCellValue>;
}

/**
 * Request envelope passed to a custom `ImportRangeResolver` for `=MJ.IMPORTRANGE(...)` (`§ 4.2`).
 */
export interface SpreadsheetImportRangeRequest {
    ArtifactIDOrName: string;
    RangeString: string;
    VersionNumber?: number;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
    VisitedArtifactKeys: string[];
    Depth: number;
}

/**
 * Parsed representation of an opt-in `=MJ.AI(prompt, [cellOrRange...])` formula (`§ 5.2b`).
 */
export interface ParsedMjAiFormulaCall {
    /** Natural-language instruction literal. */
    Prompt: string;
    /** Cell or range reference tokens passed as context arguments. */
    References: string[];
}

/**
 * Options for evaluating `=MJ.QUERY`, `=MJ.VIEW`, and `=MJ.IMPORTRANGE` custom functions and live tables.
 */
export interface SpreadsheetMjEvaluationOptions {
    /** Override cache TTL in milliseconds (defaults to 60,000 ms). */
    CacheTtlMs?: number;
    /** Maximum concurrent requests in flight (defaults to 5). */
    MaxConcurrency?: number;
    /** Bypass the viewer result cache when `true`. */
    BypassCache?: boolean;
    /** Optional resolver override for `=MJ.IMPORTRANGE(...)` (useful in tests or custom hosts). */
    ImportRangeResolver?: (request: SpreadsheetImportRangeRequest) => Promise<DocumentBlockExecutionResult>;
    /** Recursion cycle-tracking stack for nested `=MJ.IMPORTRANGE` calls (max depth 3). */
    ImportRangeVisitedKeys?: string[];
    /** Current recursion depth for `=MJ.IMPORTRANGE` (starts at `0`). */
    ImportRangeDepth?: number;
    /** Hosting artifact ID for self-reference / cycle attribution. */
    HostArtifactID?: string;
    /** Optional edit context used to enforce `ProtectedRanges` on non-anchor spill destination cells. */
    EditContext?: SpreadsheetCellEditContext;
    /** Optional binary file resolver override for `ContentMode = 'File'` `.xlsx` targets in `=MJ.IMPORTRANGE`. */
    ResolveFileBytes?: (fileId: string, versionId: string) => Promise<Uint8Array | ArrayBuffer | null>;
}

/**
 * Options for explicit opt-in batch evaluation of `=MJ.AI(...)` spreadsheet cells (`§ 5.2b`).
 */
export interface SpreadsheetAiEvaluationOptions {
    /** Optional hosting `MJ: Artifacts` ID. */
    ArtifactID?: string | null;
    /** Optional actor/permission context checked before mutating protected cells with AI results. */
    EditContext?: SpreadsheetCellEditContext;
    /** Restrict evaluation to these canonical `'SheetID::Addr'` or `'Addr'` keys. */
    TargetAddresses?: string[];
    /** Maximum cells per batch (clamped to `MAX_AI_FORMULA_BATCH_CELLS = 50`). */
    MaxCells?: number;
    /** Re-evaluate even if `AiInputHash` already matches cached output. */
    ForceRefresh?: boolean;
    /** Optional explicit AI model override. */
    ModelOverride?: string | null;
    /** Optional custom batch evaluator (defaults to `ArtifactEvaluateAiFormulaOperation`). */
    AiEvaluator?: (
        cells: ArtifactAiFormulaCellRequest[]
    ) => Promise<Array<{ SheetID: string; Address: string; InputHash: string; Value: string; ErrorMessage?: string | null; AccessDenied?: boolean }>>;
}

/**
 * Summary returned by {@link SpreadsheetEngine.EvaluateAiFormulas}.
 */
export interface SpreadsheetAiEvaluationResult {
    EvaluatedCount: number;
    CacheHitCount: number;
    SkippedOverCapCount: number;
    AccessDeniedCount: number;
    ErrorCount: number;
}

interface ViewerFunctionCacheEntry {
    ExpiresAt: number;
    Result: DocumentBlockExecutionResult;
}

const DEFAULT_ROW_COUNT = 25;
const DEFAULT_COLUMN_COUNT = 12;
const DEFAULT_COLUMN_WIDTH = 14;
const DEFAULT_ROW_HEIGHT = 24;
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_MAX_CONCURRENCY = 5;
const HIDDEN_META_SHEET_NAME = '_mj_sheets_meta';
const META_CHUNK_SIZE = 28_000;

/** Maximum compressed `.xlsx` archive size accepted by `ImportFromXlsxBytes` (15 MiB, `B6`). */
export const MAX_XLSX_COMPRESSED_BYTES = 15 * 1024 * 1024;
/** Maximum cumulative uncompressed size across all ZIP entries in `.xlsx` import (64 MiB, `B6`, `R8-3`). */
export const MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES = 64 * 1024 * 1024;
/** Maximum uncompressed size of any single ZIP entry in `.xlsx` import (32 MiB, `B6`, `R8-3`). */
export const MAX_XLSX_ENTRY_BYTES = 32 * 1024 * 1024;
/** Maximum formula expression character length accepted before returning `#VALUE!` (`P0-11`). */
export const MAX_FORMULA_LENGTH = 8192;
/** Maximum parser/evaluator AST recursion depth before returning `#VALUE!` / `#CALC!` (`P0-11`). */
export const MAX_AST_DEPTH = 128;
/** Maximum formula AST/lambda evaluation operations permitted within a single workbook pass (`B5`). */
export const MAX_EVAL_OPS_PER_WORKBOOK = 2_000_000;
/** Maximum wall-clock duration (ms) permitted for a single workbook evaluation pass (`B5`). */
export const MAX_EVAL_TIME_MS = 5_000;
/** Maximum character length permitted in any formula string result (matches Excel's 32,767 cell limit, `B5`). */
export const MAX_CELL_STRING_LENGTH = 32_767;
/** Maximum total cell grid entries emitted in a single `ExportToCsv` pass (`B5`). */
export const MAX_EXPORT_CSV_CELLS = 500_000;

class EvalBudgetExceededError extends Error {
    constructor() {
        super('Formula evaluation exceeded operation or time budget.');
        this.name = 'EvalBudgetExceededError';
    }
}

/**
 * Builds the canonical {@link FrozenSnapshotIdentityBinding} for a {@link SpreadsheetLiveTableSpec} (`S3`).
 */
export function BuildLiveTableIdentityBinding(
    table: Pick<
        SpreadsheetLiveTableSpec,
        'TableID' | 'SourceType' | 'EntityName' | 'ViewID' | 'ViewName' | 'QueryID' | 'QueryName'
    >,
    hostArtifactId?: string | null
): FrozenSnapshotIdentityBinding {
    return BuildBlockIdentityBinding(
        {
            BlockID: table.TableID,
            Kind: table.SourceType,
            EntityName: table.EntityName,
            ViewID: table.ViewID,
            ViewName: table.ViewName,
            QueryID: table.QueryID,
            QueryName: table.QueryName
        },
        hostArtifactId
    );
}

/**
 * Sanitizes a worksheet name for Excel/OOXML compatibility: strips forbidden characters
 * (`[`, `]`, `:`, `*`, `?`, `/`, `\`), trims whitespace, limits length to 31 characters,
 * and deduplicates case-insensitively against `existingLowerNames` using `" (2)"`, `" (3)"`, ...
 */
export function SanitizeWorksheetName(name: string, existingLowerNames?: ReadonlySet<string>): string {
    const cleaned = (name ?? '').replace(/[\[\]:*?/\\]/g, ' ').trim();
    const base = cleaned.slice(0, 31).trim() || 'Sheet';
    if (!existingLowerNames || !existingLowerNames.has(base.toLowerCase())) {
        return base;
    }
    for (let i = 2; i < 999; i++) {
        const suffix = ` (${i})`;
        const prefixMax = Math.max(1, 31 - suffix.length);
        const candidate = `${base.slice(0, prefixMax).trimEnd()}${suffix}`;
        if (!existingLowerNames.has(candidate.toLowerCase())) {
            return candidate;
        }
    }
    return base;
}

/**
 * Resolves a relative OOXML relationship `Target` against a base directory inside the ZIP archive,
 * collapsing `.` and `..` segments and rejecting any traversal escaping the archive root (`P1-6`).
 */
function normalizeOoxmlRelTarget(baseDir: string, target: string): string | null {
    if (!target || /[\u0000-\u001f]/.test(target)) return null;
    const raw = target.replace(/\\/g, '/');
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
    const joined = raw.startsWith('/') ? raw.slice(1) : baseDir ? `${baseDir}/${raw}` : raw;
    const out: string[] = [];
    for (const seg of joined.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') {
            if (out.length === 0) return null;
            out.pop();
            continue;
        }
        out.push(seg);
    }
    return out.length > 0 ? out.join('/') : null;
}
/** Excel 1900 date serial epoch offset from Unix epoch (`1970-01-01` = serial `25569`). */
const EXCEL_UNIX_EPOCH_SERIAL_OFFSET = 25569;
const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// A1 Coordinate & Column Letter Helpers
// ---------------------------------------------------------------------------

/**
 * Converts a 1-based column index (`1 = A`, `26 = Z`, `27 = AA`) to its Excel column letter.
 */
export function ColumnIndexToLetter(index: number): string {
    let n = Math.max(1, Math.floor(index));
    let letters = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        letters = String.fromCharCode(65 + rem) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
}

/**
 * Converts an Excel column letter (`'A'`, `'Z'`, `'AA'`) to a 1-based column index.
 */
export function ColumnLetterToIndex(letter: string): number {
    const clean = letter.replace(/\$/g, '').trim().toUpperCase();
    let result = 0;
    for (let i = 0; i < clean.length; i++) {
        const code = clean.charCodeAt(i);
        if (code < 65 || code > 90) {
            return 1;
        }
        result = result * 26 + (code - 64);
    }
    return Math.max(1, result);
}

/**
 * Parses an A1 cell coordinate (`'B2'`, `'$B$2'`) into 1-based `{ row, col, absRow, absCol }`.
 */
export function ParseCellAddress(address: string): {
    row: number;
    col: number;
    colLetter: string;
    absRow: boolean;
    absCol: boolean;
} | null {
    const match = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)$/.exec(address.trim());
    if (!match) {
        return null;
    }
    const colLetter = match[2].toUpperCase();
    const col = ColumnLetterToIndex(colLetter);
    const row = parseInt(match[4], 10);
    if (col < 1 || col > EXCEL_MAX_COLS || row < 1 || row > EXCEL_MAX_ROWS) {
        return null;
    }
    return {
        col,
        row,
        colLetter,
        absCol: match[1] === '$',
        absRow: match[3] === '$'
    };
}

/**
 * Formats a 1-based `(row, col)` coordinate as an A1 cell address (`'B2'`).
 */
export function FormatCellAddress(row: number, col: number, absRow = false, absCol = false): string {
    const colLetter = ColumnIndexToLetter(col);
    return `${absCol ? '$' : ''}${colLetter}${absRow ? '$' : ''}${Math.max(1, Math.floor(row))}`;
}

/**
 * Expands an A1 range string (`'A1:C3'`, single cell `'B2'`, whole-column `'A:A'` / `'$A:$C'`,
 * or whole-row `'1:1'` / `'$1:$5'`) into `{ startRow, endRow, startCol, endCol }`.
 */
export function ParseRangeAddress(
    range: string,
    maxRows: number = DEFAULT_ROW_COUNT,
    maxCols: number = DEFAULT_COLUMN_COUNT
): {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
} | null {
    const parts = range.trim().split(':');
    if (parts.length === 1) {
        const single = ParseCellAddress(parts[0]);
        if (!single) return null;
        return {
            startRow: single.row,
            endRow: single.row,
            startCol: single.col,
            endCol: single.col
        };
    }
    if (parts.length === 2) {
        const a = ParseCellAddress(parts[0]);
        const b = ParseCellAddress(parts[1]);
        if (a && b) {
            return {
                startRow: Math.min(a.row, b.row),
                endRow: Math.max(a.row, b.row),
                startCol: Math.min(a.col, b.col),
                endCol: Math.max(a.col, b.col)
            };
        }
        // Whole-column reference: A:A, $A:$C
        const colA = /^\$?([A-Za-z]{1,3})$/.exec(parts[0].trim());
        const colB = /^\$?([A-Za-z]{1,3})$/.exec(parts[1].trim());
        if (colA && colB) {
            const c1 = ColumnLetterToIndex(colA[1].toUpperCase());
            const c2 = ColumnLetterToIndex(colB[1].toUpperCase());
            if (c1 < 1 || c2 < 1 || c1 > EXCEL_MAX_COLS || c2 > EXCEL_MAX_COLS) {
                return null;
            }
            return {
                startRow: 1,
                endRow: Math.max(1, maxRows),
                startCol: Math.min(c1, c2),
                endCol: Math.max(c1, c2)
            };
        }
        // Whole-row reference: 1:1, $1:$5
        const rowA = /^\$?([1-9][0-9]*)$/.exec(parts[0].trim());
        const rowB = /^\$?([1-9][0-9]*)$/.exec(parts[1].trim());
        if (rowA && rowB) {
            const r1 = parseInt(rowA[1], 10);
            const r2 = parseInt(rowB[1], 10);
            if (r1 < 1 || r2 < 1 || r1 > EXCEL_MAX_ROWS || r2 > EXCEL_MAX_ROWS) {
                return null;
            }
            return {
                startRow: Math.min(r1, r2),
                endRow: Math.max(r1, r2),
                startCol: 1,
                endCol: Math.max(1, maxCols)
            };
        }
    }
    return null;
}

const MAX_DENSE_ROWS = 10_000;
const MAX_DENSE_COLS = 512;
const EXCEL_MAX_ROWS = 1_048_576;
const EXCEL_MAX_COLS = 16_384;
const MAX_DYNAMIC_ARRAY_CELLS = 200_000;
export const MAX_IMPORT_SHEETS = 128;
export const MAX_IMPORT_WORKBOOK_CELLS = 250_000;
export const MAX_IMPORT_WORKBOOK_FORMULAS = 100_000;
export const MAX_IMPORT_WORKBOOK_ARRAY_ANCHORS = 25_000;
export const MAX_IMPORT_WORKBOOK_COL_TAGS = 25_000;
export const MAX_VALIDATION_RULES_PER_SHEET = 5_000;
export const MAX_VALIDATION_CHECKS_PER_WORKBOOK = 2_000_000;
export const MAX_IMPORT_WORKBOOK_MERGE_RANGES = 50_000;
export const MAX_IMPORT_WORKBOOK_CHARTS = 2_000;
export const MAX_IMPORT_DRAWING_ANCHORS = 10_000;
export const MAX_IMPORT_WORKBOOK_CONDITIONAL_FORMATS = 5_000;
export const MAX_IMPORT_WORKBOOK_LIVE_TABLES = 1_000;
export const MAX_IMPORT_WORKBOOK_EMBEDDED_ARTIFACTS = 1_000;
export const MAX_IMPORTED_FORMULA_BYTES = 16 * 1024 * 1024;
export const MAX_DAG_EDGES_PER_WORKBOOK = 1_000_000;
export const MAX_DAG_EXPANDED_WIDE_EDGES = 750_000;
export const MAX_DAG_RANGE_WATCHERS = 250_000;
export const MAX_EVAL_MATRIX_CELLS_PER_FORMULA = 1_000_000;
export const MAX_EVAL_MATRIX_CELLS_PER_WORKBOOK = 4_000_000;

interface SpreadsheetImportBudget {
    cells: number;
    formulas: number;
    formulaBytes: number;
    arrayAnchors: number;
    validationRules: number;
    colTags: number;
    merges: number;
    charts: number;
    drawingAnchors: number;
}

interface ArrayAnchorRect {
    anchorAddr: string;
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

/**
 * Verifies in `O(N log N)` time that no two multi-cell array/spill anchor rectangles overlap (`R6-1`).
 */
function assertNoOverlappingArrayAnchors(anchors: readonly ArrayAnchorRect[]): void {
    if (anchors.length <= 1) {
        return;
    }
    const sorted = [...anchors].sort((a, b) => a.startRow - b.startRow || a.startCol - b.startCol);
    // Because we reject immediately on any overlap, `active` intervals are always pairwise disjoint by [startCol, endCol].
    const active: ArrayAnchorRect[] = [];
    for (const cur of sorted) {
        if (active.length > 0) {
            let writeIdx = 0;
            for (let i = 0; i < active.length; i++) {
                if (active[i].endRow >= cur.startRow) {
                    active[writeIdx++] = active[i];
                }
            }
            active.length = writeIdx;
        }
        // Binary search first active interval with endCol >= cur.startCol
        let lo = 0;
        let hi = active.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (active[mid].endCol < cur.startCol) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if (lo < active.length && active[lo].startCol <= cur.endCol) {
            throw new Error(
                `Spreadsheet rejected: overlapping array formula ranges (${active[lo].anchorAddr} and ${cur.anchorAddr}).`
            );
        }
        // Maintain sorted startCol invariant (first active interval with startCol > cur.startCol is `lo`)
        active.splice(lo, 0, cur);
    }
}

export interface SpreadsheetWorkerIsolationRunner {
    ImportFromXlsxBytes(bytes: Uint8Array, configurationJson?: string | null): Promise<WorkbookSpec>;
    PatchXlsxBytes(originalBytes: Uint8Array, workbook: WorkbookSpec): Promise<Uint8Array>;
    EvaluateWorkbook(
        workbook: WorkbookSpec,
        editContext?: SpreadsheetCellEditContext
    ): Promise<{ Workbook: WorkbookSpec; EvaluatedFormulaCount: number }>;
}

const SPREADSHEET_WORKER_RUNNER_KEY = '___MJ_SPREADSHEET_WORKER_ISOLATION_RUNNER___';
const SPREADSHEET_WORKER_REQUIRED_KEY = '___MJ_SPREADSHEET_WORKER_ISOLATION_REQUIRED___';
const SPREADSHEET_WORKER_WARNED_KEY = '___MJ_SPREADSHEET_WORKER_FALLBACK_WARNED___';

/**
 * Registers the server-side `worker_threads` isolation runner used by {@link SpreadsheetEngine}
 * async `Isolated` entry points (`R6-1`). Keeps `@memberjunction/core-entities` free of Node imports.
 */
export function RegisterSpreadsheetWorkerRunner(runner: SpreadsheetWorkerIsolationRunner | null): void {
    const store = GetGlobalObjectStore();
    if (runner) {
        store[SPREADSHEET_WORKER_RUNNER_KEY] = runner;
    } else {
        delete store[SPREADSHEET_WORKER_RUNNER_KEY];
    }
}

/**
 * Configures whether isolated entry points must fail closed in Node/server mode when no
 * {@link SpreadsheetWorkerIsolationRunner} is registered (`R7-1`).
 */
export function SetSpreadsheetWorkerIsolationRequired(required: boolean): void {
    const store = GetGlobalObjectStore();
    if (required) {
        store[SPREADSHEET_WORKER_REQUIRED_KEY] = true;
    } else {
        delete store[SPREADSHEET_WORKER_REQUIRED_KEY];
    }
}

/**
 * Returns the registered {@link SpreadsheetWorkerIsolationRunner}, or `null` in browser / standalone mode.
 */
export function GetSpreadsheetWorkerRunner(): SpreadsheetWorkerIsolationRunner | null {
    const runner = GetGlobalObjectStore()[SPREADSHEET_WORKER_RUNNER_KEY] as
        | SpreadsheetWorkerIsolationRunner
        | undefined;
    return runner ?? null;
}

function handleMissingWorkerRunner(opName: string): void {
    const isNode = typeof process !== 'undefined' && Boolean(process.versions?.node);
    if (!isNode) {
        return;
    }
    const store = GetGlobalObjectStore();
    if (store[SPREADSHEET_WORKER_REQUIRED_KEY] === true) {
        throw new Error(
            `Spreadsheet operation '${opName}' rejected: server worker isolation runner is required but not registered.`
        );
    }
    if (!store[SPREADSHEET_WORKER_WARNED_KEY]) {
        store[SPREADSHEET_WORKER_WARNED_KEY] = true;
        LogError(
            `SpreadsheetEngine.${opName}: no worker_threads isolation runner is registered in this Node process; falling back to main-thread execution.`
        );
    }
}

function buildColSortedAddrIndex(addrs: Iterable<string>): Map<number, Array<{ row: number; addr: string }>> {
    const byCol = new Map<number, Array<{ row: number; addr: string }>>();
    for (const addr of addrs) {
        const pos = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
        if (!pos) continue;
        let list = byCol.get(pos.col);
        if (!list) {
            list = [];
            byCol.set(pos.col, list);
        }
        list.push({ row: pos.row, addr });
    }
    for (const list of byCol.values()) {
        if (list.length > 1) {
            list.sort((a, b) => a.row - b.row);
        }
    }
    return byCol;
}

function scanColSortedAddrIndex(
    byCol: ReadonlyMap<number, ReadonlyArray<{ row: number; addr: string }>>,
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
    visitor: (addr: string) => void
): void {
    const visitCol = (list: ReadonlyArray<{ row: number; addr: string }>): void => {
        let lo = 0;
        let hi = list.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (list[mid].row < startRow) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        for (let i = lo; i < list.length; i++) {
            const entry = list[i];
            if (entry.row > endRow) break;
            visitor(entry.addr);
        }
    };
    if (endCol - startCol + 1 <= byCol.size) {
        for (let c = startCol; c <= endCol; c++) {
            const list = byCol.get(c);
            if (list) visitCol(list);
        }
    } else {
        for (const [col, list] of byCol.entries()) {
            if (col < startCol || col > endCol) continue;
            visitCol(list);
        }
    }
}

interface CompiledValidationEntry {
    rule: SpreadsheetValidationRuleSpec;
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

interface CompiledValidationIndex {
    byRow: Map<number, CompiledValidationEntry[]>;
    byCol: Map<number, CompiledValidationEntry[]>;
    wideRules: CompiledValidationEntry[];
}

function buildCompiledValidationIndex(rules: readonly SpreadsheetValidationRuleSpec[]): CompiledValidationIndex {
    if (rules.length > MAX_VALIDATION_RULES_PER_SHEET) {
        throw new Error(
            `Spreadsheet rejected: worksheet exceeds maximum validation rule limit (${MAX_VALIDATION_RULES_PER_SHEET}).`
        );
    }
    const byRow = new Map<number, CompiledValidationEntry[]>();
    const byCol = new Map<number, CompiledValidationEntry[]>();
    const wideRules: CompiledValidationEntry[] = [];
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const bounds = ParseRangeAddress(rule.Range);
        if (!bounds) continue;
        const entry: CompiledValidationEntry = {
            rule,
            startRow: bounds.startRow,
            endRow: bounds.endRow,
            startCol: bounds.startCol,
            endCol: bounds.endCol
        };
        if (bounds.endRow - bounds.startRow <= 64) {
            for (let r = bounds.startRow; r <= bounds.endRow; r++) {
                let rowList = byRow.get(r);
                if (!rowList) {
                    rowList = [];
                    byRow.set(r, rowList);
                }
                rowList.push(entry);
            }
        } else if (bounds.endCol - bounds.startCol <= 64) {
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                let colList = byCol.get(c);
                if (!colList) {
                    colList = [];
                    byCol.set(c, colList);
                }
                colList.push(entry);
            }
        } else {
            wideRules.push(entry);
        }
    }
    return { byRow, byCol, wideRules };
}

/**
 * Zero-regex ASCII coordinate parser for canonical or `$`-prefixed A1 cell keys (`'B2'`, `'$AA$100'`).
 * Returns 1-based `{ row, col }` or `null` if invalid.
 */
function parseCellCoordsFast(addr: string): { row: number; col: number } | null {
    const len = addr.length;
    if (len < 2) return null;
    let i = 0;
    if (addr.charCodeAt(0) === 36) i++; // '$'
    let col = 0;
    let colChars = 0;
    while (i < len) {
        const c = addr.charCodeAt(i);
        if (c >= 65 && c <= 90) {
            col = col * 26 + (c - 64);
            colChars++;
            i++;
        } else if (c >= 97 && c <= 122) {
            col = col * 26 + (c - 96);
            colChars++;
            i++;
        } else {
            break;
        }
    }
    if (colChars === 0 || colChars > 3 || col > EXCEL_MAX_COLS || i >= len) return null;
    if (addr.charCodeAt(i) === 36) i++; // '$'
    if (i >= len) return null;
    const firstDigit = addr.charCodeAt(i);
    if (firstDigit < 49 || firstDigit > 57) return null; // '1'..'9'
    let row = firstDigit - 48;
    i++;
    while (i < len) {
        const d = addr.charCodeAt(i);
        if (d < 48 || d > 57) return null;
        row = row * 10 + (d - 48);
        i++;
    }
    if (row > EXCEL_MAX_ROWS) return null;
    return { row, col };
}

// ---------------------------------------------------------------------------
// SpreadsheetEngine Singleton
// ---------------------------------------------------------------------------

const WORKSHEET_CLEARED_SPILL_STORE_KEY = '___MJ_SPREADSHEET_WORKSHEET_CLEARED_SPILL_CHILDREN';
function getWorksheetClearedSpillMap(): WeakMap<WorksheetSpec, Set<string>> {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    let map = store[WORKSHEET_CLEARED_SPILL_STORE_KEY] as WeakMap<WorksheetSpec, Set<string>> | undefined;
    if (!map) {
        map = new WeakMap<WorksheetSpec, Set<string>>();
        store[WORKSHEET_CLEARED_SPILL_STORE_KEY] = map;
    }
    return map;
}

function getClearedSpillSet(ws: WorksheetSpec): Set<string> | undefined {
    return getWorksheetClearedSpillMap().get(ws);
}

function addClearedSpillAddr(ws: WorksheetSpec, addr: string): void {
    const clearedMap = getWorksheetClearedSpillMap();
    let s = clearedMap.get(ws);
    if (!s) {
        s = new Set<string>();
        clearedMap.set(ws, s);
    }
    s.add(addr.toUpperCase());
}

function deleteClearedSpillAddr(ws: WorksheetSpec, addr: string): void {
    const s = getWorksheetClearedSpillMap().get(ws);
    if (s) {
        s.delete(addr.toUpperCase());
    }
}

/**
 * Isomorphic engine for MJ Sheets (`Excel Spreadsheet` artifact type, `§ 6` & `§ 7.2`).
 *
 * Provides:
 * - Multi-tab workbook creation, normalization, and revision hashing
 * - Stable RowID / ColumnID formula storage (`CompileFormulaToStableIds` / `ResolveFormulaFromStableIds`)
 *   so concurrent row/column insertions and formula edits over Yjs preserve exact cell targets (`Accept #1`)
 * - Headless Node + browser formula evaluation covering 35+ spreadsheet functions (`Accept #3`)
 * - Viewer-scoped `=MJ.QUERY(name, ...params)` and `=MJ.VIEW(entity, view, filter)` evaluation with
 *   RLS + FLS projection, `IsServerSet` stripping, 60s viewer cache, and concurrency cap (`§ 6.3`, `§ 7.2`)
 * - Range sources (`SpreadsheetLiveTableSpec`) bound to MJ Views/Queries with calculated formula columns
 *   and explicit recorded `O5` freeze (`Accept #2`)
 * - Lossless `.xlsx` (OpenXML ZIP with `<f>` formulas and `numFmt` styles) and `.csv` import/export (`Accept #4`)
 * - Range chart dataset extraction for live Sheet-to-Slide / Sheet-to-Doc chart blocks (`Accept #5`)
 */
export class SpreadsheetEngine extends BaseSingleton<SpreadsheetEngine> {
    private viewerCache = new Map<string, ViewerFunctionCacheEntry>();
    private sheetToWorkbook = new WeakMap<WorksheetSpec, WorkbookSpec>();
    private workbookDagCache = new WeakMap<WorkbookSpec, WorkbookDependencyGraph>();
    private sheetLookupCache = new WeakMap<
        WorksheetSpec,
        { rowLen: number; colLen: number; rowIndexById: Map<string, number>; colIndexById: Map<string, number> }
    >();
    private sheetAxisIdSets = new WeakMap<
        WorksheetSpec,
        { rowIds: Set<string>; lastRowLen: number; colIds: Set<string>; lastColLen: number }
    >();
    private workbookVirtualAxisIndex = new WeakMap<WorkbookSpec, Map<string, Map<SpreadsheetCellSpec, WorksheetSpec>>>();
    private sheetUnboundVirtualAxisIndex = new WeakMap<WorksheetSpec, Map<string, Set<SpreadsheetCellSpec>>>();
    private cellIndexedVirtualTokens = new WeakMap<SpreadsheetCellSpec, Set<string>>();
    private indexedSheets = new WeakSet<WorksheetSpec>();
    private sheetsWithVirtualAxisIds = new WeakSet<WorksheetSpec>();
    private workbooksWithVirtualAxisIds = new WeakSet<WorkbookSpec>();
    private unimplementedResultCells = new WeakSet<SpreadsheetCellSpec>();
    private validationIndexCache = new WeakMap<
        WorksheetSpec,
        { rulesRef: readonly SpreadsheetValidationRuleSpec[]; rulesLen: number; index: CompiledValidationIndex }
    >();
    private monotonicIdCounter = 0;
    private _lastEvaluatedFormulaCount = 0;
    private activeEvalBudget: {
        ops: number;
        maxOps: number;
        deadlineMs: number;
        exceeded: boolean;
        matrixCellsLive: number;
        totalMatrixCellsAllocated: number;
        sheetColIndex: WeakMap<WorksheetSpec, Map<number, Array<{ row: number; addr: string }>>>;
    } | null = null;

    private runWithEvalBudget<T>(fn: () => T): T {
        if (this.activeEvalBudget) {
            return fn();
        }
        this.activeEvalBudget = {
            ops: 0,
            maxOps: MAX_EVAL_OPS_PER_WORKBOOK,
            deadlineMs: Date.now() + MAX_EVAL_TIME_MS,
            exceeded: false,
            matrixCellsLive: 0,
            totalMatrixCellsAllocated: 0,
            sheetColIndex: new WeakMap<WorksheetSpec, Map<number, Array<{ row: number; addr: string }>>>()
        };
        try {
            return fn();
        } finally {
            this.activeEvalBudget = null;
        }
    }

    private chargeMatrixAllocation(cellCount: number): void {
        if (!Number.isFinite(cellCount) || cellCount < 0) {
            throw new EvalBudgetExceededError();
        }
        const budget = this.activeEvalBudget;
        if (!budget) {
            if (cellCount > MAX_DYNAMIC_ARRAY_CELLS) {
                throw new EvalBudgetExceededError();
            }
            return;
        }
        if (budget.exceeded) {
            throw new EvalBudgetExceededError();
        }
        if (budget.matrixCellsLive + cellCount > MAX_EVAL_MATRIX_CELLS_PER_FORMULA) {
            throw new EvalBudgetExceededError();
        }
        if (budget.totalMatrixCellsAllocated + cellCount > MAX_EVAL_MATRIX_CELLS_PER_WORKBOOK) {
            budget.exceeded = true;
            throw new EvalBudgetExceededError();
        }
        this.consumeEvalBudget(Math.max(1, cellCount));
        budget.matrixCellsLive += cellCount;
        budget.totalMatrixCellsAllocated += cellCount;
    }

    private getOrBuildValidationIndex(sheet: WorksheetSpec): CompiledValidationIndex {
        const cached = this.validationIndexCache.get(sheet);
        if (cached && cached.rulesRef === sheet.ValidationRules && cached.rulesLen === sheet.ValidationRules.length) {
            return cached.index;
        }
        const index = buildCompiledValidationIndex(sheet.ValidationRules);
        this.validationIndexCache.set(sheet, {
            rulesRef: sheet.ValidationRules,
            rulesLen: sheet.ValidationRules.length,
            index
        });
        return index;
    }

    private getOrBuildSheetColIndex(sheet: WorksheetSpec): Map<number, Array<{ row: number; addr: string }>> {
        const cached = this.activeEvalBudget?.sheetColIndex.get(sheet);
        if (cached) {
            return cached;
        }
        const keys = Object.keys(sheet.Cells);
        if (this.activeEvalBudget && keys.length > 0) {
            this.consumeEvalBudget(keys.length);
        }
        const byCol = new Map<number, Array<{ row: number; addr: string }>>();
        for (const addr of keys) {
            const pos = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
            if (!pos) continue;
            let entries = byCol.get(pos.col);
            if (!entries) {
                entries = [];
                byCol.set(pos.col, entries);
            }
            entries.push({ row: pos.row, addr });
        }
        for (const entries of byCol.values()) {
            if (entries.length > 1) {
                entries.sort((a, b) => a.row - b.row);
            }
        }
        this.activeEvalBudget?.sheetColIndex.set(sheet, byCol);
        return byCol;
    }

    private upsertCellInEvalColIndex(sheet: WorksheetSpec, row: number, col: number, addr: string): void {
        const byCol = this.activeEvalBudget?.sheetColIndex.get(sheet);
        if (!byCol) {
            return;
        }
        let entries = byCol.get(col);
        if (!entries) {
            entries = [{ row, addr }];
            byCol.set(col, entries);
            return;
        }
        let lo = 0;
        let hi = entries.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (entries[mid].row < row) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if (lo < entries.length && entries[lo].row === row) {
            entries[lo] = { row, addr };
        } else if (entries.length === 0 || row > entries[entries.length - 1].row) {
            entries.push({ row, addr });
        } else {
            entries.splice(lo, 0, { row, addr });
        }
    }

    private removeCellFromEvalColIndex(sheet: WorksheetSpec, row: number, col: number): void {
        const byCol = this.activeEvalBudget?.sheetColIndex.get(sheet);
        if (!byCol) {
            return;
        }
        const entries = byCol.get(col);
        if (!entries || entries.length === 0) {
            return;
        }
        if (entries[entries.length - 1].row === row) {
            entries.pop();
            if (entries.length === 0) {
                byCol.delete(col);
            }
            return;
        }
        let lo = 0;
        let hi = entries.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (entries[mid].row < row) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if (lo < entries.length && entries[lo].row === row) {
            entries.splice(lo, 1);
            if (entries.length === 0) {
                byCol.delete(col);
            }
        }
    }

    private getPopulatedCellBounds(sheet: WorksheetSpec): { maxRow: number; maxCol: number } {
        const byCol = this.getOrBuildSheetColIndex(sheet);
        let maxRow = 1;
        let maxCol = 1;
        for (const [col, entries] of byCol.entries()) {
            if (col > maxCol) {
                maxCol = col;
            }
            if (entries.length > 0) {
                const lastRow = entries[entries.length - 1].row;
                if (lastRow > maxRow) {
                    maxRow = lastRow;
                }
            }
        }
        return { maxRow, maxCol };
    }

    private consumeEvalBudget(cost = 1): void {
        const budget = this.activeEvalBudget;
        if (!budget) {
            throw new EvalBudgetExceededError();
        }
        if (budget.exceeded) {
            throw new EvalBudgetExceededError();
        }
        const units = Number.isFinite(cost) && cost > 1 ? Math.trunc(cost) : 1;
        const prevOps = budget.ops;
        budget.ops += units;
        if (
            budget.ops > budget.maxOps ||
            units > 64 ||
            (budget.ops >>> 10) !== (prevOps >>> 10)
        ) {
            if (budget.ops > budget.maxOps || Date.now() > budget.deadlineMs) {
                budget.exceeded = true;
                throw new EvalBudgetExceededError();
            }
        }
    }

    private joinCappedStrings(parts: readonly string[], delim = ''): string {
        let totalLen = parts.length > 1 ? delim.length * (parts.length - 1) : 0;
        if (totalLen > MAX_CELL_STRING_LENGTH) {
            return '#VALUE!';
        }
        for (let i = 0; i < parts.length; i++) {
            totalLen += parts[i].length;
            if (totalLen > MAX_CELL_STRING_LENGTH) {
                return '#VALUE!';
            }
        }
        return parts.join(delim);
    }

    /**
     * Number of cell formulas evaluated in the most recent `EvaluateWorkbook` or incremental recalculation pass.
     */
    public get LastEvaluatedFormulaCount(): number {
        return this._lastEvaluatedFormulaCount;
    }

    protected constructor() {
        super();
    }

    /** Returns the process-wide singleton instance of {@link SpreadsheetEngine}. */
    public static get Instance(): SpreadsheetEngine {
        return super.getInstance<SpreadsheetEngine>();
    }

    /** Clears the viewer-scoped `=MJ.QUERY` / `=MJ.VIEW` result cache. */
    public ClearViewerFunctionCache(userId?: string): void {
        if (!userId) {
            this.viewerCache.clear();
            return;
        }
        const prefix = `${userId.toLowerCase()}::`;
        for (const key of Array.from(this.viewerCache.keys())) {
            if (key.startsWith(prefix)) {
                this.viewerCache.delete(key);
            }
        }
    }

    /**
     * Creates a new multi-tab {@link WorkbookSpec} with stable `RowID`s and `ColumnID`s.
     */
    public CreateEmptyWorkbook(
        title = 'Untitled Workbook',
        sheetNames: string[] = ['Sheet 1'],
        rowCount = DEFAULT_ROW_COUNT,
        colCount = DEFAULT_COLUMN_COUNT
    ): WorkbookSpec {
        const now = new Date().toISOString();
        const names = sheetNames.length > 0 ? sheetNames : ['Sheet 1'];
        const worksheets = names.map((name, idx) =>
            this.CreateEmptyWorksheet(`sheet-${idx + 1}`, name, rowCount, colCount)
        );
        const wb: WorkbookSpec = {
            WorkbookID: `wb-${Date.now().toString(36)}`,
            Title: title,
            ActiveSheetID: worksheets[0].SheetID,
            Worksheets: worksheets,
            NamedRanges: [],
            CreatedAt: now,
            UpdatedAt: now
        };
        this.bindSheetsToWorkbook(wb);
        return wb;
    }

    /**
     * Creates a single empty {@link WorksheetSpec} with initialized stable `Rows` and `Columns`.
     */
    public CreateEmptyWorksheet(
        sheetId: string,
        name: string,
        rowCount = DEFAULT_ROW_COUNT,
        colCount = DEFAULT_COLUMN_COUNT
    ): WorksheetSpec {
        const rows: SpreadsheetRowSpec[] = [];
        for (let r = 1; r <= Math.max(1, rowCount); r++) {
            rows.push({
                RowID: `${sheetId}-row-${r}`,
                Index: r,
                Height: DEFAULT_ROW_HEIGHT,
                Hidden: false
            });
        }
        const columns: SpreadsheetColumnSpec[] = [];
        for (let c = 1; c <= Math.max(1, colCount); c++) {
            const letter = ColumnIndexToLetter(c);
            columns.push({
                ColumnID: `${sheetId}-col-${letter}`,
                Index: c,
                Letter: letter,
                Width: DEFAULT_COLUMN_WIDTH,
                Hidden: false
            });
        }
        const ws: WorksheetSpec = {
            SheetID: sheetId,
            Name: name.slice(0, 31) || 'Sheet 1',
            Rows: rows,
            Columns: columns,
            Cells: {},
            FrozenRows: 1,
            FrozenColumns: 0,
            SortSpec: null,
            FilterSpecs: [],
            ValidationRules: [],
            ConditionalFormats: [],
            LiveTables: [],
            Charts: [],
            EmbeddedArtifacts: [],
            ProtectedRanges: []
        };
        this.indexedSheets.add(ws);
        return ws;
    }

    /**
     * Parses a workbook from JSON string, `Configuration` metadata string, CSV text, or returns a default workbook.
     */
    public ParseWorkbook(
        content?: string | null,
        configuration?: string | null,
        options?: { SkipEvaluate?: boolean }
    ): WorkbookSpec {
        for (const candidate of [configuration, content]) {
            if (!candidate || typeof candidate !== 'string') continue;
            const trimmed = candidate.trim();
            if (!trimmed.startsWith('{')) continue;
            let parsed: Partial<WorkbookSpec> | null = null;
            try {
                parsed = JSON.parse(trimmed) as Partial<WorkbookSpec>;
            } catch {
                parsed = null;
            }
            if (parsed && Array.isArray(parsed.Worksheets) && parsed.Worksheets.length > 0) {
                const wb = this.NormalizeWorkbook(parsed);
                if (!options?.SkipEvaluate) {
                    this.EvaluateWorkbook(wb);
                }
                return wb;
            }
        }

        if (content && typeof content === 'string') {
            const trimmed = content.trim();
            // Data URL or base64 XLSX
            if (trimmed.startsWith('data:') || trimmed.startsWith('UEsDB')) {
                const bytes = this.decodeBase64OrDataUrl(trimmed);
                if (bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
                    const imported = this.ImportFromXlsxBytes(bytes, configuration);
                    return imported;
                }
            }
            // Plain CSV fallback
            if (trimmed.length > 0 && !trimmed.startsWith('{') && !trimmed.startsWith('data:')) {
                return this.ImportFromCsv(trimmed, 'Sheet 1', 'Imported CSV', options);
            }
        }

        return this.CreateEmptyWorkbook();
    }

    /**
     * Isolated async counterpart to {@link ParseWorkbook}: enforces workbook limits in
     * {@link NormalizeWorkbook} and delegates `.xlsx` binary imports as well as formula
     * evaluation to the registered server `worker_threads` runner when active (`R7-1`).
     */
    public async ParseWorkbookIsolated(
        content?: string | null,
        configuration?: string | null,
        options?: { SkipEvaluate?: boolean }
    ): Promise<WorkbookSpec> {
        for (const candidate of [configuration, content]) {
            if (!candidate || typeof candidate !== 'string') continue;
            const trimmed = candidate.trim();
            if (!trimmed.startsWith('{')) continue;
            let parsed: Partial<WorkbookSpec> | null = null;
            try {
                parsed = JSON.parse(trimmed) as Partial<WorkbookSpec>;
            } catch {
                parsed = null;
            }
            if (parsed && Array.isArray(parsed.Worksheets) && parsed.Worksheets.length > 0) {
                const wb = this.NormalizeWorkbook(parsed);
                if (!options?.SkipEvaluate) {
                    await this.EvaluateWorkbookIsolated(wb);
                }
                return wb;
            }
        }

        if (content && typeof content === 'string') {
            const trimmed = content.trim();
            if (trimmed.startsWith('data:') || trimmed.startsWith('UEsDB')) {
                const bytes = this.decodeBase64OrDataUrl(trimmed);
                if (bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
                    return await this.ImportFromXlsxBytesIsolated(bytes, configuration);
                }
            }
            if (trimmed.length > 0 && !trimmed.startsWith('{') && !trimmed.startsWith('data:')) {
                const wb = this.ImportFromCsv(trimmed, 'Sheet 1', 'Imported CSV', { SkipEvaluate: true });
                if (!options?.SkipEvaluate) {
                    await this.EvaluateWorkbookIsolated(wb);
                }
                return wb;
            }
        }

        return this.CreateEmptyWorkbook();
    }

    /**
     * Serializes a {@link WorkbookSpec} to canonical formatted JSON, stripping viewer-scoped
     * `=MJ.*` spill cells, `Mode === 'Live'` table cells, and `=MJ.QUERY`/`=MJ.VIEW` computed values
     * so viewer-scoped data is never persisted (`B4`).
     */
    public SerializeWorkbook(workbook: WorkbookSpec, options?: { preserveTimestamps?: boolean }): string {
        if (!options?.preserveTimestamps) {
            workbook.UpdatedAt = new Date().toISOString();
        }
        const sanitized = this.cloneWorkbookWithoutViewerScopedData(workbook);
        return JSON.stringify(sanitized, null, 2);
    }

    /**
     * Returns a deep-cloned workbook with all viewer-scoped data (`=MJ.*` cells/spills,
     * `Mode === 'Live'` tables, and transitively dependent formula cells) stripped (`B7b`).
     */
    public CloneWorkbookWithoutViewerScopedData(workbook: WorkbookSpec): WorkbookSpec {
        return this.cloneWorkbookWithoutViewerScopedData(workbook);
    }

    private isCellInLiveTableFootprint(ws: WorksheetSpec, rowIndex: number, colIndex: number): string | null {
        for (const table of ws.LiveTables) {
            if (table.Mode === 'Frozen') continue;
            const anchor = ParseCellAddress(table.AnchorCell || 'A1');
            if (!anchor) continue;
            const rowSpan =
                (table.IncludeHeaders !== false ? 1 : 0) + Math.max(0, table.LastRowCount ?? 0);
            if (rowSpan <= 0) continue;
            const colSpan = Math.max(
                1,
                table.LastColumnCount ?? ((table.Fields?.length ?? 0) + (table.CalculatedColumns?.length ?? 0))
            );
            if (
                rowIndex >= anchor.row &&
                rowIndex < anchor.row + rowSpan &&
                colIndex >= anchor.col &&
                colIndex < anchor.col + colSpan
            ) {
                return table.TableID;
            }
        }
        return null;
    }

    private cloneWorkbookWithoutViewerScopedData(workbook: WorkbookSpec): WorkbookSpec {
        // 1. Identify all viewer-scoped cells across the workbook in O(cells), and index spill children by anchor
        //    so static dynamic-array spills (e.g. =SEQUENCE(5)) are preserved while viewer-scoped spills are stripped.
        const viewerScopedSeedKeys = new Set<string>();
        const liveTableIdsBySheet = new Map<string, Set<string>>();
        const spilledChildrenByAnchorKey = new Map<string, string[]>();

        for (const ws of workbook.Worksheets) {
            const liveModeTableIds = new Set(
                ws.LiveTables.filter((t) => t.Mode !== 'Frozen').map((t) => t.TableID)
            );
            liveTableIdsBySheet.set(ws.SheetID, liveModeTableIds);

            for (const [addr, cell] of Object.entries(ws.Cells)) {
                if (!cell) continue;
                const pos = ParseCellAddress(addr);
                const canonicalAddr = pos ? FormatCellAddress(pos.row, pos.col) : addr;
                const cellKey = `${ws.SheetID}::${canonicalAddr}`;
                if (cell.SpilledFrom) {
                    const anchorPos = ParseCellAddress(cell.SpilledFrom);
                    const canonicalAnchor = anchorPos
                        ? FormatCellAddress(anchorPos.row, anchorPos.col)
                        : cell.SpilledFrom.toUpperCase();
                    const anchorKey = `${ws.SheetID}::${canonicalAnchor}`;
                    let children = spilledChildrenByAnchorKey.get(anchorKey);
                    if (!children) {
                        children = [];
                        spilledChildrenByAnchorKey.set(anchorKey, children);
                    }
                    children.push(cellKey);
                }
                const footprintTableId = pos ? this.isCellInLiveTableFootprint(ws, pos.row, pos.col) : null;
                const parsedMj = cell.Formula ? this.ParseMjCustomFunctionFormula(cell.Formula) : null;
                if (
                    (cell.LiveTableID && liveModeTableIds.has(cell.LiveTableID)) ||
                    footprintTableId !== null ||
                    (parsedMj && parsedMj.Kind !== 'AI')
                ) {
                    viewerScopedSeedKeys.add(cellKey);
                }
            }
        }

        // 2. If any viewer-scoped cells exist, find all formula cells and dynamic spills that transitively depend on them
        //    via a fast O(V + E) BFS over the dependency graph WITHOUT calling EvaluateWorkbook!
        //    Includes >256-cell range watchers (e.g. =SUM(A:A), =VLOOKUP(..., A1:D500, ...), =MJ.AI(..., B2:D300)).
        const transitivelyDependentFormulaKeys = new Set<string>();
        const viewerScopedSpillChildKeys = new Set<string>();
        if (viewerScopedSeedKeys.size > 0) {
            const dag = this.workbookDagCache.get(workbook) ?? this.buildWorkbookDependencyGraph(workbook);
            this.workbookDagCache.set(workbook, dag);
            const queuedKeys = new Set<string>(viewerScopedSeedKeys);
            const queue = Array.from(viewerScopedSeedKeys);
            let head = 0;
            while (head < queue.length) {
                const current = queue[head++];
                const spillChildren = spilledChildrenByAnchorKey.get(current);
                if (spillChildren) {
                    for (const childKey of spillChildren) {
                        viewerScopedSpillChildKeys.add(childKey);
                        if (!queuedKeys.has(childKey)) {
                            queuedKeys.add(childKey);
                            queue.push(childKey);
                        }
                    }
                }
                const revDeps = dag.reverseCellDeps.get(current);
                if (revDeps) {
                    for (const depKey of revDeps) {
                        if (!viewerScopedSeedKeys.has(depKey) && !transitivelyDependentFormulaKeys.has(depKey)) {
                            transitivelyDependentFormulaKeys.add(depKey);
                        }
                        if (!queuedKeys.has(depKey)) {
                            queuedKeys.add(depKey);
                            queue.push(depKey);
                        }
                    }
                }
                const sepIdx = current.indexOf('::');
                if (sepIdx > 0) {
                    const sheetId = current.slice(0, sepIdx);
                    const addr = current.slice(sepIdx + 2);
                    const watchers = dag.rangeWatchersBySheet.get(sheetId);
                    if (watchers && watchers.length > 0) {
                        const pos = ParseCellAddress(addr);
                        if (pos) {
                            for (const w of watchers) {
                                if (
                                    pos.row >= w.startRow &&
                                    pos.row <= w.endRow &&
                                    pos.col >= w.startCol &&
                                    pos.col <= w.endCol
                                ) {
                                    if (!viewerScopedSeedKeys.has(w.watcherKey) && !transitivelyDependentFormulaKeys.has(w.watcherKey)) {
                                        transitivelyDependentFormulaKeys.add(w.watcherKey);
                                    }
                                    if (!queuedKeys.has(w.watcherKey)) {
                                        queuedKeys.add(w.watcherKey);
                                        queue.push(w.watcherKey);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Clone worksheets, stripping live/spilled values and clearing transitively dependent formula values
        const cloned: WorkbookSpec = {
            ...workbook,
            NamedRanges: workbook.NamedRanges.map((nr) => ({ ...nr })),
            Worksheets: workbook.Worksheets.map((ws) => {
                const liveModeTableIds = liveTableIdsBySheet.get(ws.SheetID) ?? new Set<string>();
                const cleanedCells: Record<string, SpreadsheetCellSpec> = {};
                for (const [addr, cell] of Object.entries(ws.Cells)) {
                    if (!cell) continue;
                    const pos = ParseCellAddress(addr);
                    const canonicalAddr = pos ? FormatCellAddress(pos.row, pos.col) : addr;
                    const cellKey = `${ws.SheetID}::${canonicalAddr}`;

                    const parsedMj = cell.Formula ? this.ParseMjCustomFunctionFormula(cell.Formula) : null;
                    if (parsedMj && parsedMj.Kind !== 'AI') {
                        const clearedMj: SpreadsheetCellSpec = {
                            ...cell,
                            RawValue: null,
                            ComputedValue: null,
                            DisplayValue: '',
                            AccessDenied: false,
                            ErrorMessage: null,
                            SpilledFrom: null,
                            Style: cell.Style ? { ...cell.Style } : undefined
                        };
                        delete clearedMj.AiInputHash;
                        cleanedCells[addr] = clearedMj;
                        continue;
                    }

                    const footprintTableId = pos ? this.isCellInLiveTableFootprint(ws, pos.row, pos.col) : null;
                    const isLiveOrSpilled =
                        viewerScopedSpillChildKeys.has(cellKey) ||
                        Boolean(cell.LiveTableID && liveModeTableIds.has(cell.LiveTableID)) ||
                        footprintTableId !== null;

                    if (isLiveOrSpilled) {
                        // Omit uncustomized live/spilled cells; if the user added a Note or custom Style to a live cell,
                        // preserve only the Note/Style metadata with RawValue: null, ComputedValue: null, DisplayValue: ''
                        const tableObj = ws.LiveTables.find(
                            (t) => t.TableID === (cell.LiveTableID ?? footprintTableId)
                        );
                        const anchorPos = tableObj ? ParseCellAddress(tableObj.AnchorCell || 'A1') : null;
                        const isHeaderCell = Boolean(
                            tableObj &&
                                tableObj.IncludeHeaders !== false &&
                                anchorPos &&
                                pos &&
                                pos.row === anchorPos.row
                        );
                        const isCalculatedColCell = Boolean(cell.Formula && cell.LiveTableID);
                        const styleKeys = cell.Style ? Object.keys(cell.Style) : [];
                        const hasCustomStyle =
                            styleKeys.length > 0 &&
                            !(isHeaderCell && styleKeys.length === 1 && cell.Style?.Bold === true) &&
                            !(
                                isCalculatedColCell &&
                                styleKeys.every((k) => k === 'FormatType' || k === 'NumberFormatPattern')
                            );
                        if (cell.Note || hasCustomStyle) {
                            cleanedCells[addr] = {
                                RowID: cell.RowID,
                                ColumnID: cell.ColumnID,
                                Address: cell.Address,
                                RawValue: null,
                                Formula: null,
                                FormulaStable: null,
                                ComputedValue: null,
                                DisplayValue: '',
                                Style: cell.Style ? { ...cell.Style } : undefined,
                                Note: cell.Note,
                                SpilledFrom: cell.SpilledFrom ?? null,
                                LiveTableID: cell.LiveTableID ?? footprintTableId ?? null
                            };
                        }
                        continue;
                    }

                    const resolvedFormula = cell.FormulaStable
                        ? this.ResolveFormulaFromStableIds(ws, cell.FormulaStable, workbook)
                        : cell.Formula;

                    if (transitivelyDependentFormulaKeys.has(cellKey)) {
                        const cellCopy: SpreadsheetCellSpec = {
                            ...cell,
                            Formula: resolvedFormula,
                            RawValue: null,
                            ComputedValue: null,
                            DisplayValue: '',
                            Style: cell.Style ? { ...cell.Style } : undefined
                        };
                        delete cellCopy.AiInputHash;
                        copyCellXmlMeta(cell, cellCopy);
                        if (!(parsedMj && parsedMj.Kind !== 'AI')) {
                            delete cellCopy.AccessDenied;
                            delete cellCopy.ErrorMessage;
                        }
                        cleanedCells[addr] = cellCopy;
                        continue;
                    }

                    const clonedCell: SpreadsheetCellSpec = {
                        ...cell,
                        Formula: resolvedFormula,
                        Style: cell.Style ? { ...cell.Style } : undefined
                    };
                    copyCellXmlMeta(cell, clonedCell);
                    if (!Boolean(cell.Formula && this.ParseMjCustomFunctionFormula(cell.Formula))) {
                        delete clonedCell.AccessDenied;
                        delete clonedCell.ErrorMessage;
                    }
                    if (this.unimplementedResultCells.has(cell)) {
                        this.unimplementedResultCells.add(clonedCell);
                    }
                    cleanedCells[addr] = clonedCell;
                }
                    return {
                        ...ws,
                        Rows: ws.Rows.map((r) => ({ ...r })),
                        Columns: ws.Columns.map((c) => ({ ...c })),
                        Cells: cleanedCells,
                        FilterSpecs: ws.FilterSpecs.map((f) => ({ ...f })),
                        ValidationRules: ws.ValidationRules.map((v) => ({ ...v })),
                        ConditionalFormats: ws.ConditionalFormats.map((cf) => ({ ...cf })),
                        LiveTables: ws.LiveTables.map((t) => ({ ...t })),
                        Charts: ws.Charts.map((c) => ({ ...c })),
                        EmbeddedArtifacts: ws.EmbeddedArtifacts.map((e) => ({ ...e })),
                        ProtectedRanges: (ws.ProtectedRanges ?? []).map((p) => ({ ...p }))
                    };
                })
        };

        this.bindSheetsToWorkbook(cloned);
        return cloned;
    }

    private getOrCreateWorkbookVirtualAxisIndex(
        workbook: WorkbookSpec
    ): Map<string, Map<SpreadsheetCellSpec, WorksheetSpec>> {
        let index = this.workbookVirtualAxisIndex.get(workbook);
        if (!index) {
            index = new Map<string, Map<SpreadsheetCellSpec, WorksheetSpec>>();
            this.workbookVirtualAxisIndex.set(workbook, index);
        }
        return index;
    }

    private extractVirtualAxisTokensFromCell(cell: SpreadsheetCellSpec): Set<string> | null {
        let out: Set<string> | null = null;
        if (cell.RowID && cell.RowID.includes('-vrow-')) {
            out = out ?? new Set<string>();
            out.add(cell.RowID);
        }
        if (cell.ColumnID && cell.ColumnID.includes('-vcol-')) {
            out = out ?? new Set<string>();
            out.add(cell.ColumnID);
        }
        const fs = cell.FormulaStable;
        if (fs && (fs.includes('-vrow-') || fs.includes('-vcol-'))) {
            const rx = /[(,]\$?([^\s,()$]+-v(?:row|col)-\d+)(?=[,)])/g;
            let match: RegExpExecArray | null;
            while ((match = rx.exec(fs)) !== null) {
                out = out ?? new Set<string>();
                out.add(match[1]);
            }
        }
        return out;
    }

    private removeCellFromVirtualAxisIndex(sheet: WorksheetSpec, cell: SpreadsheetCellSpec): void {
        const prevTokens = this.cellIndexedVirtualTokens.get(cell);
        if (!prevTokens || prevTokens.size === 0) {
            return;
        }
        const wb = this.sheetToWorkbook.get(sheet);
        const wbIndex = wb ? this.workbookVirtualAxisIndex.get(wb) : undefined;
        const unboundIndex = this.sheetUnboundVirtualAxisIndex.get(sheet);
        for (const tok of prevTokens) {
            if (wbIndex) {
                const cellMap = wbIndex.get(tok);
                if (cellMap) {
                    cellMap.delete(cell);
                    if (cellMap.size === 0) {
                        wbIndex.delete(tok);
                    }
                }
            }
            if (unboundIndex) {
                const cellSet = unboundIndex.get(tok);
                if (cellSet) {
                    cellSet.delete(cell);
                    if (cellSet.size === 0) {
                        unboundIndex.delete(tok);
                    }
                }
            }
        }
        this.cellIndexedVirtualTokens.delete(cell);
    }

    private syncCellVirtualAxisIndex(sheet: WorksheetSpec, cell: SpreadsheetCellSpec): void {
        const nextTokens = this.extractVirtualAxisTokensFromCell(cell);
        const prevTokens = this.cellIndexedVirtualTokens.get(cell);
        if (!nextTokens && (!prevTokens || prevTokens.size === 0)) {
            return;
        }
        if (prevTokens && prevTokens.size > 0) {
            this.removeCellFromVirtualAxisIndex(sheet, cell);
        }
        if (!nextTokens || nextTokens.size === 0) {
            return;
        }
        this.cellIndexedVirtualTokens.set(cell, nextTokens);
        const wb = this.sheetToWorkbook.get(sheet);
        if (wb) {
            const wbIndex = this.getOrCreateWorkbookVirtualAxisIndex(wb);
            for (const tok of nextTokens) {
                let cellMap = wbIndex.get(tok);
                if (!cellMap) {
                    cellMap = new Map<SpreadsheetCellSpec, WorksheetSpec>();
                    wbIndex.set(tok, cellMap);
                }
                cellMap.set(cell, sheet);
            }
            this.workbooksWithVirtualAxisIds.add(wb);
        } else {
            let unboundIndex = this.sheetUnboundVirtualAxisIndex.get(sheet);
            if (!unboundIndex) {
                unboundIndex = new Map<string, Set<SpreadsheetCellSpec>>();
                this.sheetUnboundVirtualAxisIndex.set(sheet, unboundIndex);
            }
            for (const tok of nextTokens) {
                let cellSet = unboundIndex.get(tok);
                if (!cellSet) {
                    cellSet = new Set<SpreadsheetCellSpec>();
                    unboundIndex.set(tok, cellSet);
                }
                cellSet.add(cell);
            }
            this.sheetsWithVirtualAxisIds.add(sheet);
        }
    }

    private bindSheetsToWorkbook(workbook: WorkbookSpec): void {
        const wbIndex = this.getOrCreateWorkbookVirtualAxisIndex(workbook);
        for (const ws of workbook.Worksheets) {
            this.sheetToWorkbook.set(ws, workbook);
            const unbound = this.sheetUnboundVirtualAxisIndex.get(ws);
            if (unbound) {
                for (const [tok, cellSet] of unbound.entries()) {
                    let cellMap = wbIndex.get(tok);
                    if (!cellMap) {
                        cellMap = new Map<SpreadsheetCellSpec, WorksheetSpec>();
                        wbIndex.set(tok, cellMap);
                    }
                    for (const c of cellSet) {
                        cellMap.set(c, ws);
                    }
                }
                this.sheetUnboundVirtualAxisIndex.delete(ws);
            }
            if (!this.indexedSheets.has(ws)) {
                this.indexedSheets.add(ws);
                for (const cell of Object.values(ws.Cells)) {
                    if (cell) {
                        this.syncCellVirtualAxisIndex(ws, cell);
                    }
                }
            }
            if (this.sheetsWithVirtualAxisIds.has(ws)) {
                this.workbooksWithVirtualAxisIds.add(workbook);
            }
        }
        if (wbIndex.size > 0) {
            this.workbooksWithVirtualAxisIds.add(workbook);
        }
    }

    private markSheetHasVirtualAxisIds(sheet: WorksheetSpec): void {
        this.sheetsWithVirtualAxisIds.add(sheet);
        const wb = this.sheetToWorkbook.get(sheet);
        if (wb) {
            this.workbooksWithVirtualAxisIds.add(wb);
        }
    }

    private getSheetLookup(
        ws: WorksheetSpec
    ): { rowIndexById: Map<string, number>; colIndexById: Map<string, number> } {
        const cached = this.sheetLookupCache.get(ws);
        if (cached && cached.rowLen === ws.Rows.length && cached.colLen === ws.Columns.length) {
            return cached;
        }
        const rowIndexById = new Map<string, number>();
        for (let i = 0; i < ws.Rows.length; i++) {
            rowIndexById.set(ws.Rows[i].RowID, i + 1);
        }
        const colIndexById = new Map<string, number>();
        for (let i = 0; i < ws.Columns.length; i++) {
            colIndexById.set(ws.Columns[i].ColumnID, i + 1);
        }
        const built = {
            rowLen: ws.Rows.length,
            colLen: ws.Columns.length,
            rowIndexById,
            colIndexById
        };
        this.sheetLookupCache.set(ws, built);
        return built;
    }

    private getStableRowIdForIndex(sheet: WorksheetSpec, row1Based: number): string {
        const existing = sheet.Rows[row1Based - 1];
        if (existing) {
            return existing.RowID;
        }
        this.markSheetHasVirtualAxisIds(sheet);
        return `${sheet.SheetID}-vrow-${row1Based}`;
    }

    private getStableColIdForIndex(sheet: WorksheetSpec, col1Based: number): string {
        const existing = sheet.Columns[col1Based - 1];
        if (existing) {
            return existing.ColumnID;
        }
        this.markSheetHasVirtualAxisIds(sheet);
        return `${sheet.SheetID}-vcol-${col1Based}`;
    }

    private resolveRowIndexFromId(
        lookup: { rowIndexById: Map<string, number> },
        rowId: string
    ): number | undefined {
        const direct = lookup.rowIndexById.get(rowId);
        if (direct !== undefined) return direct;
        const vMatch = /-vrow-(\d+)$/.exec(rowId);
        if (vMatch) {
            const n = parseInt(vMatch[1], 10);
            if (n >= 1 && n <= EXCEL_MAX_ROWS) return n;
        }
        return undefined;
    }

    private resolveColIndexFromId(
        lookup: { colIndexById: Map<string, number> },
        colId: string
    ): number | undefined {
        const direct = lookup.colIndexById.get(colId);
        if (direct !== undefined) return direct;
        const vMatch = /-vcol-(\d+)$/.exec(colId);
        if (vMatch) {
            const n = parseInt(vMatch[1], 10);
            if (n >= 1 && n <= EXCEL_MAX_COLS) return n;
        }
        return undefined;
    }

    private mintUniqueRowId(sheetId: string, existingIds: Set<string>, preferredNumber: number): string {
        const direct = `${sheetId}-row-${preferredNumber}`;
        if (!existingIds.has(direct)) {
            existingIds.add(direct);
            return direct;
        }
        let candidate = `${sheetId}-row-${generateSpreadsheetUuid()}`;
        while (existingIds.has(candidate)) {
            candidate = `${sheetId}-row-${generateSpreadsheetUuid()}`;
        }
        existingIds.add(candidate);
        return candidate;
    }

    private mintUniqueColumnId(sheetId: string, existingIds: Set<string>, preferredIndex: number): string {
        const direct = `${sheetId}-col-${ColumnIndexToLetter(preferredIndex)}`;
        if (!existingIds.has(direct)) {
            existingIds.add(direct);
            return direct;
        }
        let candidate = `${sheetId}-col-${generateSpreadsheetUuid()}`;
        while (existingIds.has(candidate)) {
            candidate = `${sheetId}-col-${generateSpreadsheetUuid()}`;
        }
        existingIds.add(candidate);
        return candidate;
    }

    /**
     * Computes a deterministic FNV-1a revision hash over the workbook for optimistic concurrency checks.
     */
    public ComputeRevisionHash(workbook: WorkbookSpec): string {
        const canonical = JSON.stringify({
            WorkbookID: workbook.WorkbookID,
            Title: workbook.Title,
            Worksheets: workbook.Worksheets.map((ws) => ({
                SheetID: ws.SheetID,
                Name: ws.Name,
                Rows: ws.Rows.map((r) => r.RowID),
                Columns: ws.Columns.map((c) => c.ColumnID),
                Cells: Object.keys(ws.Cells)
                    .sort()
                    .map((k) => ({
                        k,
                        r: ws.Cells[k].RawValue,
                        f: ws.Cells[k].Formula ?? null,
                        fs: ws.Cells[k].FormulaStable ?? null,
                        v: ws.Cells[k].ComputedValue ?? null
                    })),
                LiveTables: ws.LiveTables.map((t) => ({ id: t.TableID, mode: t.Mode, anchor: t.AnchorCell })),
                Charts: ws.Charts.map((c) => ({ id: c.ChartID, range: c.SourceRange, type: c.ChartType }))
            }))
        });
        let hash = 0x811c9dc5;
        for (let i = 0; i < canonical.length; i++) {
            hash ^= canonical.charCodeAt(i);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return `wb-rev-${hash.toString(16).padStart(8, '0')}`;
    }

    /**
     * Validates workbook-wide structural limits across JSON, room hydration, and `.xlsx` payloads (`R7-1`, `S7-2`, `S7-3`).
     */
    public AssertWorkbookWithinLimits(raw: Partial<WorkbookSpec>): void {
        const sheets = Array.isArray(raw.Worksheets) ? raw.Worksheets : [];
        if (sheets.length > MAX_IMPORT_SHEETS) {
            throw new Error(
                `Spreadsheet rejected: workbook exceeds maximum sheet limit (${MAX_IMPORT_SHEETS}).`
            );
        }

        let totalCells = 0;
        let totalDenseRows = 0;
        let totalDenseCols = 0;
        let totalFormulas = 0;
        let totalFormulaBytes = 0;
        let totalArrayAnchors = 0;
        let totalMerges = 0;
        let totalCharts = 0;
        let totalCondFormats = 0;
        let totalLiveTables = 0;
        let totalEmbedded = 0;

        for (const ws of sheets) {
            if (!ws || typeof ws !== 'object') {
                continue;
            }
            const validationRules = Array.isArray(ws.ValidationRules) ? ws.ValidationRules : [];
            if (validationRules.length > MAX_VALIDATION_RULES_PER_SHEET) {
                throw new Error(
                    `Spreadsheet rejected: worksheet exceeds maximum validation rule limit (${MAX_VALIDATION_RULES_PER_SHEET}).`
                );
            }

            totalDenseRows += Array.isArray(ws.Rows) ? ws.Rows.length : 0;
            if (totalDenseRows > MAX_IMPORT_WORKBOOK_CELLS) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum dense row limit (${MAX_IMPORT_WORKBOOK_CELLS}).`
                );
            }
            totalDenseCols += Array.isArray(ws.Columns) ? ws.Columns.length : 0;
            if (totalDenseCols > MAX_IMPORT_WORKBOOK_COL_TAGS) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum dense column limit (${MAX_IMPORT_WORKBOOK_COL_TAGS}).`
                );
            }

            totalMerges += Array.isArray(ws.MergeRanges) ? ws.MergeRanges.length : 0;
            if (totalMerges > MAX_IMPORT_WORKBOOK_MERGE_RANGES) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum merge range limit (${MAX_IMPORT_WORKBOOK_MERGE_RANGES}).`
                );
            }
            totalCharts += Array.isArray(ws.Charts) ? ws.Charts.length : 0;
            if (totalCharts > MAX_IMPORT_WORKBOOK_CHARTS) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum chart limit (${MAX_IMPORT_WORKBOOK_CHARTS}).`
                );
            }
            totalCondFormats += Array.isArray(ws.ConditionalFormats) ? ws.ConditionalFormats.length : 0;
            if (totalCondFormats > MAX_IMPORT_WORKBOOK_CONDITIONAL_FORMATS) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum conditional format limit (${MAX_IMPORT_WORKBOOK_CONDITIONAL_FORMATS}).`
                );
            }
            totalLiveTables += Array.isArray(ws.LiveTables) ? ws.LiveTables.length : 0;
            if (totalLiveTables > MAX_IMPORT_WORKBOOK_LIVE_TABLES) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum live table limit (${MAX_IMPORT_WORKBOOK_LIVE_TABLES}).`
                );
            }
            totalEmbedded += Array.isArray(ws.EmbeddedArtifacts) ? ws.EmbeddedArtifacts.length : 0;
            if (totalEmbedded > MAX_IMPORT_WORKBOOK_EMBEDDED_ARTIFACTS) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum embedded artifact limit (${MAX_IMPORT_WORKBOOK_EMBEDDED_ARTIFACTS}).`
                );
            }

            const rawCells = ws.Cells && typeof ws.Cells === 'object' ? ws.Cells : {};
            const cellKeys = Object.keys(rawCells);
            totalCells += cellKeys.length;
            if (totalCells > MAX_IMPORT_WORKBOOK_CELLS) {
                throw new Error(
                    `Spreadsheet rejected: workbook exceeds maximum cell limit (${MAX_IMPORT_WORKBOOK_CELLS}).`
                );
            }

            const anchorRects: ArrayAnchorRect[] = [];
            for (const key of cellKeys) {
                const cell = rawCells[key];
                if (!cell) continue;
                const formula = typeof cell.Formula === 'string' ? cell.Formula : '';
                if (formula.length > 0) {
                    if (formula.length > MAX_FORMULA_LENGTH) {
                        throw new Error(
                            `Spreadsheet rejected: formula exceeds maximum length (${MAX_FORMULA_LENGTH} chars).`
                        );
                    }
                    totalFormulas++;
                    if (totalFormulas > MAX_IMPORT_WORKBOOK_FORMULAS) {
                        throw new Error(
                            `Spreadsheet rejected: workbook exceeds maximum formula count (${MAX_IMPORT_WORKBOOK_FORMULAS}).`
                        );
                    }
                    totalFormulaBytes += formula.length;
                    if (totalFormulaBytes > MAX_IMPORTED_FORMULA_BYTES) {
                        throw new Error(
                            `Spreadsheet rejected: workbook exceeds maximum formula bytes (${MAX_IMPORTED_FORMULA_BYTES} bytes).`
                        );
                    }
                }
                if (typeof cell.SpillRange === 'string' && cell.SpillRange.trim().length > 0) {
                    const anchorAddr = cell.Address || key;
                    const anchorPos = parseCellCoordsFast(anchorAddr) ?? ParseCellAddress(anchorAddr);
                    const bounds = ParseRangeAddress(cell.SpillRange, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                    if (bounds) {
                        if (++totalArrayAnchors > MAX_IMPORT_WORKBOOK_ARRAY_ANCHORS) {
                            throw new Error(
                                `Spreadsheet rejected: workbook exceeds maximum array formula anchor limit (${MAX_IMPORT_WORKBOOK_ARRAY_ANCHORS}).`
                            );
                        }
                        if (anchorPos && (anchorPos.row !== bounds.startRow || anchorPos.col !== bounds.startCol)) {
                            throw new Error(
                                `Spreadsheet rejected: array formula anchor '${anchorAddr}' must match top-left of range '${cell.SpillRange}'.`
                            );
                        }
                        anchorRects.push({
                            anchorAddr,
                            startRow: bounds.startRow,
                            endRow: bounds.endRow,
                            startCol: bounds.startCol,
                            endCol: bounds.endCol
                        });
                    }
                }
            }
            if (anchorRects.length > 1) {
                assertNoOverlappingArrayAnchors(anchorRects);
            }
        }
    }

    /**
     * Ensures a partial or deserialized workbook has valid `Rows`, `Columns`, `Cells`, and stable IDs.
     */
    public NormalizeWorkbook(raw: Partial<WorkbookSpec>): WorkbookSpec {
        this.AssertWorkbookWithinLimits(raw);
        const now = new Date().toISOString();
        const rawSheets = Array.isArray(raw.Worksheets) && raw.Worksheets.length > 0
            ? raw.Worksheets
            : [this.CreateEmptyWorksheet('sheet-1', 'Sheet 1')];

        const worksheets: WorksheetSpec[] = rawSheets.map((ws, idx) =>
            this.NormalizeWorksheet(ws, `sheet-${idx + 1}`, `Sheet ${idx + 1}`)
        );
        const activeId = worksheets.some((w) => w.SheetID === raw.ActiveSheetID)
            ? (raw.ActiveSheetID as string)
            : worksheets[0].SheetID;

        const wb: WorkbookSpec = {
            WorkbookID: raw.WorkbookID || `wb-${Date.now().toString(36)}`,
            Title: raw.Title || 'Untitled Workbook',
            ActiveSheetID: activeId,
            Worksheets: worksheets,
            NamedRanges: Array.isArray(raw.NamedRanges) ? raw.NamedRanges : [],
            ...(typeof raw.PreferredObjectsPaneHeightPx === 'number' &&
            Number.isFinite(raw.PreferredObjectsPaneHeightPx) &&
            raw.PreferredObjectsPaneHeightPx > 0
                ? { PreferredObjectsPaneHeightPx: Math.round(raw.PreferredObjectsPaneHeightPx) }
                : {}),
            CreatedAt: raw.CreatedAt || now,
            UpdatedAt: raw.UpdatedAt || now
        };
        this.bindSheetsToWorkbook(wb);

        // Second pass now that all sheets in `wb` are bound: compile/resolve any cross-sheet `@SHEET_*` references
        for (const ws of wb.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (cell.FormulaStable && cell.FormulaStable.includes('@SHEET_')) {
                    cell.Formula = this.ResolveFormulaFromStableIds(ws, cell.FormulaStable, wb);
                } else if (cell.Formula && cell.Formula.includes('!')) {
                    cell.FormulaStable = this.CompileFormulaToStableIds(ws, cell.Formula, wb);
                    this.syncCellVirtualAxisIndex(ws, cell);
                }
            }
        }
        return wb;
    }

    /**
     * Normalizes a single worksheet, ensuring `Rows` and `Columns` cover all populated cell coordinates,
     * guaranteeing monotonic unique `RowID`s and `ColumnID`s, and ensuring every formula has both
     * `Formula` and `FormulaStable`.
     */
    public NormalizeWorksheet(
        raw: Partial<WorksheetSpec>,
        fallbackId = 'sheet-1',
        fallbackName = 'Sheet 1'
    ): WorksheetSpec {
        const sheetId = raw.SheetID || fallbackId;
        let maxRow = Math.max(
            DEFAULT_ROW_COUNT,
            Math.min(EXCEL_MAX_ROWS, Array.isArray(raw.Rows) ? raw.Rows.length : 0)
        );
        let maxCol = Math.max(
            DEFAULT_COLUMN_COUNT,
            Math.min(EXCEL_MAX_COLS, Array.isArray(raw.Columns) ? raw.Columns.length : 0)
        );

        const rawCells = raw.Cells ?? {};
        for (const addr of Object.keys(rawCells)) {
            const parsed = parseCellCoordsFast(addr);
            if (parsed) {
                if (parsed.row > maxRow && parsed.row <= MAX_DENSE_ROWS) maxRow = parsed.row;
                if (parsed.col > maxCol && parsed.col <= MAX_DENSE_COLS) maxCol = parsed.col;
            }
        }

        const existingRows = Array.isArray(raw.Rows) ? raw.Rows : [];
        const usedRowIds = new Set<string>();
        const rows: SpreadsheetRowSpec[] = [];
        for (let r = 1; r <= maxRow; r++) {
            const existing = existingRows[r - 1];
            const candidateId =
                existing?.RowID && !usedRowIds.has(existing.RowID)
                    ? (usedRowIds.add(existing.RowID), existing.RowID)
                    : this.mintUniqueRowId(sheetId, usedRowIds, r);
            rows.push({
                RowID: candidateId,
                Index: r,
                Height: existing?.Height ?? DEFAULT_ROW_HEIGHT,
                Hidden: existing?.Hidden ?? false
            });
        }

        const existingCols = Array.isArray(raw.Columns) ? raw.Columns : [];
        const usedColIds = new Set<string>();
        const columns: SpreadsheetColumnSpec[] = [];
        for (let c = 1; c <= maxCol; c++) {
            const existing = existingCols[c - 1];
            const letter = ColumnIndexToLetter(c);
            const candidateId =
                existing?.ColumnID && !usedColIds.has(existing.ColumnID)
                    ? (usedColIds.add(existing.ColumnID), existing.ColumnID)
                    : this.mintUniqueColumnId(sheetId, usedColIds, c);
            columns.push({
                ColumnID: candidateId,
                Index: c,
                Letter: letter,
                Header: existing?.Header,
                Width: existing?.Width ?? DEFAULT_COLUMN_WIDTH,
                Hidden: existing?.Hidden ?? false
            });
        }

        const sheet: WorksheetSpec = {
            SheetID: sheetId,
            Name: (raw.Name || fallbackName).slice(0, 31),
            Rows: rows,
            Columns: columns,
            Cells: {},
            FrozenRows: typeof raw.FrozenRows === 'number' ? raw.FrozenRows : 1,
            FrozenColumns: typeof raw.FrozenColumns === 'number' ? raw.FrozenColumns : 0,
            SortSpec: raw.SortSpec ?? null,
            FilterSpecs: Array.isArray(raw.FilterSpecs) ? raw.FilterSpecs : [],
            ValidationRules: Array.isArray(raw.ValidationRules) ? raw.ValidationRules : [],
            ConditionalFormats: Array.isArray(raw.ConditionalFormats) ? raw.ConditionalFormats : [],
            LiveTables: Array.isArray(raw.LiveTables) ? raw.LiveTables : [],
            Charts: Array.isArray(raw.Charts) ? raw.Charts : [],
            EmbeddedArtifacts: Array.isArray(raw.EmbeddedArtifacts) ? raw.EmbeddedArtifacts : [],
            ProtectedRanges: Array.isArray(raw.ProtectedRanges)
                ? raw.ProtectedRanges.map((p) => ({ ...p }))
                : []
        };
        if (Array.isArray(raw.ClearedSpillChildren)) {
            for (const addr of raw.ClearedSpillChildren) {
                if (typeof addr === 'string') {
                    addClearedSpillAddr(sheet, addr);
                }
            }
        }
        this.indexedSheets.add(sheet);

        const rowIndexById = new Map<string, number>();
        for (const r of sheet.Rows) rowIndexById.set(r.RowID, r.Index);
        const colIndexById = new Map<string, number>();
        for (const c of sheet.Columns) colIndexById.set(c.ColumnID, c.Index);

        const lookupObj = { rowIndexById, colIndexById };
        for (const [key, cell] of Object.entries(rawCells)) {
            if (!cell) continue;
            // Determine canonical position from RowID/ColumnID if valid, else from Address/key
            let rowIdx = cell.RowID ? this.resolveRowIndexFromId(lookupObj, cell.RowID) : undefined;
            let colIdx = cell.ColumnID ? this.resolveColIndexFromId(lookupObj, cell.ColumnID) : undefined;
            if (!rowIdx || !colIdx) {
                const parsed = ParseCellAddress(cell.Address || key);
                if (!parsed) continue;
                rowIdx = parsed.row;
                colIdx = parsed.col;
            }
            this.ensureSheetCapacity(sheet, rowIdx, colIdx);
            const rowId = this.getStableRowIdForIndex(sheet, rowIdx);
            const colId = this.getStableColIdForIndex(sheet, colIdx);
            const canonicalAddr = FormatCellAddress(rowIdx, colIdx);

            let formula = cell.Formula ?? null;
            let formulaStable = cell.FormulaStable ?? null;
            if (formulaStable) {
                if (formulaStable.includes('-vrow-') || formulaStable.includes('-vcol-')) {
                    this.markSheetHasVirtualAxisIds(sheet);
                }
                formula = this.ResolveFormulaFromStableIds(sheet, formulaStable);
            } else if (formula) {
                formulaStable = this.CompileFormulaToStableIds(sheet, formula);
            }

            if (rowId.includes('-vrow-') || colId.includes('-vcol-')) {
                this.markSheetHasVirtualAxisIds(sheet);
            }

            const prevAtCanonical = sheet.Cells[canonicalAddr];
            if (prevAtCanonical) {
                this.removeCellFromVirtualAxisIndex(sheet, prevAtCanonical);
            }
            let sanitizedSpillRange: string | undefined;
            if (typeof cell.SpillRange === 'string' && formula) {
                const spillBounds = ParseRangeAddress(cell.SpillRange, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                if (spillBounds) {
                    const spillArea =
                        (spillBounds.endRow - spillBounds.startRow + 1) *
                        (spillBounds.endCol - spillBounds.startCol + 1);
                    if (spillArea > 0 && spillArea <= MAX_DYNAMIC_ARRAY_CELLS) {
                        sanitizedSpillRange = cell.SpillRange;
                    }
                }
            }
            const normalizedCell: SpreadsheetCellSpec = {
                ...cell,
                RowID: rowId,
                ColumnID: colId,
                Address: canonicalAddr,
                RawValue: cell.RawValue ?? null,
                Formula: formula,
                FormulaStable: formulaStable,
                SpillRange: sanitizedSpillRange
            };
            copyCellXmlMeta(cell, normalizedCell);
            const xmlMetaMap = getCellXmlMetaMap();
            if (!xmlMetaMap.has(normalizedCell) && normalizedCell.SpillRange) {
                xmlMetaMap.set(normalizedCell, {
                    fType: 'array',
                    fRef: normalizedCell.SpillRange,
                    formulaDirty: false
                });
            }
            sheet.Cells[canonicalAddr] = normalizedCell;
            this.syncCellVirtualAxisIndex(sheet, normalizedCell);
        }

        return sheet;
    }

    // -----------------------------------------------------------------------
    // Stable Row & Column ID Formula Translation (§ 6.2 & Accept #1)
    // -----------------------------------------------------------------------

    /**
     * Shifts relative A1 cell and range references inside `formula` by `(rowDelta, colDelta)`
     * using the formula tokenizer so string literals, sheet prefixes, and function names (e.g. `LOG10`)
     * are never corrupted, and `$`-anchored coordinates stay fixed.
     */
    public ShiftFormulaReferences(formula: string, rowDelta: number, colDelta: number): string {
        if (!formula || (rowDelta === 0 && colDelta === 0)) {
            return formula;
        }
        const eqIdx = formula.indexOf('=');
        if (eqIdx === -1 || formula.slice(0, eqIdx).trim() !== '') {
            return formula;
        }
        const shiftedBody = shiftFormulaBodyReferences(formula.slice(eqIdx + 1), rowDelta, colDelta);
        return `${formula.slice(0, eqIdx + 1)}${shiftedBody}`;
    }

    /**
     * Translates an A1 formula (e.g. `'=SUM(B2:B9) + $C$2'`) into a stable-ID formula
     * (`'=SUM(@RANGE(sheet-1-row-2,sheet-1-col-B,sheet-1-row-9,sheet-1-col-B)) + @CELL($sheet-1-row-2,$sheet-1-col-C)'`
     * and cross-sheet `'@SHEET_CELL(sheetId,r,c)'` / `'@SHEET_RANGE(sheetId,r1,c1,r2,c2)'`)
     * so concurrent row/column insertions and deletions preserve exact logical references (`§ 6.2`, `Accept #1`, `D3`).
     */
    public CompileFormulaToStableIds(sheet: WorksheetSpec, formula: string, workbook?: WorkbookSpec): string {
        if (!formula || !formula.trim().startsWith('=')) {
            return formula;
        }
        const activeWorkbook = workbook ?? this.sheetToWorkbook.get(sheet);

        // 1. Protect Excel double-quoted string literals (handling doubled "" inside strings)
        const literals: string[] = [];
        let masked = formula.replace(/"(?:""|[^"])*"/g, (match) => {
            literals.push(match);
            return `__STR_LIT_${literals.length - 1}__`;
        });

        const stableTokens: string[] = [];
        const emitStableToken = (tok: string): string => {
            stableTokens.push(tok);
            return `__STABLE_TOK_${stableTokens.length - 1}__`;
        };

        // 2a. Translate or mask cross-sheet A1 cell and rectangular range references ('FY24 Q1'!B2, Two!A1:C5)
        const sheetQuotes: string[] = [];
        masked = masked.replace(
            /(?:'((?:''|[^'])*)'|([A-Za-z_][A-Za-z0-9_.]*))!(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?::(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*))?/g,
            (
                full,
                quotedSheet: string | undefined,
                plainSheet: string | undefined,
                absC1: string,
                col1: string,
                absR1: string,
                row1: string,
                absC2: string | undefined,
                col2: string | undefined,
                absR2: string | undefined,
                row2: string | undefined
            ) => {
                const rawSheetName = quotedSheet !== undefined ? quotedSheet.replace(/''/g, () => "'") : (plainSheet ?? '');
                const targetSheet = activeWorkbook ? this.GetWorksheet(activeWorkbook, rawSheetName) : undefined;
                if (!targetSheet) {
                    // Mask unknown/unattached cross-sheet token so local regexes never corrupt 'FY24 Q1'!B2
                    sheetQuotes.push(full);
                    return `__XSHEET_LIT_${sheetQuotes.length - 1}__`;
                }
                const r1 = parseInt(row1, 10);
                const c1 = ColumnLetterToIndex(col1);
                if (col2 && row2) {
                    const r2 = parseInt(row2, 10);
                    const c2 = ColumnLetterToIndex(col2);
                    const rId1 = `${absR1 ? '$' : ''}${this.getStableRowIdForIndex(targetSheet, r1)}`;
                    const cId1 = `${absC1 ? '$' : ''}${this.getStableColIdForIndex(targetSheet, c1)}`;
                    const rId2 = `${absR2 ? '$' : ''}${this.getStableRowIdForIndex(targetSheet, r2)}`;
                    const cId2 = `${absC2 ? '$' : ''}${this.getStableColIdForIndex(targetSheet, c2)}`;
                    return emitStableToken(`@SHEET_RANGE(${targetSheet.SheetID},${rId1},${cId1},${rId2},${cId2})`);
                }
                const rId = `${absR1 ? '$' : ''}${this.getStableRowIdForIndex(targetSheet, r1)}`;
                const cId = `${absC1 ? '$' : ''}${this.getStableColIdForIndex(targetSheet, c1)}`;
                return emitStableToken(`@SHEET_CELL(${targetSheet.SheetID},${rId},${cId})`);
            }
        );

        // 2b. Translate or mask cross-sheet whole-column references (Two!A:A, 'Sheet Two'!$B:$D)
        masked = masked.replace(
            /(?:'((?:''|[^'])*)'|([A-Za-z_][A-Za-z0-9_.]*))!(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![0-9A-Za-z_])/g,
            (
                full,
                quotedSheet: string | undefined,
                plainSheet: string | undefined,
                absC1: string,
                col1: string,
                absC2: string,
                col2: string
            ) => {
                const rawSheetName = quotedSheet !== undefined ? quotedSheet.replace(/''/g, () => "'") : (plainSheet ?? '');
                const targetSheet = activeWorkbook ? this.GetWorksheet(activeWorkbook, rawSheetName) : undefined;
                const c1 = ColumnLetterToIndex(col1);
                const c2 = ColumnLetterToIndex(col2);
                if (!targetSheet || c1 > 16384 || c2 > 16384) {
                    sheetQuotes.push(full);
                    return `__XSHEET_LIT_${sheetQuotes.length - 1}__`;
                }
                const cId1 = `${absC1 ? '$' : ''}${this.getStableColIdForIndex(targetSheet, c1)}`;
                const cId2 = `${absC2 ? '$' : ''}${this.getStableColIdForIndex(targetSheet, c2)}`;
                return emitStableToken(`@SHEET_COLS(${targetSheet.SheetID},${cId1},${cId2})`);
            }
        );

        // 2c. Translate or mask cross-sheet whole-row references (Two!3:3, 'Sheet Two'!$1:$5)
        masked = masked.replace(
            /(?:'((?:''|[^'])*)'|([A-Za-z_][A-Za-z0-9_.]*))!(\$?)([1-9][0-9]*):(\$?)([1-9][0-9]*)(?![0-9A-Za-z_.])/g,
            (
                full,
                quotedSheet: string | undefined,
                plainSheet: string | undefined,
                absR1: string,
                row1: string,
                absR2: string,
                row2: string
            ) => {
                const rawSheetName = quotedSheet !== undefined ? quotedSheet.replace(/''/g, () => "'") : (plainSheet ?? '');
                const targetSheet = activeWorkbook ? this.GetWorksheet(activeWorkbook, rawSheetName) : undefined;
                if (!targetSheet) {
                    sheetQuotes.push(full);
                    return `__XSHEET_LIT_${sheetQuotes.length - 1}__`;
                }
                const r1 = parseInt(row1, 10);
                const r2 = parseInt(row2, 10);
                const rId1 = `${absR1 ? '$' : ''}${this.getStableRowIdForIndex(targetSheet, r1)}`;
                const rId2 = `${absR2 ? '$' : ''}${this.getStableRowIdForIndex(targetSheet, r2)}`;
                return emitStableToken(`@SHEET_ROWS(${targetSheet.SheetID},${rId1},${rId2})`);
            }
        );

        // Also mask any remaining single-quoted segments so tokens like Q1 inside 'FY24 Q1' are never touched
        masked = masked.replace(/'(?:''|[^'])*'/g, (match) => {
            sheetQuotes.push(match);
            return `__XSHEET_LIT_${sheetQuotes.length - 1}__`;
        });

        // 3a. Replace local A1 rectangular ranges (not preceded by '!' or '@')
        let withLocalRanges = masked.replace(
            /(?<![!@A-Za-z0-9_])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*):(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)/g,
            (
                _full,
                absC1: string,
                col1: string,
                absR1: string,
                row1: string,
                absC2: string,
                col2: string,
                absR2: string,
                row2: string
            ) => {
                const r1 = parseInt(row1, 10);
                const c1 = ColumnLetterToIndex(col1);
                const r2 = parseInt(row2, 10);
                const c2 = ColumnLetterToIndex(col2);
                const rId1 = `${absR1 ? '$' : ''}${this.getStableRowIdForIndex(sheet, r1)}`;
                const cId1 = `${absC1 ? '$' : ''}${this.getStableColIdForIndex(sheet, c1)}`;
                const rId2 = `${absR2 ? '$' : ''}${this.getStableRowIdForIndex(sheet, r2)}`;
                const cId2 = `${absC2 ? '$' : ''}${this.getStableColIdForIndex(sheet, c2)}`;
                return emitStableToken(`@RANGE(${rId1},${cId1},${rId2},${cId2})`);
            }
        );

        // 3b. Replace local whole-column ranges (A:A, $B:$C)
        withLocalRanges = withLocalRanges.replace(
            /(?<![!@A-Za-z0-9_.$])(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![0-9A-Za-z_])/g,
            (full, absC1: string, col1: string, absC2: string, col2: string) => {
                const c1 = ColumnLetterToIndex(col1);
                const c2 = ColumnLetterToIndex(col2);
                if (c1 > 16384 || c2 > 16384) return full;
                const cId1 = `${absC1 ? '$' : ''}${this.getStableColIdForIndex(sheet, c1)}`;
                const cId2 = `${absC2 ? '$' : ''}${this.getStableColIdForIndex(sheet, c2)}`;
                return emitStableToken(`@COLS(${cId1},${cId2})`);
            }
        );

        // 3c. Replace local whole-row ranges (3:3, $1:$5)
        withLocalRanges = withLocalRanges.replace(
            /(?<![!@A-Za-z0-9_.$])(\$?)([1-9][0-9]*):(\$?)([1-9][0-9]*)(?![0-9A-Za-z_.])/g,
            (_full, absR1: string, row1: string, absR2: string, row2: string) => {
                const r1 = parseInt(row1, 10);
                const r2 = parseInt(row2, 10);
                const rId1 = `${absR1 ? '$' : ''}${this.getStableRowIdForIndex(sheet, r1)}`;
                const rId2 = `${absR2 ? '$' : ''}${this.getStableRowIdForIndex(sheet, r2)}`;
                return emitStableToken(`@ROWS(${rId1},${rId2})`);
            }
        );

        // 4. Replace standalone local A1 cell references (not followed by '(' function call or preceded by '!' or '@' or '.')
        const withCells = withLocalRanges.replace(
            /(?<![!@.A-Za-z0-9_])(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]*)(?![A-Za-z0-9_.(\[])/g,
            (_full, absC: string, col: string, absR: string, row: string) => {
                const r = parseInt(row, 10);
                const c = ColumnLetterToIndex(col);
                const rId = `${absR ? '$' : ''}${this.getStableRowIdForIndex(sheet, r)}`;
                const cId = `${absC ? '$' : ''}${this.getStableColIdForIndex(sheet, c)}`;
                return emitStableToken(`@CELL(${rId},${cId})`);
            }
        );

        const unmaskedStable = withCells.replace(
            /__STABLE_TOK_(\d+)__/g,
            (_m, idxStr: string) => stableTokens[parseInt(idxStr, 10)] ?? ''
        );
        const unmaskedSheets = unmaskedStable.replace(
            /__XSHEET_LIT_(\d+)__/g,
            (_m, idxStr: string) => sheetQuotes[parseInt(idxStr, 10)] ?? ''
        );
        return unmaskedSheets.replace(
            /__STR_LIT_(\d+)__/g,
            (_m, idxStr: string) => literals[parseInt(idxStr, 10)] ?? ''
        );
    }

    /**
     * Resolves a `FormulaStable` string back to human-readable A1 notation using the current
     * positions of each `RowID` and `ColumnID` in `sheet.Rows` / `sheet.Columns` (and cross-sheet
     * `@SHEET_CELL` / `@SHEET_RANGE` / `@SHEET_COLS` / `@SHEET_ROWS` targets when `workbook` is available) (`§ 6.2`, `Accept #1`, `D3`, `E6`).
     */
    public ResolveFormulaFromStableIds(sheet: WorksheetSpec, formulaStable: string, workbook?: WorkbookSpec): string {
        if (
            !formulaStable ||
            (!formulaStable.includes('@CELL(') &&
                !formulaStable.includes('@RANGE(') &&
                !formulaStable.includes('@COLS(') &&
                !formulaStable.includes('@ROWS(') &&
                !formulaStable.includes('@SHEET_CELL(') &&
                !formulaStable.includes('@SHEET_RANGE(') &&
                !formulaStable.includes('@SHEET_COLS(') &&
                !formulaStable.includes('@SHEET_ROWS('))
        ) {
            return formulaStable;
        }
        const activeWorkbook = workbook ?? this.sheetToWorkbook.get(sheet);

        const localLookup = this.getSheetLookup(sheet);
        const crossLookupCache = new Map<string, { ws: WorksheetSpec; rowIndexById: Map<string, number>; colIndexById: Map<string, number> }>();

        const getCrossLookup = (targetSheetId: string) => {
            const existing = crossLookupCache.get(targetSheetId);
            if (existing) return existing;
            const ws = activeWorkbook?.Worksheets.find((w) => w.SheetID === targetSheetId);
            if (!ws) return null;
            const built = { ws, ...this.getSheetLookup(ws) };
            crossLookupCache.set(targetSheetId, built);
            return built;
        };

        const resolveTokenAgainst = (
            lookup: { rowIndexById: Map<string, number>; colIndexById: Map<string, number> },
            rawRowId: string,
            rawColId: string
        ): string => {
            const absR = rawRowId.startsWith('$');
            const absC = rawColId.startsWith('$');
            const rId = absR ? rawRowId.slice(1) : rawRowId;
            const cId = absC ? rawColId.slice(1) : rawColId;
            const rIdx = this.resolveRowIndexFromId(lookup, rId);
            const cIdx = this.resolveColIndexFromId(lookup, cId);
            if (!rIdx || !cIdx) {
                return '#REF!';
            }
            return FormatCellAddress(rIdx, cIdx, absR, absC);
        };

        const resolveColTokenAgainst = (
            lookup: { colIndexById: Map<string, number> },
            rawColId: string
        ): string => {
            const absC = rawColId.startsWith('$');
            const cId = absC ? rawColId.slice(1) : rawColId;
            const cIdx = this.resolveColIndexFromId(lookup, cId);
            if (!cIdx) return '#REF!';
            return `${absC ? '$' : ''}${ColumnIndexToLetter(cIdx)}`;
        };

        const resolveRowTokenAgainst = (
            lookup: { rowIndexById: Map<string, number> },
            rawRowId: string
        ): string => {
            const absR = rawRowId.startsWith('$');
            const rId = absR ? rawRowId.slice(1) : rawRowId;
            const rIdx = this.resolveRowIndexFromId(lookup, rId);
            if (!rIdx) return '#REF!';
            return `${absR ? '$' : ''}${rIdx}`;
        };

        const replaceFormulaMacro = (
            input: string,
            prefix: string,
            expectedArgs: number,
            formatter: (args: string[]) => string
        ): string => {
            let out = '';
            let cursor = 0;
            while (cursor < input.length) {
                const start = input.indexOf(prefix, cursor);
                if (start === -1) {
                    out += input.slice(cursor);
                    break;
                }
                const argStart = start + prefix.length;
                const end = input.indexOf(')', argStart);
                if (end === -1) {
                    out += input.slice(cursor);
                    break;
                }
                const args = input.slice(argStart, end).split(',');
                if (args.length !== expectedArgs || args.some((a) => a.length === 0)) {
                    out += input.slice(cursor, argStart);
                    cursor = argStart;
                    continue;
                }
                out += input.slice(cursor, start) + formatter(args);
                cursor = end + 1;
            }
            return out;
        };

        let resolved = replaceFormulaMacro(formulaStable, '@SHEET_RANGE(', 5, (args) => {
            const [sId, r1, c1, r2, c2] = args;
            const cross = getCrossLookup(sId.trim());
            if (!cross) return '#REF!';
            const start = resolveTokenAgainst(cross, r1.trim(), c1.trim());
            const end = resolveTokenAgainst(cross, r2.trim(), c2.trim());
            if (start === '#REF!' || end === '#REF!') {
                return '#REF!';
            }
            return `${formatSheetQualifier(cross.ws.Name)}${start}:${end}`;
        });

        resolved = replaceFormulaMacro(resolved, '@SHEET_COLS(', 3, (args) => {
            const [sId, c1, c2] = args;
            const cross = getCrossLookup(sId.trim());
            if (!cross) return '#REF!';
            const startC = resolveColTokenAgainst(cross, c1.trim());
            const endC = resolveColTokenAgainst(cross, c2.trim());
            if (startC === '#REF!' || endC === '#REF!') return '#REF!';
            return `${formatSheetQualifier(cross.ws.Name)}${startC}:${endC}`;
        });

        resolved = replaceFormulaMacro(resolved, '@SHEET_ROWS(', 3, (args) => {
            const [sId, r1, r2] = args;
            const cross = getCrossLookup(sId.trim());
            if (!cross) return '#REF!';
            const startR = resolveRowTokenAgainst(cross, r1.trim());
            const endR = resolveRowTokenAgainst(cross, r2.trim());
            if (startR === '#REF!' || endR === '#REF!') return '#REF!';
            return `${formatSheetQualifier(cross.ws.Name)}${startR}:${endR}`;
        });

        resolved = replaceFormulaMacro(resolved, '@SHEET_CELL(', 3, (args) => {
            const [sId, r, c] = args;
            const cross = getCrossLookup(sId.trim());
            if (!cross) return '#REF!';
            const addr = resolveTokenAgainst(cross, r.trim(), c.trim());
            if (addr === '#REF!') return '#REF!';
            return `${formatSheetQualifier(cross.ws.Name)}${addr}`;
        });

        resolved = replaceFormulaMacro(resolved, '@RANGE(', 4, (args) => {
            const [r1, c1, r2, c2] = args;
            const start = resolveTokenAgainst(localLookup, r1.trim(), c1.trim());
            const end = resolveTokenAgainst(localLookup, r2.trim(), c2.trim());
            if (start === '#REF!' || end === '#REF!') {
                return '#REF!';
            }
            return `${start}:${end}`;
        });

        resolved = replaceFormulaMacro(resolved, '@COLS(', 2, (args) => {
            const [c1, c2] = args;
            const startC = resolveColTokenAgainst(localLookup, c1.trim());
            const endC = resolveColTokenAgainst(localLookup, c2.trim());
            if (startC === '#REF!' || endC === '#REF!') return '#REF!';
            return `${startC}:${endC}`;
        });

        resolved = replaceFormulaMacro(resolved, '@ROWS(', 2, (args) => {
            const [r1, r2] = args;
            const startR = resolveRowTokenAgainst(localLookup, r1.trim());
            const endR = resolveRowTokenAgainst(localLookup, r2.trim());
            if (startR === '#REF!' || endR === '#REF!') return '#REF!';
            return `${startR}:${endR}`;
        });

        const out = replaceFormulaMacro(resolved, '@CELL(', 2, (args) => {
            const [r, c] = args;
            return resolveTokenAgainst(localLookup, r.trim(), c.trim());
        });
        return out.trim().startsWith('=') ? out : `=${out.trim()}`;
    }

    private assertProtectedRangesAllowStructuralEdit(
        sheet: WorksheetSpec,
        editBounds: { startRow: number; endRow: number; startCol: number; endCol: number },
        actionLabel: string,
        editContext?: SpreadsheetCellEditContext
    ): void {
        if (!editContext || editContext.BypassProtection) {
            return;
        }
        const rules = sheet.ProtectedRanges;
        if (!Array.isArray(rules) || rules.length === 0) {
            return;
        }
        for (const rule of rules) {
            const rb = ParseRangeAddress(rule.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (!rb) continue;
            const overlaps =
                rb.startRow <= editBounds.endRow &&
                rb.endRow >= editBounds.startRow &&
                rb.startCol <= editBounds.endCol &&
                rb.endCol >= editBounds.startCol;
            if (overlaps && !this.isActorAllowedForProtectedRule(rule, editContext)) {
                throw new Error(
                    `Cannot ${actionLabel}: intersects protected range '${rule.Range}' (locked by ${rule.LockedByUserID}).`
                );
            }
        }
    }

    /**
     * Inserts `count` new rows at 1-based `atRowNumber` in `sheetId`, assigning fresh monotonic `RowID`s,
     * shifting affected cells and non-cell range metadata down, and resolving all `FormulaStable` references (`§ 6.2`, `Accept #1`, `D3`).
     */
    public InsertRows(
        workbook: WorkbookSpec,
        sheetId: string,
        atRowNumber: number,
        count = 1,
        editContext?: SpreadsheetCellEditContext
    ): SpreadsheetRowSpec[] {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetId}' not found.`);
        }
        const requestedRow1 = Math.max(1, Math.min(EXCEL_MAX_ROWS, Math.floor(atRowNumber)));
        this.assertProtectedRangesAllowStructuralEdit(
            sheet,
            { startRow: requestedRow1, endRow: EXCEL_MAX_ROWS, startCol: 1, endCol: EXCEL_MAX_COLS },
            `insert rows at ${requestedRow1}`,
            editContext
        );
        this.bindSheetsToWorkbook(workbook);
        this.ensureAllWorkbookFormulasHaveStableIds(workbook);
        const numToInsert = Math.max(1, Math.floor(count));
        if (requestedRow1 - 1 > sheet.Rows.length && requestedRow1 - 1 <= MAX_DENSE_ROWS) {
            this.ensureSheetCapacity(sheet, requestedRow1 - 1, 1);
        }
        const inserted: SpreadsheetRowSpec[] = [];
        if (requestedRow1 <= sheet.Rows.length + 1) {
            const insertIdx = requestedRow1 - 1;
            const existingIds = new Set(sheet.Rows.map((r) => r.RowID));
            for (let i = 0; i < numToInsert; i++) {
                let candidate = `${sheet.SheetID}-row-${generateSpreadsheetUuid()}`;
                while (existingIds.has(candidate)) {
                    candidate = `${sheet.SheetID}-row-${generateSpreadsheetUuid()}`;
                }
                existingIds.add(candidate);
                inserted.push({
                    RowID: candidate,
                    Index: insertIdx + i + 1,
                    Height: DEFAULT_ROW_HEIGHT,
                    Hidden: false
                });
            }
            sheet.Rows.splice(insertIdx, 0, ...inserted);
        }
        this.sheetLookupCache.delete(sheet);
        this.sheetAxisIdSets.delete(sheet);
        this.shiftVirtualAxisIds(workbook, sheet, 'row', 'insert', requestedRow1, numToInsert);
        this.shiftNonCellMetadataForRowEdit(workbook, sheet, 'insert', requestedRow1, numToInsert);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
        return inserted;
    }

    /**
     * Deletes `count` rows starting at 1-based `atRowNumber` in `sheetId`, shrinking `@RANGE` endpoints
     * to surviving rows (or `#REF!` if the entire range was deleted) and updating non-cell range metadata (`D3`, `R6-10`).
     */
    public DeleteRows(
        workbook: WorkbookSpec,
        sheetId: string,
        atRowNumber: number,
        count = 1,
        editContext?: SpreadsheetCellEditContext
    ): void {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet) return;
        const requestedStart1 = Math.max(1, Math.min(EXCEL_MAX_ROWS, Math.floor(atRowNumber)));
        const requestedCount = Math.max(1, Math.min(EXCEL_MAX_ROWS - requestedStart1 + 1, Math.floor(count)));
        this.assertProtectedRangesAllowStructuralEdit(
            sheet,
            { startRow: requestedStart1, endRow: EXCEL_MAX_ROWS, startCol: 1, endCol: EXCEL_MAX_COLS },
            `delete rows ${requestedStart1}..${requestedStart1 + requestedCount - 1}`,
            editContext
        );
        if (sheet.Rows.length <= 1 && requestedStart1 === 1 && requestedCount === 1 && Object.keys(sheet.Cells).length === 0) {
            return;
        }
        this.bindSheetsToWorkbook(workbook);
        this.ensureAllWorkbookFormulasHaveStableIds(workbook);

        // Shrink @RANGE, @ROWS, @SHEET_RANGE, and @SHEET_ROWS endpoints (both dense and virtual) BEFORE splicing rows
        this.shrinkFormulaStableRowEndpointsBeforeDelete(workbook, sheet, requestedStart1, requestedCount);

        if (requestedStart1 <= sheet.Rows.length) {
            const startIdx = requestedStart1 - 1;
            const denseCount = Math.min(requestedCount, sheet.Rows.length - startIdx);
            const removedRowSet = new Set(sheet.Rows.slice(startIdx, startIdx + denseCount).map((r) => r.RowID));
            sheet.Rows.splice(startIdx, denseCount);
            if (sheet.Rows.length === 0) {
                sheet.Rows.push({
                    RowID: `${sheet.SheetID}-row-${generateSpreadsheetUuid()}`,
                    Index: 1,
                    Height: DEFAULT_ROW_HEIGHT,
                    Hidden: false
                });
            }
            for (const [addr, cell] of Object.entries(sheet.Cells)) {
                if (removedRowSet.has(cell.RowID)) {
                    this.removeCellFromVirtualAxisIndex(sheet, cell);
                    delete sheet.Cells[addr];
                }
            }
        }
        this.sheetLookupCache.delete(sheet);
        this.sheetAxisIdSets.delete(sheet);
        this.shiftVirtualAxisIds(workbook, sheet, 'row', 'delete', requestedStart1, requestedCount);
        this.shiftNonCellMetadataForRowEdit(workbook, sheet, 'delete', requestedStart1, requestedCount);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
    }

    /**
     * Inserts `count` new columns at 1-based `atColumnNumber` in `sheetId`, assigning fresh UUID `ColumnID`s,
     * shifting affected cells and non-cell range metadata right, and resolving all `FormulaStable` references (`§ 6.2`, `Accept #1`, `D3`).
     */
    public InsertColumns(
        workbook: WorkbookSpec,
        sheetId: string,
        atColumnNumber: number,
        count = 1,
        editContext?: SpreadsheetCellEditContext
    ): SpreadsheetColumnSpec[] {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetId}' not found.`);
        }
        const requestedCol1 = Math.max(1, Math.min(EXCEL_MAX_COLS, Math.floor(atColumnNumber)));
        this.assertProtectedRangesAllowStructuralEdit(
            sheet,
            { startRow: 1, endRow: EXCEL_MAX_ROWS, startCol: requestedCol1, endCol: EXCEL_MAX_COLS },
            `insert columns at ${requestedCol1}`,
            editContext
        );
        this.bindSheetsToWorkbook(workbook);
        this.ensureAllWorkbookFormulasHaveStableIds(workbook);
        const numToInsert = Math.max(1, Math.floor(count));
        if (requestedCol1 - 1 > sheet.Columns.length && requestedCol1 - 1 <= MAX_DENSE_COLS) {
            this.ensureSheetCapacity(sheet, 1, requestedCol1 - 1);
        }
        const inserted: SpreadsheetColumnSpec[] = [];
        if (requestedCol1 <= sheet.Columns.length + 1) {
            const insertIdx = requestedCol1 - 1;
            const existingIds = new Set(sheet.Columns.map((c) => c.ColumnID));
            for (let i = 0; i < numToInsert; i++) {
                let candidate = `${sheet.SheetID}-col-${generateSpreadsheetUuid()}`;
                while (existingIds.has(candidate)) {
                    candidate = `${sheet.SheetID}-col-${generateSpreadsheetUuid()}`;
                }
                existingIds.add(candidate);
                inserted.push({
                    ColumnID: candidate,
                    Index: insertIdx + i + 1,
                    Letter: ColumnIndexToLetter(insertIdx + i + 1),
                    Width: DEFAULT_COLUMN_WIDTH,
                    Hidden: false
                });
            }
            sheet.Columns.splice(insertIdx, 0, ...inserted);
        }
        this.sheetLookupCache.delete(sheet);
        this.sheetAxisIdSets.delete(sheet);
        this.shiftVirtualAxisIds(workbook, sheet, 'col', 'insert', requestedCol1, numToInsert);
        this.shiftNonCellMetadataForColEdit(workbook, sheet, 'insert', requestedCol1, numToInsert);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
        return inserted;
    }

    /**
     * Deletes `count` columns starting at 1-based `atColumnNumber` in `sheetId`, shrinking `@RANGE` endpoints
     * to surviving columns (or `#REF!` if the entire range was deleted) and updating non-cell range metadata (`D3`, `R6-10`).
     */
    public DeleteColumns(
        workbook: WorkbookSpec,
        sheetId: string,
        atColumnNumber: number,
        count = 1,
        editContext?: SpreadsheetCellEditContext
    ): void {
        const sheet = this.GetWorksheet(workbook, sheetId);
        if (!sheet) return;
        const requestedStart1 = Math.max(1, Math.min(EXCEL_MAX_COLS, Math.floor(atColumnNumber)));
        const requestedCount = Math.max(1, Math.min(EXCEL_MAX_COLS - requestedStart1 + 1, Math.floor(count)));
        this.assertProtectedRangesAllowStructuralEdit(
            sheet,
            { startRow: 1, endRow: EXCEL_MAX_ROWS, startCol: requestedStart1, endCol: EXCEL_MAX_COLS },
            `delete columns ${requestedStart1}..${requestedStart1 + requestedCount - 1}`,
            editContext
        );
        if (sheet.Columns.length <= 1 && requestedStart1 === 1 && requestedCount === 1 && Object.keys(sheet.Cells).length === 0) {
            return;
        }
        this.bindSheetsToWorkbook(workbook);
        this.ensureAllWorkbookFormulasHaveStableIds(workbook);

        // Shrink @RANGE, @COLS, @SHEET_RANGE, and @SHEET_COLS endpoints (both dense and virtual) BEFORE splicing columns
        this.shrinkFormulaStableColEndpointsBeforeDelete(workbook, sheet, requestedStart1, requestedCount);

        if (requestedStart1 <= sheet.Columns.length) {
            const startIdx = requestedStart1 - 1;
            const denseCount = Math.min(requestedCount, sheet.Columns.length - startIdx);
            const removedColSet = new Set(sheet.Columns.slice(startIdx, startIdx + denseCount).map((c) => c.ColumnID));
            sheet.Columns.splice(startIdx, denseCount);
            if (sheet.Columns.length === 0) {
                sheet.Columns.push({
                    ColumnID: `${sheet.SheetID}-col-${generateSpreadsheetUuid()}`,
                    Index: 1,
                    Letter: 'A',
                    Width: DEFAULT_COLUMN_WIDTH,
                    Hidden: false
                });
            }
            for (const [addr, cell] of Object.entries(sheet.Cells)) {
                if (removedColSet.has(cell.ColumnID)) {
                    this.removeCellFromVirtualAxisIndex(sheet, cell);
                    delete sheet.Cells[addr];
                }
            }
        }
        this.sheetLookupCache.delete(sheet);
        this.sheetAxisIdSets.delete(sheet);
        this.shiftVirtualAxisIds(workbook, sheet, 'col', 'delete', requestedStart1, requestedCount);
        this.shiftNonCellMetadataForColEdit(workbook, sheet, 'delete', requestedStart1, requestedCount);
        this.reindexWorkbookAfterStructuralEdit(workbook, sheet);
        this.EvaluateWorkbook(workbook);
    }

    private shiftVirtualAxisIds(
        workbook: WorkbookSpec,
        targetSheet: WorksheetSpec,
        axis: 'row' | 'col',
        op: 'insert' | 'delete',
        start1Based: number,
        count: number
    ): void {
        const tag = axis === 'row' ? '-vrow-' : '-vcol-';
        const prefix = `${targetSheet.SheetID}${tag}`;
        const maxBound = axis === 'row' ? EXCEL_MAX_ROWS : EXCEL_MAX_COLS;
        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);
        const tokenRx = new RegExp(`${escapedPrefix}(\\d+)`, 'g');

        for (const [addr, cell] of Object.entries(targetSheet.Cells)) {
            if (axis === 'row' && cell.RowID.startsWith(prefix)) {
                const n = parseInt(cell.RowID.slice(prefix.length), 10);
                if (Number.isFinite(n)) {
                    if (op === 'delete' && n >= start1Based && n < start1Based + count) {
                        this.removeCellFromVirtualAxisIndex(targetSheet, cell);
                        delete targetSheet.Cells[addr];
                        continue;
                    }
                    const nextN =
                        op === 'insert'
                            ? n >= start1Based
                                ? Math.min(maxBound, n + count)
                                : n
                            : n >= start1Based + count
                              ? Math.max(1, n - count)
                              : n;
                    cell.RowID =
                        nextN <= targetSheet.Rows.length
                            ? targetSheet.Rows[nextN - 1].RowID
                            : `${prefix}${nextN}`;
                    this.syncCellVirtualAxisIndex(targetSheet, cell);
                }
            } else if (axis === 'col' && cell.ColumnID.startsWith(prefix)) {
                const n = parseInt(cell.ColumnID.slice(prefix.length), 10);
                if (Number.isFinite(n)) {
                    if (op === 'delete' && n >= start1Based && n < start1Based + count) {
                        this.removeCellFromVirtualAxisIndex(targetSheet, cell);
                        delete targetSheet.Cells[addr];
                        continue;
                    }
                    const nextN =
                        op === 'insert'
                            ? n >= start1Based
                                ? Math.min(maxBound, n + count)
                                : n
                            : n >= start1Based + count
                              ? Math.max(1, n - count)
                              : n;
                    cell.ColumnID =
                        nextN <= targetSheet.Columns.length
                            ? targetSheet.Columns[nextN - 1].ColumnID
                            : `${prefix}${nextN}`;
                    this.syncCellVirtualAxisIndex(targetSheet, cell);
                }
            }
        }

        for (const ws of workbook.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (cell.FormulaStable && cell.FormulaStable.includes(prefix)) {
                    cell.FormulaStable = cell.FormulaStable.replace(tokenRx, (_m, numStr: string) => {
                        const n = parseInt(numStr, 10);
                        if (op === 'delete' && n >= start1Based && n < start1Based + count) {
                            return '__deleted_axis__';
                        }
                        const nextN =
                            op === 'insert'
                                ? n >= start1Based
                                    ? Math.min(maxBound, n + count)
                                    : n
                                : n >= start1Based + count
                                  ? Math.max(1, n - count)
                                  : n;
                        if (axis === 'row' && nextN <= targetSheet.Rows.length) {
                            return targetSheet.Rows[nextN - 1].RowID;
                        }
                        if (axis === 'col' && nextN <= targetSheet.Columns.length) {
                            return targetSheet.Columns[nextN - 1].ColumnID;
                        }
                        return `${prefix}${nextN}`;
                    });
                    this.syncCellVirtualAxisIndex(ws, cell);
                }
            }
        }
    }

    /**
     * Rebuilds 1-based row/column indices, moves cells to their current `(RowID, ColumnID)` A1 coordinates,
     * and updates every cell's `Formula` from its `FormulaStable` (`§ 6.2`, `Accept #1`).
     */
    public ReindexWorksheetAndResolveFormulas(sheet: WorksheetSpec): void {
        this.reindexSheetStructureAndFormulas(sheet);
    }

    private reindexWorkbookAfterStructuralEdit(workbook: WorkbookSpec, editedSheet: WorksheetSpec): void {
        this.workbookDagCache.delete(workbook);
        this.reindexSheetStructureAndFormulas(editedSheet, workbook);
        for (const ws of workbook.Worksheets) {
            if (ws.SheetID === editedSheet.SheetID) continue;
            for (const cell of Object.values(ws.Cells)) {
                if (cell.FormulaStable) {
                    cell.Formula = this.ResolveFormulaFromStableIds(ws, cell.FormulaStable, workbook);
                }
            }
        }
    }

    private reindexSheetStructureAndFormulas(sheet: WorksheetSpec, workbook?: WorkbookSpec): void {
        const activeWorkbook = workbook ?? this.sheetToWorkbook.get(sheet);
        const rowIndexById = new Map<string, number>();
        for (let i = 0; i < sheet.Rows.length; i++) {
            sheet.Rows[i].Index = i + 1;
            rowIndexById.set(sheet.Rows[i].RowID, i + 1);
        }
        const colIndexById = new Map<string, number>();
        for (let i = 0; i < sheet.Columns.length; i++) {
            sheet.Columns[i].Index = i + 1;
            sheet.Columns[i].Letter = ColumnIndexToLetter(i + 1);
            colIndexById.set(sheet.Columns[i].ColumnID, i + 1);
        }
        this.sheetLookupCache.set(sheet, {
            rowLen: sheet.Rows.length,
            colLen: sheet.Columns.length,
            rowIndexById,
            colIndexById
        });
        this.sheetAxisIdSets.delete(sheet);

        const lookupObj = { rowIndexById, colIndexById };
        const nextCells: Record<string, SpreadsheetCellSpec> = {};
        for (const cell of Object.values(sheet.Cells)) {
            const rIdx = this.resolveRowIndexFromId(lookupObj, cell.RowID);
            const cIdx = this.resolveColIndexFromId(lookupObj, cell.ColumnID);
            if (!rIdx || !cIdx) {
                this.removeCellFromVirtualAxisIndex(sheet, cell);
                continue;
            }
            const nextAddr = FormatCellAddress(rIdx, cIdx);
            const resolvedFormula = cell.FormulaStable
                ? this.ResolveFormulaFromStableIds(sheet, cell.FormulaStable, activeWorkbook)
                : cell.Formula ?? null;
            const updatedCell: SpreadsheetCellSpec = {
                ...cell,
                Address: nextAddr,
                Formula: resolvedFormula
            };
            copyCellXmlMeta(cell, updatedCell);
            if (this.unimplementedResultCells.has(cell)) {
                this.unimplementedResultCells.add(updatedCell);
            }
            this.removeCellFromVirtualAxisIndex(sheet, cell);
            this.syncCellVirtualAxisIndex(sheet, updatedCell);
            nextCells[nextAddr] = updatedCell;
        }
        sheet.Cells = nextCells;

        const xmlMetaMap = getCellXmlMetaMap();
        for (const cell of Object.values(sheet.Cells)) {
            const meta = xmlMetaMap.get(cell);
            if (meta?.fRef) {
                const refStart = meta.fRef.split(':')[0].replace(/\$/g, '').toUpperCase();
                if (refStart !== cell.Address.toUpperCase()) {
                    xmlMetaMap.delete(cell);
                }
            }
            if (cell.SpillRange) {
                const srStart = cell.SpillRange.split(':')[0].replace(/\$/g, '').toUpperCase();
                if (srStart !== cell.Address.toUpperCase()) {
                    delete cell.SpillRange;
                }
            }
        }
    }

    private ensureAllWorkbookFormulasHaveStableIds(workbook: WorkbookSpec, forceRecompile = false): void {
        for (const ws of workbook.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (cell.Formula && (forceRecompile || !cell.FormulaStable)) {
                    cell.FormulaStable = this.CompileFormulaToStableIds(ws, cell.Formula, workbook);
                    this.syncCellVirtualAxisIndex(ws, cell);
                }
            }
        }
    }

    private shrinkFormulaStableRowEndpointsBeforeDelete(
        workbook: WorkbookSpec,
        targetSheet: WorksheetSpec,
        delStart1: number,
        delCount: number
    ): void {
        const delEnd1 = delStart1 + delCount - 1;
        const preRowIndexById = new Map<string, number>();
        targetSheet.Rows.forEach((r, idx) => preRowIndexById.set(r.RowID, idx + 1));

        const resolvePreRow1 = (id: string): number | undefined => {
            const direct = preRowIndexById.get(id);
            if (direct !== undefined) return direct;
            const vm = /-vrow-(\d+)$/.exec(id);
            if (!vm) return undefined;
            const parsed = parseInt(vm[1], 10);
            return parsed >= 1 && parsed <= EXCEL_MAX_ROWS ? parsed : undefined;
        };

        const toPreRowToken = (pre1: number): string => {
            if (pre1 <= targetSheet.Rows.length) {
                return targetSheet.Rows[pre1 - 1].RowID;
            }
            this.markSheetHasVirtualAxisIds(targetSheet);
            return `${targetSheet.SheetID}-vrow-${pre1}`;
        };

        const shrinkRowPair = (rawR1: string, rawR2: string): { nextR1: string; nextR2: string } | null => {
            const absR1 = rawR1.trim().startsWith('$');
            const absR2 = rawR2.trim().startsWith('$');
            const id1 = absR1 ? rawR1.trim().slice(1) : rawR1.trim();
            const id2 = absR2 ? rawR2.trim().slice(1) : rawR2.trim();
            const r1 = resolvePreRow1(id1);
            const r2 = resolvePreRow1(id2);
            if (r1 === undefined || r2 === undefined) return null;
            const minR = Math.min(r1, r2);
            const maxR = Math.max(r1, r2);
            if (maxR < delStart1 || minR > delEnd1) {
                return { nextR1: rawR1.trim(), nextR2: rawR2.trim() };
            }
            if (minR >= delStart1 && maxR <= delEnd1) {
                return null;
            }
            const survFirst1 = minR < delStart1 ? minR : delEnd1 + 1;
            const survLast1 = maxR > delEnd1 ? maxR : delStart1 - 1;
            return {
                nextR1: `${absR1 ? '$' : ''}${toPreRowToken(survFirst1)}`,
                nextR2: `${absR2 ? '$' : ''}${toPreRowToken(survLast1)}`
            };
        };

        for (const ws of workbook.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (!cell.FormulaStable) continue;
                let updated = cell.FormulaStable;
                if (ws.SheetID === targetSheet.SheetID && updated.includes('@RANGE(')) {
                    updated = updated.replace(
                        /@RANGE\(([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (_full, r1: string, c1: string, r2: string, c2: string) => {
                            const shrunk = shrinkRowPair(r1, r2);
                            if (!shrunk) return '#REF!';
                            return `@RANGE(${shrunk.nextR1},${c1.trim()},${shrunk.nextR2},${c2.trim()})`;
                        }
                    );
                }
                if (ws.SheetID === targetSheet.SheetID && updated.includes('@ROWS(')) {
                    updated = updated.replace(
                        /@ROWS\(([^,]+),([^)]+)\)/g,
                        (_full, r1: string, r2: string) => {
                            const shrunk = shrinkRowPair(r1, r2);
                            if (!shrunk) return '#REF!';
                            return `@ROWS(${shrunk.nextR1},${shrunk.nextR2})`;
                        }
                    );
                }
                if (updated.includes('@SHEET_RANGE(')) {
                    updated = updated.replace(
                        /@SHEET_RANGE\(([^,]+),([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (full, sId: string, r1: string, c1: string, r2: string, c2: string) => {
                            if (sId.trim() !== targetSheet.SheetID) return full;
                            const shrunk = shrinkRowPair(r1, r2);
                            if (!shrunk) return '#REF!';
                            return `@SHEET_RANGE(${sId.trim()},${shrunk.nextR1},${c1.trim()},${shrunk.nextR2},${c2.trim()})`;
                        }
                    );
                }
                if (updated.includes('@SHEET_ROWS(')) {
                    updated = updated.replace(
                        /@SHEET_ROWS\(([^,]+),([^,]+),([^)]+)\)/g,
                        (full, sId: string, r1: string, r2: string) => {
                            if (sId.trim() !== targetSheet.SheetID) return full;
                            const shrunk = shrinkRowPair(r1, r2);
                            if (!shrunk) return '#REF!';
                            return `@SHEET_ROWS(${sId.trim()},${shrunk.nextR1},${shrunk.nextR2})`;
                        }
                    );
                }
                if (updated !== cell.FormulaStable) {
                    cell.FormulaStable = updated;
                    this.syncCellVirtualAxisIndex(ws, cell);
                }
            }
        }
    }

    private shrinkFormulaStableColEndpointsBeforeDelete(
        workbook: WorkbookSpec,
        targetSheet: WorksheetSpec,
        delStart1: number,
        delCount: number
    ): void {
        const delEnd1 = delStart1 + delCount - 1;
        const preColIndexById = new Map<string, number>();
        targetSheet.Columns.forEach((c, idx) => preColIndexById.set(c.ColumnID, idx + 1));

        const resolvePreCol1 = (id: string): number | undefined => {
            const direct = preColIndexById.get(id);
            if (direct !== undefined) return direct;
            const vm = /-vcol-(\d+)$/.exec(id);
            if (!vm) return undefined;
            const parsed = parseInt(vm[1], 10);
            return parsed >= 1 && parsed <= EXCEL_MAX_COLS ? parsed : undefined;
        };

        const toPreColToken = (pre1: number): string => {
            if (pre1 <= targetSheet.Columns.length) {
                return targetSheet.Columns[pre1 - 1].ColumnID;
            }
            this.markSheetHasVirtualAxisIds(targetSheet);
            return `${targetSheet.SheetID}-vcol-${pre1}`;
        };

        const shrinkColPair = (rawC1: string, rawC2: string): { nextC1: string; nextC2: string } | null => {
            const absC1 = rawC1.trim().startsWith('$');
            const absC2 = rawC2.trim().startsWith('$');
            const id1 = absC1 ? rawC1.trim().slice(1) : rawC1.trim();
            const id2 = absC2 ? rawC2.trim().slice(1) : rawC2.trim();
            const c1 = resolvePreCol1(id1);
            const c2 = resolvePreCol1(id2);
            if (c1 === undefined || c2 === undefined) return null;
            const minC = Math.min(c1, c2);
            const maxC = Math.max(c1, c2);
            if (maxC < delStart1 || minC > delEnd1) {
                return { nextC1: rawC1.trim(), nextC2: rawC2.trim() };
            }
            if (minC >= delStart1 && maxC <= delEnd1) {
                return null;
            }
            const survFirst1 = minC < delStart1 ? minC : delEnd1 + 1;
            const survLast1 = maxC > delEnd1 ? maxC : delStart1 - 1;
            return {
                nextC1: `${absC1 ? '$' : ''}${toPreColToken(survFirst1)}`,
                nextC2: `${absC2 ? '$' : ''}${toPreColToken(survLast1)}`
            };
        };

        for (const ws of workbook.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                if (!cell.FormulaStable) continue;
                let updated = cell.FormulaStable;
                if (ws.SheetID === targetSheet.SheetID && updated.includes('@RANGE(')) {
                    updated = updated.replace(
                        /@RANGE\(([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (_full, r1: string, c1: string, r2: string, c2: string) => {
                            const shrunk = shrinkColPair(c1, c2);
                            if (!shrunk) return '#REF!';
                            return `@RANGE(${r1.trim()},${shrunk.nextC1},${r2.trim()},${shrunk.nextC2})`;
                        }
                    );
                }
                if (ws.SheetID === targetSheet.SheetID && updated.includes('@COLS(')) {
                    updated = updated.replace(
                        /@COLS\(([^,]+),([^)]+)\)/g,
                        (_full, c1: string, c2: string) => {
                            const shrunk = shrinkColPair(c1, c2);
                            if (!shrunk) return '#REF!';
                            return `@COLS(${shrunk.nextC1},${shrunk.nextC2})`;
                        }
                    );
                }
                if (updated.includes('@SHEET_RANGE(')) {
                    updated = updated.replace(
                        /@SHEET_RANGE\(([^,]+),([^,]+),([^,]+),([^,]+),([^)]+)\)/g,
                        (full, sId: string, r1: string, c1: string, r2: string, c2: string) => {
                            if (sId.trim() !== targetSheet.SheetID) return full;
                            const shrunk = shrinkColPair(c1, c2);
                            if (!shrunk) return '#REF!';
                            return `@SHEET_RANGE(${sId.trim()},${r1.trim()},${shrunk.nextC1},${r2.trim()},${shrunk.nextC2})`;
                        }
                    );
                }
                if (updated.includes('@SHEET_COLS(')) {
                    updated = updated.replace(
                        /@SHEET_COLS\(([^,]+),([^,]+),([^)]+)\)/g,
                        (full, sId: string, c1: string, c2: string) => {
                            if (sId.trim() !== targetSheet.SheetID) return full;
                            const shrunk = shrinkColPair(c1, c2);
                            if (!shrunk) return '#REF!';
                            return `@SHEET_COLS(${sId.trim()},${shrunk.nextC1},${shrunk.nextC2})`;
                        }
                    );
                }
                if (updated !== cell.FormulaStable) {
                    cell.FormulaStable = updated;
                    this.syncCellVirtualAxisIndex(ws, cell);
                }
            }
        }
    }

    private shiftNonCellMetadataForRowEdit(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        op: 'insert' | 'delete',
        startRow1Based: number,
        count: number
    ): void {
        const maxSurvivingRow = Math.max(1, sheet.Rows.length);
        for (const nr of workbook.NamedRanges) {
            if (nr.SheetID !== sheet.SheetID || nr.Range === '#REF!') continue;
            const shifted = shiftA1RangeRows(nr.Range, op, startRow1Based, count, false, maxSurvivingRow);
            nr.Range = shifted ?? '#REF!';
        }
        sheet.ValidationRules = sheet.ValidationRules
            .map((vr) => {
                const shifted = shiftA1RangeRows(vr.Range, op, startRow1Based, count, false, maxSurvivingRow);
                return shifted ? { ...vr, Range: shifted } : null;
            })
            .filter((vr): vr is SpreadsheetValidationRuleSpec => vr !== null);
        sheet.ConditionalFormats = sheet.ConditionalFormats
            .map((cf) => {
                const shifted = shiftA1RangeRows(cf.Range, op, startRow1Based, count, false, maxSurvivingRow);
                return shifted ? { ...cf, Range: shifted } : null;
            })
            .filter((cf): cf is SpreadsheetConditionalFormatRuleSpec => cf !== null);
        if (Array.isArray(sheet.ProtectedRanges) && sheet.ProtectedRanges.length > 0) {
            sheet.ProtectedRanges = sheet.ProtectedRanges
                .map((pr) => {
                    const shifted = shiftA1RangeRows(pr.Range, op, startRow1Based, count, false, maxSurvivingRow);
                    return shifted ? { ...pr, Range: shifted } : null;
                })
                .filter((pr): pr is SpreadsheetProtectedRangeSpec => pr !== null);
        }
        if (Array.isArray(sheet.MergeRanges) && sheet.MergeRanges.length > 0) {
            sheet.MergeRanges = sheet.MergeRanges
                .map((mr) => {
                    const shifted = shiftA1RangeRows(mr, op, startRow1Based, count, false, maxSurvivingRow);
                    if (!shifted) return null;
                    const b = ParseRangeAddress(shifted, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                    return b && (b.endRow > b.startRow || b.endCol > b.startCol) ? shifted : null;
                })
                .filter((mr): mr is string => mr !== null);
        }
        for (const ws of workbook.Worksheets) {
            for (const chart of ws.Charts) {
                if (chart.SheetID === sheet.SheetID && chart.SourceRange !== '#REF!') {
                    const shiftedSource = shiftA1RangeRows(chart.SourceRange, op, startRow1Based, count, false, maxSurvivingRow);
                    chart.SourceRange = shiftedSource ?? '#REF!';
                }
            }
        }
        for (const chart of sheet.Charts) {
            const shiftedPos = shiftA1RangeRows(chart.PositionCell, op, startRow1Based, count, true, maxSurvivingRow);
            if (shiftedPos) chart.PositionCell = shiftedPos;
        }
        for (const lt of sheet.LiveTables) {
            const shiftedAnchor = shiftA1RangeRows(lt.AnchorCell, op, startRow1Based, count, true, maxSurvivingRow);
            if (shiftedAnchor) lt.AnchorCell = shiftedAnchor;
        }
        for (const ea of sheet.EmbeddedArtifacts) {
            const shiftedAnchor = shiftA1RangeRows(ea.AnchorCell, op, startRow1Based, count, true, maxSurvivingRow);
            if (shiftedAnchor) ea.AnchorCell = shiftedAnchor;
        }
        const maxSurvivingRowLimit = 1048576;
        const xmlMetaMapRows = getCellXmlMetaMap();
        for (const cell of Object.values(sheet.Cells)) {
            const meta = xmlMetaMapRows.get(cell);
            if (meta?.fRef) {
                const isSingle = !meta.fRef.includes(':');
                const shiftedRef = shiftA1RangeRows(meta.fRef, op, startRow1Based, count, isSingle, maxSurvivingRowLimit);
                if (shiftedRef) {
                    meta.fRef = shiftedRef;
                } else {
                    xmlMetaMapRows.delete(cell);
                }
            }
            if (cell.SpillRange) {
                const isSingle = !cell.SpillRange.includes(':');
                cell.SpillRange = shiftA1RangeRows(cell.SpillRange, op, startRow1Based, count, isSingle, maxSurvivingRowLimit) ?? undefined;
            }
        }
    }

    private shiftNonCellMetadataForColEdit(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        op: 'insert' | 'delete',
        startCol1Based: number,
        count: number
    ): void {
        const maxSurvivingCol = Math.max(1, sheet.Columns.length);
        for (const nr of workbook.NamedRanges) {
            if (nr.SheetID !== sheet.SheetID || nr.Range === '#REF!') continue;
            const shifted = shiftA1RangeCols(nr.Range, op, startCol1Based, count, false, maxSurvivingCol);
            nr.Range = shifted ?? '#REF!';
        }
        sheet.ValidationRules = sheet.ValidationRules
            .map((vr) => {
                const shifted = shiftA1RangeCols(vr.Range, op, startCol1Based, count, false, maxSurvivingCol);
                return shifted ? { ...vr, Range: shifted } : null;
            })
            .filter((vr): vr is SpreadsheetValidationRuleSpec => vr !== null);
        sheet.ConditionalFormats = sheet.ConditionalFormats
            .map((cf) => {
                const shifted = shiftA1RangeCols(cf.Range, op, startCol1Based, count, false, maxSurvivingCol);
                return shifted ? { ...cf, Range: shifted } : null;
            })
            .filter((cf): cf is SpreadsheetConditionalFormatRuleSpec => cf !== null);
        if (Array.isArray(sheet.ProtectedRanges) && sheet.ProtectedRanges.length > 0) {
            sheet.ProtectedRanges = sheet.ProtectedRanges
                .map((pr) => {
                    const shifted = shiftA1RangeCols(pr.Range, op, startCol1Based, count, false, maxSurvivingCol);
                    return shifted ? { ...pr, Range: shifted } : null;
                })
                .filter((pr): pr is SpreadsheetProtectedRangeSpec => pr !== null);
        }
        if (Array.isArray(sheet.MergeRanges) && sheet.MergeRanges.length > 0) {
            sheet.MergeRanges = sheet.MergeRanges
                .map((mr) => {
                    const shifted = shiftA1RangeCols(mr, op, startCol1Based, count, false, maxSurvivingCol);
                    if (!shifted) return null;
                    const b = ParseRangeAddress(shifted, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                    return b && (b.endRow > b.startRow || b.endCol > b.startCol) ? shifted : null;
                })
                .filter((mr): mr is string => mr !== null);
        }
        for (const ws of workbook.Worksheets) {
            for (const chart of ws.Charts) {
                if (chart.SheetID === sheet.SheetID && chart.SourceRange !== '#REF!') {
                    const shiftedSource = shiftA1RangeCols(chart.SourceRange, op, startCol1Based, count, false, maxSurvivingCol);
                    chart.SourceRange = shiftedSource ?? '#REF!';
                }
            }
        }
        for (const chart of sheet.Charts) {
            const shiftedPos = shiftA1RangeCols(chart.PositionCell, op, startCol1Based, count, true, maxSurvivingCol);
            if (shiftedPos) chart.PositionCell = shiftedPos;
        }
        for (const lt of sheet.LiveTables) {
            const shiftedAnchor = shiftA1RangeCols(lt.AnchorCell, op, startCol1Based, count, true, maxSurvivingCol);
            if (shiftedAnchor) lt.AnchorCell = shiftedAnchor;
        }
        for (const ea of sheet.EmbeddedArtifacts) {
            const shiftedAnchor = shiftA1RangeCols(ea.AnchorCell, op, startCol1Based, count, true, maxSurvivingCol);
            if (shiftedAnchor) ea.AnchorCell = shiftedAnchor;
        }
        if (sheet.SortSpec) {
            const shiftedSortCol = shiftColumnLetter(sheet.SortSpec.ColumnLetter, op, startCol1Based, count);
            sheet.SortSpec = shiftedSortCol ? { ...sheet.SortSpec, ColumnLetter: shiftedSortCol } : null;
        }
        sheet.FilterSpecs = sheet.FilterSpecs
            .map((fs) => {
                const shiftedCol = shiftColumnLetter(fs.ColumnLetter, op, startCol1Based, count);
                return shiftedCol ? { ...fs, ColumnLetter: shiftedCol } : null;
            })
            .filter((fs): fs is SpreadsheetFilterSpec => fs !== null);
        const maxSurvivingColLimit = 16384;
        const xmlMetaMapCols = getCellXmlMetaMap();
        for (const cell of Object.values(sheet.Cells)) {
            const meta = xmlMetaMapCols.get(cell);
            if (meta?.fRef) {
                const isSingle = !meta.fRef.includes(':');
                const shiftedRef = shiftA1RangeCols(meta.fRef, op, startCol1Based, count, isSingle, maxSurvivingColLimit);
                if (shiftedRef) {
                    meta.fRef = shiftedRef;
                } else {
                    xmlMetaMapCols.delete(cell);
                }
            }
            if (cell.SpillRange) {
                const isSingle = !cell.SpillRange.includes(':');
                cell.SpillRange = shiftA1RangeCols(cell.SpillRange, op, startCol1Based, count, isSingle, maxSurvivingColLimit) ?? undefined;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Cell Read / Write & Worksheet Management
    // -----------------------------------------------------------------------

    /**
     * Finds a worksheet by `SheetID` or case-insensitive `Name`.
     */
    public GetWorksheet(workbook: WorkbookSpec, sheetIdOrName: string): WorksheetSpec | undefined {
        const trimmed = (sheetIdOrName ?? '').trim();
        return (
            workbook.Worksheets.find((w) => w.SheetID === trimmed) ??
            workbook.Worksheets.find((w) => w.Name.toLowerCase() === trimmed.toLowerCase())
        );
    }

    private isCseOrArrayFormula(formula: string, workbook?: WorkbookSpec): boolean {
        const body = (formula.startsWith('=') ? formula.slice(1) : formula).trim();
        if (!body) {
            return false;
        }
        const withoutStrings = body.replace(/"(?:[^"]|"")*"/g, '""');
        // 1. Contains an inline array literal {...}
        if (/\{[^}]+\}/.test(withoutStrings)) {
            return true;
        }
        // 2. Contains a range reference (:) such as A1:A3, A:A, 1:3
        if (withoutStrings.includes(':')) {
            return true;
        }
        // 3. References a NamedRange or non-cell identifier (not followed by '(' and not a single-cell A1 ref)
        const identMatches = withoutStrings.matchAll(/(?<![A-Za-z0-9_.$!])([A-Za-z_\\][A-Za-z0-9_.]*)\s*(\()?/g);
        for (const m of identMatches) {
            const ident = m[1];
            const isFuncCall = Boolean(m[2]);
            if (isFuncCall) {
                continue;
            }
            const upper = ident.toUpperCase();
            if (upper === 'TRUE' || upper === 'FALSE') {
                continue;
            }
            // Single-cell A1 reference like A1, B12, XFD1048576
            if (/^[A-Za-z]{1,3}\d+$/.test(ident)) {
                continue;
            }
            // Matches a defined NamedRange or identifier
            if (workbook?.NamedRanges?.some((nr) => nr.Name.toUpperCase() === upper) || !/^[A-Za-z]{1,3}\d+$/.test(ident)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Writes a value or formula into a single cell (addressed by A1 coordinate or `{ rowId, columnId }`)
     * and recalculates affected dependents (`Accept #3`, `D2`).
     */
    public SetCell(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        address: string,
        input: {
            Value?: SpreadsheetCellValue;
            Formula?: string | null;
            FormulaStable?: string | null;
            Literal?: boolean;
            Style?: Partial<SpreadsheetCellStyleSpec>;
            Note?: string | null;
            SpilledFrom?: string | null;
            LiveTableID?: string | null;
            AccessDenied?: boolean;
            ErrorMessage?: string | null;
            AiInputHash?: string | null;
        },
        recalculate = true,
        editContext?: SpreadsheetCellEditContext
    ): SpreadsheetCellSpec {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        this.bindSheetsToWorkbook(workbook);
        const parsed = ParseCellAddress(address);
        if (!parsed) {
            throw new Error(`Invalid cell address '${address}'.`);
        }
        const canonicalAddrPre = FormatCellAddress(parsed.row, parsed.col);
        const writeCheck = this.CheckCellWritePermission(sheet, canonicalAddrPre, editContext);
        if (!writeCheck.Allowed) {
            throw new Error(writeCheck.Reason);
        }
        this.ensureSheetCapacity(sheet, parsed.row, parsed.col);
        const canonicalAddr = FormatCellAddress(parsed.row, parsed.col);
        const rowId = this.getStableRowIdForIndex(sheet, parsed.row);
        const colId = this.getStableColIdForIndex(sheet, parsed.col);
        const existing = sheet.Cells[canonicalAddr];
        const isMetadataOnlyEdit =
            input.Value === undefined && input.Formula === undefined && input.FormulaStable === undefined;

        const clearedSpillAddrs = !isMetadataOnlyEdit
            ? this.clearOwnedArrayChildren(sheet, canonicalAddr)
            : [];

        // Determine whether input is a formula
        let formula: string | null = input.Formula !== undefined ? input.Formula : existing?.Formula ?? null;
        let rawValue: SpreadsheetCellValue = input.Value !== undefined ? input.Value : existing?.RawValue ?? null;

        let explicitCseFormula = false;
        if (typeof input.Formula === 'string') {
            const trimmedFormula = input.Formula.trim();
            const cseMatch = trimmedFormula.match(/^\{=([\s\S]+)\}$/);
            if (cseMatch) {
                formula = `=${cseMatch[1].trim()}`;
                explicitCseFormula = true;
            }
        }

        if (typeof input.Value === 'string' && input.Value.trim().startsWith('=') && input.Formula === undefined && !input.Literal) {
            formula = input.Value.trim();
            rawValue = null;
        } else if (input.Value !== undefined && input.Formula === undefined) {
            formula = null;
        }

        let formulaStable: string | null = null;
        if (input.FormulaStable) {
            formulaStable = input.FormulaStable;
            formula = this.ResolveFormulaFromStableIds(sheet, formulaStable, workbook);
        } else if (isMetadataOnlyEdit && existing?.FormulaStable) {
            formulaStable = existing.FormulaStable;
        } else if (formula && formula.trim().startsWith('=')) {
            formula = formula.trim();
            formulaStable = this.CompileFormulaToStableIds(sheet, formula, workbook);
        }

        const mergedStyle: SpreadsheetCellStyleSpec | undefined =
            input.Style || existing?.Style
                ? { ...(existing?.Style ?? {}), ...(input.Style ?? {}) }
                : undefined;

        const preservedSpilledFrom =
            input.SpilledFrom !== undefined
                ? input.SpilledFrom
                : isMetadataOnlyEdit
                  ? existing?.SpilledFrom ?? null
                  : null;
        const preservedLiveTableId =
            input.LiveTableID !== undefined
                ? input.LiveTableID
                : isMetadataOnlyEdit
                  ? existing?.LiveTableID ?? this.isCellInLiveTableFootprint(sheet, parsed.row, parsed.col)
                  : null;
        const isMjFormula = Boolean(
            formula && /^=\s*_?(?:xll\.)?MJ\.(?:VIEW|QUERY|FIELD|IMPORTRANGE|AI)\s*\(/i.test(formula)
        );
        const keepExistingMjDiagnostics = isMetadataOnlyEdit || (isMjFormula && formula === existing?.Formula);
        const preservedErrorMessage =
            input.ErrorMessage !== undefined
                ? input.ErrorMessage
                : keepExistingMjDiagnostics
                  ? existing?.ErrorMessage ?? null
                  : null;
        const preservedAccessDenied =
            input.AccessDenied !== undefined
                ? input.AccessDenied
                : keepExistingMjDiagnostics
                  ? existing?.AccessDenied ?? false
                  : false;

        if (existing) {
            this.removeCellFromVirtualAxisIndex(sheet, existing);
        }

        const cell: SpreadsheetCellSpec = {
            RowID: rowId,
            ColumnID: colId,
            Address: canonicalAddr,
            RawValue: rawValue,
            Formula: formula,
            FormulaStable: formulaStable,
            ComputedValue: formula ? existing?.ComputedValue ?? null : rawValue,
            DisplayValue: '',
            Style: mergedStyle,
            Note: input.Note !== undefined ? input.Note : existing?.Note ?? null,
            AccessDenied: preservedAccessDenied,
            ErrorMessage: preservedErrorMessage,
            SpilledFrom: preservedSpilledFrom,
            SpillRange: isMetadataOnlyEdit ? existing?.SpillRange : undefined,
            ArrayMaster: isMetadataOnlyEdit ? existing?.ArrayMaster : undefined,
            LiveTableID: preservedLiveTableId,
            AiInputHash:
                input.AiInputHash !== undefined
                    ? input.AiInputHash
                    : keepExistingMjDiagnostics
                      ? existing?.AiInputHash ?? null
                      : null
        };

        const xmlMetaMapSet = getCellXmlMetaMap();
        const existingMeta = existing ? xmlMetaMapSet.get(existing) : undefined;
        if (isMetadataOnlyEdit) {
            if (existingMeta) {
                xmlMetaMapSet.set(cell, { ...existingMeta });
            }
        } else if (formula) {
            if (explicitCseFormula) {
                if (!existingMeta?.cmAttr) {
                    cell.SpillRange = existingMeta?.fRef || existing?.SpillRange || canonicalAddr;
                }
                xmlMetaMapSet.set(cell, {
                    fType: 'array',
                    fRef: existingMeta?.fRef || canonicalAddr,
                    cmAttr: existingMeta?.cmAttr ?? null,
                    sAttr: existingMeta?.sAttr ?? null,
                    formulaDirty: true
                });
            } else if (existingMeta?.fType === 'array' && this.isCseOrArrayFormula(formula, workbook)) {
                if (!existingMeta?.cmAttr) {
                    cell.SpillRange = existingMeta.fRef || existing?.SpillRange || canonicalAddr;
                }
                xmlMetaMapSet.set(cell, {
                    fType: 'array',
                    fRef: existingMeta.fRef || canonicalAddr,
                    cmAttr: existingMeta.cmAttr ?? null,
                    sAttr: existingMeta.sAttr ?? null,
                    formulaDirty: true
                });
            } else if (existingMeta && existingMeta.fType !== 'array') {
                xmlMetaMapSet.set(cell, {
                    cmAttr: existingMeta.cmAttr ?? null,
                    sAttr: existingMeta.sAttr ?? null,
                    formulaDirty: true
                });
            }
        }

        sheet.Cells[canonicalAddr] = cell;
        this.syncCellVirtualAxisIndex(sheet, cell);

        if (!isMetadataOnlyEdit && (rawValue !== null || Boolean(formula))) {
            deleteClearedSpillAddr(sheet, canonicalAddr);
        }

        if (recalculate) {
            if (isMetadataOnlyEdit) {
                this.validateCellAgainstSheetRules(sheet, cell);
                cell.DisplayValue = this.formatCellForDisplay(cell);
            } else {
                this.recalculateAfterCellEdit(workbook, sheet, canonicalAddr, clearedSpillAddrs, editContext);
            }
        } else {
            if (!isMetadataOnlyEdit) {
                this.workbookDagCache.delete(workbook);
            }
            this.validateCellAgainstSheetRules(sheet, cell);
            cell.DisplayValue = this.formatCellForDisplay(cell);
        }
        workbook.UpdatedAt = new Date().toISOString();
        return sheet.Cells[canonicalAddr];
    }

    /**
     * Clears all populated cells in `rangeA1` (including any owned dynamic-array or legacy CSE spill children
     * whose anchor cell falls inside `rangeA1`) and incrementally recalculates dependents (`R8-8`).
     */
    public ClearRange(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        rangeA1: string,
        recalculate = true,
        editContext?: SpreadsheetCellEditContext
    ): string[] {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        this.bindSheetsToWorkbook(workbook);
        const bounds = ParseRangeAddress(rangeA1, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            throw new Error(`Invalid A1 range '${rangeA1}'.`);
        }
        if ((sheet.ProtectedRanges?.length ?? 0) > 0 && !editContext?.BypassProtection) {
            for (const rule of sheet.ProtectedRanges ?? []) {
                const ruleBounds = ParseRangeAddress(rule.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                if (!ruleBounds) continue;
                const overlaps =
                    bounds.startRow <= ruleBounds.endRow &&
                    bounds.endRow >= ruleBounds.startRow &&
                    bounds.startCol <= ruleBounds.endCol &&
                    bounds.endCol >= ruleBounds.startCol;
                if (overlaps && !this.isActorAllowedForProtectedRule(rule, editContext)) {
                    throw new Error(
                        `Cannot clear range '${rangeA1}': intersects protected range '${rule.Range}' (locked by ${rule.LockedByUserID}).`
                    );
                }
            }
        }

        const affectedSet = new Set<string>();

        const area = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
        const targetAddrs: string[] = [];
        if (area <= 4096) {
            for (let r = bounds.startRow; r <= bounds.endRow; r++) {
                for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                    const addr = FormatCellAddress(r, c);
                    if (sheet.Cells[addr]) {
                        targetAddrs.push(addr);
                    }
                }
            }
        } else {
            for (const addr of Object.keys(sheet.Cells)) {
                const pos = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
                if (
                    pos &&
                    pos.row >= bounds.startRow &&
                    pos.row <= bounds.endRow &&
                    pos.col >= bounds.startCol &&
                    pos.col <= bounds.endCol
                ) {
                    targetAddrs.push(FormatCellAddress(pos.row, pos.col));
                }
            }
        }

        for (const addr of targetAddrs) {
            const existing = sheet.Cells[addr];
            if (!existing) continue;
            const childCleared = this.clearOwnedArrayChildren(sheet, addr);
            for (const cAddr of childCleared) {
                affectedSet.add(cAddr);
            }
            this.removeCellFromVirtualAxisIndex(sheet, existing);
            this.unimplementedResultCells.delete(existing);
            delete sheet.Cells[addr];
            addClearedSpillAddr(sheet, addr);
            affectedSet.add(addr);
        }

        const affected = Array.from(affectedSet);
        if (affected.length > 0) {
            if (recalculate) {
                this.recalculateAfterCellEdit(workbook, sheet, affected[0], affected.slice(1), editContext);
            } else {
                this.workbookDagCache.delete(workbook);
            }
        }
        workbook.UpdatedAt = new Date().toISOString();
        return affected;
    }

    /**
     * Clears owned spill / legacy CSE array child cells when anchor cell `canonicalAnchorAddr` is edited,
     * cleared, or overwritten, recording cleared child coordinates on `WORKSHEET_CLEARED_SPILL_CHILDREN` (`R8-8`, `R9-6`).
     */
    private clearOwnedArrayChildren(sheet: WorksheetSpec, canonicalAnchorAddr: string): string[] {
        const anchor = sheet.Cells[canonicalAnchorAddr];
        if (!anchor || !anchor.SpillRange || !anchor.SpillRange.includes(':')) {
            return [];
        }
        const bounds = ParseRangeAddress(anchor.SpillRange, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            anchor.SpillRange = undefined;
            return [];
        }
        const area = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
        if (area <= 0 || area > MAX_DYNAMIC_ARRAY_CELLS) {
            anchor.SpillRange = undefined;
        }
        const cleared: string[] = [];
        let hasAtLeastAreaCells = false;
        if (area > 0 && area <= MAX_DYNAMIC_ARRAY_CELLS) {
            let count = 0;
            for (const _ in sheet.Cells) {
                if (Object.prototype.hasOwnProperty.call(sheet.Cells, _) && ++count >= area) {
                    hasAtLeastAreaCells = true;
                    break;
                }
            }
        }

        if (area <= 0 || area > MAX_DYNAMIC_ARRAY_CELLS || !hasAtLeastAreaCells) {
            // Sparse cleanup (`R6`, `N3`, `S5-7`): only when area exceeds populated cell count or dynamic cap.
            for (const key of Object.keys(sheet.Cells)) {
                if (key === canonicalAnchorAddr) continue;
                const pos = parseCellCoordsFast(key);
                if (
                    !pos ||
                    pos.row < bounds.startRow ||
                    pos.row > bounds.endRow ||
                    pos.col < bounds.startCol ||
                    pos.col > bounds.endCol
                ) {
                    continue;
                }
                const child = sheet.Cells[key];
                if (child && (child.ArrayMaster === canonicalAnchorAddr || child.SpilledFrom === canonicalAnchorAddr)) {
                    this.removeCellFromVirtualAxisIndex(sheet, child);
                    this.unimplementedResultCells.delete(child);
                    delete sheet.Cells[key];
                    this.removeCellFromEvalColIndex(sheet, pos.row, pos.col);
                    addClearedSpillAddr(sheet, key);
                    cleared.push(key);
                }
            }
            return cleared;
        }

        for (let r = bounds.startRow; r <= bounds.endRow; r++) {
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                const childAddr = FormatCellAddress(r, c);
                if (childAddr === canonicalAnchorAddr) continue;
                const child = sheet.Cells[childAddr];
                if (child) {
                    if (child.ArrayMaster === canonicalAnchorAddr || child.SpilledFrom === canonicalAnchorAddr) {
                        this.removeCellFromVirtualAxisIndex(sheet, child);
                        this.unimplementedResultCells.delete(child);
                        delete sheet.Cells[childAddr];
                        this.removeCellFromEvalColIndex(sheet, r, c);
                        addClearedSpillAddr(sheet, childAddr);
                        cleared.push(childAddr);
                    }
                } else {
                    addClearedSpillAddr(sheet, childAddr);
                    cleared.push(childAddr);
                }
            }
        }

        return cleared;
    }

    /**
     * Reads a rectangular A1 range from `sheetIdOrName` as a 2D array of cell specs.
     */
    public ReadRange(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        rangeA1: string
    ): SpreadsheetCellSpec[][] {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const bounds = ParseRangeAddress(rangeA1, sheet.Rows.length, sheet.Columns.length);
        if (!bounds) {
            throw new Error(`Invalid A1 range '${rangeA1}'.`);
        }
        this.ensureSheetCapacity(sheet, bounds.endRow, bounds.endCol);
        const grid: SpreadsheetCellSpec[][] = [];
        for (let r = bounds.startRow; r <= bounds.endRow; r++) {
            const rowCells: SpreadsheetCellSpec[] = [];
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                const addr = FormatCellAddress(r, c);
                const cell = sheet.Cells[addr] ?? {
                    RowID: this.getStableRowIdForIndex(sheet, r),
                    ColumnID: this.getStableColIdForIndex(sheet, c),
                    Address: addr,
                    RawValue: null,
                    ComputedValue: null,
                    DisplayValue: ''
                };
                rowCells.push(cell);
            }
            grid.push(rowCells);
        }
        return grid;
    }

    /**
     * Adds a new worksheet tab to `workbook`.
     */
    public AddWorksheet(
        workbook: WorkbookSpec,
        name: string,
        rowCount = DEFAULT_ROW_COUNT,
        colCount = DEFAULT_COLUMN_COUNT
    ): WorksheetSpec {
        const nextNum = workbook.Worksheets.length + 1;
        this.monotonicIdCounter++;
        const sheetId = `sheet-${Date.now().toString(36)}-${nextNum}-${this.monotonicIdCounter}`;
        const uniqueName = this.makeUniqueWorksheetName(workbook, name || `Sheet ${nextNum}`);
        const ws = this.CreateEmptyWorksheet(sheetId, uniqueName, rowCount, colCount);
        workbook.Worksheets.push(ws);
        this.sheetToWorkbook.set(ws, workbook);
        this.workbookDagCache.delete(workbook);
        workbook.UpdatedAt = new Date().toISOString();
        return ws;
    }

    /**
     * Renames an existing worksheet in `workbook`, updating all cross-sheet formulas
     * referencing that worksheet across the entire workbook and recalculating (`Blocker 7`).
     */
    public RenameWorksheet(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        newName: string,
        evaluate = true
    ): boolean {
        const ws = this.GetWorksheet(workbook, sheetIdOrName);
        if (!ws) {
            return false;
        }
        const cleaned = (newName ?? '').replace(/[\[\]:*?/\\]/g, () => ' ').trim().slice(0, 31);
        if (!cleaned) {
            return false;
        }
        const hasCaseCollision = workbook.Worksheets.some(
            (s) => s.SheetID !== ws.SheetID && s.Name.toLowerCase() === cleaned.toLowerCase()
        );
        if (hasCaseCollision) {
            return false;
        }
        const oldName = ws.Name;
        if (oldName === cleaned) {
            return true;
        }
        // Recompile FormulaStable across all sheets while ws.Name is still oldName so cross-sheet refs (including A:A & 3:3) bind to ws.SheetID
        this.bindSheetsToWorkbook(workbook);
        this.ensureAllWorkbookFormulasHaveStableIds(workbook, true);
        ws.Name = cleaned;
        for (const sheet of workbook.Worksheets) {
            for (const cell of Object.values(sheet.Cells)) {
                if (cell.FormulaStable) {
                    cell.Formula = this.ResolveFormulaFromStableIds(sheet, cell.FormulaStable, workbook);
                }
            }
        }
        this.workbookDagCache.delete(workbook);
        workbook.UpdatedAt = new Date().toISOString();
        if (evaluate) {
            this.EvaluateWorkbook(workbook);
        }
        return true;
    }

    private makeUniqueWorksheetName(workbook: WorkbookSpec, desired: string): string {
        const existing = new Set(workbook.Worksheets.map((w) => w.Name.toLowerCase()));
        return SanitizeWorksheetName(desired, existing);
    }

    private getOrSyncSheetAxisIdSets(
        sheet: WorksheetSpec
    ): { rowIds: Set<string>; lastRowLen: number; colIds: Set<string>; lastColLen: number } {
        let cached = this.sheetAxisIdSets.get(sheet);
        if (!cached) {
            const rowIds = new Set<string>();
            for (let i = 0; i < sheet.Rows.length; i++) {
                rowIds.add(sheet.Rows[i].RowID);
            }
            const colIds = new Set<string>();
            for (let i = 0; i < sheet.Columns.length; i++) {
                colIds.add(sheet.Columns[i].ColumnID);
            }
            cached = {
                rowIds,
                lastRowLen: sheet.Rows.length,
                colIds,
                lastColLen: sheet.Columns.length
            };
            this.sheetAxisIdSets.set(sheet, cached);
            return cached;
        }
        if (cached.lastRowLen !== sheet.Rows.length) {
            cached.rowIds.clear();
            for (let i = 0; i < sheet.Rows.length; i++) {
                cached.rowIds.add(sheet.Rows[i].RowID);
            }
            cached.lastRowLen = sheet.Rows.length;
        }
        if (cached.lastColLen !== sheet.Columns.length) {
            cached.colIds.clear();
            for (let i = 0; i < sheet.Columns.length; i++) {
                cached.colIds.add(sheet.Columns[i].ColumnID);
            }
            cached.lastColLen = sheet.Columns.length;
        }
        return cached;
    }

    private ensureSheetCapacity(sheet: WorksheetSpec, minRow: number, minCol: number): void {
        const cappedMinRow = Math.min(minRow, MAX_DENSE_ROWS);
        const cappedMinCol = Math.min(minCol, MAX_DENSE_COLS);
        if (sheet.Rows.length >= cappedMinRow && sheet.Columns.length >= cappedMinCol) {
            return;
        }
        const oldRowLen = sheet.Rows.length;
        const oldColLen = sheet.Columns.length;
        const axisSets = this.getOrSyncSheetAxisIdSets(sheet);
        let rowsGrew = false;
        let colsGrew = false;
        if (sheet.Rows.length < cappedMinRow) {
            rowsGrew = true;
            while (sheet.Rows.length < cappedMinRow) {
                const nextIdx = sheet.Rows.length + 1;
                sheet.Rows.push({
                    RowID: this.mintUniqueRowId(sheet.SheetID, axisSets.rowIds, nextIdx),
                    Index: nextIdx,
                    Height: DEFAULT_ROW_HEIGHT,
                    Hidden: false
                });
            }
            axisSets.lastRowLen = sheet.Rows.length;
        }
        if (sheet.Columns.length < cappedMinCol) {
            colsGrew = true;
            while (sheet.Columns.length < cappedMinCol) {
                const nextIdx = sheet.Columns.length + 1;
                const letter = ColumnIndexToLetter(nextIdx);
                sheet.Columns.push({
                    ColumnID: this.mintUniqueColumnId(sheet.SheetID, axisSets.colIds, nextIdx),
                    Index: nextIdx,
                    Letter: letter,
                    Width: DEFAULT_COLUMN_WIDTH,
                    Hidden: false
                });
            }
            axisSets.lastColLen = sheet.Columns.length;
        }
        if (rowsGrew || colsGrew) {
            this.sheetLookupCache.delete(sheet);
            this.promoteMaterializedVirtualAxisIds(sheet, oldRowLen, sheet.Rows.length, oldColLen, sheet.Columns.length);
        }
    }

    private promoteMaterializedVirtualAxisIds(
        sheet: WorksheetSpec,
        oldRowLen: number,
        newRowLen: number,
        oldColLen: number,
        newColLen: number
    ): void {
        const wb = this.sheetToWorkbook.get(sheet);
        const wbIndex = wb ? this.workbookVirtualAxisIndex.get(wb) : undefined;
        const unboundIndex = this.sheetUnboundVirtualAxisIndex.get(sheet);
        if ((!wbIndex || wbIndex.size === 0) && (!unboundIndex || unboundIndex.size === 0)) {
            return;
        }

        const promoteSingleToken = (virtualAxisId: string, realAxisId: string, axis: 'row' | 'col'): void => {
            const wbHits = wbIndex?.get(virtualAxisId);
            const unboundHits = unboundIndex?.get(virtualAxisId);
            if (!wbHits && !unboundHits) {
                return;
            }
            const escapedVirtual = virtualAxisId.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);
            const replaceRx = new RegExp(`([\\(,]\\$?)${escapedVirtual}(?=[,\\)])`, 'g');

            const applyToCell = (refCell: SpreadsheetCellSpec, ownerSheet: WorksheetSpec): void => {
                if (ownerSheet === sheet) {
                    if (axis === 'row' && refCell.RowID === virtualAxisId) {
                        refCell.RowID = realAxisId;
                    } else if (axis === 'col' && refCell.ColumnID === virtualAxisId) {
                        refCell.ColumnID = realAxisId;
                    }
                }
                if (refCell.FormulaStable && refCell.FormulaStable.includes(virtualAxisId)) {
                    refCell.FormulaStable = refCell.FormulaStable.replace(
                        replaceRx,
                        (_m, delimPrefix: string) => `${delimPrefix}${realAxisId}`
                    );
                }
                const cellTokens = this.cellIndexedVirtualTokens.get(refCell);
                if (cellTokens) {
                    cellTokens.delete(virtualAxisId);
                    if (cellTokens.size === 0) {
                        this.cellIndexedVirtualTokens.delete(refCell);
                    }
                }
            };

            if (wbHits) {
                for (const [refCell, ownerSheet] of wbHits.entries()) {
                    applyToCell(refCell, ownerSheet);
                }
                wbIndex!.delete(virtualAxisId);
            }
            if (unboundHits) {
                for (const refCell of unboundHits.values()) {
                    applyToCell(refCell, sheet);
                }
                unboundIndex!.delete(virtualAxisId);
            }
        };

        if (newRowLen > oldRowLen) {
            const rowPrefix = `${sheet.SheetID}-vrow-`;
            for (let r = oldRowLen + 1; r <= newRowLen; r++) {
                promoteSingleToken(`${rowPrefix}${r}`, sheet.Rows[r - 1].RowID, 'row');
            }
        }

        if (newColLen > oldColLen) {
            const colPrefix = `${sheet.SheetID}-vcol-`;
            for (let c = oldColLen + 1; c <= newColLen; c++) {
                promoteSingleToken(`${colPrefix}${c}`, sheet.Columns[c - 1].ColumnID, 'col');
            }
        }

        if ((!unboundIndex || unboundIndex.size === 0) && (!wbIndex || wbIndex.size === 0)) {
            this.sheetsWithVirtualAxisIds.delete(sheet);
            if (wb && (!wbIndex || wbIndex.size === 0)) {
                this.workbooksWithVirtualAxisIds.delete(wb);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Headless Lexical AST + Iterative Topological DAG Formula Evaluator (§ 6.1, O7, D2, D4)
    // -----------------------------------------------------------------------

    /**
     * Synchronously evaluates all standard formulas across all worksheets in `workbook`
     * using an iterative topological DAG traversal (zero JS call-stack recursion across cells).
     *
     * Note: Cells containing `=MJ.QUERY(...)` or `=MJ.VIEW(...)` retain their last viewer-evaluated
     * `ComputedValue` (or `'#MJ_PENDING!'` until `EvaluateMjCustomFunctions` runs with a `UserInfo`).
     */
    public EvaluateWorkbook(workbook: WorkbookSpec, editContext?: SpreadsheetCellEditContext): void {
        this._lastEvaluatedFormulaCount = 0;
        this.bindSheetsToWorkbook(workbook);

        for (const sheet of workbook.Worksheets) {
            for (const cell of Object.values(sheet.Cells)) {
                if (cell.FormulaStable) {
                    cell.Formula = this.ResolveFormulaFromStableIds(sheet, cell.FormulaStable, workbook);
                }
            }
        }

        const dag = this.buildWorkbookDependencyGraph(workbook);
        this.workbookDagCache.set(workbook, dag);

        const formulaKeys: string[] = [];
        const validationCheckBudget = { remaining: MAX_VALIDATION_CHECKS_PER_WORKBOOK };
        for (const sheet of workbook.Worksheets) {
            this.validationIndexCache.delete(sheet);
            const hasValidation = sheet.ValidationRules.length > 0;
            const validationIndex = hasValidation ? this.getOrBuildValidationIndex(sheet) : null;
            for (const addr of Object.keys(sheet.Cells)) {
                const cell = sheet.Cells[addr];
                if (!cell) continue;
                const parsed = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
                if (!parsed) continue;
                const f = cell.Formula;
                if (!f || (f.charCodeAt(0) !== 61 && !f.trim().startsWith('='))) {
                    this.unimplementedResultCells.delete(cell);
                    cell.ComputedValue = cell.RawValue ?? null;
                    cell.DisplayValue = this.formatCellForDisplay(cell);
                    if (validationIndex) {
                        this.validateCellAgainstSheetRules(sheet, cell, parsed, validationIndex, validationCheckBudget);
                    } else if (cell.ErrorMessage) {
                        cell.ErrorMessage = null;
                    }
                    continue;
                }
                const canonical = FormatCellAddress(parsed.row, parsed.col);
                formulaKeys.push(`${sheet.SheetID}::${canonical}`);
            }
        }

        if (formulaKeys.length > 0) {
            this.runWithEvalBudget(() => {
                this.evaluateCellKeysIteratively(workbook, dag, formulaKeys, null, editContext);
            });
        }
    }

    /**
     * Evaluates `workbook` inside the registered server `worker_threads` isolation runner when available (`R6-1`),
     * applying its mutated worksheets/named ranges back onto `workbook` in place.
     */
    public async EvaluateWorkbookIsolated(
        workbook: WorkbookSpec,
        editContext?: SpreadsheetCellEditContext
    ): Promise<void> {
        const runner = GetSpreadsheetWorkerRunner();
        if (!runner) {
            handleMissingWorkerRunner('EvaluateWorkbookIsolated');
            this.EvaluateWorkbook(workbook, editContext);
            return;
        }
        const res = await runner.EvaluateWorkbook(workbook, editContext);
        workbook.Worksheets = res.Workbook.Worksheets;
        workbook.NamedRanges = res.Workbook.NamedRanges;
        workbook.ActiveSheetID = res.Workbook.ActiveSheetID;
        workbook.UpdatedAt = res.Workbook.UpdatedAt;
        this._lastEvaluatedFormulaCount = res.EvaluatedFormulaCount;
        this.bindSheetsToWorkbook(workbook);
        this.workbookDagCache.delete(workbook);
    }

    /**
     * Imports `.xlsx` bytes inside the registered server `worker_threads` isolation runner when available (`R6-1`).
     */
    public async ImportFromXlsxBytesIsolated(
        bytes: Uint8Array | ArrayBuffer,
        configurationJson?: string | null
    ): Promise<WorkbookSpec> {
        const runner = GetSpreadsheetWorkerRunner();
        if (!runner) {
            handleMissingWorkerRunner('ImportFromXlsxBytesIsolated');
            return this.ImportFromXlsxBytes(bytes, configurationJson);
        }
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        return runner.ImportFromXlsxBytes(u8, configurationJson);
    }

    /**
     * Patches `.xlsx` bytes inside the registered server `worker_threads` isolation runner when available (`R6-1`).
     */
    public async PatchXlsxBytesIsolated(
        originalBytes: Uint8Array | ArrayBuffer,
        workbook: WorkbookSpec
    ): Promise<Uint8Array> {
        const runner = GetSpreadsheetWorkerRunner();
        if (!runner) {
            handleMissingWorkerRunner('PatchXlsxBytesIsolated');
            return this.PatchXlsxBytes(originalBytes, workbook);
        }
        const u8 = originalBytes instanceof Uint8Array ? originalBytes : new Uint8Array(originalBytes);
        return runner.PatchXlsxBytes(u8, workbook);
    }

    /**
     * Incrementally recalculates `canonicalAddr` (plus any `extraDirtyAddrs`) on `sheet` and ONLY their
     * transitive dependent formula cells in iterative topological order (`D2`, `R8-3`, `R8-8`).
     */
    private recalculateAfterCellEdit(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        canonicalAddr: string,
        extraDirtyAddrs: readonly string[] = [],
        editContext?: SpreadsheetCellEditContext
    ): void {
        const namedSig = JSON.stringify(workbook.NamedRanges);
        const existingDag = this.workbookDagCache.get(workbook);
        if (!existingDag || existingDag.namedRangesSignature !== namedSig) {
            this.EvaluateWorkbook(workbook, editContext);
            return;
        }

        this._lastEvaluatedFormulaCount = 0;

        const allSeedAddrs = extraDirtyAddrs.length > 0 ? [canonicalAddr, ...extraDirtyAddrs] : [canonicalAddr];
        const dirtySet = new Set<string>();
        const queue: string[] = [];
        const watchers = existingDag.rangeWatchersBySheet.get(sheet.SheetID);

        for (let sIdx = 0; sIdx < allSeedAddrs.length; sIdx++) {
            const seedAddr = allSeedAddrs[sIdx];
            const seedKey = `${sheet.SheetID}::${seedAddr}`;
            this.updateSingleCellInDag(workbook, sheet, seedAddr, existingDag);

            // Wire any sparse range watchers (whole-column A:A, whole-row 1:1048576, or large bounding boxes) on `sheet` to `seedKey`
            const seedPos = parseCellCoordsFast(seedAddr);
            if (seedPos && watchers) {
                for (let wIdx = 0; wIdx < watchers.length; wIdx++) {
                    const w = watchers[wIdx];
                    if (
                        seedPos.row >= w.startRow &&
                        seedPos.row <= w.endRow &&
                        seedPos.col >= w.startCol &&
                        seedPos.col <= w.endCol
                    ) {
                        const depSet = existingDag.directCellDepSets.get(w.watcherKey);
                        if (depSet && !depSet.has(seedKey)) {
                            depSet.add(seedKey);
                            existingDag.directCellDeps.get(w.watcherKey)?.push(seedKey);
                        }
                        let rev = existingDag.reverseCellDeps.get(seedKey);
                        if (!rev) {
                            rev = new Set<string>();
                            existingDag.reverseCellDeps.set(seedKey, rev);
                        }
                        rev.add(w.watcherKey);
                    }
                }
            }

            if (!dirtySet.has(seedKey)) {
                dirtySet.add(seedKey);
                queue.push(seedKey);
            }
        }

        // Re-evaluate any #SPILL!-blocked formula cells on this sheet in case clearing/editing a cell unblocked them
        const spillBlockedOnSheet = existingDag.spillBlockedKeysBySheet.get(sheet.SheetID);
        if (spillBlockedOnSheet && spillBlockedOnSheet.size > 0) {
            for (const blockedKey of spillBlockedOnSheet) {
                if (!dirtySet.has(blockedKey)) {
                    dirtySet.add(blockedKey);
                    queue.push(blockedKey);
                }
            }
        }

        // Collect transitive dependents via iterative BFS
        let head = 0;
        while (head < queue.length) {
            const current = queue[head++];
            const dependents = existingDag.reverseCellDeps.get(current);
            if (dependents) {
                for (const depKey of dependents) {
                    if (!dirtySet.has(depKey)) {
                        dirtySet.add(depKey);
                        queue.push(depKey);
                    }
                }
            }
        }

        this.runWithEvalBudget(() => {
            this.evaluateCellKeysIteratively(workbook, existingDag, queue, dirtySet, editContext);
        });
    }

    /**
     * Evaluates an arbitrary formula expression against `sheet` in `workbook` without mutating cells.
     */
    public EvaluateFormulaExpression(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        formula: string
    ): SpreadsheetCellValue {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName) ?? workbook.Worksheets[0];
        if (!sheet) return '#REF!';
        const trimmed = formula.trim();
        const body = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
        if (!body) return null;

        // Ensure workbook cells are up-to-date if not yet evaluated
        if (!this.workbookDagCache.has(workbook)) {
            this.EvaluateWorkbook(workbook);
        }
        const ast = compileFormulaAstCached(body);
        try {
            const raw = this.runWithEvalBudget(() => this.evalAstNode(ast, workbook, sheet, null));
            if (raw === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return '#NAME?';
            return raw === null ? 0 : raw;
        } catch (err) {
            if (err instanceof EvalBudgetExceededError) {
                return '#CALC!';
            }
            return '#VALUE!';
        }
    }

    private buildWorkbookDependencyGraph(workbook: WorkbookSpec): WorkbookDependencyGraph {
        const formulaCellsBySheet = new Map<WorksheetSpec, Map<number, Array<{ row: number; key: string }>>>();
        const dag: WorkbookDependencyGraph = {
            namedRangesSignature: JSON.stringify(workbook.NamedRanges),
            astByCellKey: new Map<string, FormulaAstNode | null>(),
            directCellDeps: new Map<string, string[]>(),
            directCellDepSets: new Map<string, Set<string>>(),
            reverseCellDeps: new Map<string, Set<string>>(),
            rangeWatchersBySheet: new Map<string, RangeWatcherEntry[]>(),
            rangeWatchesByCell: new Map<string, Array<{ sheetId: string; startRow: number; endRow: number; startCol: number; endCol: number }>>(),
            watchedSheetsByCell: new Map<string, string[]>(),
            formulaCellsBySheet,
            spillBlockedKeysBySheet: new Map<string, Set<string>>(),
            sheetById: new Map<string, WorksheetSpec>()
        };
        for (const ws of workbook.Worksheets) {
            dag.sheetById.set(ws.SheetID, ws);
            const byCol = new Map<number, Array<{ row: number; key: string }>>();
            for (const addr of Object.keys(ws.Cells)) {
                const c = ws.Cells[addr];
                if (!c || (!c.Formula && !c.SpilledFrom)) continue;
                const pos = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
                if (!pos) continue;
                let colList = byCol.get(pos.col);
                if (!colList) {
                    colList = [];
                    byCol.set(pos.col, colList);
                }
                colList.push({ row: pos.row, key: `${ws.SheetID}::${FormatCellAddress(pos.row, pos.col)}` });
            }
            for (const colList of byCol.values()) {
                if (colList.length > 1) {
                    colList.sort((a, b) => a.row - b.row);
                }
            }
            formulaCellsBySheet.set(ws, byCol);
        }
        const dagEdgeBudget = {
            totalRemaining: MAX_DAG_EDGES_PER_WORKBOOK,
            wideRemaining: MAX_DAG_EXPANDED_WIDE_EDGES,
            watchersRemaining: MAX_DAG_RANGE_WATCHERS
        };
        for (const ws of workbook.Worksheets) {
            for (const addr of Object.keys(ws.Cells)) {
                const cell = ws.Cells[addr];
                if (!cell || !cell.Formula) continue;
                const f = cell.Formula;
                if (f.charCodeAt(0) !== 61 && !f.trim().startsWith('=')) continue;
                const parsed = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
                if (!parsed) continue;
                const canonical = FormatCellAddress(parsed.row, parsed.col);
                this.updateSingleCellInDag(workbook, ws, canonical, dag, formulaCellsBySheet, dagEdgeBudget);
            }
        }
        return dag;
    }

    private updateSingleCellInDag(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        canonicalAddr: string,
        dag: WorkbookDependencyGraph,
        formulaCellsBySheet?: ReadonlyMap<WorksheetSpec, ReadonlyMap<number, ReadonlyArray<{ row: number; key: string }>>>,
        dagEdgeBudget?: {
            totalRemaining: number;
            wideRemaining: number;
            watchersRemaining: number;
        }
    ): void {
        dag.sheetById.set(sheet.SheetID, sheet);
        const cellKey = `${sheet.SheetID}::${canonicalAddr}`;

        // Keep dag.formulaCellsBySheet up to date during incremental cell edits
        if (!formulaCellsBySheet) {
            const pos = parseCellCoordsFast(canonicalAddr) ?? ParseCellAddress(canonicalAddr);
            if (pos) {
                let byCol = dag.formulaCellsBySheet.get(sheet);
                if (!byCol) {
                    byCol = new Map<number, Array<{ row: number; key: string }>>();
                    dag.formulaCellsBySheet.set(sheet, byCol);
                }
                const cellObj = sheet.Cells[canonicalAddr];
                const isFormulaOrSpill = Boolean(cellObj && (cellObj.Formula || cellObj.SpilledFrom));
                const colList = byCol.get(pos.col);
                if (isFormulaOrSpill) {
                    if (!colList) {
                        byCol.set(pos.col, [{ row: pos.row, key: cellKey }]);
                    } else if (!colList.some((e) => e.row === pos.row)) {
                        colList.push({ row: pos.row, key: cellKey });
                        if (colList.length > 1) colList.sort((a, b) => a.row - b.row);
                    }
                } else if (colList) {
                    const idx = colList.findIndex((e) => e.row === pos.row);
                    if (idx >= 0) colList.splice(idx, 1);
                }
            }
        }

        // Remove previous dependency edges
        const oldDeps = dag.directCellDeps.get(cellKey);
        if (oldDeps) {
            for (const dep of oldDeps) {
                const rev = dag.reverseCellDeps.get(dep);
                if (rev) {
                    rev.delete(cellKey);
                    if (rev.size === 0) {
                        dag.reverseCellDeps.delete(dep);
                    }
                }
            }
        }
        const oldWatchedSheets = dag.watchedSheetsByCell.get(cellKey);
        if (oldWatchedSheets) {
            for (const sId of oldWatchedSheets) {
                const list = dag.rangeWatchersBySheet.get(sId);
                if (list) {
                    const filtered = list.filter((w) => w.watcherKey !== cellKey);
                    if (filtered.length === 0) {
                        dag.rangeWatchersBySheet.delete(sId);
                    } else {
                        dag.rangeWatchersBySheet.set(sId, filtered);
                    }
                }
            }
            dag.watchedSheetsByCell.delete(cellKey);
        }
        dag.rangeWatchesByCell.delete(cellKey);

        const cell = sheet.Cells[canonicalAddr];
        if (!cell || !cell.Formula || !cell.Formula.trim().startsWith('=')) {
            dag.astByCellKey.delete(cellKey);
            dag.directCellDeps.delete(cellKey);
            dag.directCellDepSets.delete(cellKey);
            return;
        }

        const parsedMjCell = this.ParseMjCustomFunctionFormula(cell.Formula);
        if (parsedMjCell && parsedMjCell.Kind !== 'AI') {
            dag.astByCellKey.delete(cellKey);
            dag.directCellDeps.delete(cellKey);
            dag.directCellDepSets.delete(cellKey);
            return;
        }

        const exprBody = cell.Formula.trim().slice(1).trim();
        const ast = compileFormulaAstCached(exprBody);
        dag.astByCellKey.set(cellKey, ast);

        const extracted = this.extractAstCellDependencies(
            ast,
            workbook,
            sheet,
            formulaCellsBySheet ?? dag.formulaCellsBySheet,
            dagEdgeBudget
        );
        dag.directCellDeps.set(cellKey, extracted.cellDeps);
        dag.directCellDepSets.set(cellKey, new Set<string>(extracted.cellDeps));
        for (const dep of extracted.cellDeps) {
            let rev = dag.reverseCellDeps.get(dep);
            if (!rev) {
                rev = new Set<string>();
                dag.reverseCellDeps.set(dep, rev);
            }
            rev.add(cellKey);
        }
        if (extracted.rangeWatches.length > 0) {
            dag.rangeWatchesByCell.set(cellKey, extracted.rangeWatches);
            const sheetSet = new Set<string>();
            for (const rw of extracted.rangeWatches) {
                sheetSet.add(rw.sheetId);
                let list = dag.rangeWatchersBySheet.get(rw.sheetId);
                if (!list) {
                    list = [];
                    dag.rangeWatchersBySheet.set(rw.sheetId, list);
                }
                list.push({
                    watcherKey: cellKey,
                    startRow: rw.startRow,
                    endRow: rw.endRow,
                    startCol: rw.startCol,
                    endCol: rw.endCol
                });
            }
            dag.watchedSheetsByCell.set(cellKey, Array.from(sheetSet));
        }
    }

    private extractAstCellDependencies(
        root: FormulaAstNode,
        workbook: WorkbookSpec,
        currentSheet: WorksheetSpec,
        formulaCellsBySheet?: ReadonlyMap<WorksheetSpec, ReadonlyMap<number, ReadonlyArray<{ row: number; key: string }>>>,
        dagEdgeBudget?: {
            totalRemaining: number;
            wideRemaining: number;
            watchersRemaining: number;
        }
    ): {
        cellDeps: string[];
        rangeWatches: Array<{ sheetId: string; startRow: number; endRow: number; startCol: number; endCol: number }>;
    } {
        const deps = new Set<string>();
        const rangeWatches: Array<{
            sheetId: string;
            startRow: number;
            endRow: number;
            startCol: number;
            endCol: number;
        }> = [];
        const stack: FormulaAstNode[] = [root];

        const addDirectDep = (depKey: string): void => {
            if (deps.has(depKey)) {
                return;
            }
            if (dagEdgeBudget) {
                if (--dagEdgeBudget.totalRemaining < 0) {
                    throw new Error(
                        `Workbook dependency graph exceeded maximum edge limit (${MAX_DAG_EDGES_PER_WORKBOOK} edges).`
                    );
                }
            }
            deps.add(depKey);
        };

        const addSparseOrDenseBoxDeps = (
            targetSheet: WorksheetSpec,
            startRow: number,
            endRow: number,
            startCol: number,
            endCol: number
        ): void => {
            const area = (endRow - startRow + 1) * (endCol - startCol + 1);
            if (area <= 256) {
                if (dagEdgeBudget && dagEdgeBudget.totalRemaining < area) {
                    // Quick check: compute exact new unique edges so shared/overlapping refs count accurately
                    for (let r = startRow; r <= endRow; r++) {
                        for (let c = startCol; c <= endCol; c++) {
                            addDirectDep(`${targetSheet.SheetID}::${FormatCellAddress(r, c)}`);
                        }
                    }
                    return;
                }
                for (let r = startRow; r <= endRow; r++) {
                    for (let c = startCol; c <= endCol; c++) {
                        addDirectDep(`${targetSheet.SheetID}::${FormatCellAddress(r, c)}`);
                    }
                }
                return;
            }
            if (dagEdgeBudget && --dagEdgeBudget.watchersRemaining < 0) {
                throw new Error(
                    `Workbook dependency graph exceeded maximum range watcher limit (${MAX_DAG_RANGE_WATCHERS}).`
                );
            }
            rangeWatches.push({
                sheetId: targetSheet.SheetID,
                startRow,
                endRow,
                startCol,
                endCol
            });
            const preindexedByCol = formulaCellsBySheet?.get(targetSheet);
            if (preindexedByCol) {
                const scanCol = (colList: ReadonlyArray<{ row: number; key: string }>): void => {
                    let lo = 0;
                    let hi = colList.length;
                    while (lo < hi) {
                        const mid = (lo + hi) >>> 1;
                        if (colList[mid].row < startRow) {
                            lo = mid + 1;
                        } else {
                            hi = mid;
                        }
                    }
                    for (let i = lo; i < colList.length; i++) {
                        const entry = colList[i];
                        if (entry.row > endRow) break;
                        if (!deps.has(entry.key)) {
                            if (dagEdgeBudget) {
                                if (--dagEdgeBudget.wideRemaining < 0) {
                                    throw new Error(
                                        `Spreadsheet rejected: workbook dependency graph exceeded maximum wide-range edge limit (${MAX_DAG_EXPANDED_WIDE_EDGES} edges).`
                                    );
                                }
                                if (--dagEdgeBudget.totalRemaining < 0) {
                                    throw new Error(
                                        `Workbook dependency graph exceeded maximum edge limit (${MAX_DAG_EDGES_PER_WORKBOOK} edges).`
                                    );
                                }
                            }
                            deps.add(entry.key);
                        }
                    }
                };
                if (endCol - startCol + 1 <= preindexedByCol.size) {
                    for (let c = startCol; c <= endCol; c++) {
                        const colList = preindexedByCol.get(c);
                        if (colList) scanCol(colList);
                    }
                } else {
                    for (const [col, colList] of preindexedByCol.entries()) {
                        if (col < startCol || col > endCol) continue;
                        scanCol(colList);
                    }
                }
                return;
            }
            for (const addr of Object.keys(targetSheet.Cells)) {
                const c = targetSheet.Cells[addr];
                if (!c || (!c.Formula && !c.SpilledFrom)) continue;
                const pos = parseCellCoordsFast(addr);
                if (pos && pos.row >= startRow && pos.row <= endRow && pos.col >= startCol && pos.col <= endCol) {
                    const key = `${targetSheet.SheetID}::${FormatCellAddress(pos.row, pos.col)}`;
                    if (!deps.has(key)) {
                        if (dagEdgeBudget) {
                            if (--dagEdgeBudget.wideRemaining < 0) {
                                throw new Error(
                                    `Spreadsheet rejected: workbook dependency graph exceeded maximum wide-range edge limit (${MAX_DAG_EXPANDED_WIDE_EDGES} edges).`
                                );
                            }
                            if (--dagEdgeBudget.totalRemaining < 0) {
                                throw new Error(
                                    `Workbook dependency graph exceeded maximum edge limit (${MAX_DAG_EDGES_PER_WORKBOOK} edges).`
                                );
                            }
                        }
                        deps.add(key);
                    }
                }
            }
        };

        const addRangeDeps = (targetSheet: WorksheetSpec, rangeStr: string): void => {
            const parts = rangeStr.trim().split(':');
            if (parts.length === 2) {
                const p0 = parts[0].trim();
                const p1 = parts[1].trim();
                const colA = /^\$?([A-Za-z]{1,3})$/.exec(p0);
                const colB = /^\$?([A-Za-z]{1,3})$/.exec(p1);
                if (colA && colB && !parseCellCoordsFast(p0) && !parseCellCoordsFast(p1)) {
                    const c1 = ColumnLetterToIndex(colA[1].toUpperCase());
                    const c2 = ColumnLetterToIndex(colB[1].toUpperCase());
                    addSparseOrDenseBoxDeps(targetSheet, 1, EXCEL_MAX_ROWS, Math.min(c1, c2), Math.max(c1, c2));
                    return;
                }
                const rowA = /^\$?([1-9][0-9]*)$/.exec(p0);
                const rowB = /^\$?([1-9][0-9]*)$/.exec(p1);
                if (rowA && rowB) {
                    const r1 = parseInt(rowA[1], 10);
                    const r2 = parseInt(rowB[1], 10);
                    addSparseOrDenseBoxDeps(targetSheet, Math.min(r1, r2), Math.max(r1, r2), 1, EXCEL_MAX_COLS);
                    return;
                }
                const cellA = parseCellCoordsFast(p0);
                const cellB = parseCellCoordsFast(p1);
                if (cellA && cellB) {
                    addSparseOrDenseBoxDeps(
                        targetSheet,
                        Math.min(cellA.row, cellB.row),
                        Math.max(cellA.row, cellB.row),
                        Math.min(cellA.col, cellB.col),
                        Math.max(cellA.col, cellB.col)
                    );
                    return;
                }
            }
            const single = parseCellCoordsFast(rangeStr.trim());
            if (single) {
                addDirectDep(`${targetSheet.SheetID}::${FormatCellAddress(single.row, single.col)}`);
            }
        };

        while (stack.length > 0) {
            const node = stack.pop()!;
            switch (node.kind) {
                case 'CellRef': {
                    const ws = node.sheetName ? this.GetWorksheet(workbook, node.sheetName) : currentSheet;
                    const pos = parseCellCoordsFast(node.address.trim());
                    if (ws && pos) {
                        addDirectDep(`${ws.SheetID}::${FormatCellAddress(pos.row, pos.col)}`);
                    }
                    break;
                }
                case 'RangeRef': {
                    const ws = node.sheetName ? this.GetWorksheet(workbook, node.sheetName) : currentSheet;
                    if (ws) {
                        addRangeDeps(ws, `${node.startAddress}:${node.endAddress}`);
                    }
                    break;
                }
                case 'Identifier': {
                    const named = workbook.NamedRanges.find(
                        (nr) => nr.Name.toLowerCase() === node.name.toLowerCase()
                    );
                    if (named && named.Range !== '#REF!') {
                        const ws = this.GetWorksheet(workbook, named.SheetID) ?? currentSheet;
                        addRangeDeps(ws, named.Range);
                    }
                    break;
                }
                case 'UnaryOp':
                case 'PostfixPercent':
                    stack.push(node.operand);
                    break;
                case 'BinaryOp':
                    stack.push(node.right, node.left);
                    break;
                case 'ArrayLiteral':
                    for (const row of node.rows) {
                        for (const item of row) {
                            stack.push(item);
                        }
                    }
                    break;
                case 'FunctionCall':
                    for (let i = node.args.length - 1; i >= 0; i--) {
                        stack.push(node.args[i]);
                    }
                    break;
                case 'InvokeLambda':
                    stack.push(node.callee);
                    for (let i = node.args.length - 1; i >= 0; i--) {
                        stack.push(node.args[i]);
                    }
                    break;
            }
        }
        return {
            cellDeps: Array.from(deps),
            rangeWatches
        };
    }

    /**
     * Evaluates `targetKeys` in iterative post-order topological order with explicit cycle detection
     * (`#CYCLE!`), zero JS call-stack recursion across cells, and $O(1)$ lookup for clean cells when
     * `dirtyScope` is non-null.
     */
    private evaluateCellKeysIteratively(
        workbook: WorkbookSpec,
        dag: WorkbookDependencyGraph,
        targetKeys: string[],
        dirtyScope: ReadonlySet<string> | null,
        editContext?: SpreadsheetCellEditContext
    ): void {
        // state: 1 = currently on active DFS path (visiting), 2 = evaluated
        const state = new Map<string, 1 | 2>();
        const memo = new Map<string, SpreadsheetCellValue>();
        const inCycle = new Set<string>();
        const MAX_CELL_REEVALUATIONS = 32;
        const requeueCountByCellKey = new Map<string, number>();

        interface WorkFrame {
            key: string;
            depsScheduled: boolean;
        }
        const workStack: WorkFrame[] = [];

        const readCleanOrEmptyCell = (key: string): SpreadsheetCellValue => {
            const sep = key.indexOf('::');
            const sheetId = key.slice(0, sep);
            const addr = key.slice(sep + 2);
            const ws = dag.sheetById.get(sheetId);
            const cell = ws?.Cells[addr];
            if (!cell) return null;
            if (!cell.Formula || !cell.Formula.trim().startsWith('=')) {
                return cell.RawValue ?? null;
            }
            if (
                this.unimplementedResultCells.has(cell) ||
                (cell.ComputedValue === '#NAME?' &&
                    containsUnimplementedDynamicArrayCall(cell.Formula.trim().slice(1)))
            ) {
                return UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
            }
            return cell.ComputedValue !== undefined ? cell.ComputedValue : null;
        };

        const writeEvaluatedValue = (key: string, val: SpreadsheetCellValue, isFormulaCell: boolean): void => {
            const normalizedVal: SpreadsheetCellValue = isFormulaCell && val === null ? 0 : val;
            memo.set(key, normalizedVal);
            state.set(key, 2);
            const sep = key.indexOf('::');
            const sheetId = key.slice(0, sep);
            const addr = key.slice(sep + 2);
            const ws = dag.sheetById.get(sheetId);
            const cell = ws?.Cells[addr];
            if (cell && ws) {
                if (normalizedVal === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                    this.unimplementedResultCells.add(cell);
                    cell.ComputedValue = '#NAME?';
                } else {
                    this.unimplementedResultCells.delete(cell);
                    cell.ComputedValue = normalizedVal;
                }
                cell.DisplayValue = this.formatCellForDisplay(cell);
                if (ws.ValidationRules.length > 0) {
                    this.validateCellAgainstSheetRules(ws, cell);
                } else {
                    const pmj = cell.Formula ? this.ParseMjCustomFunctionFormula(cell.Formula) : null;
                    if (cell.ErrorMessage && !(pmj && pmj.Kind !== 'AI') && normalizedVal !== '#SPILL!') {
                        cell.ErrorMessage = null;
                    }
                }
            }
        };

        const canonicalizeLookupAddress = (rawAddr: string): string | null => {
            // Fast path for already-canonical A1 coordinates (e.g. "A2", "BC4000") with zero regex or allocation
            let i = 0;
            const len = rawAddr.length;
            if (len >= 2 && len <= 10) {
                while (i < len) {
                    const ch = rawAddr.charCodeAt(i);
                    if (ch >= 65 && ch <= 90) i++;
                    else break;
                }
                if (i >= 1 && i <= 3 && i < len) {
                    const firstDigit = rawAddr.charCodeAt(i);
                    if (firstDigit >= 49 && firstDigit <= 57) {
                        let allDigits = true;
                        for (let j = i + 1; j < len; j++) {
                            const d = rawAddr.charCodeAt(j);
                            if (d < 48 || d > 57) {
                                allDigits = false;
                                break;
                            }
                        }
                        if (allDigits) {
                            return rawAddr;
                        }
                    }
                }
            }
            const parsed = parseCellCoordsFast(rawAddr) ?? ParseCellAddress(rawAddr);
            return parsed ? FormatCellAddress(parsed.row, parsed.col) : null;
        };

        for (const rootKey of targetKeys) {
            if (state.get(rootKey) === 2) continue;
            workStack.push({ key: rootKey, depsScheduled: false });

            while (workStack.length > 0) {
                const top = workStack[workStack.length - 1];
                const curState = state.get(top.key);
                if (curState === 2) {
                    workStack.pop();
                    continue;
                }

                const sep = top.key.indexOf('::');
                const sheetId = top.key.slice(0, sep);
                const addr = top.key.slice(sep + 2);
                const ws = dag.sheetById.get(sheetId);
                const cell = ws?.Cells[addr];

                if (!cell || !ws) {
                    memo.set(top.key, null);
                    state.set(top.key, 2);
                    workStack.pop();
                    continue;
                }

                // Non-formula scalar cell
                if (!cell.Formula || !cell.Formula.trim().startsWith('=')) {
                    writeEvaluatedValue(top.key, cell.RawValue ?? null, false);
                    workStack.pop();
                    continue;
                }

                // Viewer-scoped =MJ.QUERY / =MJ.VIEW / =MJ.IMPORTRANGE custom function cell
                const parsedMjCellFn = this.ParseMjCustomFunctionFormula(cell.Formula);
                if (parsedMjCellFn && parsedMjCellFn.Kind !== 'AI') {
                    const mjVal: SpreadsheetCellValue = cell.AccessDenied
                        ? '#MJ_ACCESS_DENIED!'
                        : cell.ComputedValue !== undefined && cell.ComputedValue !== null
                          ? cell.ComputedValue
                          : '#MJ_PENDING!';
                    writeEvaluatedValue(top.key, mjVal, false);
                    workStack.pop();
                    continue;
                }

                // Opt-in =MJ.AI(...) cell: NEVER executes LLMs during synchronous recalc
                if (this.ParseMjAiFormula(cell.Formula)) {
                    const aiVal: SpreadsheetCellValue = cell.AccessDenied
                        ? '#MJ_ACCESS_DENIED!'
                        : cell.ComputedValue !== undefined && cell.ComputedValue !== null && cell.ComputedValue !== ''
                          ? cell.ComputedValue
                          : '#AI_PENDING';
                    writeEvaluatedValue(top.key, aiVal, false);
                    workStack.pop();
                    continue;
                }

                if (!top.depsScheduled) {
                    state.set(top.key, 1);
                    top.depsScheduled = true;

                    const deps = dag.directCellDeps.get(top.key) ?? [];
                    const depSet = dag.directCellDepSets.get(top.key);
                    const scheduleDepKey = (depKey: string): void => {
                        const depState = state.get(depKey);
                        if (depState === 1) {
                            inCycle.add(depKey);
                            for (let s = workStack.length - 1; s >= 0; s--) {
                                inCycle.add(workStack[s].key);
                                if (workStack[s].key === depKey) break;
                            }
                        } else if (depState !== 2) {
                            if (dirtyScope && !dirtyScope.has(depKey)) {
                                return;
                            }
                            if (!dirtyScope) {
                                const dSep = depKey.indexOf('::');
                                const dWs = dag.sheetById.get(depKey.slice(0, dSep));
                                const dCell = dWs?.Cells[depKey.slice(dSep + 2)];
                                const dFormula = dCell?.Formula;
                                if (!dCell || !dFormula || (dFormula.charCodeAt(0) !== 61 && !dFormula.trim().startsWith('='))) {
                                    return;
                                }
                            }
                            workStack.push({ key: depKey, depsScheduled: false });
                        }
                    };
                    if (dirtyScope && depSet && dirtyScope.size < deps.length) {
                        // O(|dirtyScope|) fast path for formulas watching large ranges (e.g. SUM(A2:A4000))
                        for (const candKey of dirtyScope) {
                            if (!depSet.has(candKey)) continue;
                            scheduleDepKey(candKey);
                        }
                    } else {
                        for (let i = deps.length - 1; i >= 0; i--) {
                            scheduleDepKey(deps[i]);
                        }
                    }
                    continue;
                }

                // All precedents are now evaluated!
                workStack.pop();
                if (inCycle.has(top.key)) {
                    writeEvaluatedValue(top.key, '#CYCLE!', true);
                    continue;
                }
                if (this.activeEvalBudget?.exceeded) {
                    cell.ErrorMessage = 'Formula evaluation exceeded operation or time budget.';
                    writeEvaluatedValue(top.key, '#CALC!', true);
                    continue;
                }
                if (this.activeEvalBudget) {
                    this.activeEvalBudget.matrixCellsLive = 0;
                }

                const ast = dag.astByCellKey.get(top.key) ?? compileFormulaAstCached(cell.Formula.trim().slice(1).trim());
                this._lastEvaluatedFormulaCount++;
                const xmlMeta = getCellXmlMetaMap().get(cell);
                const isLegacyCse = Boolean(
                    xmlMeta?.fType === 'array' &&
                    !xmlMeta?.cmAttr &&
                    !this.isTopLevelSpillCandidate(ast, workbook)
                );
                const clearedPriorSpill = isLegacyCse ? [] : this.clearOwnedArrayChildren(ws, addr);
                let computed: SpreadsheetCellValue;
                let spillErrorMessage: string | undefined;
                const newlySpilledAddrs: string[] = [];
                try {
                    const lookupFn = (lookupSheet: WorksheetSpec, lookupAddr: string): SpreadsheetCellValue => {
                        const canonical = canonicalizeLookupAddress(lookupAddr);
                        if (!canonical) return '#REF!';
                        const targetCell = lookupSheet.Cells[canonical];
                        if (!targetCell) return null;
                        const tf = targetCell.Formula;
                        if (!tf || (tf.charCodeAt(0) !== 61 && !tf.trim().startsWith('='))) {
                            return targetCell.RawValue ?? null;
                        }
                        const k = `${lookupSheet.SheetID}::${canonical}`;
                        if (memo.has(k)) return memo.get(k) ?? null;
                        return readCleanOrEmptyCell(k);
                    };
                    if (this.isTopLevelSpillCandidate(ast, workbook)) {
                        const matrix = this.evalAstMatrix(ast, workbook, ws, lookupFn, lookupFn, addr, 0);
                        const rows = matrix.length;
                        const cols = matrix[0]?.length ?? 0;
                        if (rows > 1 || cols > 1) {
                            const spillOutcome = this.applyDynamicArraySpillToSheet(
                                ws,
                                cell,
                                addr,
                                matrix,
                                editContext
                            );
                            computed = spillOutcome.anchorValue;
                            spillErrorMessage = spillOutcome.errorMessage;
                            for (const spAddr of spillOutcome.writtenAddrs) {
                                newlySpilledAddrs.push(spAddr);
                            }
                        } else {
                            delete cell.SpillRange;
                            computed = matrix[0]?.[0] ?? null;
                        }
                    } else {
                        if (!isLegacyCse) {
                            delete cell.SpillRange;
                        }
                        computed = this.evalAstNode(ast, workbook, ws, lookupFn, addr, 0);
                    }
                } catch (err) {
                    if (!isLegacyCse) {
                        delete cell.SpillRange;
                    }
                    if (err instanceof EvalBudgetExceededError) {
                        computed = '#CALC!';
                        cell.ErrorMessage = err.message;
                    } else {
                        computed = '#VALUE!';
                    }
                }
                writeEvaluatedValue(top.key, computed, true);
                if (computed === '#SPILL!') {
                    cell.ErrorMessage = spillErrorMessage ?? 'Spill range is blocked by non-empty cell(s).';
                    let blocked = dag.spillBlockedKeysBySheet.get(ws.SheetID);
                    if (!blocked) {
                        blocked = new Set<string>();
                        dag.spillBlockedKeysBySheet.set(ws.SheetID, blocked);
                    }
                    blocked.add(top.key);
                } else {
                    dag.spillBlockedKeysBySheet.get(ws.SheetID)?.delete(top.key);
                }

                // Re-queue downstream cells watching any spilled child cells written or cleared by this formula
                const scheduleReevaluation = (targetKey: string): void => {
                    const prevCount = requeueCountByCellKey.get(targetKey) ?? 0;
                    if (prevCount >= MAX_CELL_REEVALUATIONS) {
                        inCycle.add(targetKey);
                        const sep = targetKey.indexOf('::');
                        const tWs = sep > 0 ? dag.sheetById.get(targetKey.slice(0, sep)) : undefined;
                        const tAddr = sep > 0 ? targetKey.slice(sep + 2) : '';
                        const tCell = tWs?.Cells[tAddr];
                        if (tWs && tCell) {
                            this.clearOwnedArrayChildren(tWs, tAddr);
                            delete tCell.SpillRange;
                            tCell.ErrorMessage =
                                'Cyclic dynamic-array spill dependency exceeded maximum re-evaluation limit.';
                        }
                        writeEvaluatedValue(targetKey, '#CYCLE!', true);
                        return;
                    }
                    requeueCountByCellKey.set(targetKey, prevCount + 1);
                    state.delete(targetKey);
                    memo.delete(targetKey);
                    workStack.push({ key: targetKey, depsScheduled: false });
                };

                const touchedSpillSet = new Set<string>([...clearedPriorSpill, ...newlySpilledAddrs]);
                if (touchedSpillSet.size > 0) {
                    const sheetWatchers = dag.rangeWatchersBySheet.get(ws.SheetID);
                    for (const spAddr of touchedSpillSet) {
                        const spKey = `${ws.SheetID}::${spAddr}`;
                        const revDeps = dag.reverseCellDeps.get(spKey);
                        if (revDeps) {
                            for (const depKey of revDeps) {
                                if (depKey !== top.key && !inCycle.has(depKey) && state.get(depKey) === 2) {
                                    scheduleReevaluation(depKey);
                                }
                            }
                        }
                        if (sheetWatchers) {
                            const spPos = parseCellCoordsFast(spAddr);
                            if (spPos) {
                                for (const w of sheetWatchers) {
                                    if (
                                        spPos.row >= w.startRow &&
                                        spPos.row <= w.endRow &&
                                        spPos.col >= w.startCol &&
                                        spPos.col <= w.endCol &&
                                        w.watcherKey !== top.key &&
                                        !inCycle.has(w.watcherKey) &&
                                        state.get(w.watcherKey) === 2
                                    ) {
                                        scheduleReevaluation(w.watcherKey);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private finiteOrNumError(n: number): SpreadsheetCellValue {
        return Number.isFinite(n) ? (n === 0 ? 0 : n) : '#NUM!';
    }

    private evalBinaryOpScalars(
        left: SpreadsheetCellValue,
        right: SpreadsheetCellValue,
        op: BinaryOperator
    ): SpreadsheetCellValue {
        if (this.isErrorValue(left)) return left;
        if (this.isErrorValue(right)) return right;
        switch (op) {
            case '=':
            case '<>':
            case '<':
            case '<=':
            case '>':
            case '>=':
                return this.compareValues(left, right, op);
            case '&': {
                const sLeft = String(left ?? '');
                const sRight = String(right ?? '');
                if (sLeft.length + sRight.length > MAX_CELL_STRING_LENGTH) {
                    return '#VALUE!';
                }
                return `${sLeft}${sRight}`;
            }
            case '+':
            case '-':
            case '*':
            case '/':
            case '^': {
                const nl = this.toNumberOrError(left);
                if (typeof nl === 'string') return nl;
                const nr = this.toNumberOrError(right);
                if (typeof nr === 'string') return nr;
                if (op === '+') return this.finiteOrNumError(nl + nr);
                if (op === '-') return this.finiteOrNumError(nl - nr);
                if (op === '*') return this.finiteOrNumError(nl * nr);
                if (op === '/') {
                    if (nr === 0) return '#DIV/0!';
                    return this.finiteOrNumError(nl / nr);
                }
                return this.finiteOrNumError(Math.pow(nl, nr));
            }
        }
        return '#VALUE!';
    }

    private isTopLevelSpillCandidate(node: FormulaAstNode, workbook: WorkbookSpec): boolean {
        switch (node.kind) {
            case 'ArrayLiteral':
            case 'InvokeLambda':
                return true;
            case 'FunctionCall': {
                const fn = node.name.toUpperCase().replace(/^(?:_XLFN\.|_XLWS\.)+/, '');
                if (DYNAMIC_ARRAY_FN_SET.has(fn)) {
                    return true;
                }
                if (fn === 'IF') {
                    return node.args.slice(1).some((a) => this.isTopLevelSpillCandidate(a, workbook));
                }
                if (fn === 'IFERROR' || fn === 'IFNA') {
                    return node.args.some((a) => this.isTopLevelSpillCandidate(a, workbook));
                }
                return false;
            }
            default:
                return false;
        }
    }

    private applyDynamicArraySpillToSheet(
        sheet: WorksheetSpec,
        anchorCell: SpreadsheetCellSpec,
        anchorAddr: string,
        matrix: SpreadsheetCellValue[][],
        editContext?: SpreadsheetCellEditContext
    ): { anchorValue: SpreadsheetCellValue; writtenAddrs: string[]; errorMessage?: string } {
        const anchorPos = ParseCellAddress(anchorAddr);
        if (!anchorPos) {
            return { anchorValue: '#REF!', writtenAddrs: [] };
        }
        const rows = matrix.length;
        const cols = matrix.reduce((max, r) => Math.max(max, r.length), 0);
        if (rows === 0 || cols === 0) {
            delete anchorCell.SpillRange;
            return { anchorValue: null, writtenAddrs: [] };
        }
        if (anchorPos.row + rows - 1 > EXCEL_MAX_ROWS || anchorPos.col + cols - 1 > EXCEL_MAX_COLS) {
            delete anchorCell.SpillRange;
            return { anchorValue: '#SPILL!', writtenAddrs: [], errorMessage: 'Spill range exceeds worksheet bounds.' };
        }

        // Check every non-anchor cell in the spill footprint for ProtectedRanges and collisions BEFORE mutating any cell
        for (let rIdx = 0; rIdx < rows; rIdx++) {
            for (let cIdx = 0; cIdx < cols; cIdx++) {
                if (rIdx === 0 && cIdx === 0) continue;
                const targetAddr = FormatCellAddress(anchorPos.row + rIdx, anchorPos.col + cIdx);
                const perm = this.CheckCellWritePermission(sheet, targetAddr, editContext);
                if (!perm.Allowed) {
                    delete anchorCell.SpillRange;
                    return {
                        anchorValue: '#SPILL!',
                        writtenAddrs: [],
                        errorMessage: perm.Reason ?? `Spill range intersects protected range containing '${targetAddr}'.`
                    };
                }
                const existing = sheet.Cells[targetAddr];
                if (
                    existing &&
                    !existing.SpilledFrom &&
                    (Boolean(existing.Formula && existing.Formula.trim().length > 0) ||
                        (existing.RawValue !== null && existing.RawValue !== undefined && existing.RawValue !== ''))
                ) {
                    delete anchorCell.SpillRange;
                    return { anchorValue: '#SPILL!', writtenAddrs: [] };
                }
            }
        }

        this.ensureSheetCapacity(sheet, anchorPos.row + rows - 1, anchorPos.col + cols - 1);
        const endAddr = FormatCellAddress(anchorPos.row + rows - 1, anchorPos.col + cols - 1);
        anchorCell.SpillRange = `${anchorAddr}:${endAddr}`;

        const writtenAddrs: string[] = [];
        for (let rIdx = 0; rIdx < rows; rIdx++) {
            const rowArr = matrix[rIdx] ?? [];
            for (let cIdx = 0; cIdx < cols; cIdx++) {
                if (rIdx === 0 && cIdx === 0) continue;
                const targetR = anchorPos.row + rIdx;
                const targetC = anchorPos.col + cIdx;
                const targetAddr = FormatCellAddress(targetR, targetC);
                const val = rowArr[cIdx] ?? null;
                const existing = sheet.Cells[targetAddr];
                sheet.Cells[targetAddr] = {
                    RowID: sheet.Rows[targetR - 1].RowID,
                    ColumnID: sheet.Columns[targetC - 1].ColumnID,
                    Address: targetAddr,
                    RawValue: val,
                    ComputedValue: val,
                    DisplayValue: this.FormatCellValue(val, existing?.Style),
                    Style: existing?.Style,
                    Note: existing?.Note ?? null,
                    SpilledFrom: anchorAddr
                };
                this.upsertCellInEvalColIndex(sheet, targetR, targetC, targetAddr);
                writtenAddrs.push(targetAddr);
            }
        }
        return { anchorValue: matrix[0]?.[0] ?? null, writtenAddrs };
    }

    private nodeContainsArray(
        node: FormulaAstNode,
        workbook: WorkbookSpec,
        lexicalScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): boolean {
        switch (node.kind) {
            case 'ArrayLiteral':
            case 'RangeRef':
            case 'InvokeLambda':
                return true;
            case 'Identifier': {
                const lex = lexicalScope?.get(node.name.replace(/^_xlpm\./i, '').toLowerCase());
                if (lex) {
                    return lex.kind === 'matrix';
                }
                const named = workbook.NamedRanges.find(
                    (nr) => nr.Name.toLowerCase() === node.name.toLowerCase()
                );
                return Boolean(named && named.Range.includes(':'));
            }
            case 'UnaryOp':
            case 'PostfixPercent':
                return this.nodeContainsArray(node.operand, workbook, lexicalScope);
            case 'BinaryOp':
                return (
                    this.nodeContainsArray(node.left, workbook, lexicalScope) ||
                    this.nodeContainsArray(node.right, workbook, lexicalScope)
                );
            case 'FunctionCall': {
                const upper = node.name.toUpperCase().replace(/^(?:_XLFN\.|_XLWS\.)+/, '');
                if (DYNAMIC_ARRAY_FN_SET.has(upper)) {
                    return true;
                }
                const bound = lexicalScope?.get(upper.replace(/^_XLPM\./, '').toLowerCase());
                if (bound?.kind === 'lambda') {
                    return true;
                }
                if (upper === 'IF' || upper === 'IFERROR') {
                    return node.args.slice(1).some((a) => this.nodeContainsArray(a, workbook, lexicalScope));
                }
                return false;
            }
            default:
                return false;
        }
    }

    private evalAstNode(
        node: FormulaAstNode,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        cellLookup: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null,
        currentCellAddress?: string,
        depth = 0,
        lexicalScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetCellValue {
        this.consumeEvalBudget();
        if (depth > MAX_AST_DEPTH) {
            return '#CALC!';
        }
        const getCellVal = (targetSheet: WorksheetSpec, addr: string): SpreadsheetCellValue => {
            if (cellLookup) {
                return cellLookup(targetSheet, addr);
            }
            const parsed = ParseCellAddress(addr);
            if (!parsed) return '#REF!';
            const canonical = FormatCellAddress(parsed.row, parsed.col);
            const c = targetSheet.Cells[canonical];
            if (!c) return null;
            if (c.Formula && c.Formula.trim().startsWith('=')) {
                if (
                    this.unimplementedResultCells.has(c) ||
                    (c.ComputedValue === '#NAME?' &&
                        containsUnimplementedDynamicArrayCall(c.Formula.trim().slice(1)))
                ) {
                    return UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                }
                return c.ComputedValue !== undefined ? c.ComputedValue : null;
            }
            return c.RawValue ?? null;
        };

        switch (node.kind) {
            case 'EmptyArg':
                return null;
            case 'NumberLiteral':
                return this.finiteOrNumError(node.value);
            case 'StringLiteral':
                return node.value;
            case 'BooleanLiteral':
                return node.value;
            case 'ErrorLiteral':
                return node.error;
            case 'ArrayLiteral':
                return '#VALUE!';
            case 'CellRef': {
                const targetSheet = node.sheetName ? this.GetWorksheet(workbook, node.sheetName) : sheet;
                if (!targetSheet) return '#REF!';
                return getCellVal(targetSheet, node.address);
            }
            case 'RangeRef': {
                const matrix = this.resolveAstRangeMatrix(node, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return matrix[0]?.[0] ?? null;
            }
            case 'Identifier': {
                const normKey = node.name.replace(/^_xlpm\./i, '').toLowerCase();
                const lex = lexicalScope?.get(normKey);
                if (lex) {
                    if (lex.kind === 'scalar') return lex.value;
                    if (lex.kind === 'matrix') return lex.value[0]?.[0] ?? null;
                    return '#CALC!';
                }
                const upper = node.name.toUpperCase();
                if (upper === 'TRUE') return true;
                if (upper === 'FALSE') return false;
                const named = workbook.NamedRanges.find((nr) => nr.Name.toLowerCase() === node.name.toLowerCase());
                if (named) {
                    if (named.Range === '#REF!') return '#REF!';
                    const targetSheet = this.GetWorksheet(workbook, named.SheetID) ?? sheet;
                    if (ParseCellAddress(named.Range)) {
                        return getCellVal(targetSheet, named.Range);
                    }
                    const dims = getEffectiveSheetDimensions(targetSheet);
                    const bounds = ParseRangeAddress(named.Range, dims.maxRow, dims.maxCol);
                    if (!bounds) return '#REF!';
                    return getCellVal(targetSheet, FormatCellAddress(bounds.startRow, bounds.startCol));
                }
                return '#NAME?';
            }
            case 'PostfixPercent': {
                const v = this.evalAstNode(node.operand, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                if (this.isErrorValue(v)) return v;
                const n = this.toNumberOrError(v);
                if (typeof n === 'string') return n;
                return this.finiteOrNumError(n / 100);
            }
            case 'UnaryOp': {
                const v = this.evalAstNode(node.operand, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                if (this.isErrorValue(v)) return v;
                const n = this.toNumberOrError(v);
                if (typeof n === 'string') return n;
                return this.finiteOrNumError(node.op === '-' ? (n === 0 ? 0 : -n) : n);
            }
            case 'BinaryOp': {
                const left = this.evalAstNode(node.left, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                const right = this.evalAstNode(node.right, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return this.evalBinaryOpScalars(left, right, node.op);
            }
            case 'InvokeLambda': {
                const m = this.evalAstMatrix(node, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return m[0]?.[0] ?? null;
            }
            case 'FunctionCall':
                return this.evalAstFunctionCall(
                    node.name,
                    node.args,
                    workbook,
                    sheet,
                    cellLookup,
                    getCellVal,
                    currentCellAddress,
                    depth + 1,
                    lexicalScope
                );
        }
    }

    private resolveAstRangeDescriptor(
        argNode: FormulaAstNode | undefined,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        useExcelGridMax = true
    ): {
        targetSheet: WorksheetSpec;
        startRow: number;
        endRow: number;
        startCol: number;
        endCol: number;
    } | '#REF!' | null {
        if (!argNode) return null;
        if (argNode.kind === 'RangeRef') {
            const targetSheet = argNode.sheetName ? this.GetWorksheet(workbook, argNode.sheetName) : sheet;
            if (!targetSheet) return '#REF!';
            const dims = useExcelGridMax
                ? { maxRow: EXCEL_MAX_ROWS, maxCol: EXCEL_MAX_COLS }
                : getEffectiveSheetDimensions(targetSheet);
            const bounds = ParseRangeAddress(
                `${argNode.startAddress}:${argNode.endAddress}`,
                dims.maxRow,
                dims.maxCol
            );
            if (!bounds) return '#REF!';
            return { targetSheet, ...bounds };
        }
        if (argNode.kind === 'CellRef') {
            const targetSheet = argNode.sheetName ? this.GetWorksheet(workbook, argNode.sheetName) : sheet;
            if (!targetSheet) return '#REF!';
            const pos = parseCellCoordsFast(argNode.address) ?? ParseCellAddress(argNode.address);
            if (!pos) return '#REF!';
            return {
                targetSheet,
                startRow: pos.row,
                endRow: pos.row,
                startCol: pos.col,
                endCol: pos.col
            };
        }
        if (argNode.kind === 'Identifier') {
            const named = workbook.NamedRanges.find((nr) => nr.Name.toLowerCase() === argNode.name.toLowerCase());
            if (!named) return null;
            if (named.Range === '#REF!') return '#REF!';
            const targetSheet = this.GetWorksheet(workbook, named.SheetID) ?? sheet;
            const dims = useExcelGridMax
                ? { maxRow: EXCEL_MAX_ROWS, maxCol: EXCEL_MAX_COLS }
                : getEffectiveSheetDimensions(targetSheet);
            const bounds = ParseRangeAddress(named.Range, dims.maxRow, dims.maxCol);
            if (!bounds) return '#REF!';
            return { targetSheet, ...bounds };
        }
        return null;
    }

    private resolveAstRangeMatrix(
        argNode: FormulaAstNode,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue,
        cellLookup?: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null,
        currentCellAddress?: string,
        depth = 0,
        lexicalScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetCellValue[][] {
        if (depth > MAX_AST_DEPTH) {
            return [['#CALC!']];
        }
        if (argNode.kind === 'Identifier') {
            const lex = lexicalScope?.get(argNode.name.replace(/^_xlpm\./i, '').toLowerCase());
            if (lex) {
                if (lex.kind === 'matrix') return lex.value;
                if (lex.kind === 'scalar') return [[lex.value]];
                return [['#CALC!']];
            }
        }
        const desc = this.resolveAstRangeDescriptor(argNode, workbook, sheet, false);
        if (desc === '#REF!') return [['#REF!']];
        if (desc) {
            let endRow = desc.endRow;
            let endCol = desc.endCol;
            const rawArea = (endRow - desc.startRow + 1) * (endCol - desc.startCol + 1);
            // R5-2: Preserve exact declared range shape for all ranges within MAX_DYNAMIC_ARRAY_CELLS;
            // only clamp whole-column / oversized ranges exceeding MAX_DYNAMIC_ARRAY_CELLS to populated bounds.
            if (rawArea > MAX_DYNAMIC_ARRAY_CELLS || !Number.isFinite(rawArea)) {
                const dims = this.getPopulatedCellBounds(desc.targetSheet);
                endRow = Math.min(endRow, Math.max(desc.startRow, dims.maxRow));
                endCol = Math.min(endCol, Math.max(desc.startCol, dims.maxCol));
            }
            const rowCount = endRow - desc.startRow + 1;
            const colCount = endCol - desc.startCol + 1;
            const clampedArea = rowCount * colCount;
            if (clampedArea > MAX_DYNAMIC_ARRAY_CELLS || !Number.isFinite(clampedArea)) {
                return [['#NUM!']];
            }
            this.chargeMatrixAllocation(clampedArea);
            const byCol = this.getOrBuildSheetColIndex(desc.targetSheet);
            const matrix: SpreadsheetCellValue[][] = Array.from({ length: rowCount }, () =>
                new Array<SpreadsheetCellValue>(colCount).fill(null)
            );
            let populatedHits = 0;
            for (let c = desc.startCol; c <= endCol; c++) {
                const colEntries = byCol.get(c);
                if (!colEntries || colEntries.length === 0) {
                    continue;
                }
                let lo = 0;
                let hi = colEntries.length;
                while (lo < hi) {
                    const mid = (lo + hi) >>> 1;
                    if (colEntries[mid].row < desc.startRow) {
                        lo = mid + 1;
                    } else {
                        hi = mid;
                    }
                }
                const cOffset = c - desc.startCol;
                for (let idx = lo; idx < colEntries.length; idx++) {
                    const entry = colEntries[idx];
                    if (entry.row > endRow) {
                        break;
                    }
                    matrix[entry.row - desc.startRow][cOffset] = getCellVal(desc.targetSheet, entry.addr);
                    populatedHits++;
                }
            }
            this.consumeEvalBudget(Math.max(1, populatedHits + Math.ceil(clampedArea / 1024)));
            return matrix;
        }
        if (argNode.kind === 'ArrayLiteral' || this.nodeContainsArray(argNode, workbook, lexicalScope)) {
            const matrix = this.evalAstMatrix(argNode, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
            if (matrix) {
                return matrix;
            }
        }
        return [[this.evalAstNode(argNode, workbook, sheet, cellLookup ?? null, currentCellAddress, depth + 1, lexicalScope)]];
    }

    private evalAstMatrix(
        node: FormulaAstNode,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue,
        cellLookup?: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null,
        currentCellAddress?: string,
        depth = 0,
        lexicalScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetCellValue[][] {
        this.consumeEvalBudget();
        if (depth > MAX_AST_DEPTH) {
            return [['#CALC!']];
        }
        switch (node.kind) {
            case 'ArrayLiteral': {
                const matrix: SpreadsheetCellValue[][] = [];
                for (const row of node.rows) {
                    const rowVals: SpreadsheetCellValue[] = [];
                    for (const item of row) {
                        rowVals.push(this.evalAstNode(item, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope));
                    }
                    matrix.push(rowVals);
                }
                return matrix.length > 0 ? matrix : [[null]];
            }
            case 'RangeRef':
            case 'CellRef': {
                return this.resolveAstRangeMatrix(node, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
            }
            case 'Identifier': {
                const lex = lexicalScope?.get(node.name.replace(/^_xlpm\./i, '').toLowerCase());
                if (lex) {
                    if (lex.kind === 'matrix') return lex.value;
                    if (lex.kind === 'scalar') return [[lex.value]];
                    return [['#CALC!']];
                }
                const desc = this.resolveAstRangeDescriptor(node, workbook, sheet, false);
                if (desc && desc !== '#REF!') {
                    return this.resolveAstRangeMatrix(node, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                }
                const scalarVal = this.evalAstNode(node, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return [[scalarVal]];
            }
            case 'UnaryOp': {
                const m = this.evalAstMatrix(node.operand, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return m.map((row) =>
                    row.map((val) => {
                        if (this.isErrorValue(val)) return val;
                        const n = this.toNumberOrError(val);
                        if (typeof n === 'string') return n;
                        return this.finiteOrNumError(node.op === '-' ? (n === 0 ? 0 : -n) : n);
                    })
                );
            }
            case 'PostfixPercent': {
                const m = this.evalAstMatrix(node.operand, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return m.map((row) =>
                    row.map((val) => {
                        if (this.isErrorValue(val)) return val;
                        const n = this.toNumberOrError(val);
                        if (typeof n === 'string') return n;
                        return this.finiteOrNumError(n / 100);
                    })
                );
            }
            case 'BinaryOp': {
                const leftM = this.evalAstMatrix(node.left, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                const rightM = this.evalAstMatrix(node.right, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                const leftRows = leftM.length;
                const leftCols = leftM[0]?.length ?? 0;
                const rightRows = rightM.length;
                const rightCols = rightM[0]?.length ?? 0;

                const outRows = Math.max(leftRows, rightRows);
                const outCols = Math.max(leftCols, rightCols);

                if (
                    (leftRows !== rightRows && leftRows !== 1 && rightRows !== 1) ||
                    (leftCols !== rightCols && leftCols !== 1 && rightCols !== 1)
                ) {
                    return [['#VALUE!']];
                }
                const broadcastArea = outRows * outCols;
                if (broadcastArea > MAX_DYNAMIC_ARRAY_CELLS || !Number.isFinite(broadcastArea)) {
                    return [['#NUM!']];
                }
                this.consumeEvalBudget(broadcastArea);

                const out: SpreadsheetCellValue[][] = [];
                for (let r = 0; r < outRows; r++) {
                    const row: SpreadsheetCellValue[] = [];
                    const lr = leftRows === 1 ? 0 : r;
                    const rr = rightRows === 1 ? 0 : r;
                    for (let c = 0; c < outCols; c++) {
                        const lc = leftCols === 1 ? 0 : c;
                        const rc = rightCols === 1 ? 0 : c;
                        row.push(this.evalBinaryOpScalars(leftM[lr][lc], rightM[rr][rc], node.op));
                    }
                    out.push(row);
                }
                return out;
            }
            case 'InvokeLambda': {
                const binding = this.evalAstNodeToLexicalBinding(
                    node.callee,
                    workbook,
                    sheet,
                    getCellVal,
                    cellLookup,
                    currentCellAddress,
                    depth + 1,
                    lexicalScope
                );
                if (binding.kind !== 'lambda') {
                    if (binding.kind === 'scalar' && this.isErrorValue(binding.value)) {
                        return [[binding.value]];
                    }
                    return [['#VALUE!']];
                }
                return this.invokeLambdaBinding(
                    binding,
                    node.args,
                    workbook,
                    sheet,
                    getCellVal,
                    cellLookup,
                    currentCellAddress,
                    depth + 1,
                    lexicalScope
                );
            }
            case 'FunctionCall': {
                const fnName = node.name.toUpperCase().replace(/^(?:_XLFN\.|_XLWS\.)+/, () => '');
                const boundLambda = lexicalScope?.get(node.name.replace(/^_xlpm\./i, '').toLowerCase());
                if (boundLambda && boundLambda.kind === 'lambda') {
                    return this.invokeLambdaBinding(
                        boundLambda,
                        node.args,
                        workbook,
                        sheet,
                        getCellVal,
                        cellLookup,
                        currentCellAddress,
                        depth + 1,
                        lexicalScope
                    );
                }
                if (DYNAMIC_ARRAY_FN_SET.has(fnName)) {
                    return this.evalDynamicArrayMatrix(
                        fnName,
                        node.args,
                        workbook,
                        sheet,
                        getCellVal,
                        cellLookup,
                        currentCellAddress,
                        depth + 1,
                        lexicalScope
                    );
                }
                if (fnName === 'IF') {
                    const cond = node.args[0]
                        ? this.evalAstNode(node.args[0], workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope)
                        : null;
                    if (this.isErrorValue(cond)) return [[cond]];
                    const truthy = this.toBooleanOrError(cond);
                    if (typeof truthy === 'string') return [[truthy]];
                    const branch = truthy ? node.args[1] : node.args[2];
                    if (!branch || branch.kind === 'EmptyArg') {
                        const fallback: SpreadsheetCellValue = truthy
                            ? (node.args.length >= 2 ? 0 : true)
                            : (node.args.length >= 3 ? 0 : false);
                        return [[fallback]];
                    }
                    if (this.nodeContainsArray(branch, workbook, lexicalScope)) {
                        return this.evalAstMatrix(branch, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                    }
                    return [[this.evalAstNode(branch, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope)]];
                }
                if (fnName === 'IFERROR' || fnName === 'IFNA') {
                    const primaryArg = node.args[0];
                    if (!primaryArg || primaryArg.kind === 'EmptyArg') return [[null]];
                    const primaryMatrix = this.nodeContainsArray(primaryArg, workbook, lexicalScope)
                        ? this.evalAstMatrix(primaryArg, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope)
                        : [[this.evalAstNode(primaryArg, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope)]];
                    const is1x1 = primaryMatrix.length === 1 && (primaryMatrix[0]?.length ?? 0) === 1;
                    const singleVal = primaryMatrix[0]?.[0];
                    const matchesError = (v: SpreadsheetCellValue): boolean =>
                        v !== '#MJ_ACCESS_DENIED!' &&
                        v !== UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL &&
                        (fnName === 'IFNA' ? v === '#N/A' : this.isErrorValue(v));
                    if (is1x1 && matchesError(singleVal)) {
                        const fallbackArg = node.args[1];
                        if (!fallbackArg || fallbackArg.kind === 'EmptyArg') return [['']];
                        if (this.nodeContainsArray(fallbackArg, workbook, lexicalScope)) {
                            return this.evalAstMatrix(fallbackArg, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                        }
                        return [[this.evalAstNode(fallbackArg, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope)]];
                    }
                    let hasCellError = false;
                    for (const row of primaryMatrix) {
                        for (const v of row) {
                            if (matchesError(v)) {
                                hasCellError = true;
                                break;
                            }
                        }
                        if (hasCellError) break;
                    }
                    if (!hasCellError) return primaryMatrix;
                    const fallbackVal = node.args[1] && node.args[1].kind !== 'EmptyArg'
                        ? this.evalAstNode(node.args[1], workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope)
                        : '';
                    return primaryMatrix.map((row) => row.map((v) => (matchesError(v) ? fallbackVal : v)));
                }
                const scalarVal = this.evalAstNode(node, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return [[scalarVal]];
            }
            default: {
                const scalarVal = this.evalAstNode(node, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                return [[scalarVal]];
            }
        }
    }

    private evalAstNodeToLexicalBinding(
        node: FormulaAstNode,
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue,
        cellLookup: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null | undefined,
        currentCellAddress: string | undefined,
        depth: number,
        lexicalScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetLexicalBinding {
        if (depth > MAX_AST_DEPTH) {
            return { kind: 'scalar', value: '#CALC!' };
        }
        if (node.kind === 'FunctionCall') {
            const fnName = node.name.toUpperCase().replace(/^(?:_XLFN\.|_XLWS\.)+/, () => '');
            if (fnName === 'LAMBDA') {
                return this.createLambdaBinding(node.args, lexicalScope);
            }
        }
        if (node.kind === 'Identifier') {
            const lex = lexicalScope?.get(node.name.replace(/^_xlpm\./i, '').toLowerCase());
            if (lex) {
                return lex;
            }
        }
        if (node.kind === 'InvokeLambda') {
            const matrix = this.evalAstMatrix(node, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
            if (matrix.length === 1 && (matrix[0]?.length ?? 0) === 1) {
                return { kind: 'scalar', value: matrix[0][0] ?? null };
            }
            return { kind: 'matrix', value: matrix };
        }
        if (
            node.kind === 'RangeRef' ||
            node.kind === 'ArrayLiteral' ||
            this.nodeContainsArray(node, workbook, lexicalScope)
        ) {
            const matrix = this.resolveAstRangeMatrix(node, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
            if (matrix.length === 1 && (matrix[0]?.length ?? 0) === 1 && node.kind !== 'RangeRef' && node.kind !== 'ArrayLiteral') {
                return { kind: 'scalar', value: matrix[0][0] ?? null };
            }
            return { kind: 'matrix', value: matrix };
        }
        const desc = this.resolveAstRangeDescriptor(node, workbook, sheet, false);
        if (desc && desc !== '#REF!') {
            const matrix = this.resolveAstRangeMatrix(node, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
            if (matrix.length === 1 && (matrix[0]?.length ?? 0) === 1) {
                return { kind: 'scalar', value: matrix[0][0] ?? null };
            }
            return { kind: 'matrix', value: matrix };
        }
        const scalar = this.evalAstNode(node, workbook, sheet, cellLookup ?? null, currentCellAddress, depth + 1, lexicalScope);
        return { kind: 'scalar', value: scalar };
    }

    private createLambdaBinding(
        args: FormulaAstNode[],
        closureScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetLexicalBinding {
        if (args.length < 1) {
            return { kind: 'scalar', value: '#VALUE!' };
        }
        const params: string[] = [];
        const seen = new Set<string>();
        for (let i = 0; i < args.length - 1; i++) {
            const pNode = args[i];
            if (pNode.kind !== 'Identifier') {
                return { kind: 'scalar', value: '#VALUE!' };
            }
            const norm = pNode.name.replace(/^_xlpm\./i, '').toLowerCase();
            if (!norm || seen.has(norm)) {
                return { kind: 'scalar', value: '#VALUE!' };
            }
            seen.add(norm);
            params.push(norm);
        }
        const body = args[args.length - 1];
        if (!body || body.kind === 'EmptyArg') {
            return { kind: 'scalar', value: '#VALUE!' };
        }
        return {
            kind: 'lambda',
            params,
            body,
            closureScope
        };
    }

    private invokeLambdaBinding(
        lambdaBinding: Extract<SpreadsheetLexicalBinding, { kind: 'lambda' }>,
        argNodes: FormulaAstNode[],
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue,
        cellLookup: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null | undefined,
        currentCellAddress: string | undefined,
        depth: number,
        callerScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetCellValue[][] {
        this.consumeEvalBudget();
        if (depth > MAX_AST_DEPTH) {
            return [['#CALC!']];
        }
        if (argNodes.length !== lambdaBinding.params.length) {
            return [['#VALUE!']];
        }
        const nextScope = new Map<string, SpreadsheetLexicalBinding>(lambdaBinding.closureScope);
        for (let i = 0; i < lambdaBinding.params.length; i++) {
            const valBinding = this.evalAstNodeToLexicalBinding(
                argNodes[i],
                workbook,
                sheet,
                getCellVal,
                cellLookup,
                currentCellAddress,
                depth + 1,
                callerScope
            );
            nextScope.set(lambdaBinding.params[i], valBinding);
        }
        return this.evalAstMatrix(
            lambdaBinding.body,
            workbook,
            sheet,
            getCellVal,
            cellLookup,
            currentCellAddress,
            depth + 1,
            nextScope
        );
    }

    private dynamicArrayCellKey(val: SpreadsheetCellValue): string {
        if (val === null || val === undefined) return 'e:';
        if (typeof val === 'number') return `n:${Object.is(val, -0) ? 0 : val}`;
        if (typeof val === 'boolean') return `b:${val ? 1 : 0}`;
        return `s:${String(val).toLowerCase()}`;
    }

    private compareDynamicArraySortValues(a: SpreadsheetCellValue, b: SpreadsheetCellValue, order: number): number {
        const aBlank = a === null || a === undefined || a === '';
        const bBlank = b === null || b === undefined || b === '';
        if (aBlank && bBlank) return 0;
        // Excel always sorts blanks after all non-blank values regardless of ascending/descending
        if (aBlank) return 1;
        if (bBlank) return -1;

        const rank = (v: SpreadsheetCellValue): number => {
            if (typeof v === 'number') return 1;
            if (this.isErrorValue(v)) return 4;
            if (typeof v === 'boolean') return 3;
            return 2; // string
        };
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) {
            return (ra - rb) * order;
        }
        if (ra === 1) {
            return ((a as number) - (b as number)) * order;
        }
        if (ra === 3) {
            return ((a ? 1 : 0) - (b ? 1 : 0)) * order;
        }
        return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }) * order;
    }

    private evalDynamicArrayMatrix(
        fnName: string,
        args: FormulaAstNode[],
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue,
        cellLookup: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null | undefined,
        currentCellAddress: string | undefined,
        depth: number,
        lexicalScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetCellValue[][] {
        this.consumeEvalBudget();
        if (depth > MAX_AST_DEPTH) {
            return [['#CALC!']];
        }
        const evalScalarLocal = (arg?: FormulaAstNode, scopeOverride?: ReadonlyMap<string, SpreadsheetLexicalBinding>): SpreadsheetCellValue =>
            arg
                ? this.evalAstNode(arg, workbook, sheet, cellLookup ?? null, currentCellAddress, depth + 1, scopeOverride ?? lexicalScope)
                : null;
        const isProvided = (idx: number): boolean => idx < args.length && args[idx].kind !== 'EmptyArg';

        switch (fnName) {
            case 'LAMBDA':
                // Bare uninvoked LAMBDA returns #CALC! when evaluated as a cell result
                return [['#CALC!']];

            case 'LET': {
                if (args.length < 3 || args.length % 2 === 0) {
                    return [['#VALUE!']];
                }
                const nextScope = new Map<string, SpreadsheetLexicalBinding>(lexicalScope);
                for (let i = 0; i + 1 < args.length - 1; i += 2) {
                    const nameNode = args[i];
                    if (nameNode.kind !== 'Identifier') {
                        return [['#VALUE!']];
                    }
                    const varName = nameNode.name.replace(/^_xlpm\./i, '').toLowerCase();
                    if (!varName) {
                        return [['#VALUE!']];
                    }
                    const binding = this.evalAstNodeToLexicalBinding(
                        args[i + 1],
                        workbook,
                        sheet,
                        getCellVal,
                        cellLookup,
                        currentCellAddress,
                        depth + 1,
                        nextScope
                    );
                    nextScope.set(varName, binding);
                }
                const bodyNode = args[args.length - 1];
                if (!bodyNode || bodyNode.kind === 'EmptyArg') {
                    return [['#VALUE!']];
                }
                if (this.nodeContainsArray(bodyNode, workbook, nextScope)) {
                    return this.evalAstMatrix(bodyNode, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, nextScope);
                }
                return [[this.evalAstNode(bodyNode, workbook, sheet, cellLookup ?? null, currentCellAddress, depth + 1, nextScope)]];
            }

            case 'SEQUENCE': {
                if (!isProvided(0)) return [['#VALUE!']];
                const rowsNum = this.toNumberOrError(evalScalarLocal(args[0]));
                if (typeof rowsNum === 'string') return [[rowsNum]];
                const rows = Math.trunc(rowsNum);
                if (rows < 0) return [['#VALUE!']];
                if (rows === 0) return [['#CALC!']];

                let cols = 1;
                if (isProvided(1)) {
                    const colsNum = this.toNumberOrError(evalScalarLocal(args[1]));
                    if (typeof colsNum === 'string') return [[colsNum]];
                    cols = Math.trunc(colsNum);
                    if (cols < 0) return [['#VALUE!']];
                    if (cols === 0) return [['#CALC!']];
                }

                if (rows * cols > MAX_DYNAMIC_ARRAY_CELLS) {
                    return [['#NUM!']];
                }
                this.chargeMatrixAllocation(rows * cols);

                let start = 1;
                if (isProvided(2)) {
                    const startNum = this.toNumberOrError(evalScalarLocal(args[2]));
                    if (typeof startNum === 'string') return [[startNum]];
                    start = startNum;
                }

                let step = 1;
                if (isProvided(3)) {
                    const stepNum = this.toNumberOrError(evalScalarLocal(args[3]));
                    if (typeof stepNum === 'string') return [[stepNum]];
                    step = stepNum;
                }

                const out: SpreadsheetCellValue[][] = [];
                let cur = start;
                for (let r = 0; r < rows; r++) {
                    const rowArr: SpreadsheetCellValue[] = [];
                    for (let c = 0; c < cols; c++) {
                        this.consumeEvalBudget();
                        rowArr.push(this.finiteOrNumError(cur));
                        cur += step;
                    }
                    out.push(rowArr);
                }
                return out;
            }

            case 'FILTER': {
                if (!isProvided(0) || !isProvided(1)) return [['#VALUE!']];
                const arrayM = this.resolveAstRangeMatrix(args[0], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                const includeM = this.resolveAstRangeMatrix(args[1], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                if (arrayM.length === 1 && arrayM[0]?.length === 1 && this.isErrorValue(arrayM[0][0])) {
                    return arrayM;
                }
                const arrRows = arrayM.length;
                const arrCols = arrayM[0]?.length ?? 0;
                const incRows = includeM.length;
                const incCols = includeM[0]?.length ?? 0;

                const toFilterFlag = (v: SpreadsheetCellValue): boolean | string => {
                    if (this.isErrorValue(v)) return v;
                    if (v === null || v === undefined) return false;
                    if (typeof v === 'boolean') return v;
                    if (typeof v === 'number') return v !== 0;
                    return this.toBooleanOrError(v);
                };

                const returnEmptyFallback = (): SpreadsheetCellValue[][] => {
                    if (isProvided(2)) {
                        if (this.nodeContainsArray(args[2], workbook, lexicalScope)) {
                            return this.evalAstMatrix(args[2], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                        }
                        return [[evalScalarLocal(args[2])]];
                    }
                    return [['#CALC!']];
                };

                if (incRows === arrRows && incCols === 1) {
                    const out: SpreadsheetCellValue[][] = [];
                    for (let r = 0; r < arrRows; r++) {
                        const flag = toFilterFlag(includeM[r]?.[0] ?? null);
                        if (typeof flag === 'string') return [[flag]];
                        if (flag) {
                            out.push([...(arrayM[r] ?? [])]);
                        }
                    }
                    return out.length > 0 ? out : returnEmptyFallback();
                }

                if (incRows === 1 && incCols === arrCols) {
                    const keepCols: number[] = [];
                    for (let c = 0; c < arrCols; c++) {
                        const flag = toFilterFlag(includeM[0]?.[c] ?? null);
                        if (typeof flag === 'string') return [[flag]];
                        if (flag) keepCols.push(c);
                    }
                    if (keepCols.length === 0) return returnEmptyFallback();
                    return arrayM.map((row) => keepCols.map((c) => row[c] ?? null));
                }

                return [['#VALUE!']];
            }

            case 'UNIQUE': {
                if (!isProvided(0)) return [['#VALUE!']];
                const arrayM = this.resolveAstRangeMatrix(args[0], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                if (arrayM.length === 1 && arrayM[0]?.length === 1 && this.isErrorValue(arrayM[0][0])) {
                    return arrayM;
                }
                let byCol = false;
                if (isProvided(1)) {
                    const b = this.toBooleanOrError(evalScalarLocal(args[1]));
                    if (typeof b === 'string') return [[b]];
                    byCol = b;
                }
                let exactlyOnce = false;
                if (isProvided(2)) {
                    const e = this.toBooleanOrError(evalScalarLocal(args[2]));
                    if (typeof e === 'string') return [[e]];
                    exactlyOnce = e;
                }

                const numRows = arrayM.length;
                const numCols = arrayM[0]?.length ?? 0;
                if (!byCol) {
                    const counts = new Map<string, number>();
                    const rowKeys: string[] = [];
                    for (let r = 0; r < numRows; r++) {
                        const key = (arrayM[r] ?? []).map((v) => this.dynamicArrayCellKey(v)).join('\u0001');
                        rowKeys.push(key);
                        counts.set(key, (counts.get(key) ?? 0) + 1);
                    }
                    const seen = new Set<string>();
                    const out: SpreadsheetCellValue[][] = [];
                    for (let r = 0; r < numRows; r++) {
                        const key = rowKeys[r];
                        if (exactlyOnce) {
                            if (counts.get(key) === 1) {
                                out.push([...(arrayM[r] ?? [])]);
                            }
                        } else if (!seen.has(key)) {
                            seen.add(key);
                            out.push([...(arrayM[r] ?? [])]);
                        }
                    }
                    return out.length > 0 ? out : [['#CALC!']];
                }

                const counts = new Map<string, number>();
                const colKeys: string[] = [];
                for (let c = 0; c < numCols; c++) {
                    const parts: string[] = [];
                    for (let r = 0; r < numRows; r++) {
                        parts.push(this.dynamicArrayCellKey(arrayM[r]?.[c] ?? null));
                    }
                    const key = parts.join('\u0001');
                    colKeys.push(key);
                    counts.set(key, (counts.get(key) ?? 0) + 1);
                }
                const seen = new Set<string>();
                const keepCols: number[] = [];
                for (let c = 0; c < numCols; c++) {
                    const key = colKeys[c];
                    if (exactlyOnce) {
                        if (counts.get(key) === 1) keepCols.push(c);
                    } else if (!seen.has(key)) {
                        seen.add(key);
                        keepCols.push(c);
                    }
                }
                if (keepCols.length === 0) return [['#CALC!']];
                return arrayM.map((row) => keepCols.map((c) => row[c] ?? null));
            }

            case 'SORT': {
                if (!isProvided(0)) return [['#VALUE!']];
                const arrayM = this.resolveAstRangeMatrix(args[0], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                if (arrayM.length === 1 && arrayM[0]?.length === 1 && this.isErrorValue(arrayM[0][0])) {
                    return arrayM;
                }
                const numRows = arrayM.length;
                const numCols = arrayM[0]?.length ?? 0;

                let sortIndex = 1;
                if (isProvided(1)) {
                    const si = this.toNumberOrError(evalScalarLocal(args[1]));
                    if (typeof si === 'string') return [[si]];
                    sortIndex = Math.trunc(si);
                }
                let sortOrder = 1;
                if (isProvided(2)) {
                    const so = this.toNumberOrError(evalScalarLocal(args[2]));
                    if (typeof so === 'string') return [[so]];
                    sortOrder = Math.trunc(so);
                    if (sortOrder !== 1 && sortOrder !== -1) return [['#VALUE!']];
                }
                let byCol = false;
                if (isProvided(3)) {
                    const bc = this.toBooleanOrError(evalScalarLocal(args[3]));
                    if (typeof bc === 'string') return [[bc]];
                    byCol = bc;
                }

                if (!byCol) {
                    if (sortIndex < 1 || sortIndex > numCols) return [['#VALUE!']];
                    const colIdx = sortIndex - 1;
                    return arrayM
                        .map((row, idx) => ({ row: [...row], idx }))
                        .sort((a, b) => {
                            const cmp = this.compareDynamicArraySortValues(a.row[colIdx] ?? null, b.row[colIdx] ?? null, sortOrder);
                            return cmp !== 0 ? cmp : a.idx - b.idx;
                        })
                        .map((item) => item.row);
                }

                if (sortIndex < 1 || sortIndex > numRows) return [['#VALUE!']];
                const rowIdx = sortIndex - 1;
                const colIndices = Array.from({ length: numCols }, (_, i) => i).sort((ca, cb) => {
                    const cmp = this.compareDynamicArraySortValues(
                        arrayM[rowIdx]?.[ca] ?? null,
                        arrayM[rowIdx]?.[cb] ?? null,
                        sortOrder
                    );
                    return cmp !== 0 ? cmp : ca - cb;
                });
                return arrayM.map((row) => colIndices.map((c) => row[c] ?? null));
            }

            case 'SORTBY': {
                if (args.length < 2) return [['#VALUE!']];
                const arrayM = this.resolveAstRangeMatrix(args[0], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                if (arrayM.length === 1 && arrayM[0]?.length === 1 && this.isErrorValue(arrayM[0][0])) {
                    return arrayM;
                }
                const numRows = arrayM.length;
                const numCols = arrayM[0]?.length ?? 0;

                const by1 = this.resolveAstRangeMatrix(args[1], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                const byRows = by1.length === numRows && (by1[0]?.length ?? 0) === 1;
                const byCols = !byRows && by1.length === 1 && (by1[0]?.length ?? 0) === numCols;
                if (!byRows && !byCols) return [['#VALUE!']];

                const sortKeys: Array<{ vals: SpreadsheetCellValue[]; order: number }> = [];
                for (let i = 1; i < args.length; i += 2) {
                    const byM =
                        i === 1
                            ? by1
                            : this.resolveAstRangeMatrix(args[i], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                    let vals: SpreadsheetCellValue[];
                    if (byRows) {
                        if (byM.length !== numRows || (byM[0]?.length ?? 0) !== 1) return [['#VALUE!']];
                        vals = byM.map((r) => r[0] ?? null);
                    } else {
                        if (byM.length !== 1 || (byM[0]?.length ?? 0) !== numCols) return [['#VALUE!']];
                        vals = [...(byM[0] ?? [])];
                    }
                    let order = 1;
                    if (isProvided(i + 1)) {
                        const so = this.toNumberOrError(evalScalarLocal(args[i + 1]));
                        if (typeof so === 'string') return [[so]];
                        order = Math.trunc(so);
                        if (order !== 1 && order !== -1) return [['#VALUE!']];
                    }
                    sortKeys.push({ vals, order });
                }

                if (byRows) {
                    const rowIndices = Array.from({ length: numRows }, (_, idx) => idx).sort((ra, rb) => {
                        for (const sk of sortKeys) {
                            const cmp = this.compareDynamicArraySortValues(sk.vals[ra] ?? null, sk.vals[rb] ?? null, sk.order);
                            if (cmp !== 0) return cmp;
                        }
                        return ra - rb;
                    });
                    return rowIndices.map((r) => [...(arrayM[r] ?? [])]);
                }

                const colIndices = Array.from({ length: numCols }, (_, idx) => idx).sort((ca, cb) => {
                    for (const sk of sortKeys) {
                        const cmp = this.compareDynamicArraySortValues(sk.vals[ca] ?? null, sk.vals[cb] ?? null, sk.order);
                        if (cmp !== 0) return cmp;
                    }
                    return ca - cb;
                });
                return arrayM.map((row) => colIndices.map((c) => row[c] ?? null));
            }

            default:
                return [[UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL]];
        }
    }

    private evalAstFunctionCall(
        rawFnName: string,
        args: FormulaAstNode[],
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        cellLookup: ((targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue) | null,
        getCellVal: (targetSheet: WorksheetSpec, addr: string) => SpreadsheetCellValue,
        currentCellAddress?: string,
        depth = 0,
        lexicalScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>
    ): SpreadsheetCellValue {
        this.consumeEvalBudget();
        if (depth > MAX_AST_DEPTH) {
            return '#CALC!';
        }
        const boundLambda = lexicalScope?.get(rawFnName.replace(/^_xlpm\./i, '').toLowerCase());
        if (boundLambda && boundLambda.kind === 'lambda') {
            const m = this.invokeLambdaBinding(
                boundLambda,
                args,
                workbook,
                sheet,
                getCellVal,
                cellLookup,
                currentCellAddress,
                depth + 1,
                lexicalScope
            );
            return m[0]?.[0] ?? null;
        }
        const fnName = rawFnName.toUpperCase().replace(/^(?:_XLFN\.|_XLWS\.)+/, () => '');
        const evalScalar = (arg?: FormulaAstNode): SpreadsheetCellValue =>
            arg ? this.evalAstNode(arg, workbook, sheet, cellLookup, currentCellAddress, depth + 1, lexicalScope) : null;
        const isArgProvided = (idx: number): boolean => idx < args.length && args[idx].kind !== 'EmptyArg';
        const isDirectRangeOrRef = (arg: FormulaAstNode): boolean =>
            arg.kind === 'RangeRef' ||
            arg.kind === 'CellRef' ||
            (arg.kind === 'Identifier' &&
                !lexicalScope?.has(arg.name.replace(/^_xlpm\./i, '').toLowerCase()) &&
                workbook.NamedRanges.some((nr) => nr.Name.toLowerCase() === arg.name.toLowerCase()));

        const nodeContainsArray = (node: FormulaAstNode): boolean => this.nodeContainsArray(node, workbook, lexicalScope);

        const resolveFlattenedRange = (arg?: FormulaAstNode): SpreadsheetCellValue[] => {
            if (!arg) return [];
            const matrix = this.resolveAstRangeMatrix(arg, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
            const flat: SpreadsheetCellValue[] = [];
            for (const r of matrix) flat.push(...r);
            return flat;
        };

        /**
         * Resolves populated cells inside a direct range/ref in row-major `(row, col)` order,
         * iterating `Object.keys(targetSheet.Cells)` sparsely in `O(populated cells)` whenever the range
         * area exceeds `Math.max(256, populatedCount * 2)` (e.g. `=SUM(1:1048576)` or `=SUM(A:XFD)`).
         */
        const resolveNonBlankRangeValues = (arg?: FormulaAstNode, preserveOrder = false): SpreadsheetCellValue[] => {
            if (!arg) return [];
            const desc = this.resolveAstRangeDescriptor(arg, workbook, sheet, true);
            if (desc === '#REF!') return ['#REF!'];
            if (!desc) return resolveFlattenedRange(arg);
            const area = (desc.endRow - desc.startRow + 1) * (desc.endCol - desc.startCol + 1);
            if (area <= 256) {
                this.consumeEvalBudget(1 + Math.ceil(area / 64));
                const denseVals: SpreadsheetCellValue[] = [];
                if (desc.startCol === desc.endCol) {
                    const colLetter = ColumnIndexToLetter(desc.startCol);
                    for (let r = desc.startRow; r <= desc.endRow; r++) {
                        const v = getCellVal(desc.targetSheet, `${colLetter}${r}`);
                        if (v !== null && v !== undefined) {
                            denseVals.push(v);
                        }
                    }
                    return denseVals;
                }
                const colSpan = desc.endCol - desc.startCol + 1;
                const colLetters: string[] = new Array(colSpan);
                for (let c = 0; c < colSpan; c++) {
                    colLetters[c] = ColumnIndexToLetter(desc.startCol + c);
                }
                for (let r = desc.startRow; r <= desc.endRow; r++) {
                    for (let c = 0; c < colSpan; c++) {
                        const v = getCellVal(desc.targetSheet, `${colLetters[c]}${r}`);
                        if (v !== null && v !== undefined) {
                            denseVals.push(v);
                        }
                    }
                }
                return denseVals;
            }
            const byCol = this.getOrBuildSheetColIndex(desc.targetSheet);
            const colSpan = desc.endCol - desc.startCol + 1;
            const hits: Array<{ row: number; col: number; val: SpreadsheetCellValue }> = [];
            let sawError = false;
            const collectColEntries = (col: number, entries: ReadonlyArray<{ row: number; addr: string }>): void => {
                // Binary search first entry with row >= desc.startRow
                let lo = 0;
                let hi = entries.length;
                while (lo < hi) {
                    const mid = (lo + hi) >>> 1;
                    if (entries[mid].row < desc.startRow) {
                        lo = mid + 1;
                    } else {
                        hi = mid;
                    }
                }
                for (let i = lo; i < entries.length; i++) {
                    const e = entries[i];
                    if (e.row > desc.endRow) break;
                    const v = getCellVal(desc.targetSheet, e.addr);
                    if (v !== null && v !== undefined) {
                        if (!sawError && typeof v === 'string' && v.charCodeAt(0) === 35) {
                            sawError = true;
                        }
                        hits.push({ row: e.row, col, val: v });
                    }
                }
            };
            if (colSpan <= byCol.size * 2) {
                for (let c = desc.startCol; c <= desc.endCol; c++) {
                    const entries = byCol.get(c);
                    if (entries) {
                        collectColEntries(c, entries);
                    }
                }
            } else {
                for (const [col, entries] of byCol) {
                    if (col >= desc.startCol && col <= desc.endCol) {
                        collectColEntries(col, entries);
                    }
                }
            }
            this.consumeEvalBudget(1 + Math.ceil((Math.min(colSpan, byCol.size) + hits.length) / 64));
            if (colSpan > 1 && (preserveOrder || sawError) && hits.length > 1) {
                hits.sort((a, b) => a.row - b.row || a.col - b.col);
            }
            const out: SpreadsheetCellValue[] = new Array(hits.length);
            for (let i = 0; i < hits.length; i++) {
                out[i] = hits[i].val;
            }
            return out;
        };

        // Collect values distinguishing range cells (where text/booleans are ignored in SUM/AVERAGE) from direct scalar args
        const collectAggregateNumbers = (coerceDirectScalars: boolean): number[] | string => {
            const nums: number[] = [];
            for (const arg of args) {
                if (arg.kind === 'EmptyArg') {
                    if (coerceDirectScalars) nums.push(0);
                    continue;
                }
                if (isDirectRangeOrRef(arg)) {
                    const flat = resolveNonBlankRangeValues(arg);
                    for (const v of flat) {
                        if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(v)) return v as string;
                        if (typeof v === 'number' && !Number.isNaN(v)) {
                            nums.push(v);
                        }
                    }
                } else if (nodeContainsArray(arg)) {
                    const matrix = this.evalAstMatrix(arg, workbook, sheet, getCellVal, cellLookup, currentCellAddress);
                    for (const row of matrix) {
                        for (const v of row) {
                            if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(v)) return v as string;
                            if (typeof v === 'number' && !Number.isNaN(v)) {
                                nums.push(v);
                            } else if (coerceDirectScalars) {
                                const n = this.toNumberOrError(v);
                                if (typeof n === 'string') return n;
                                nums.push(n);
                            }
                        }
                    }
                } else {
                    const v = evalScalar(arg);
                    if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(v)) return v as string;
                    if (coerceDirectScalars) {
                        const n = this.toNumberOrError(v);
                        if (typeof n === 'string') return n;
                        nums.push(n);
                    } else if (typeof v === 'number' && !Number.isNaN(v)) {
                        nums.push(v);
                    }
                }
            }
            return nums;
        };

        const finiteOrNumError = (n: number): SpreadsheetCellValue =>
            Number.isFinite(n) ? (n === 0 ? 0 : n) : '#NUM!';

        switch (fnName) {
            case 'SUM': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                let sum = 0;
                for (const n of nums) sum += n;
                return finiteOrNumError(sum);
            }
            case 'AVERAGE':
            case 'AVG': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                if (nums.length === 0) return '#DIV/0!';
                let sum = 0;
                for (const n of nums) sum += n;
                return finiteOrNumError(sum / nums.length);
            }
            case 'COUNT': {
                let count = 0;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    if (isDirectRangeOrRef(arg)) {
                        for (const v of resolveNonBlankRangeValues(arg)) {
                            if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                            if (typeof v === 'number' && !Number.isNaN(v)) count++;
                        }
                    } else if (nodeContainsArray(arg)) {
                        const matrix = this.evalAstMatrix(arg, workbook, sheet, getCellVal, cellLookup, currentCellAddress);
                        for (const row of matrix) {
                            for (const v of row) {
                                if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                                if (typeof v === 'number' && !Number.isNaN(v)) count++;
                                else if (typeof v === 'string' && v.trim() !== '' && !this.isErrorValue(v) && !Number.isNaN(Number(v))) {
                                    count++;
                                }
                            }
                        }
                    } else {
                        const v = evalScalar(arg);
                        if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                        if (typeof v === 'number' && !Number.isNaN(v)) count++;
                        else if (typeof v === 'boolean') count++;
                        else if (typeof v === 'string' && v.trim() !== '' && !this.isErrorValue(v) && !Number.isNaN(Number(v))) {
                            count++;
                        }
                    }
                }
                return count;
            }
            case 'COUNTA': {
                let count = 0;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    if (isDirectRangeOrRef(arg)) {
                        for (const v of resolveNonBlankRangeValues(arg)) {
                            if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                            if (v !== null && v !== undefined && v !== '') count++;
                        }
                    } else if (nodeContainsArray(arg)) {
                        const matrix = this.evalAstMatrix(arg, workbook, sheet, getCellVal, cellLookup, currentCellAddress);
                        for (const row of matrix) {
                            for (const v of row) {
                                if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                                if (v !== null && v !== undefined && v !== '') count++;
                            }
                        }
                    } else {
                        const v = evalScalar(arg);
                        if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                        if (v !== null && v !== undefined && v !== '') count++;
                    }
                }
                return count;
            }
            case 'COUNTBLANK': {
                let count = 0;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    if (isDirectRangeOrRef(arg)) {
                        const desc = this.resolveAstRangeDescriptor(arg, workbook, sheet, true);
                        if (desc === '#REF!') return '#REF!';
                        if (desc) {
                            const totalArea = (desc.endRow - desc.startRow + 1) * (desc.endCol - desc.startCol + 1);
                            let nonBlankCount = 0;
                            for (const v of resolveNonBlankRangeValues(arg)) {
                                if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                                if (v !== null && v !== undefined && v !== '') nonBlankCount++;
                            }
                            count += totalArea - nonBlankCount;
                        } else {
                            for (const v of resolveFlattenedRange(arg)) {
                                if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                                if (v === null || v === undefined || v === '') count++;
                            }
                        }
                    } else {
                        const v = evalScalar(arg);
                        if (v === '#MJ_ACCESS_DENIED!' || v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                        if (v === null || v === undefined || v === '') count++;
                    }
                }
                return count;
            }
            case 'PRODUCT': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                if (nums.length === 0) return 0;
                let prod = 1;
                for (const n of nums) prod *= n;
                return finiteOrNumError(prod);
            }
            case 'FLOOR':
            case 'CEILING': {
                const numVal = this.toNumberOrError(evalScalar(args[0]));
                if (typeof numVal === 'string') return numVal;
                const sigVal = isArgProvided(1)
                    ? this.toNumberOrError(evalScalar(args[1]))
                    : numVal < 0
                      ? -1
                      : 1;
                if (typeof sigVal === 'string') return sigVal;
                if (numVal === 0) return 0;
                if (sigVal === 0) return fnName === 'FLOOR' ? '#DIV/0!' : 0;
                if (numVal > 0 && sigVal < 0) return '#NUM!';
                const ratio = normalizeCompareFloat15(numVal / sigVal);
                if (!Number.isFinite(ratio)) return '#NUM!';
                const multiple = fnName === 'FLOOR' ? Math.floor(ratio) : Math.ceil(ratio);
                return finiteOrNumError(normalizeCompareFloat15(multiple * sigVal));
            }
            case 'MIN': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                return nums.length > 0 ? finiteOrNumError(Math.min(...nums)) : 0;
            }
            case 'MAX': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                return nums.length > 0 ? finiteOrNumError(Math.max(...nums)) : 0;
            }
            case 'MEDIAN': {
                const nums = collectAggregateNumbers(true);
                if (typeof nums === 'string') return nums;
                if (nums.length === 0) return '#NUM!';
                nums.sort((a, b) => a - b);
                const mid = Math.floor(nums.length / 2);
                return nums.length % 2 === 0
                    ? finiteOrNumError((nums[mid - 1] + nums[mid]) / 2)
                    : finiteOrNumError(nums[mid]);
            }
            case 'SUMPRODUCT': {
                if (args.length === 0) return '#VALUE!';
                const matrices = args.map((a) =>
                    this.resolveAstRangeMatrix(a, workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope)
                );
                const rCount = matrices[0].length;
                const cCount = matrices[0][0]?.length ?? 0;
                for (const m of matrices) {
                    if (m.length !== rCount || (m[0]?.length ?? 0) !== cCount) {
                        return '#VALUE!';
                    }
                }
                let total = 0;
                for (let r = 0; r < rCount; r++) {
                    for (let c = 0; c < cCount; c++) {
                        let rowProd = 1;
                        for (let mIdx = 0; mIdx < matrices.length; mIdx++) {
                            const cellVal = matrices[mIdx][r][c];
                            if (this.isErrorValue(cellVal)) return cellVal;
                            const num = typeof cellVal === 'number' && !Number.isNaN(cellVal) ? cellVal : 0;
                            rowProd *= num;
                        }
                        total += rowProd;
                    }
                }
                return finiteOrNumError(normalizeCompareFloat15(total));
            }
            case 'ROUND':
            case 'ROUNDUP':
            case 'ROUNDDOWN': {
                const numVal = this.toNumberOrError(evalScalar(args[0]));
                if (typeof numVal === 'string') return numVal;
                const digitsVal = isArgProvided(1) ? this.toNumberOrError(evalScalar(args[1])) : 0;
                if (typeof digitsVal === 'string') return digitsVal;
                const digits = Math.trunc(digitsVal);
                if (numVal === 0) return 0;
                const sign = numVal < 0 ? -1 : 1;
                const shifted = normalizeCompareFloat15(decimalShift(Math.abs(numVal), digits));
                if (!Number.isFinite(shifted)) return '#NUM!';
                let roundedInt: number;
                if (fnName === 'ROUNDUP') {
                    roundedInt = Math.ceil(shifted);
                } else if (fnName === 'ROUNDDOWN') {
                    roundedInt = Math.floor(shifted);
                } else {
                    // Excel half-away-from-zero rounding (ROUND(-2.5, 0) -> -3; ROUND(1.005, 2) -> 1.01)
                    roundedInt = Math.floor(shifted + 0.5);
                }
                const result = sign * normalizeCompareFloat15(decimalShift(roundedInt, -digits));
                return finiteOrNumError(result);
            }
            case 'MROUND': {
                const numVal = this.toNumberOrError(evalScalar(args[0]));
                if (typeof numVal === 'string') return numVal;
                const multVal = this.toNumberOrError(evalScalar(args[1]));
                if (typeof multVal === 'string') return multVal;
                if (multVal === 0 || numVal === 0) return 0;
                if ((numVal > 0 && multVal < 0) || (numVal < 0 && multVal > 0)) return '#NUM!';
                const sign = numVal < 0 ? -1 : 1;
                const absMult = Math.abs(multVal);
                const q = normalizeCompareFloat15(Math.abs(numVal) / absMult);
                if (!Number.isFinite(q)) return '#NUM!';
                const roundedQ = Math.floor(q + 0.5);
                return finiteOrNumError(sign * normalizeCompareFloat15(roundedQ * absMult));
            }
            case 'TRUNC': {
                const numVal = this.toNumberOrError(evalScalar(args[0]));
                if (typeof numVal === 'string') return numVal;
                const digitsVal = isArgProvided(1) ? this.toNumberOrError(evalScalar(args[1])) : 0;
                if (typeof digitsVal === 'string') return digitsVal;
                const digits = Math.trunc(digitsVal);
                if (numVal === 0) return 0;
                const sign = numVal < 0 ? -1 : 1;
                const shifted = normalizeCompareFloat15(decimalShift(Math.abs(numVal), digits));
                if (!Number.isFinite(shifted)) return '#NUM!';
                const truncInt = Math.floor(shifted);
                return finiteOrNumError(sign * normalizeCompareFloat15(decimalShift(truncInt, -digits)));
            }
            case 'INT': {
                const v = this.toNumberOrError(evalScalar(args[0]));
                return typeof v === 'string' ? v : finiteOrNumError(Math.floor(normalizeCompareFloat15(v)));
            }
            case 'ABS': {
                const v = this.toNumberOrError(evalScalar(args[0]));
                return typeof v === 'string' ? v : finiteOrNumError(Math.abs(v));
            }
            case 'SQRT': {
                const v = this.toNumberOrError(evalScalar(args[0]));
                if (typeof v === 'string') return v;
                return v < 0 ? '#NUM!' : finiteOrNumError(Math.sqrt(v));
            }
            case 'POWER': {
                const base = this.toNumberOrError(evalScalar(args[0]));
                if (typeof base === 'string') return base;
                const exp = this.toNumberOrError(isArgProvided(1) ? evalScalar(args[1]) : 1);
                if (typeof exp === 'string') return exp;
                return finiteOrNumError(Math.pow(base, exp));
            }
            case 'MOD': {
                const n = this.toNumberOrError(evalScalar(args[0]));
                if (typeof n === 'string') return n;
                const d = this.toNumberOrError(isArgProvided(1) ? evalScalar(args[1]) : 1);
                if (typeof d === 'string') return d;
                if (d === 0) return '#DIV/0!';
                // Excel MOD uses floored division: MOD(-1, 3) -> 2; MOD(0.3, 0.1) -> 0; MOD(100000000000001, 1e14) -> 1
                const q = Math.floor(normalizeCompareFloat15(n / d));
                const modVal = normalizeCompareFloat15(normalizeCompareFloat15(n) - normalizeCompareFloat15(d * q));
                return finiteOrNumError(modVal);
            }
            case 'IF': {
                const cond = evalScalar(args[0]);
                if (this.isErrorValue(cond)) return cond;
                const truthy = this.toBooleanOrError(cond);
                if (typeof truthy === 'string') return truthy;
                if (truthy) {
                    return isArgProvided(1) ? (evalScalar(args[1]) ?? 0) : (args.length >= 2 ? 0 : true);
                }
                return isArgProvided(2) ? (evalScalar(args[2]) ?? 0) : (args.length >= 3 ? 0 : false);
            }
            case 'IFS': {
                for (let i = 0; i + 1 < args.length; i += 2) {
                    const cond = evalScalar(args[i]);
                    if (this.isErrorValue(cond)) return cond;
                    const truthy = this.toBooleanOrError(cond);
                    if (typeof truthy === 'string') return truthy;
                    if (truthy) {
                        return evalScalar(args[i + 1]);
                    }
                }
                return '#N/A';
            }
            case 'IFERROR': {
                const primary = evalScalar(args[0]);
                // Item 15 & R6-9: Never allow IFERROR to mask viewer-scoped access denial or unimplemented dynamic arrays
                if (primary === '#MJ_ACCESS_DENIED!' || primary === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                    return primary;
                }
                if (this.isErrorValue(primary)) {
                    return evalScalar(args[1]) ?? '';
                }
                return primary;
            }
            case 'IFNA': {
                // Catches #N/A ONLY (distinct from IFERROR!)
                const primary = evalScalar(args[0]);
                if (primary === '#MJ_ACCESS_DENIED!' || primary === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                    return primary;
                }
                if (primary === '#N/A') {
                    return evalScalar(args[1]) ?? '';
                }
                return primary;
            }
            case 'AND': {
                let sawBoolean = false;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    const vals = isDirectRangeOrRef(arg)
                        ? resolveNonBlankRangeValues(arg, true)
                        : nodeContainsArray(arg)
                          ? resolveFlattenedRange(arg)
                          : [evalScalar(arg)];
                    for (const v of vals) {
                        if (this.isErrorValue(v)) return v;
                        if (v === null || v === undefined || (typeof v === 'string' && isDirectRangeOrRef(arg))) continue;
                        const b = this.toBooleanOrError(v);
                        if (typeof b === 'string') return b;
                        sawBoolean = true;
                        if (!b) return false;
                    }
                }
                return sawBoolean ? true : '#VALUE!';
            }
            case 'OR': {
                let sawBoolean = false;
                for (const arg of args) {
                    if (arg.kind === 'EmptyArg') continue;
                    const vals = isDirectRangeOrRef(arg)
                        ? resolveNonBlankRangeValues(arg, true)
                        : nodeContainsArray(arg)
                          ? resolveFlattenedRange(arg)
                          : [evalScalar(arg)];
                    for (const v of vals) {
                        if (this.isErrorValue(v)) return v;
                        if (v === null || v === undefined || (typeof v === 'string' && isDirectRangeOrRef(arg))) continue;
                        const b = this.toBooleanOrError(v);
                        if (typeof b === 'string') return b;
                        sawBoolean = true;
                        if (b) return true;
                    }
                }
                return sawBoolean ? false : '#VALUE!';
            }
            case 'NOT': {
                const v = evalScalar(args[0]);
                if (this.isErrorValue(v)) return v;
                const b = this.toBooleanOrError(v);
                return typeof b === 'string' ? b : !b;
            }
            case 'NA': {
                if (args.length > 0) return '#VALUE!';
                return '#N/A';
            }
            case 'ISBLANK': {
                const v = evalScalar(args[0]);
                if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                return v === null || v === undefined;
            }
            case 'ISNUMBER': {
                const v = evalScalar(args[0]);
                if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                return typeof v === 'number' && !Number.isNaN(v);
            }
            case 'ISTEXT': {
                const v = evalScalar(args[0]);
                if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                return typeof v === 'string' && !this.isErrorValue(v);
            }
            case 'ISERROR': {
                const v = evalScalar(args[0]);
                if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                return this.isErrorValue(v);
            }
            case 'ISERR': {
                const v = evalScalar(args[0]);
                if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                return this.isErrorValue(v) && v !== '#N/A';
            }
            case 'ISNA': {
                const v = evalScalar(args[0]);
                if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                return v === '#N/A';
            }
            case 'ERROR.TYPE': {
                const v = evalScalar(args[0]);
                if (v === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return v;
                switch (v) {
                    case '#NULL!':
                        return 1;
                    case '#DIV/0!':
                        return 2;
                    case '#VALUE!':
                        return 3;
                    case '#REF!':
                        return 4;
                    case '#NAME?':
                        return 5;
                    case '#NUM!':
                        return 6;
                    case '#N/A':
                        return 7;
                    default:
                        return '#N/A';
                }
            }
            case 'CONCAT':
            case 'CONCATENATE': {
                const parts: string[] = [];
                for (const arg of args) {
                    const vals = isDirectRangeOrRef(arg)
                        ? resolveNonBlankRangeValues(arg, true)
                        : nodeContainsArray(arg)
                          ? resolveFlattenedRange(arg)
                          : [evalScalar(arg)];
                    for (const v of vals) {
                        if (this.isErrorValue(v)) return v;
                        if (v !== null && v !== undefined) {
                            parts.push(typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v));
                        }
                    }
                }
                return this.joinCappedStrings(parts, '');
            }
            case 'UPPER': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').toUpperCase();
            }
            case 'LOWER': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').toLowerCase();
            }
            case 'TRIM': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').trim().replace(/\s+/g, ' ');
            }
            case 'LEN': {
                const v = evalScalar(args[0]);
                return this.isErrorValue(v) ? v : String(v ?? '').length;
            }
            case 'LEFT': {
                const rawText = evalScalar(args[0]);
                if (this.isErrorValue(rawText)) return rawText;
                const text = String(rawText ?? '');
                let len = 1;
                if (isArgProvided(1)) {
                    const lenNum = this.toNumberOrError(evalScalar(args[1]));
                    if (typeof lenNum === 'string') return lenNum;
                    if (lenNum < 0) return '#VALUE!';
                    len = Math.trunc(lenNum);
                }
                return text.slice(0, len);
            }
            case 'RIGHT': {
                const rawText = evalScalar(args[0]);
                if (this.isErrorValue(rawText)) return rawText;
                const text = String(rawText ?? '');
                let len = 1;
                if (isArgProvided(1)) {
                    const lenNum = this.toNumberOrError(evalScalar(args[1]));
                    if (typeof lenNum === 'string') return lenNum;
                    if (lenNum < 0) return '#VALUE!';
                    len = Math.trunc(lenNum);
                }
                return len === 0 ? '' : text.slice(-len);
            }
            case 'MID': {
                const rawText = evalScalar(args[0]);
                if (this.isErrorValue(rawText)) return rawText;
                const startNum = this.toNumberOrError(evalScalar(args[1]));
                if (typeof startNum === 'string') return startNum;
                const lenNum = this.toNumberOrError(evalScalar(args[2]));
                if (typeof lenNum === 'string') return lenNum;
                const start = Math.trunc(startNum);
                const len = Math.trunc(lenNum);
                if (start < 1 || len < 0) return '#VALUE!';
                return String(rawText ?? '').slice(start - 1, start - 1 + len);
            }
            case 'TEXT': {
                const val = evalScalar(args[0]);
                if (this.isErrorValue(val)) return val;
                const fmtVal = evalScalar(args[1]);
                if (this.isErrorValue(fmtVal)) return fmtVal;
                return this.formatValueWithCustomPattern(val, String(fmtVal ?? ''));
            }
            case 'COUNTIF':
            case 'SUMIF':
            case 'AVERAGEIF': {
                const criteria = evalScalar(args[1]);
                if (criteria === '#MJ_ACCESS_DENIED!' || criteria === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return criteria;
                if (this.isErrorValue(criteria) && args[1]?.kind !== 'StringLiteral') return criteria;
                const desc0 = this.resolveAstRangeDescriptor(args[0], workbook, sheet, true);
                if (desc0 === '#REF!') return '#REF!';
                const desc2 =
                    fnName !== 'COUNTIF' && isArgProvided(2)
                        ? this.resolveAstRangeDescriptor(args[2], workbook, sheet, true)
                        : desc0;
                if (desc2 === '#REF!') return '#REF!';

                if (desc0 && desc2) {
                    const area = (desc0.endRow - desc0.startRow + 1) * (desc0.endCol - desc0.startCol + 1);
                    if (area > 4096) {
                        const cellKeys0 = Object.keys(desc0.targetSheet.Cells);
                        const populatedOffsets: Array<{ dr: number; dc: number; cv: SpreadsheetCellValue }> = [];
                        for (let k = 0; k < cellKeys0.length; k++) {
                            const pos = parseCellCoordsFast(cellKeys0[k]);
                            if (
                                pos &&
                                pos.row >= desc0.startRow &&
                                pos.row <= desc0.endRow &&
                                pos.col >= desc0.startCol &&
                                pos.col <= desc0.endCol
                            ) {
                                const cv = getCellVal(desc0.targetSheet, FormatCellAddress(pos.row, pos.col));
                                if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return cv;
                                populatedOffsets.push({
                                    dr: pos.row - desc0.startRow,
                                    dc: pos.col - desc0.startCol,
                                    cv
                                });
                            }
                        }
                        if (populatedOffsets.length > 1) {
                            populatedOffsets.sort((a, b) => a.dr - b.dr || a.dc - b.dc);
                        }
                        const blankMatches = this.matchesCriteria(null, criteria);
                        let sum = 0;
                        let matchCount = blankMatches ? area - populatedOffsets.length : 0;
                        let numericCount = 0;
                        for (let i = 0; i < populatedOffsets.length; i++) {
                            const entry = populatedOffsets[i];
                            if (this.matchesCriteria(entry.cv, criteria)) {
                                matchCount++;
                                if (fnName !== 'COUNTIF') {
                                    const tv = getCellVal(
                                        desc2.targetSheet,
                                        FormatCellAddress(desc2.startRow + entry.dr, desc2.startCol + entry.dc)
                                    );
                                    if (tv === '#MJ_ACCESS_DENIED!' || tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return tv;
                                    if (this.isErrorValue(tv)) return tv;
                                    if (typeof tv === 'number' && !Number.isNaN(tv)) {
                                        sum += tv;
                                        numericCount++;
                                    }
                                }
                            }
                        }
                        if (blankMatches && fnName !== 'COUNTIF') {
                            const populatedDrDc = new Set(populatedOffsets.map((p) => `${p.dr}:${p.dc}`));
                            for (const addr2 of Object.keys(desc2.targetSheet.Cells)) {
                                const pos2 = parseCellCoordsFast(addr2);
                                if (!pos2) continue;
                                const dr = pos2.row - desc2.startRow;
                                const dc = pos2.col - desc2.startCol;
                                if (
                                    dr >= 0 &&
                                    dr <= desc0.endRow - desc0.startRow &&
                                    dc >= 0 &&
                                    dc <= desc0.endCol - desc0.startCol &&
                                    !populatedDrDc.has(`${dr}:${dc}`)
                                ) {
                                    const tv = getCellVal(desc2.targetSheet, FormatCellAddress(pos2.row, pos2.col));
                                    if (tv === '#MJ_ACCESS_DENIED!' || tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return tv;
                                    if (this.isErrorValue(tv)) return tv;
                                    if (typeof tv === 'number' && !Number.isNaN(tv)) {
                                        sum += tv;
                                        numericCount++;
                                    }
                                }
                            }
                        }
                        if (fnName === 'COUNTIF') return matchCount;
                        if (fnName === 'AVERAGEIF') {
                            return numericCount === 0 ? '#DIV/0!' : finiteOrNumError(sum / numericCount);
                        }
                        return finiteOrNumError(sum);
                    }

                    // Dense direct-descriptor path (<= 4096): only inspect target cell when criteria matched!
                    const rowSpan = desc0.endRow - desc0.startRow + 1;
                    const colSpan = desc0.endCol - desc0.startCol + 1;
                    let sum = 0;
                    let matchCount = 0;
                    let numericCount = 0;
                    for (let dr = 0; dr < rowSpan; dr++) {
                        for (let dc = 0; dc < colSpan; dc++) {
                            const cv = getCellVal(
                                desc0.targetSheet,
                                FormatCellAddress(desc0.startRow + dr, desc0.startCol + dc)
                            );
                            if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return cv;
                            if (this.matchesCriteria(cv, criteria)) {
                                matchCount++;
                                if (fnName !== 'COUNTIF') {
                                    const tv = getCellVal(
                                        desc2.targetSheet,
                                        FormatCellAddress(desc2.startRow + dr, desc2.startCol + dc)
                                    );
                                    if (tv === '#MJ_ACCESS_DENIED!' || tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return tv;
                                    if (this.isErrorValue(tv)) return tv;
                                    if (typeof tv === 'number' && !Number.isNaN(tv)) {
                                        sum += tv;
                                        numericCount++;
                                    }
                                }
                            }
                        }
                    }
                    if (fnName === 'COUNTIF') return matchCount;
                    if (fnName === 'AVERAGEIF') {
                        return numericCount === 0 ? '#DIV/0!' : finiteOrNumError(sum / numericCount);
                    }
                    return finiteOrNumError(sum);
                }

                const criteriaRange = resolveFlattenedRange(args[0]);
                const targetRange =
                    fnName !== 'COUNTIF' && isArgProvided(2) ? resolveFlattenedRange(args[2]) : criteriaRange;
                for (const cv of criteriaRange) {
                    if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return cv;
                }
                let sum = 0;
                let matchCount = 0;
                let numericCount = 0;
                for (let i = 0; i < criteriaRange.length; i++) {
                    if (this.matchesCriteria(criteriaRange[i], criteria)) {
                        matchCount++;
                        if (fnName !== 'COUNTIF') {
                            const tv = targetRange[i];
                            if (tv === '#MJ_ACCESS_DENIED!' || tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return tv;
                            if (this.isErrorValue(tv)) return tv;
                            if (typeof tv === 'number' && !Number.isNaN(tv)) {
                                sum += tv;
                                numericCount++;
                            }
                        }
                    }
                }
                if (fnName === 'COUNTIF') return matchCount;
                if (fnName === 'AVERAGEIF') {
                    return numericCount === 0 ? '#DIV/0!' : finiteOrNumError(sum / numericCount);
                }
                return finiteOrNumError(sum);
            }
            case 'COUNTIFS': {
                if (args.length < 2 || args.length % 2 !== 0) return '#VALUE!';
                const descPairs: Array<{
                    desc: { targetSheet: WorksheetSpec; startRow: number; endRow: number; startCol: number; endCol: number };
                    crit: SpreadsheetCellValue;
                }> = [];
                let allDirectDescriptors = true;
                for (let i = 0; i < args.length; i += 2) {
                    const d = this.resolveAstRangeDescriptor(args[i], workbook, sheet, true);
                    if (d === '#REF!') return '#REF!';
                    if (!d) {
                        allDirectDescriptors = false;
                        break;
                    }
                    const crit = evalScalar(args[i + 1]);
                    if (crit === '#MJ_ACCESS_DENIED!' || crit === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return crit;
                    descPairs.push({ desc: d, crit });
                }

                const evalRowCriteriaOutcome = (
                    readCritVal: (pairIdx: number) => SpreadsheetCellValue
                ): 'match' | 'nomatch' | '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL => {
                    let matched = true;
                    let rowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                    for (let pIdx = 0; pIdx < descPairs.length; pIdx++) {
                        const cv = readCritVal(pIdx);
                        if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (rowTaint === null || cv === '#MJ_ACCESS_DENIED!') {
                                rowTaint = cv;
                            }
                            continue;
                        }
                        if (!this.matchesCriteria(cv, descPairs[pIdx].crit)) {
                            matched = false;
                            break;
                        }
                    }
                    if (!matched) return 'nomatch';
                    if (rowTaint !== null) return rowTaint;
                    return 'match';
                };

                if (allDirectDescriptors && descPairs.length > 0) {
                    const rowSpan = descPairs[0].desc.endRow - descPairs[0].desc.startRow + 1;
                    const colSpan = descPairs[0].desc.endCol - descPairs[0].desc.startCol + 1;
                    for (let pIdx = 1; pIdx < descPairs.length; pIdx++) {
                        const d = descPairs[pIdx].desc;
                        if (d.endRow - d.startRow + 1 !== rowSpan || d.endCol - d.startCol + 1 !== colSpan) {
                            return '#VALUE!';
                        }
                    }
                    const totalCells = rowSpan * colSpan;
                    if (totalCells > 2048) {
                        const coordMap = new Map<number, { dr: number; dc: number }>();
                        for (const p of descPairs) {
                            const d = p.desc;
                            const keys = Object.keys(d.targetSheet.Cells);
                            for (let k = 0; k < keys.length; k++) {
                                const pos = parseCellCoordsFast(keys[k]);
                                if (
                                    pos &&
                                    pos.row >= d.startRow &&
                                    pos.row <= d.endRow &&
                                    pos.col >= d.startCol &&
                                    pos.col <= d.endCol
                                ) {
                                    const dr = pos.row - d.startRow;
                                    const dc = pos.col - d.startCol;
                                    const offsetKey = dr * colSpan + dc;
                                    if (!coordMap.has(offsetKey)) {
                                        coordMap.set(offsetKey, { dr, dc });
                                    }
                                }
                            }
                        }
                        const sortedCoords = Array.from(coordMap.values());
                        if (sortedCoords.length > 1) {
                            sortedCoords.sort((a, b) => a.dr - b.dr || a.dc - b.dc);
                        }
                        const allCritMatchBlank = descPairs.every((p) => this.matchesCriteria(null, p.crit));
                        let populatedMatches = 0;
                        for (let cIdx = 0; cIdx < sortedCoords.length; cIdx++) {
                            const coord = sortedCoords[cIdx];
                            const outcome = evalRowCriteriaOutcome((pIdx) => {
                                const pd = descPairs[pIdx].desc;
                                return getCellVal(
                                    pd.targetSheet,
                                    FormatCellAddress(pd.startRow + coord.dr, pd.startCol + coord.dc)
                                );
                            });
                            if (outcome === '#MJ_ACCESS_DENIED!' || outcome === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                return outcome;
                            }
                            if (outcome === 'match') populatedMatches++;
                        }
                        return populatedMatches + (allCritMatchBlank ? totalCells - coordMap.size : 0);
                    }

                    let matches = 0;
                    for (let dr = 0; dr < rowSpan; dr++) {
                        for (let dc = 0; dc < colSpan; dc++) {
                            const outcome = evalRowCriteriaOutcome((pIdx) => {
                                const pd = descPairs[pIdx].desc;
                                return getCellVal(pd.targetSheet, FormatCellAddress(pd.startRow + dr, pd.startCol + dc));
                            });
                            if (outcome === '#MJ_ACCESS_DENIED!' || outcome === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                return outcome;
                            }
                            if (outcome === 'match') matches++;
                        }
                    }
                    return matches;
                }

                const pairs: Array<{ range: SpreadsheetCellValue[]; crit: SpreadsheetCellValue }> = [];
                for (let i = 0; i < args.length; i += 2) {
                    const r = resolveFlattenedRange(args[i]);
                    if (r.length === 1 && (r[0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || r[0] === '#MJ_ACCESS_DENIED!')) {
                        return r[0];
                    }
                    const c = evalScalar(args[i + 1]);
                    if (c === '#MJ_ACCESS_DENIED!' || c === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return c;
                    if (pairs.length > 0 && r.length !== pairs[0].range.length) return '#VALUE!';
                    pairs.push({ range: r, crit: c });
                }
                const len = pairs[0].range.length;
                let matches = 0;
                for (let idx = 0; idx < len; idx++) {
                    let matched = true;
                    let rowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                    for (const p of pairs) {
                        const cv = p.range[idx];
                        if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (rowTaint === null || cv === '#MJ_ACCESS_DENIED!') {
                                rowTaint = cv;
                            }
                            continue;
                        }
                        if (!this.matchesCriteria(cv, p.crit)) {
                            matched = false;
                            break;
                        }
                    }
                    if (!matched) continue;
                    if (rowTaint !== null) return rowTaint;
                    matches++;
                }
                return matches;
            }
            case 'SUMIFS':
            case 'AVERAGEIFS': {
                if (args.length < 3 || (args.length - 1) % 2 !== 0) return '#VALUE!';
                const targetDesc = this.resolveAstRangeDescriptor(args[0], workbook, sheet, true);
                if (targetDesc === '#REF!') return '#REF!';
                const critDescPairs: Array<{
                    desc: { targetSheet: WorksheetSpec; startRow: number; endRow: number; startCol: number; endCol: number };
                    crit: SpreadsheetCellValue;
                }> = [];
                let allDirect = Boolean(targetDesc);
                if (allDirect) {
                    for (let i = 1; i < args.length; i += 2) {
                        const d = this.resolveAstRangeDescriptor(args[i], workbook, sheet, true);
                        if (d === '#REF!') return '#REF!';
                        if (!d) {
                            allDirect = false;
                            break;
                        }
                        const c = evalScalar(args[i + 1]);
                        if (c === '#MJ_ACCESS_DENIED!' || c === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return c;
                        critDescPairs.push({ desc: d, crit: c });
                    }
                }
                if (allDirect && targetDesc) {
                    const rowSpan = targetDesc.endRow - targetDesc.startRow + 1;
                    const colSpan = targetDesc.endCol - targetDesc.startCol + 1;
                    for (const p of critDescPairs) {
                        if (
                            p.desc.endRow - p.desc.startRow + 1 !== rowSpan ||
                            p.desc.endCol - p.desc.startCol + 1 !== colSpan
                        ) {
                            return '#VALUE!';
                        }
                    }
                    const evalDirectRow = (
                        dr: number,
                        dc: number
                    ): 'match' | 'nomatch' | '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL => {
                        let matched = true;
                        let rowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                        for (let pIdx = 0; pIdx < critDescPairs.length; pIdx++) {
                            const pd = critDescPairs[pIdx].desc;
                            const cv = getCellVal(
                                pd.targetSheet,
                                FormatCellAddress(pd.startRow + dr, pd.startCol + dc)
                            );
                            if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                if (rowTaint === null || cv === '#MJ_ACCESS_DENIED!') {
                                    rowTaint = cv;
                                }
                                continue;
                            }
                            if (!this.matchesCriteria(cv, critDescPairs[pIdx].crit)) {
                                matched = false;
                                break;
                            }
                        }
                        if (!matched) return 'nomatch';
                        if (rowTaint !== null) return rowTaint;
                        return 'match';
                    };

                    const totalCells = rowSpan * colSpan;
                    if (totalCells > 2048) {
                        const coordMap = new Map<number, { dr: number; dc: number }>();
                        const allDescs = [targetDesc, ...critDescPairs.map((p) => p.desc)];
                        for (const d of allDescs) {
                            const keys = Object.keys(d.targetSheet.Cells);
                            for (let k = 0; k < keys.length; k++) {
                                const pos = parseCellCoordsFast(keys[k]);
                                if (
                                    pos &&
                                    pos.row >= d.startRow &&
                                    pos.row <= d.endRow &&
                                    pos.col >= d.startCol &&
                                    pos.col <= d.endCol
                                ) {
                                    const dr = pos.row - d.startRow;
                                    const dc = pos.col - d.startCol;
                                    const offsetKey = dr * colSpan + dc;
                                    if (!coordMap.has(offsetKey)) {
                                        coordMap.set(offsetKey, { dr, dc });
                                    }
                                }
                            }
                        }
                        const sortedCoords = Array.from(coordMap.values());
                        if (sortedCoords.length > 1) {
                            sortedCoords.sort((a, b) => a.dr - b.dr || a.dc - b.dc);
                        }
                        let sum = 0;
                        let numericCount = 0;
                        for (let cIdx = 0; cIdx < sortedCoords.length; cIdx++) {
                            const coord = sortedCoords[cIdx];
                            const outcome = evalDirectRow(coord.dr, coord.dc);
                            if (outcome === '#MJ_ACCESS_DENIED!' || outcome === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                return outcome;
                            }
                            if (outcome === 'match') {
                                const tv = getCellVal(
                                    targetDesc.targetSheet,
                                    FormatCellAddress(targetDesc.startRow + coord.dr, targetDesc.startCol + coord.dc)
                                );
                                if (tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(tv)) return tv;
                                if (typeof tv === 'number' && !Number.isNaN(tv)) {
                                    sum += tv;
                                    numericCount++;
                                }
                            }
                        }
                        if (fnName === 'AVERAGEIFS') {
                            return numericCount === 0 ? '#DIV/0!' : finiteOrNumError(sum / numericCount);
                        }
                        return finiteOrNumError(sum);
                    }

                    let sum = 0;
                    let numericCount = 0;
                    for (let dr = 0; dr < rowSpan; dr++) {
                        for (let dc = 0; dc < colSpan; dc++) {
                            const outcome = evalDirectRow(dr, dc);
                            if (outcome === '#MJ_ACCESS_DENIED!' || outcome === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                return outcome;
                            }
                            if (outcome === 'match') {
                                const tv = getCellVal(
                                    targetDesc.targetSheet,
                                    FormatCellAddress(targetDesc.startRow + dr, targetDesc.startCol + dc)
                                );
                                if (tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(tv)) return tv;
                                if (typeof tv === 'number' && !Number.isNaN(tv)) {
                                    sum += tv;
                                    numericCount++;
                                }
                            }
                        }
                    }
                    if (fnName === 'AVERAGEIFS') {
                        return numericCount === 0 ? '#DIV/0!' : finiteOrNumError(sum / numericCount);
                    }
                    return finiteOrNumError(sum);
                }

                const targetRange = resolveFlattenedRange(args[0]);
                if (targetRange.length === 1 && (targetRange[0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || targetRange[0] === '#MJ_ACCESS_DENIED!')) {
                    return targetRange[0];
                }
                const pairs: Array<{ range: SpreadsheetCellValue[]; crit: SpreadsheetCellValue }> = [];
                for (let i = 1; i < args.length; i += 2) {
                    const r = resolveFlattenedRange(args[i]);
                    if (r.length === 1 && (r[0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || r[0] === '#MJ_ACCESS_DENIED!')) {
                        return r[0];
                    }
                    const c = evalScalar(args[i + 1]);
                    if (c === '#MJ_ACCESS_DENIED!' || c === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return c;
                    if (r.length !== targetRange.length) return '#VALUE!';
                    pairs.push({ range: r, crit: c });
                }
                let sum = 0;
                let numericCount = 0;
                for (let idx = 0; idx < targetRange.length; idx++) {
                    let matched = true;
                    let rowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                    for (const p of pairs) {
                        const cv = p.range[idx];
                        if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (rowTaint === null || cv === '#MJ_ACCESS_DENIED!') {
                                rowTaint = cv;
                            }
                            continue;
                        }
                        if (!this.matchesCriteria(cv, p.crit)) {
                            matched = false;
                            break;
                        }
                    }
                    if (!matched) continue;
                    if (rowTaint !== null) return rowTaint;
                    const tv = targetRange[idx];
                    if (tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(tv)) return tv;
                    if (typeof tv === 'number' && !Number.isNaN(tv)) {
                        sum += tv;
                        numericCount++;
                    }
                }
                if (fnName === 'AVERAGEIFS') {
                    return numericCount === 0 ? '#DIV/0!' : finiteOrNumError(sum / numericCount);
                }
                return finiteOrNumError(sum);
            }
            case 'VLOOKUP': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;

                const colNum = this.toNumberOrError(evalScalar(args[2]));
                if (typeof colNum === 'string') return colNum;
                const colIdx = Math.trunc(colNum);

                let isApprox = true;
                if (isArgProvided(3)) {
                    const approxRaw = evalScalar(args[3]);
                    if (this.isErrorValue(approxRaw)) return approxRaw;
                    const approxBool = this.toBooleanOrError(approxRaw);
                    if (typeof approxBool === 'string') return approxBool;
                    isApprox = approxBool;
                }

                const desc = this.resolveAstRangeDescriptor(args[1], workbook, sheet, true);
                if (desc === '#REF!') return '#REF!';
                if (desc) {
                    if (colIdx < 1) return '#VALUE!';
                    const spanCols = desc.endCol - desc.startCol + 1;
                    if (colIdx > spanCols) return '#REF!';
                    const targetCol = desc.startCol + colIdx - 1;
                    const rowSpan = desc.endRow - desc.startRow + 1;

                    if (rowSpan > 2048) {
                        const populatedCol0: Array<{ row: number; val: SpreadsheetCellValue }> = [];
                        let lookupColTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                        const keys = Object.keys(desc.targetSheet.Cells);
                        for (let k = 0; k < keys.length; k++) {
                            const pos = parseCellCoordsFast(keys[k]);
                            if (
                                pos &&
                                pos.col === desc.startCol &&
                                pos.row >= desc.startRow &&
                                pos.row <= desc.endRow
                            ) {
                                const cv = getCellVal(desc.targetSheet, FormatCellAddress(pos.row, pos.col));
                                if (cv === '#MJ_ACCESS_DENIED!') {
                                    lookupColTaint = '#MJ_ACCESS_DENIED!';
                                    continue;
                                }
                                if (cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                    if (lookupColTaint !== '#MJ_ACCESS_DENIED!') {
                                        lookupColTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                                    }
                                    continue;
                                }
                                if (cv !== null && cv !== undefined) {
                                    populatedCol0.push({ row: pos.row, val: cv });
                                }
                            }
                        }
                        if (populatedCol0.length > 1) {
                            populatedCol0.sort((a, b) => a.row - b.row);
                        }
                        if (!isApprox) {
                            for (let i = 0; i < populatedCol0.length; i++) {
                                const candidate = populatedCol0[i].val;
                                if (candidate === null || this.isErrorValue(candidate)) continue;
                                if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                                    if (matchExcelWildcard(lookupVal, String(candidate))) {
                                        return getCellVal(desc.targetSheet, FormatCellAddress(populatedCol0[i].row, targetCol)) ?? null;
                                    }
                                } else if (this.strictLookupEqual(candidate, lookupVal)) {
                                    return getCellVal(desc.targetSheet, FormatCellAddress(populatedCol0[i].row, targetCol)) ?? null;
                                }
                            }
                            return lookupColTaint ?? '#N/A';
                        }

                        let bestHitRow = -1;
                        let bestHitVal: SpreadsheetCellValue = null;
                        for (let i = 0; i < populatedCol0.length; i++) {
                            const candidate = populatedCol0[i].val;
                            if (candidate === null || this.isErrorValue(candidate)) continue;
                            const cmp = this.compareSameTypeForLookup(candidate, lookupVal);
                            if (cmp !== null && cmp <= 0) {
                                if (bestHitRow === -1 || (this.compareSameTypeForLookup(candidate, bestHitVal) ?? -1) >= 0) {
                                    bestHitRow = populatedCol0[i].row;
                                    bestHitVal = candidate;
                                }
                            }
                        }
                        if (bestHitRow >= 0) {
                            return getCellVal(desc.targetSheet, FormatCellAddress(bestHitRow, targetCol)) ?? null;
                        }
                        return lookupColTaint ?? '#N/A';
                    }

                    // Dense direct-descriptor path (<= 2048): search ONLY lookup column, read ONLY matched return cell!
                    let lookupColTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                    if (!isApprox) {
                        for (let r = desc.startRow; r <= desc.endRow; r++) {
                            const candidate = getCellVal(desc.targetSheet, FormatCellAddress(r, desc.startCol));
                            if (candidate === '#MJ_ACCESS_DENIED!') {
                                lookupColTaint = '#MJ_ACCESS_DENIED!';
                                continue;
                            }
                            if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                if (lookupColTaint !== '#MJ_ACCESS_DENIED!') {
                                    lookupColTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                                }
                                continue;
                            }
                            if (candidate === null || this.isErrorValue(candidate)) continue;
                            if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                                if (matchExcelWildcard(lookupVal, String(candidate))) {
                                    return getCellVal(desc.targetSheet, FormatCellAddress(r, targetCol)) ?? null;
                                }
                            } else if (this.strictLookupEqual(candidate, lookupVal)) {
                                return getCellVal(desc.targetSheet, FormatCellAddress(r, targetCol)) ?? null;
                            }
                        }
                        return lookupColTaint ?? '#N/A';
                    }

                    let bestHitRow = -1;
                    let bestHitVal: SpreadsheetCellValue = null;
                    for (let r = desc.startRow; r <= desc.endRow; r++) {
                        const candidate = getCellVal(desc.targetSheet, FormatCellAddress(r, desc.startCol));
                        if (candidate === '#MJ_ACCESS_DENIED!') {
                            lookupColTaint = '#MJ_ACCESS_DENIED!';
                            continue;
                        }
                        if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (lookupColTaint !== '#MJ_ACCESS_DENIED!') {
                                lookupColTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                            }
                            continue;
                        }
                        if (candidate === null || this.isErrorValue(candidate)) continue;
                        const cmp = this.compareSameTypeForLookup(candidate, lookupVal);
                        if (cmp !== null && cmp <= 0) {
                            if (bestHitRow === -1 || (this.compareSameTypeForLookup(candidate, bestHitVal) ?? -1) >= 0) {
                                bestHitRow = r;
                                bestHitVal = candidate;
                            }
                        }
                    }
                    if (bestHitRow >= 0) {
                        return getCellVal(desc.targetSheet, FormatCellAddress(bestHitRow, targetCol)) ?? null;
                    }
                    return lookupColTaint ?? '#N/A';
                }

                const matrix = this.resolveAstRangeMatrix(args[1], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                if (
                    matrix.length === 1 &&
                    matrix[0]?.length === 1 &&
                    (matrix[0][0] === '#MJ_ACCESS_DENIED!' || matrix[0][0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL)
                ) {
                    return matrix[0][0];
                }
                if (colIdx < 1) return '#VALUE!';
                const maxCols = matrix[0]?.length ?? 0;
                if (colIdx > maxCols) return '#REF!';

                let lookupColTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                if (!isApprox) {
                    for (const row of matrix) {
                        const candidate = row[0] ?? null;
                        if (candidate === '#MJ_ACCESS_DENIED!') {
                            lookupColTaint = '#MJ_ACCESS_DENIED!';
                            continue;
                        }
                        if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (lookupColTaint !== '#MJ_ACCESS_DENIED!') {
                                lookupColTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                            }
                            continue;
                        }
                        if (candidate === null || this.isErrorValue(candidate)) continue;
                        if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                            if (matchExcelWildcard(lookupVal, String(candidate))) {
                                return row[colIdx - 1] ?? null;
                            }
                        } else if (this.strictLookupEqual(candidate, lookupVal)) {
                            return row[colIdx - 1] ?? null;
                        }
                    }
                    return lookupColTaint ?? '#N/A';
                }

                let bestRowIdx = -1;
                let bestVal: SpreadsheetCellValue = null;
                for (let r = 0; r < matrix.length; r++) {
                    const candidate = matrix[r][0] ?? null;
                    if (candidate === '#MJ_ACCESS_DENIED!') {
                        lookupColTaint = '#MJ_ACCESS_DENIED!';
                        continue;
                    }
                    if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                        if (lookupColTaint !== '#MJ_ACCESS_DENIED!') {
                            lookupColTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                        }
                        continue;
                    }
                    if (candidate === null || this.isErrorValue(candidate)) continue;
                    const cmp = this.compareSameTypeForLookup(candidate, lookupVal);
                    if (cmp !== null && cmp <= 0) {
                        if (bestRowIdx === -1) {
                            bestRowIdx = r;
                            bestVal = candidate;
                        } else {
                            const vsBest = this.compareSameTypeForLookup(candidate, bestVal);
                            if (vsBest !== null && vsBest >= 0) {
                                bestRowIdx = r;
                                bestVal = candidate;
                            }
                        }
                    }
                }
                return bestRowIdx >= 0 ? (matrix[bestRowIdx][colIdx - 1] ?? null) : (lookupColTaint ?? '#N/A');
            }
            case 'XLOOKUP': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;

                let matchMode = 0;
                if (isArgProvided(4)) {
                    const mm = this.toNumberOrError(evalScalar(args[4]));
                    if (typeof mm === 'string') return mm;
                    matchMode = Math.trunc(mm);
                }
                let searchMode = 1;
                if (isArgProvided(5)) {
                    const sm = this.toNumberOrError(evalScalar(args[5]));
                    if (typeof sm === 'string') return sm;
                    searchMode = Math.trunc(sm);
                }

                const lDesc = this.resolveAstRangeDescriptor(args[1], workbook, sheet, true);
                const rDesc = this.resolveAstRangeDescriptor(args[2], workbook, sheet, true);
                if (lDesc === '#REF!' || rDesc === '#REF!') return '#REF!';
                if (lDesc && rDesc) {
                    const lIs1D = lDesc.startRow === lDesc.endRow || lDesc.startCol === lDesc.endCol;
                    const rIs1D = rDesc.startRow === rDesc.endRow || rDesc.startCol === rDesc.endCol;
                    const lLen = Math.max(lDesc.endRow - lDesc.startRow + 1, lDesc.endCol - lDesc.startCol + 1);
                    const rLen = Math.max(rDesc.endRow - rDesc.startRow + 1, rDesc.endCol - rDesc.startCol + 1);
                    if (lIs1D && rIs1D && lLen === rLen && lLen > 2048) {
                        const lHorizontal = lDesc.startRow === lDesc.endRow && lDesc.endCol > lDesc.startCol;
                        const rHorizontal = rDesc.startRow === rDesc.endRow && rDesc.endCol > rDesc.startCol;
                        const hits: Array<{ offset: number; val: SpreadsheetCellValue }> = [];
                        let lookupTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                        const lKeys = Object.keys(lDesc.targetSheet.Cells);
                        for (let k = 0; k < lKeys.length; k++) {
                            const pos = parseCellCoordsFast(lKeys[k]);
                            if (
                                pos &&
                                pos.row >= lDesc.startRow &&
                                pos.row <= lDesc.endRow &&
                                pos.col >= lDesc.startCol &&
                                pos.col <= lDesc.endCol
                            ) {
                                const cv = getCellVal(lDesc.targetSheet, FormatCellAddress(pos.row, pos.col));
                                if (cv === '#MJ_ACCESS_DENIED!') {
                                    lookupTaint = '#MJ_ACCESS_DENIED!';
                                    continue;
                                }
                                if (cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                    if (lookupTaint !== '#MJ_ACCESS_DENIED!') {
                                        lookupTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                                    }
                                    continue;
                                }
                                if (cv !== null && cv !== undefined) {
                                    hits.push({
                                        offset: lHorizontal ? pos.col - lDesc.startCol : pos.row - lDesc.startRow,
                                        val: cv
                                    });
                                }
                            }
                        }
                        if (hits.length > 1) {
                            hits.sort((a, b) => (searchMode === -1 ? b.offset - a.offset : a.offset - b.offset));
                        }
                        const readReturnAt = (offset: number): SpreadsheetCellValue => {
                            const rr = rHorizontal ? rDesc.startRow : rDesc.startRow + offset;
                            const rc = rHorizontal ? rDesc.startCol + offset : rDesc.startCol;
                            return getCellVal(rDesc.targetSheet, FormatCellAddress(rr, rc)) ?? null;
                        };
                        for (let i = 0; i < hits.length; i++) {
                            const cand = hits[i].val;
                            if (cand === null || this.isErrorValue(cand)) continue;
                            if (matchMode === 2 && typeof lookupVal === 'string') {
                                if (matchExcelWildcard(lookupVal, String(cand))) return readReturnAt(hits[i].offset);
                            } else if (this.strictLookupEqual(cand, lookupVal)) {
                                return readReturnAt(hits[i].offset);
                            }
                        }
                        if (matchMode === -1 || matchMode === 1) {
                            let bestOffset = -1;
                            let bestVal: SpreadsheetCellValue = null;
                            for (let i = 0; i < hits.length; i++) {
                                const cand = hits[i].val;
                                if (cand === null || this.isErrorValue(cand)) continue;
                                const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                                if (cmp === null) continue;
                                if (matchMode === -1 && cmp < 0) {
                                    if (bestOffset === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) > 0) {
                                        bestOffset = hits[i].offset;
                                        bestVal = cand;
                                    }
                                } else if (matchMode === 1 && cmp > 0) {
                                    if (bestOffset === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) < 0) {
                                        bestOffset = hits[i].offset;
                                        bestVal = cand;
                                    }
                                }
                            }
                            if (bestOffset >= 0) return readReturnAt(bestOffset);
                        }
                        if (lookupTaint) return lookupTaint;
                        return isArgProvided(3) ? evalScalar(args[3]) : '#N/A';
                    }
                }

                const lookupArr = resolveFlattenedRange(args[1]);
                const returnArr = resolveFlattenedRange(args[2]);
                if (
                    lookupArr.length === 1 &&
                    (lookupArr[0] === '#MJ_ACCESS_DENIED!' || lookupArr[0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) &&
                    !isDirectRangeOrRef(args[1])
                ) {
                    return lookupArr[0];
                }
                if (
                    returnArr.length === 1 &&
                    (returnArr[0] === '#MJ_ACCESS_DENIED!' || returnArr[0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) &&
                    !isDirectRangeOrRef(args[2])
                ) {
                    return returnArr[0];
                }
                if (lookupArr.length === 0 || lookupArr.length !== returnArr.length) return '#VALUE!';

                const indices: number[] = [];
                if (searchMode === -1) {
                    for (let i = lookupArr.length - 1; i >= 0; i--) indices.push(i);
                } else {
                    for (let i = 0; i < lookupArr.length; i++) indices.push(i);
                }

                let lookupTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                for (const i of indices) {
                    const cand = lookupArr[i];
                    if (cand === '#MJ_ACCESS_DENIED!') {
                        lookupTaint = '#MJ_ACCESS_DENIED!';
                        continue;
                    }
                    if (cand === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                        if (lookupTaint !== '#MJ_ACCESS_DENIED!') {
                            lookupTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                        }
                        continue;
                    }
                    if (cand === null || this.isErrorValue(cand)) continue;
                    if (matchMode === 2 && typeof lookupVal === 'string') {
                        if (matchExcelWildcard(lookupVal, String(cand))) return returnArr[i] ?? null;
                    } else if (this.strictLookupEqual(cand, lookupVal)) {
                        return returnArr[i] ?? null;
                    }
                }

                if (matchMode === -1 || matchMode === 1) {
                    let bestIdx = -1;
                    let bestVal: SpreadsheetCellValue = null;
                    for (const i of indices) {
                        const cand = lookupArr[i];
                        if (cand === null || this.isErrorValue(cand)) continue;
                        const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                        if (cmp === null) continue;
                        if (matchMode === -1 && cmp < 0) {
                            if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) > 0) {
                                bestIdx = i;
                                bestVal = cand;
                            }
                        } else if (matchMode === 1 && cmp > 0) {
                            if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) < 0) {
                                bestIdx = i;
                                bestVal = cand;
                            }
                        }
                    }
                    if (bestIdx >= 0) return returnArr[bestIdx] ?? null;
                }

                if (lookupTaint) return lookupTaint;
                return isArgProvided(3) ? evalScalar(args[3]) : '#N/A';
            }
            case 'INDEX': {
                const desc = this.resolveAstRangeDescriptor(args[0], workbook, sheet, true);
                if (desc === '#REF!') return '#REF!';
                if (desc) {
                    const rows = desc.endRow - desc.startRow + 1;
                    const cols = desc.endCol - desc.startCol + 1;
                    if (rows <= 0 || cols <= 0) return '#REF!';
                    const firstNum = this.toNumberOrError(evalScalar(args[1]));
                    if (typeof firstNum === 'string') return firstNum;
                    const idx1 = Math.trunc(firstNum);
                    if (!isArgProvided(2)) {
                        if (rows === 1 && cols > 1) {
                            if (idx1 < 1 || idx1 > cols) return '#REF!';
                            return getCellVal(desc.targetSheet, FormatCellAddress(desc.startRow, desc.startCol + idx1 - 1));
                        }
                        if (idx1 < 1 || idx1 > rows) return '#REF!';
                        return getCellVal(desc.targetSheet, FormatCellAddress(desc.startRow + idx1 - 1, desc.startCol));
                    }
                    const secondNum = this.toNumberOrError(evalScalar(args[2]));
                    if (typeof secondNum === 'string') return secondNum;
                    const idx2 = Math.trunc(secondNum);
                    if (idx1 < 1 || idx2 < 1 || idx1 > rows || idx2 > cols) return '#REF!';
                    return getCellVal(desc.targetSheet, FormatCellAddress(desc.startRow + idx1 - 1, desc.startCol + idx2 - 1));
                }

                const matrix = this.resolveAstRangeMatrix(args[0], workbook, sheet, getCellVal, cellLookup, currentCellAddress, depth + 1, lexicalScope);
                const rows = matrix.length;
                const cols = matrix[0]?.length ?? 0;
                if (rows === 0 || cols === 0) return '#REF!';
                if (
                    rows === 1 &&
                    cols === 1 &&
                    (matrix[0][0] === '#REF!' ||
                        matrix[0][0] === '#MJ_ACCESS_DENIED!' ||
                        matrix[0][0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL)
                ) {
                    return matrix[0][0];
                }

                const firstNum = this.toNumberOrError(evalScalar(args[1]));
                if (typeof firstNum === 'string') return firstNum;
                const idx1 = Math.trunc(firstNum);

                if (!isArgProvided(2)) {
                    // 1D horizontal range (e.g. INDEX(B1:D1, 2)) indexes across columns when 3rd arg is omitted!
                    if (rows === 1 && cols > 1) {
                        if (idx1 < 1 || idx1 > cols) return '#REF!';
                        return matrix[0][idx1 - 1] ?? null;
                    }
                    if (idx1 < 1 || idx1 > rows) return '#REF!';
                    return matrix[idx1 - 1][0] ?? null;
                }

                const secondNum = this.toNumberOrError(evalScalar(args[2]));
                if (typeof secondNum === 'string') return secondNum;
                const idx2 = Math.trunc(secondNum);
                if (idx1 < 1 || idx2 < 1 || idx1 > rows || idx2 > cols) return '#REF!';
                return matrix[idx1 - 1][idx2 - 1] ?? null;
            }
            case 'MATCH': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;
                let matchType = 1;
                if (isArgProvided(2)) {
                    const mt = this.toNumberOrError(evalScalar(args[2]));
                    if (typeof mt === 'string') return mt;
                    matchType = Math.trunc(mt);
                }

                const desc = this.resolveAstRangeDescriptor(args[1], workbook, sheet, true);
                if (desc === '#REF!') return '#REF!';
                if (desc && (desc.startRow === desc.endRow || desc.startCol === desc.endCol)) {
                    const isHorizontal = desc.startRow === desc.endRow && desc.endCol > desc.startCol;
                    const spanLen = isHorizontal ? desc.endCol - desc.startCol + 1 : desc.endRow - desc.startRow + 1;
                    if (spanLen > 2048) {
                        const hits: Array<{ offset: number; val: SpreadsheetCellValue }> = [];
                        let lookupTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                        const keys = Object.keys(desc.targetSheet.Cells);
                        for (let k = 0; k < keys.length; k++) {
                            const pos = parseCellCoordsFast(keys[k]);
                            if (
                                pos &&
                                pos.row >= desc.startRow &&
                                pos.row <= desc.endRow &&
                                pos.col >= desc.startCol &&
                                pos.col <= desc.endCol
                            ) {
                                const cv = getCellVal(desc.targetSheet, FormatCellAddress(pos.row, pos.col));
                                if (cv === '#MJ_ACCESS_DENIED!') {
                                    lookupTaint = '#MJ_ACCESS_DENIED!';
                                    continue;
                                }
                                if (cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                    if (lookupTaint !== '#MJ_ACCESS_DENIED!') {
                                        lookupTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                                    }
                                    continue;
                                }
                                if (cv !== null && cv !== undefined) {
                                    hits.push({
                                        offset: isHorizontal ? pos.col - desc.startCol : pos.row - desc.startRow,
                                        val: cv
                                    });
                                }
                            }
                        }
                        if (hits.length > 1) {
                            hits.sort((a, b) => a.offset - b.offset);
                        }
                        if (matchType === 0) {
                            for (let i = 0; i < hits.length; i++) {
                                const cand = hits[i].val;
                                if (cand === null || this.isErrorValue(cand)) continue;
                                if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                                    if (matchExcelWildcard(lookupVal, String(cand))) return hits[i].offset + 1;
                                } else if (this.strictLookupEqual(cand, lookupVal)) {
                                    return hits[i].offset + 1;
                                }
                            }
                            return lookupTaint ?? '#N/A';
                        }
                        let bestOffset = -1;
                        let bestVal: SpreadsheetCellValue = null;
                        for (let i = 0; i < hits.length; i++) {
                            const cand = hits[i].val;
                            if (cand === null || this.isErrorValue(cand)) continue;
                            const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                            if (cmp === null) continue;
                            if (matchType > 0 && cmp <= 0) {
                                if (bestOffset === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) >= 0) {
                                    bestOffset = hits[i].offset;
                                    bestVal = cand;
                                }
                            } else if (matchType < 0 && cmp >= 0) {
                                if (bestOffset === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) <= 0) {
                                    bestOffset = hits[i].offset;
                                    bestVal = cand;
                                }
                            }
                        }
                        return bestOffset >= 0 ? bestOffset + 1 : (lookupTaint ?? '#N/A');
                    }
                }

                const vals = resolveFlattenedRange(args[1]);
                let lookupTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                for (const cand of vals) {
                    if (cand === '#MJ_ACCESS_DENIED!') {
                        lookupTaint = '#MJ_ACCESS_DENIED!';
                    } else if (cand === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL && lookupTaint !== '#MJ_ACCESS_DENIED!') {
                        lookupTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                    }
                }

                if (matchType === 0) {
                    for (let i = 0; i < vals.length; i++) {
                        const cand = vals[i];
                        if (cand === null || this.isErrorValue(cand)) continue;
                        if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                            if (matchExcelWildcard(lookupVal, String(cand))) return i + 1;
                        } else if (this.strictLookupEqual(cand, lookupVal)) {
                            return i + 1;
                        }
                    }
                    return lookupTaint ?? '#N/A';
                }

                let bestIdx = -1;
                let bestVal: SpreadsheetCellValue = null;
                for (let i = 0; i < vals.length; i++) {
                    const cand = vals[i];
                    if (cand === null || this.isErrorValue(cand)) continue;
                    const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                    if (cmp === null) continue;
                    if (matchType > 0 && cmp <= 0) {
                        if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) >= 0) {
                            bestIdx = i;
                            bestVal = cand;
                        }
                    } else if (matchType < 0 && cmp >= 0) {
                        if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) <= 0) {
                            bestIdx = i;
                            bestVal = cand;
                        }
                    }
                }
                return bestIdx >= 0 ? bestIdx + 1 : (lookupTaint ?? '#N/A');
            }
            case 'XMATCH': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;

                let matchMode = 0;
                if (isArgProvided(2)) {
                    const mm = this.toNumberOrError(evalScalar(args[2]));
                    if (typeof mm === 'string') return mm;
                    matchMode = Math.trunc(mm);
                }
                let searchMode = 1;
                if (isArgProvided(3)) {
                    const sm = this.toNumberOrError(evalScalar(args[3]));
                    if (typeof sm === 'string') return sm;
                    searchMode = Math.trunc(sm);
                }

                const desc = this.resolveAstRangeDescriptor(args[1], workbook, sheet, true);
                if (desc === '#REF!') return '#REF!';
                if (desc && (desc.startRow === desc.endRow || desc.startCol === desc.endCol)) {
                    const isHorizontal = desc.startRow === desc.endRow && desc.endCol > desc.startCol;
                    const spanLen = isHorizontal ? desc.endCol - desc.startCol + 1 : desc.endRow - desc.startRow + 1;
                    if (spanLen > 2048) {
                        const hits: Array<{ offset: number; val: SpreadsheetCellValue }> = [];
                        let lookupTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                        const keys = Object.keys(desc.targetSheet.Cells);
                        for (let k = 0; k < keys.length; k++) {
                            const pos = parseCellCoordsFast(keys[k]);
                            if (
                                pos &&
                                pos.row >= desc.startRow &&
                                pos.row <= desc.endRow &&
                                pos.col >= desc.startCol &&
                                pos.col <= desc.endCol
                            ) {
                                const cv = getCellVal(desc.targetSheet, FormatCellAddress(pos.row, pos.col));
                                if (cv === '#MJ_ACCESS_DENIED!') {
                                    lookupTaint = '#MJ_ACCESS_DENIED!';
                                    continue;
                                }
                                if (cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                    if (lookupTaint !== '#MJ_ACCESS_DENIED!') {
                                        lookupTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                                    }
                                    continue;
                                }
                                if (cv !== null && cv !== undefined) {
                                    hits.push({
                                        offset: isHorizontal ? pos.col - desc.startCol : pos.row - desc.startRow,
                                        val: cv
                                    });
                                }
                            }
                        }
                        if (hits.length > 1) {
                            hits.sort((a, b) => (searchMode === -1 ? b.offset - a.offset : a.offset - b.offset));
                        }
                        for (let i = 0; i < hits.length; i++) {
                            const cand = hits[i].val;
                            if (cand === null || this.isErrorValue(cand)) continue;
                            if (matchMode === 2 && typeof lookupVal === 'string') {
                                if (matchExcelWildcard(lookupVal, String(cand))) return hits[i].offset + 1;
                            } else if (this.strictLookupEqual(cand, lookupVal)) {
                                return hits[i].offset + 1;
                            }
                        }
                        if (matchMode === -1 || matchMode === 1) {
                            let bestOffset = -1;
                            let bestVal: SpreadsheetCellValue = null;
                            for (let i = 0; i < hits.length; i++) {
                                const cand = hits[i].val;
                                if (cand === null || this.isErrorValue(cand)) continue;
                                const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                                if (cmp === null) continue;
                                if (matchMode === -1 && cmp < 0) {
                                    if (bestOffset === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) > 0) {
                                        bestOffset = hits[i].offset;
                                        bestVal = cand;
                                    }
                                } else if (matchMode === 1 && cmp > 0) {
                                    if (bestOffset === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) < 0) {
                                        bestOffset = hits[i].offset;
                                        bestVal = cand;
                                    }
                                }
                            }
                            if (bestOffset >= 0) return bestOffset + 1;
                        }
                        return lookupTaint ?? '#N/A';
                    }
                }

                const lookupArr = resolveFlattenedRange(args[1]);
                if (lookupArr.length === 0) return '#VALUE!';
                let lookupTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                for (const cand of lookupArr) {
                    if (cand === '#MJ_ACCESS_DENIED!') {
                        lookupTaint = '#MJ_ACCESS_DENIED!';
                    } else if (cand === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL && lookupTaint !== '#MJ_ACCESS_DENIED!') {
                        lookupTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                    }
                }

                const indices: number[] = [];
                if (searchMode === -1) {
                    for (let i = lookupArr.length - 1; i >= 0; i--) indices.push(i);
                } else {
                    for (let i = 0; i < lookupArr.length; i++) indices.push(i);
                }

                for (const i of indices) {
                    const cand = lookupArr[i];
                    if (cand === null || this.isErrorValue(cand)) continue;
                    if (matchMode === 2 && typeof lookupVal === 'string') {
                        if (matchExcelWildcard(lookupVal, String(cand))) return i + 1;
                    } else if (this.strictLookupEqual(cand, lookupVal)) {
                        return i + 1;
                    }
                }

                if (matchMode === -1 || matchMode === 1) {
                    let bestIdx = -1;
                    let bestVal: SpreadsheetCellValue = null;
                    for (const i of indices) {
                        const cand = lookupArr[i];
                        if (cand === null || this.isErrorValue(cand)) continue;
                        const cmp = this.compareSameTypeForLookup(cand, lookupVal);
                        if (cmp === null) continue;
                        if (matchMode === -1 && cmp < 0) {
                            if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? -1) > 0) {
                                bestIdx = i;
                                bestVal = cand;
                            }
                        } else if (matchMode === 1 && cmp > 0) {
                            if (bestIdx === -1 || (this.compareSameTypeForLookup(cand, bestVal) ?? 1) < 0) {
                                bestIdx = i;
                                bestVal = cand;
                            }
                        }
                    }
                    if (bestIdx >= 0) return bestIdx + 1;
                }
                return lookupTaint ?? '#N/A';
            }
            case 'TODAY': {
                const now = new Date();
                return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS;
            }
            case 'NOW': {
                return finiteOrNumError(Date.now() / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS);
            }
            case 'DATE': {
                const y = this.toNumberOrError(evalScalar(args[0]));
                if (typeof y === 'string') return y;
                const m = this.toNumberOrError(evalScalar(args[1]));
                if (typeof m === 'string') return m;
                const d = this.toNumberOrError(evalScalar(args[2]));
                if (typeof d === 'string') return d;
                const yi = Math.trunc(y);
                const fullYear = yi >= 0 && yi < 1900 ? 1900 + yi : yi;
                if (fullYear < 1900 || fullYear > 9999) return '#NUM!';
                const utcMs = Date.UTC(fullYear, Math.trunc(m) - 1, Math.trunc(d));
                return Math.round(utcMs / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
            }
            case 'YEAR':
            case 'MONTH':
            case 'DAY': {
                const serial = this.toExcelDateSerialOrError(evalScalar(args[0]));
                if (typeof serial === 'string') return serial;
                const dt = excelSerialToUtcDate(serial);
                if (fnName === 'YEAR') return dt.getUTCFullYear();
                if (fnName === 'MONTH') return dt.getUTCMonth() + 1;
                return dt.getUTCDate();
            }
            case 'DAYS': {
                const endSerial = this.toExcelDateSerialOrError(evalScalar(args[0]));
                if (typeof endSerial === 'string') return endSerial;
                const startSerial = this.toExcelDateSerialOrError(evalScalar(args[1]));
                if (typeof startSerial === 'string') return startSerial;
                return Math.trunc(endSerial) - Math.trunc(startSerial);
            }
            case 'EDATE':
            case 'EOMONTH': {
                const startSerial = this.toExcelDateSerialOrError(evalScalar(args[0]));
                if (typeof startSerial === 'string') return startSerial;
                const monthsNum = this.toNumberOrError(evalScalar(args[1]));
                if (typeof monthsNum === 'string') return monthsNum;
                const dt = excelSerialToUtcDate(startSerial);
                const y = dt.getUTCFullYear();
                const m0 = dt.getUTCMonth() + Math.trunc(monthsNum);
                if (fnName === 'EOMONTH') {
                    return Math.round(Date.UTC(y, m0 + 1, 0) / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
                }
                const lastDayOfTarget = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
                const day = Math.min(dt.getUTCDate(), lastDayOfTarget);
                return Math.round(Date.UTC(y, m0, day) / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
            }
            case 'HLOOKUP': {
                const lookupVal = evalScalar(args[0]);
                if (this.isErrorValue(lookupVal)) return lookupVal;
                const rowNum = this.toNumberOrError(evalScalar(args[2]));
                if (typeof rowNum === 'string') return rowNum;
                const rowIdx = Math.trunc(rowNum);

                let isApprox = true;
                if (isArgProvided(3)) {
                    const approxRaw = evalScalar(args[3]);
                    if (this.isErrorValue(approxRaw)) return approxRaw;
                    const approxBool = this.toBooleanOrError(approxRaw);
                    if (typeof approxBool === 'string') return approxBool;
                    isApprox = approxBool;
                }

                const desc = this.resolveAstRangeDescriptor(args[1], workbook, sheet, true);
                if (desc === '#REF!') return '#REF!';
                if (desc) {
                    if (rowIdx < 1) return '#VALUE!';
                    const spanRows = desc.endRow - desc.startRow + 1;
                    if (rowIdx > spanRows) return '#REF!';
                    const targetRow = desc.startRow + rowIdx - 1;
                    const colSpan = desc.endCol - desc.startCol + 1;

                    if (colSpan > 2048) {
                        const populatedRow0: Array<{ col: number; val: SpreadsheetCellValue }> = [];
                        let lookupRowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                        const keys = Object.keys(desc.targetSheet.Cells);
                        for (let k = 0; k < keys.length; k++) {
                            const pos = parseCellCoordsFast(keys[k]);
                            if (
                                pos &&
                                pos.row === desc.startRow &&
                                pos.col >= desc.startCol &&
                                pos.col <= desc.endCol
                            ) {
                                const cv = getCellVal(desc.targetSheet, FormatCellAddress(pos.row, pos.col));
                                if (cv === '#MJ_ACCESS_DENIED!') {
                                    lookupRowTaint = '#MJ_ACCESS_DENIED!';
                                    continue;
                                }
                                if (cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                    if (lookupRowTaint !== '#MJ_ACCESS_DENIED!') {
                                        lookupRowTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                                    }
                                    continue;
                                }
                                if (cv !== null && cv !== undefined) {
                                    populatedRow0.push({ col: pos.col, val: cv });
                                }
                            }
                        }
                        if (populatedRow0.length > 1) {
                            populatedRow0.sort((a, b) => a.col - b.col);
                        }
                        if (!isApprox) {
                            for (let i = 0; i < populatedRow0.length; i++) {
                                const candidate = populatedRow0[i].val;
                                if (candidate === null || this.isErrorValue(candidate)) continue;
                                if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                                    if (matchExcelWildcard(lookupVal, String(candidate))) {
                                        return getCellVal(desc.targetSheet, FormatCellAddress(targetRow, populatedRow0[i].col)) ?? null;
                                    }
                                } else if (this.strictLookupEqual(candidate, lookupVal)) {
                                    return getCellVal(desc.targetSheet, FormatCellAddress(targetRow, populatedRow0[i].col)) ?? null;
                                }
                            }
                            return lookupRowTaint ?? '#N/A';
                        }
                        let bestHitCol = -1;
                        let bestHitVal: SpreadsheetCellValue = null;
                        for (let i = 0; i < populatedRow0.length; i++) {
                            const candidate = populatedRow0[i].val;
                            if (candidate === null || this.isErrorValue(candidate)) continue;
                            const cmp = this.compareSameTypeForLookup(candidate, lookupVal);
                            if (cmp !== null && cmp <= 0) {
                                if (bestHitCol === -1 || (this.compareSameTypeForLookup(candidate, bestHitVal) ?? -1) >= 0) {
                                    bestHitCol = populatedRow0[i].col;
                                    bestHitVal = candidate;
                                }
                            }
                        }
                        if (bestHitCol >= 0) {
                            return getCellVal(desc.targetSheet, FormatCellAddress(targetRow, bestHitCol)) ?? null;
                        }
                        return lookupRowTaint ?? '#N/A';
                    }

                    let lookupRowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                    if (!isApprox) {
                        for (let c = desc.startCol; c <= desc.endCol; c++) {
                            const candidate = getCellVal(desc.targetSheet, FormatCellAddress(desc.startRow, c));
                            if (candidate === '#MJ_ACCESS_DENIED!') {
                                lookupRowTaint = '#MJ_ACCESS_DENIED!';
                                continue;
                            }
                            if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                if (lookupRowTaint !== '#MJ_ACCESS_DENIED!') {
                                    lookupRowTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                                }
                                continue;
                            }
                            if (candidate === null || this.isErrorValue(candidate)) continue;
                            if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                                if (matchExcelWildcard(lookupVal, String(candidate))) {
                                    return getCellVal(desc.targetSheet, FormatCellAddress(targetRow, c)) ?? null;
                                }
                            } else if (this.strictLookupEqual(candidate, lookupVal)) {
                                return getCellVal(desc.targetSheet, FormatCellAddress(targetRow, c)) ?? null;
                            }
                        }
                        return lookupRowTaint ?? '#N/A';
                    }

                    let bestHitCol = -1;
                    let bestHitVal: SpreadsheetCellValue = null;
                    for (let c = desc.startCol; c <= desc.endCol; c++) {
                        const candidate = getCellVal(desc.targetSheet, FormatCellAddress(desc.startRow, c));
                        if (candidate === '#MJ_ACCESS_DENIED!') {
                            lookupRowTaint = '#MJ_ACCESS_DENIED!';
                            continue;
                        }
                        if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (lookupRowTaint !== '#MJ_ACCESS_DENIED!') {
                                lookupRowTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                            }
                            continue;
                        }
                        if (candidate === null || this.isErrorValue(candidate)) continue;
                        const cmp = this.compareSameTypeForLookup(candidate, lookupVal);
                        if (cmp !== null && cmp <= 0) {
                            if (bestHitCol === -1 || (this.compareSameTypeForLookup(candidate, bestHitVal) ?? -1) >= 0) {
                                bestHitCol = c;
                                bestHitVal = candidate;
                            }
                        }
                    }
                    if (bestHitCol >= 0) {
                        return getCellVal(desc.targetSheet, FormatCellAddress(targetRow, bestHitCol)) ?? null;
                    }
                    return lookupRowTaint ?? '#N/A';
                }

                const matrix = this.resolveAstRangeMatrix(args[1], workbook, sheet, getCellVal, cellLookup, currentCellAddress);
                if (
                    matrix.length === 1 &&
                    matrix[0]?.length === 1 &&
                    (matrix[0][0] === '#MJ_ACCESS_DENIED!' || matrix[0][0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL)
                ) {
                    return matrix[0][0];
                }
                if (rowIdx < 1) return '#VALUE!';
                const maxRows = matrix.length;
                if (rowIdx > maxRows) return '#REF!';

                const headerRow = matrix[0] ?? [];
                let lookupRowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                if (!isApprox) {
                    for (let c = 0; c < headerRow.length; c++) {
                        const candidate = headerRow[c] ?? null;
                        if (candidate === '#MJ_ACCESS_DENIED!') {
                            lookupRowTaint = '#MJ_ACCESS_DENIED!';
                            continue;
                        }
                        if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (lookupRowTaint !== '#MJ_ACCESS_DENIED!') {
                                lookupRowTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                            }
                            continue;
                        }
                        if (candidate === null || this.isErrorValue(candidate)) continue;
                        if (typeof lookupVal === 'string' && hasExcelWildcard(lookupVal)) {
                            if (matchExcelWildcard(lookupVal, String(candidate))) {
                                return matrix[rowIdx - 1]?.[c] ?? null;
                            }
                        } else if (this.strictLookupEqual(candidate, lookupVal)) {
                            return matrix[rowIdx - 1]?.[c] ?? null;
                        }
                    }
                    return lookupRowTaint ?? '#N/A';
                }

                let bestColIdx = -1;
                let bestVal: SpreadsheetCellValue = null;
                for (let c = 0; c < headerRow.length; c++) {
                    const candidate = headerRow[c] ?? null;
                    if (candidate === '#MJ_ACCESS_DENIED!') {
                        lookupRowTaint = '#MJ_ACCESS_DENIED!';
                        continue;
                    }
                    if (candidate === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                        if (lookupRowTaint !== '#MJ_ACCESS_DENIED!') {
                            lookupRowTaint = UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
                        }
                        continue;
                    }
                    if (candidate === null || this.isErrorValue(candidate)) continue;
                    const cmp = this.compareSameTypeForLookup(candidate, lookupVal);
                    if (cmp !== null && cmp <= 0) {
                        if (bestColIdx === -1 || (this.compareSameTypeForLookup(candidate, bestVal) ?? -1) >= 0) {
                            bestColIdx = c;
                            bestVal = candidate;
                        }
                    }
                }
                return bestColIdx >= 0 ? (matrix[rowIdx - 1]?.[bestColIdx] ?? null) : (lookupRowTaint ?? '#N/A');
            }
            case 'ROW':
            case 'COLUMN': {
                if (!isArgProvided(0)) {
                    const selfPos = ParseCellAddress(currentCellAddress ?? 'A1');
                    if (!selfPos) return '#REF!';
                    return fnName === 'ROW' ? selfPos.row : selfPos.col;
                }
                const arg0 = args[0];
                if (arg0.kind === 'CellRef') {
                    const pos = ParseCellAddress(arg0.address);
                    if (!pos) return '#REF!';
                    return fnName === 'ROW' ? pos.row : pos.col;
                }
                if (arg0.kind === 'RangeRef') {
                    const pos = ParseCellAddress(arg0.startAddress);
                    if (pos) {
                        return fnName === 'ROW' ? pos.row : pos.col;
                    }
                    const bounds = ParseRangeAddress(
                        `${arg0.startAddress}:${arg0.endAddress}`,
                        sheet.Rows.length,
                        sheet.Columns.length
                    );
                    if (!bounds) return '#REF!';
                    return fnName === 'ROW' ? bounds.startRow : bounds.startCol;
                }
                if (arg0.kind === 'Identifier') {
                    const named = workbook.NamedRanges.find((nr) => nr.Name.toLowerCase() === arg0.name.toLowerCase());
                    if (named && named.Range !== '#REF!') {
                        const firstAddr = named.Range.split(':')[0] ?? named.Range;
                        const pos = ParseCellAddress(firstAddr);
                        if (pos) return fnName === 'ROW' ? pos.row : pos.col;
                    }
                    return '#REF!';
                }
                return '#VALUE!';
            }
            case 'ROWS':
            case 'COLUMNS': {
                if (!isArgProvided(0)) return '#VALUE!';
                const desc = this.resolveAstRangeDescriptor(args[0], workbook, sheet, true);
                if (desc === '#REF!') return '#REF!';
                if (desc) {
                    return fnName === 'ROWS'
                        ? desc.endRow - desc.startRow + 1
                        : desc.endCol - desc.startCol + 1;
                }
                const matrix = this.resolveAstRangeMatrix(args[0], workbook, sheet, getCellVal, cellLookup, currentCellAddress);
                if (matrix.length === 1 && matrix[0]?.length === 1 && this.isErrorValue(matrix[0][0])) {
                    return matrix[0][0];
                }
                return fnName === 'ROWS' ? matrix.length : (matrix[0]?.length ?? 0);
            }
            case 'PROPER': {
                const raw = evalScalar(args[0]);
                if (this.isErrorValue(raw)) return raw;
                return String(raw ?? '')
                    .toLowerCase()
                    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
            }
            case 'SUBSTITUTE': {
                const rawText = evalScalar(args[0]);
                if (this.isErrorValue(rawText)) return rawText;
                const rawOld = evalScalar(args[1]);
                if (this.isErrorValue(rawOld)) return rawOld;
                const rawNew = evalScalar(args[2]);
                if (this.isErrorValue(rawNew)) return rawNew;
                const text = String(rawText ?? '');
                const oldText = String(rawOld ?? '');
                const newText = String(rawNew ?? '');
                if (oldText === '') return text;
                if (!isArgProvided(3)) {
                    const parts = text.split(oldText);
                    return this.joinCappedStrings(parts, newText);
                }
                const instNumVal = this.toNumberOrError(evalScalar(args[3]));
                if (typeof instNumVal === 'string') return instNumVal;
                const instNum = Math.trunc(instNumVal);
                if (instNum < 1) return '#VALUE!';
                let occurrence = 0;
                let searchFrom = 0;
                while (searchFrom <= text.length) {
                    const foundAt = text.indexOf(oldText, searchFrom);
                    if (foundAt === -1) break;
                    occurrence++;
                    if (occurrence === instNum) {
                        const out = text.slice(0, foundAt) + newText + text.slice(foundAt + oldText.length);
                        return out.length > MAX_CELL_STRING_LENGTH ? '#VALUE!' : out;
                    }
                    searchFrom = foundAt + oldText.length;
                }
                return text;
            }
            case 'FIND':
            case 'SEARCH': {
                const rawFind = evalScalar(args[0]);
                if (this.isErrorValue(rawFind)) return rawFind;
                const rawWithin = evalScalar(args[1]);
                if (this.isErrorValue(rawWithin)) return rawWithin;
                let startNum = 1;
                if (isArgProvided(2)) {
                    const sn = this.toNumberOrError(evalScalar(args[2]));
                    if (typeof sn === 'string') return sn;
                    startNum = Math.trunc(sn);
                }
                const findText = String(rawFind ?? '');
                const withinText = String(rawWithin ?? '');
                if (startNum < 1 || startNum > withinText.length + 1) return '#VALUE!';
                if (findText === '') return startNum;
                if (fnName === 'FIND') {
                    const idx = withinText.indexOf(findText, startNum - 1);
                    return idx >= 0 ? idx + 1 : '#VALUE!';
                }
                return searchExcelWildcardLinear(findText, withinText, startNum);
            }
            case 'VALUE': {
                const raw = evalScalar(args[0]);
                if (this.isErrorValue(raw)) return raw;
                if (raw === null || raw === undefined) return 0;
                if (typeof raw === 'number') return Number.isFinite(raw) ? raw : '#VALUE!';
                if (typeof raw === 'boolean') return '#VALUE!';
                let s = raw.trim();
                if (!s) return '#VALUE!';
                let isNegative = false;
                if (s.startsWith('(') && s.endsWith(')')) {
                    isNegative = true;
                    s = s.slice(1, -1).trim();
                }
                let isPercent = false;
                if (s.endsWith('%')) {
                    isPercent = true;
                    s = s.slice(0, -1).trim();
                }
                if (s.startsWith('$')) {
                    s = s.slice(1).trim();
                } else if (s.startsWith('-$') || s.startsWith('+$')) {
                    if (s[0] === '-') isNegative = !isNegative;
                    s = s.slice(2).trim();
                }
                const withoutCommas = s.replace(/,/g, '');
                if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(withoutCommas)) {
                    let parsed = Number(withoutCommas);
                    if (isNegative) parsed = -parsed;
                    if (isPercent) parsed = parsed / 100;
                    return finiteOrNumError(parsed);
                }
                const serialOrErr = this.toExcelDateSerialOrError(raw);
                if (typeof serialOrErr === 'number') return serialOrErr;
                return '#VALUE!';
            }
            case 'SWITCH': {
                if (args.length < 3) return '#VALUE!';
                const expr = evalScalar(args[0]);
                if (this.isErrorValue(expr)) return expr;
                let idx = 1;
                while (idx + 1 < args.length) {
                    const caseVal = evalScalar(args[idx]);
                    if (this.isErrorValue(caseVal)) return caseVal;
                    if (this.compareValues(expr, caseVal, '=')) {
                        return evalScalar(args[idx + 1]);
                    }
                    idx += 2;
                }
                if (idx < args.length) {
                    return evalScalar(args[idx]);
                }
                return '#N/A';
            }
            case 'TEXTJOIN': {
                if (args.length < 3) return '#VALUE!';
                const delimVal = evalScalar(args[0]);
                if (this.isErrorValue(delimVal)) return delimVal;
                const delim = String(delimVal ?? '');
                const ignoreRaw = isArgProvided(1) ? evalScalar(args[1]) : true;
                if (this.isErrorValue(ignoreRaw)) return ignoreRaw;
                const ignoreEmpty = this.toBooleanOrError(ignoreRaw);
                if (typeof ignoreEmpty === 'string') return ignoreEmpty;
                const pieces: string[] = [];
                for (let aIdx = 2; aIdx < args.length; aIdx++) {
                    const arg = args[aIdx];
                    const items = isDirectRangeOrRef(arg)
                        ? (ignoreEmpty ? resolveNonBlankRangeValues(arg, true) : resolveFlattenedRange(arg))
                        : nodeContainsArray(arg)
                          ? resolveFlattenedRange(arg)
                          : [evalScalar(arg)];
                    for (const item of items) {
                        if (this.isErrorValue(item)) return item;
                        const s = item === null || item === undefined ? '' : typeof item === 'boolean' ? (item ? 'TRUE' : 'FALSE') : String(item);
                        if (ignoreEmpty && s === '') continue;
                        pieces.push(s);
                    }
                }
                return this.joinCappedStrings(pieces, delim);
            }
            case 'MAXIFS':
            case 'MINIFS': {
                if (args.length < 3 || (args.length - 1) % 2 !== 0) return '#VALUE!';
                const targetDesc = this.resolveAstRangeDescriptor(args[0], workbook, sheet, true);
                if (targetDesc === '#REF!') return '#REF!';
                const critDescPairs: Array<{
                    desc: { targetSheet: WorksheetSpec; startRow: number; endRow: number; startCol: number; endCol: number };
                    crit: SpreadsheetCellValue;
                }> = [];
                let allDirect = Boolean(targetDesc);
                if (allDirect) {
                    for (let i = 1; i < args.length; i += 2) {
                        const d = this.resolveAstRangeDescriptor(args[i], workbook, sheet, true);
                        if (d === '#REF!') return '#REF!';
                        if (!d) {
                            allDirect = false;
                            break;
                        }
                        const c = evalScalar(args[i + 1]);
                        if (c === '#MJ_ACCESS_DENIED!' || c === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return c;
                        critDescPairs.push({ desc: d, crit: c });
                    }
                }
                if (allDirect && targetDesc) {
                    const rowSpan = targetDesc.endRow - targetDesc.startRow + 1;
                    const colSpan = targetDesc.endCol - targetDesc.startCol + 1;
                    for (const p of critDescPairs) {
                        if (
                            p.desc.endRow - p.desc.startRow + 1 !== rowSpan ||
                            p.desc.endCol - p.desc.startCol + 1 !== colSpan
                        ) {
                            return '#VALUE!';
                        }
                    }
                    const evalDirectRow = (
                        dr: number,
                        dc: number
                    ): 'match' | 'nomatch' | '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL => {
                        let matched = true;
                        let rowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                        for (let pIdx = 0; pIdx < critDescPairs.length; pIdx++) {
                            const pd = critDescPairs[pIdx].desc;
                            const cv = getCellVal(
                                pd.targetSheet,
                                FormatCellAddress(pd.startRow + dr, pd.startCol + dc)
                            );
                            if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                if (rowTaint === null || cv === '#MJ_ACCESS_DENIED!') {
                                    rowTaint = cv;
                                }
                                continue;
                            }
                            if (!this.matchesCriteria(cv, critDescPairs[pIdx].crit)) {
                                matched = false;
                                break;
                            }
                        }
                        if (!matched) return 'nomatch';
                        if (rowTaint !== null) return rowTaint;
                        return 'match';
                    };

                    const totalCells = rowSpan * colSpan;
                    if (totalCells > 2048) {
                        const coordMap = new Map<number, { dr: number; dc: number }>();
                        const allDescs = [targetDesc, ...critDescPairs.map((p) => p.desc)];
                        for (const d of allDescs) {
                            const keys = Object.keys(d.targetSheet.Cells);
                            for (let k = 0; k < keys.length; k++) {
                                const pos = parseCellCoordsFast(keys[k]);
                                if (
                                    pos &&
                                    pos.row >= d.startRow &&
                                    pos.row <= d.endRow &&
                                    pos.col >= d.startCol &&
                                    pos.col <= d.endCol
                                ) {
                                    const dr = pos.row - d.startRow;
                                    const dc = pos.col - d.startCol;
                                    const offsetKey = dr * colSpan + dc;
                                    if (!coordMap.has(offsetKey)) {
                                        coordMap.set(offsetKey, { dr, dc });
                                    }
                                }
                            }
                        }
                        const sortedCoords = Array.from(coordMap.values());
                        if (sortedCoords.length > 1) {
                            sortedCoords.sort((a, b) => a.dr - b.dr || a.dc - b.dc);
                        }
                        let numericCount = 0;
                        let bestVal = fnName === 'MAXIFS' ? -Infinity : Infinity;
                        for (let cIdx = 0; cIdx < sortedCoords.length; cIdx++) {
                            const coord = sortedCoords[cIdx];
                            const outcome = evalDirectRow(coord.dr, coord.dc);
                            if (outcome === '#MJ_ACCESS_DENIED!' || outcome === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                return outcome;
                            }
                            if (outcome === 'match') {
                                const tv = getCellVal(
                                    targetDesc.targetSheet,
                                    FormatCellAddress(targetDesc.startRow + coord.dr, targetDesc.startCol + coord.dc)
                                );
                                if (tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(tv)) return tv;
                                if (typeof tv === 'number' && Number.isFinite(tv)) {
                                    numericCount++;
                                    if (fnName === 'MAXIFS') {
                                        if (tv > bestVal) bestVal = tv;
                                    } else {
                                        if (tv < bestVal) bestVal = tv;
                                    }
                                }
                            }
                        }
                        return numericCount === 0 ? 0 : finiteOrNumError(bestVal);
                    }

                    let numericCount = 0;
                    let bestVal = fnName === 'MAXIFS' ? -Infinity : Infinity;
                    for (let dr = 0; dr < rowSpan; dr++) {
                        for (let dc = 0; dc < colSpan; dc++) {
                            const outcome = evalDirectRow(dr, dc);
                            if (outcome === '#MJ_ACCESS_DENIED!' || outcome === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                                return outcome;
                            }
                            if (outcome === 'match') {
                                const tv = getCellVal(
                                    targetDesc.targetSheet,
                                    FormatCellAddress(targetDesc.startRow + dr, targetDesc.startCol + dc)
                                );
                                if (tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(tv)) return tv;
                                if (typeof tv === 'number' && Number.isFinite(tv)) {
                                    numericCount++;
                                    if (fnName === 'MAXIFS') {
                                        if (tv > bestVal) bestVal = tv;
                                    } else {
                                        if (tv < bestVal) bestVal = tv;
                                    }
                                }
                            }
                        }
                    }
                    return numericCount === 0 ? 0 : finiteOrNumError(bestVal);
                }

                const targetVals = resolveFlattenedRange(args[0]);
                if (
                    targetVals.length === 1 &&
                    (targetVals[0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || targetVals[0] === '#MJ_ACCESS_DENIED!')
                ) {
                    return targetVals[0];
                }
                const pairs: Array<{ vals: SpreadsheetCellValue[]; crit: SpreadsheetCellValue }> = [];
                for (let i = 1; i < args.length; i += 2) {
                    const critVals = resolveFlattenedRange(args[i]);
                    if (
                        critVals.length === 1 &&
                        (critVals[0] === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || critVals[0] === '#MJ_ACCESS_DENIED!')
                    ) {
                        return critVals[0];
                    }
                    const crit = evalScalar(args[i + 1]);
                    if (crit === '#MJ_ACCESS_DENIED!' || crit === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) return crit;
                    if (critVals.length !== targetVals.length) return '#VALUE!';
                    pairs.push({ vals: critVals, crit });
                }
                const matched: number[] = [];
                for (let rIdx = 0; rIdx < targetVals.length; rIdx++) {
                    let rowMatched = true;
                    let rowTaint: '#MJ_ACCESS_DENIED!' | typeof UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL | null = null;
                    for (const p of pairs) {
                        const cv = p.vals[rIdx];
                        if (cv === '#MJ_ACCESS_DENIED!' || cv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
                            if (rowTaint === null || cv === '#MJ_ACCESS_DENIED!') {
                                rowTaint = cv;
                            }
                            continue;
                        }
                        if (!this.matchesCriteria(cv, p.crit)) {
                            rowMatched = false;
                            break;
                        }
                    }
                    if (!rowMatched) continue;
                    if (rowTaint !== null) return rowTaint;
                    const tv = targetVals[rIdx];
                    if (tv === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL || this.isErrorValue(tv)) return tv;
                    if (typeof tv === 'number' && Number.isFinite(tv)) {
                        matched.push(tv);
                    }
                }
                if (matched.length === 0) return 0;
                return fnName === 'MAXIFS' ? Math.max(...matched) : Math.min(...matched);
            }
            case 'FILTER':
            case 'UNIQUE':
            case 'SORT':
            case 'SORTBY':
            case 'SEQUENCE':
            case 'LET':
            case 'LAMBDA': {
                const matrix = this.evalDynamicArrayMatrix(
                    fnName,
                    args,
                    workbook,
                    sheet,
                    getCellVal,
                    cellLookup,
                    currentCellAddress,
                    depth + 1,
                    lexicalScope
                );
                return matrix[0]?.[0] ?? null;
            }
            default:
                // R7-7: Return the unimplemented sentinel for ALL unimplemented Excel functions (not just dynamic-array functions)
                // so wrappers like IFERROR(LARGE(B1:B5, 2), 0) surface #NAME? honestly and omit <v> on .xlsx export/patch!
                return UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL;
        }
    }

    private splitTopLevelArgs(argsStr: string): string[] {
        const trimmed = argsStr.trim();
        if (!trimmed) return [];
        const parts: string[] = [];
        let depth = 0;
        let inQuotes = false;
        let start = 0;
        for (let i = 0; i < argsStr.length; i++) {
            const ch = argsStr[i];
            if (ch === '"') {
                if (inQuotes && argsStr[i + 1] === '"') {
                    i++;
                    continue;
                }
                inQuotes = !inQuotes;
            } else if (!inQuotes) {
                if (ch === '(') depth++;
                else if (ch === ')') depth--;
                else if (ch === ',' && depth === 0) {
                    parts.push(argsStr.slice(start, i).trim());
                    start = i + 1;
                }
            }
        }
        parts.push(argsStr.slice(start).trim());
        return parts;
    }

    private isErrorValue(v: SpreadsheetCellValue): v is `#${string}` {
        return typeof v === 'string' && v.startsWith('#') && (v.endsWith('!') || v.endsWith('?') || v === '#N/A');
    }

    private toNumberOrError(v: SpreadsheetCellValue): number | string {
        if (this.isErrorValue(v)) return v;
        if (v === null || v === undefined) return 0;
        if (typeof v === 'number') return !Number.isFinite(v) ? '#NUM!' : v;
        if (typeof v === 'boolean') return v ? 1 : 0;
        const trimmed = v.trim();
        if (trimmed === '') return '#VALUE!';
        const n = Number(trimmed);
        return Number.isNaN(n) ? '#VALUE!' : !Number.isFinite(n) ? '#NUM!' : n;
    }

    private toBooleanOrError(v: SpreadsheetCellValue): boolean | string {
        if (this.isErrorValue(v)) return v;
        if (v === null || v === undefined) return false;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        const upper = v.trim().toUpperCase();
        if (upper === 'TRUE') return true;
        if (upper === 'FALSE') return false;
        return '#VALUE!';
    }

    private toExcelDateSerialOrError(v: SpreadsheetCellValue): number | string {
        if (this.isErrorValue(v)) return v;
        if (typeof v === 'number') {
            return Number.isFinite(v) ? v : '#NUM!';
        }
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (!trimmed) return '#VALUE!';
            if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
                return Number(trimmed);
            }
            const isoDateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
            if (isoDateMatch) {
                const y = parseInt(isoDateMatch[1], 10);
                const m = parseInt(isoDateMatch[2], 10);
                const d = parseInt(isoDateMatch[3], 10);
                return Math.round(Date.UTC(y, m - 1, d) / 86_400_000) + EXCEL_EPOCH_OFFSET_DAYS;
            }
            const parsedMs = Date.parse(trimmed);
            if (!Number.isNaN(parsedMs)) {
                return parsedMs / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS;
            }
        }
        return '#VALUE!';
    }

    private compareValues(left: SpreadsheetCellValue, right: SpreadsheetCellValue, op: string): boolean {
        // Excel blank (`null`) coerces to 0 against numbers, "" against strings, and FALSE against booleans
        let l = left === undefined ? null : left;
        let r = right === undefined ? null : right;

        if (l === null && r === null) {
            return op === '=' || op === '<=' || op === '>=';
        }
        if (l === null) {
            l = typeof r === 'number' ? 0 : typeof r === 'boolean' ? false : '';
        } else if (r === null) {
            r = typeof l === 'number' ? 0 : typeof l === 'boolean' ? false : '';
        }

        let cmp: number;
        if (typeof l === 'number' && typeof r === 'number') {
            const nl = normalizeCompareFloat15(l);
            const nr = normalizeCompareFloat15(r);
            cmp = nl === nr ? 0 : nl < nr ? -1 : 1;
        } else if (typeof l === 'string' && typeof r === 'string') {
            const ls = l.toLowerCase();
            const rs = r.toLowerCase();
            cmp = ls === rs ? 0 : ls < rs ? -1 : 1;
        } else if (typeof l === 'boolean' && typeof r === 'boolean') {
            cmp = l === r ? 0 : l ? 1 : -1;
        } else {
            // Excel cross-type ordering: number (1) < text (2) < boolean (3)
            const rank = (x: SpreadsheetCellValue): number =>
                typeof x === 'number' ? 1 : typeof x === 'string' ? 2 : 3;
            cmp = rank(l) - rank(r);
        }

        switch (op) {
            case '=':
                return cmp === 0;
            case '<>':
                return cmp !== 0;
            case '<':
                return cmp < 0;
            case '<=':
                return cmp <= 0;
            case '>':
                return cmp > 0;
            case '>=':
                return cmp >= 0;
            default:
                return false;
        }
    }

    private strictLookupEqual(a: SpreadsheetCellValue, b: SpreadsheetCellValue): boolean {
        if (a === null || b === null) return false;
        if (typeof a === 'number' && typeof b === 'number') {
            return normalizeCompareFloat15(a) === normalizeCompareFloat15(b);
        }
        if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
        if (typeof a === 'string' && typeof b === 'string') {
            return a.toLowerCase() === b.toLowerCase();
        }
        return false;
    }

    private compareSameTypeForLookup(a: SpreadsheetCellValue, b: SpreadsheetCellValue): number | null {
        if (typeof a === 'number' && typeof b === 'number') {
            const na = normalizeCompareFloat15(a);
            const nb = normalizeCompareFloat15(b);
            return na === nb ? 0 : na < nb ? -1 : 1;
        }
        if (typeof a === 'string' && typeof b === 'string') {
            const la = a.toLowerCase();
            const lb = b.toLowerCase();
            return la === lb ? 0 : la < lb ? -1 : 1;
        }
        if (typeof a === 'boolean' && typeof b === 'boolean') {
            return a === b ? 0 : a ? 1 : -1;
        }
        return null;
    }

    private valuesEqualCaseInsensitive(a: SpreadsheetCellValue, b: SpreadsheetCellValue): boolean {
        if (a === b) return true;
        if (typeof a === 'string' && typeof b === 'string') {
            return a.trim().toLowerCase() === b.trim().toLowerCase();
        }
        return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
    }

    private matchesCriteria(cellVal: SpreadsheetCellValue, criteria: SpreadsheetCellValue): boolean {
        const val = cellVal === undefined ? null : cellVal;
        if (criteria === null || criteria === undefined || criteria === '') {
            return val === null || val === '';
        }
        if (typeof criteria === 'number') {
            if (val === null || typeof val === 'boolean') return false;
            const normCrit = normalizeCompareFloat15(criteria);
            if (typeof val === 'number') return normalizeCompareFloat15(val) === normCrit;
            const parsed = val.trim() !== '' ? Number(val) : NaN;
            return !Number.isNaN(parsed) && normalizeCompareFloat15(parsed) === normCrit;
        }
        if (typeof criteria === 'boolean') {
            return val === criteria;
        }

        const critStr = String(criteria);
        const opMatch = /^(<>|<=|>=|=|<|>)(.*)$/.exec(critStr);
        if (opMatch) {
            const op = opMatch[1];
            const rhsRaw = opMatch[2].trim();

            if (rhsRaw === '') {
                if (op === '=') return val === null || val === '';
                if (op === '<>') return val !== null && val !== '';
                return false;
            }

            if (this.isErrorValue(val)) {
                if (op === '=') return val.toUpperCase() === rhsRaw.toUpperCase();
                if (op === '<>') return val.toUpperCase() !== rhsRaw.toUpperCase();
                return false;
            }

            const rhsNum = Number(rhsRaw);
            const rhsIsNumeric = !Number.isNaN(rhsNum);

            if (rhsIsNumeric) {
                const normRhs = normalizeCompareFloat15(rhsNum);
                if (op === '<>') {
                    if (val === null || typeof val !== 'number') return true;
                    return normalizeCompareFloat15(val) !== normRhs;
                }
                // For =, <, <=, >, >= with numeric RHS, skip blank/null/boolean/non-numeric cells (Excel COUNTIF parity!)
                if (val === null || typeof val !== 'number') {
                    if (
                        op === '=' &&
                        typeof val === 'string' &&
                        val.trim() !== '' &&
                        !Number.isNaN(Number(val)) &&
                        normalizeCompareFloat15(Number(val)) === normRhs
                    ) {
                        return true;
                    }
                    return false;
                }
                const normVal = normalizeCompareFloat15(val);
                switch (op) {
                    case '=':
                        return normVal === normRhs;
                    case '<':
                        return normVal < normRhs;
                    case '<=':
                        return normVal <= normRhs;
                    case '>':
                        return normVal > normRhs;
                    case '>=':
                        return normVal >= normRhs;
                }
            }

            // Text operator comparison
            if (op === '=' || op === '<>') {
                if (val === null) return op === '<>';
                const matchesText = hasExcelWildcard(rhsRaw)
                    ? matchExcelWildcard(rhsRaw, String(val))
                    : String(val).toLowerCase() === rhsRaw.toLowerCase();
                return op === '=' ? matchesText : !matchesText;
            }
            if (typeof val !== 'string') return false;
            const lv = val.toLowerCase();
            const rv = rhsRaw.toLowerCase();
            if (op === '<') return lv < rv;
            if (op === '<=') return lv <= rv;
            if (op === '>') return lv > rv;
            if (op === '>=') return lv >= rv;
            return false;
        }

        if (this.isErrorValue(val)) {
            return val.toUpperCase() === critStr.trim().toUpperCase();
        }
        if (val === null) return false;

        const trimmedCrit = critStr.trim();
        if (trimmedCrit !== '' && !Number.isNaN(Number(trimmedCrit))) {
            const targetNum = normalizeCompareFloat15(Number(trimmedCrit));
            if (typeof val === 'number') return normalizeCompareFloat15(val) === targetNum;
            if (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val))) {
                return normalizeCompareFloat15(Number(val)) === targetNum;
            }
            return false;
        }

        if (hasExcelWildcard(critStr)) {
            return matchExcelWildcard(critStr, String(val));
        }
        return String(val).toLowerCase() === critStr.toLowerCase();
    }

    // -----------------------------------------------------------------------
    // Cell Formatting & Validation
    // -----------------------------------------------------------------------

    private formatCellForDisplay(cell: SpreadsheetCellSpec): string {
        const val = cell.ComputedValue !== undefined ? cell.ComputedValue : cell.RawValue;
        if (
            typeof val === 'number' &&
            !cell.Style?.FormatType &&
            !cell.Style?.NumberFormatPattern &&
            cell.Formula &&
            isAutoDateFormattedFormula(cell.Formula)
        ) {
            const inferredType: SpreadsheetCellFormatType = /\bNOW\s*\(/i.test(cell.Formula) ? 'datetime' : 'date';
            return this.FormatCellValue(val, { FormatType: inferredType });
        }
        return this.FormatCellValue(val, cell.Style);
    }

    /**
     * Formats a raw or computed scalar value according to its {@link SpreadsheetCellStyleSpec}.
     */
    public FormatCellValue(value: SpreadsheetCellValue, style?: SpreadsheetCellStyleSpec): string {
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        if (typeof value === 'string' && this.isErrorValue(value)) return value;

        const formatType = style?.FormatType ?? this.InferFormatTypeFromPattern(style?.NumberFormatPattern);
        if (typeof value === 'number') {
            switch (formatType) {
                case 'currency':
                    return new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value);
                case 'percent':
                    return `${(value * 100).toFixed(1)}%`;
                case 'integer':
                    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));
                case 'number':
                    return new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(value);
                case 'date':
                    return formatExcelSerialDate(value, false);
                case 'datetime':
                    return formatExcelSerialDate(value, true);
                default:
                    if (Number.isInteger(value)) return String(value);
                    if (Math.abs(value) > 0 && Math.abs(value) < 1e-6) return String(cleanExcelFloat(value));
                    return String(Number(value.toFixed(6)));
            }
        }
        return String(value);
    }

    private formatValueWithCustomPattern(value: SpreadsheetCellValue, pattern: string): string {
        if (value === null || value === undefined) return '';
        const p = pattern.trim();
        if (!p) return String(value);

        const num = typeof value === 'number' ? value : Number(value);
        if (!Number.isNaN(num) && value !== '' && typeof value !== 'boolean') {
            if (/yyyy|yy|mm|dd|hh/i.test(p) && !p.includes('#') && !p.includes('0')) {
                const dt = excelSerialToUtcDate(num);
                const yyyy = String(dt.getUTCFullYear()).padStart(4, '0');
                const yy = yyyy.slice(-2);
                const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
                const dd = String(dt.getUTCDate()).padStart(2, '0');
                const hh = String(dt.getUTCHours()).padStart(2, '0');
                const min = String(dt.getUTCMinutes()).padStart(2, '0');
                const ss = String(dt.getUTCSeconds()).padStart(2, '0');
                const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const monthNamesFull = [
                    'January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'
                ];
                let formatted = p;
                formatted = formatted.replace(/yyyy/gi, () => yyyy).replace(/yy/gi, () => yy);
                formatted = formatted
                    .replace(/mmmm/gi, () => monthNamesFull[dt.getUTCMonth()])
                    .replace(/mmm/gi, () => monthNamesShort[dt.getUTCMonth()]);
                // Replace hh:mm(:ss) minutes before date mm
                formatted = formatted
                    .replace(/hh:mm:ss/gi, () => `${hh}:${min}:${ss}`)
                    .replace(/hh:mm/gi, () => `${hh}:${min}`);
                formatted = formatted
                    .replace(/mm/gi, () => mm)
                    .replace(/\bm\b/gi, () => String(dt.getUTCMonth() + 1));
                formatted = formatted
                    .replace(/dd/gi, () => dd)
                    .replace(/\bd\b/gi, () => String(dt.getUTCDate()));
                return formatted;
            }
            if (p.endsWith('%')) {
                const decMatch = /\.([0#]+)%$/.exec(p);
                const decimals = decMatch ? decMatch[1].length : 0;
                return `${(num * 100).toFixed(decimals)}%`;
            }
            const hasCurrency = p.includes('$');
            const decMatch = /\.([0#]+)/.exec(p);
            const decimals = decMatch ? decMatch[1].length : 0;
            const useGrouping = p.includes(',');
            if (!hasCurrency && !useGrouping && /^0+$/.test(p)) {
                const sign = num < 0 ? '-' : '';
                return `${sign}${String(Math.round(Math.abs(num))).padStart(p.length, '0')}`;
            }
            const numText = new Intl.NumberFormat('en-US', {
                useGrouping,
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            }).format(num);
            return hasCurrency ? (num < 0 ? `-$${numText.replace(/^-/, '')}` : `$${numText}`) : numText;
        }
        return String(value);
    }

    /**
     * Infers a high-level {@link SpreadsheetCellFormatType} from an Excel `numFmt` pattern string.
     */
    public InferFormatTypeFromPattern(pattern?: string | null): SpreadsheetCellFormatType {
        if (!pattern) return 'general';
        // Strip Excel color/locale tokens like [Red] or [$-409] and trailing ;@ sections in O(N) without regex backtracking
        const primarySection = pattern.split(';')[0] ?? pattern;
        let stripped = '';
        let inBrackets = false;
        for (let i = 0; i < primarySection.length; i++) {
            const ch = primarySection[i];
            if (!inBrackets && ch === '[') {
                const closeAt = primarySection.indexOf(']', i + 1);
                if (closeAt !== -1) {
                    inBrackets = true;
                    continue;
                }
            } else if (inBrackets && ch === ']') {
                inBrackets = false;
                continue;
            }
            if (!inBrackets) {
                stripped += ch;
            }
        }
        const p = stripped.trim();
        if (!p || p.toLowerCase() === 'general') return 'general';
        if (p === '@') return 'text';
        if (p.includes('$') || p.includes('¤')) return 'currency';
        if (p.includes('%')) return 'percent';
        if (/(?:yyyy|yy|mmmm|mmm|mm|dd|m\/d|d-m|y-m|hh:mm|h:mm)/i.test(p) && !p.includes('#')) {
            return /h/i.test(p) ? 'datetime' : 'date';
        }
        if (p === '#,##0' || p === '0') return 'integer';
        if (p.includes('0.0')) return 'number';
        return 'general';
    }

    /**
     * Returns the default Excel `numFmt` pattern for a {@link SpreadsheetCellFormatType}.
     */
    public DefaultPatternForFormatType(formatType?: SpreadsheetCellFormatType): string | undefined {
        switch (formatType) {
            case 'currency':
                return '$#,##0.00';
            case 'percent':
                return '0.0%';
            case 'integer':
                return '#,##0';
            case 'number':
                return '#,##0.00';
            case 'date':
                return 'yyyy-mm-dd';
            case 'datetime':
                return 'yyyy-mm-dd hh:mm';
            default:
                return undefined;
        }
    }

    private validateCellAgainstSheetRules(
        sheet: WorksheetSpec,
        cell: SpreadsheetCellSpec,
        preparsedPos?: { row: number; col: number },
        compiledIndex?: CompiledValidationIndex,
        validationCheckBudget?: { remaining: number }
    ): void {
        cell.ValidationError = null;
        if (!sheet.ValidationRules || sheet.ValidationRules.length === 0) return;
        const pos = preparsedPos ?? parseCellCoordsFast(cell.Address) ?? ParseCellAddress(cell.Address);
        if (!pos) return;
        const effectiveVal = cell.ComputedValue ?? cell.RawValue;

        const evaluateEntries = (entries: readonly CompiledValidationEntry[] | undefined): boolean => {
            if (!entries) return false;
            for (const entry of entries) {
                if (validationCheckBudget && --validationCheckBudget.remaining < 0) {
                    throw new Error(
                        'Spreadsheet evaluation rejected: validation rules exceed workbook check budget.'
                    );
                }
                if (
                    pos.row < entry.startRow ||
                    pos.row > entry.endRow ||
                    pos.col < entry.startCol ||
                    pos.col > entry.endCol
                ) {
                    continue;
                }
                const { rule } = entry;
                if (rule.RuleType === 'notEmpty') {
                    if (effectiveVal === null || effectiveVal === undefined || String(effectiveVal).trim() === '') {
                        cell.ValidationError = rule.ErrorMessage || 'This cell cannot be empty.';
                        return true;
                    }
                } else if (rule.RuleType === 'list' && Array.isArray(rule.AllowedValues)) {
                    if (effectiveVal !== null && effectiveVal !== undefined && String(effectiveVal) !== '') {
                        const allowed = rule.AllowedValues.some(
                            (a) => a.toLowerCase() === String(effectiveVal).toLowerCase()
                        );
                        if (!allowed) {
                            cell.ValidationError =
                                rule.ErrorMessage || `Value must be one of: ${rule.AllowedValues.join(', ')}.`;
                            return true;
                        }
                    }
                } else if (rule.RuleType === 'numberRange') {
                    if (effectiveVal !== null && effectiveVal !== undefined && String(effectiveVal) !== '') {
                        const num = Number(effectiveVal);
                        if (
                            Number.isNaN(num) ||
                            (rule.MinValue !== undefined && num < rule.MinValue) ||
                            (rule.MaxValue !== undefined && num > rule.MaxValue)
                        ) {
                            cell.ValidationError =
                                rule.ErrorMessage ||
                                `Value must be between ${rule.MinValue ?? '-∞'} and ${rule.MaxValue ?? '∞'}.`;
                            return true;
                        }
                    }
                }
            }
            return false;
        };

        const index = compiledIndex ?? this.getOrBuildValidationIndex(sheet);
        if (evaluateEntries(index.byRow.get(pos.row))) {
            return;
        }
        if (evaluateEntries(index.byCol.get(pos.col))) {
            return;
        }
        evaluateEntries(index.wideRules);
    }

    /**
     * Evaluates conditional formatting rules for `cell` on `sheet`, returning the matching highlight tone if any.
     */
    public GetCellConditionalHighlight(
        sheet: WorksheetSpec,
        cell: SpreadsheetCellSpec
    ): 'success' | 'warning' | 'danger' | 'info' | null {
        if (!sheet.ConditionalFormats || sheet.ConditionalFormats.length === 0) return null;
        const pos = ParseCellAddress(cell.Address);
        if (!pos) return null;
        const val = cell.ComputedValue ?? cell.RawValue;
        if (val === null || val === undefined || val === '') return null;

        for (const rule of sheet.ConditionalFormats) {
            const bounds = ParseRangeAddress(rule.Range);
            if (!bounds) continue;
            if (
                pos.row < bounds.startRow ||
                pos.row > bounds.endRow ||
                pos.col < bounds.startCol ||
                pos.col > bounds.endCol
            ) {
                continue;
            }
            const num = Number(val);
            switch (rule.Operator) {
                case 'gt':
                    if (!Number.isNaN(num) && num > Number(rule.Value1)) return rule.HighlightTone;
                    break;
                case 'lt':
                    if (!Number.isNaN(num) && num < Number(rule.Value1)) return rule.HighlightTone;
                    break;
                case 'eq':
                    if (this.valuesEqualCaseInsensitive(val, rule.Value1)) return rule.HighlightTone;
                    break;
                case 'between':
                    if (
                        !Number.isNaN(num) &&
                        num >= Number(rule.Value1) &&
                        num <= Number(rule.Value2 ?? rule.Value1)
                    ) {
                        return rule.HighlightTone;
                    }
                    break;
                case 'contains':
                    if (String(val).toLowerCase().includes(String(rule.Value1).toLowerCase())) {
                        return rule.HighlightTone;
                    }
                    break;
            }
        }
        return null;
    }

    // -----------------------------------------------------------------------
    // Protected Ranges Governance (§ 6.2)
    // -----------------------------------------------------------------------

    /**
     * Adds or updates a protected range rule on `sheetIdOrName` (`§ 6.2`).
     */
    public AddProtectedRange(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        spec: Omit<SpreadsheetProtectedRangeSpec, 'LockedAt'> & { LockedAt?: string },
        editContext?: SpreadsheetCellEditContext
    ): SpreadsheetProtectedRangeSpec {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const bounds = ParseRangeAddress(spec.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            throw new Error(`Invalid protected A1 range '${spec.Range}'.`);
        }
        const canonicalRange =
            bounds.startRow === bounds.endRow && bounds.startCol === bounds.endCol
                ? FormatCellAddress(bounds.startRow, bounds.startCol)
                : `${FormatCellAddress(bounds.startRow, bounds.startCol)}:${FormatCellAddress(bounds.endRow, bounds.endCol)}`;

        if (!Array.isArray(sheet.ProtectedRanges)) {
            sheet.ProtectedRanges = [];
        }
        const entry: SpreadsheetProtectedRangeSpec = {
            RangeID: spec.RangeID,
            Range: canonicalRange,
            LockedByUserID: spec.LockedByUserID,
            Description: spec.Description,
            AllowEditors: Boolean(spec.AllowEditors),
            LockedAt: spec.LockedAt ?? new Date().toISOString()
        };
        const effectiveActor: SpreadsheetCellEditContext = editContext ?? { UserID: spec.LockedByUserID };
        const existingIdx = sheet.ProtectedRanges.findIndex((p) => p.RangeID === entry.RangeID);
        if (existingIdx >= 0) {
            const existing = sheet.ProtectedRanges[existingIdx];
            if (!editContext?.BypassProtection && !this.isActorAllowedForProtectedRule(existing, effectiveActor)) {
                throw new Error(
                    `Cannot modify protected range '${existing.Range}' (locked by ${existing.LockedByUserID}).`
                );
            }
            sheet.ProtectedRanges[existingIdx] = entry;
        } else {
            for (const other of sheet.ProtectedRanges) {
                const ob = ParseRangeAddress(other.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                if (
                    ob &&
                    ob.startRow <= bounds.endRow &&
                    ob.endRow >= bounds.startRow &&
                    ob.startCol <= bounds.endCol &&
                    ob.endCol >= bounds.startCol &&
                    !editContext?.BypassProtection &&
                    !this.isActorAllowedForProtectedRule(other, effectiveActor)
                ) {
                    throw new Error(
                        `Cannot add protected range '${canonicalRange}': overlaps protected range '${other.Range}' (locked by ${other.LockedByUserID}).`
                    );
                }
            }
            sheet.ProtectedRanges.push(entry);
        }
        workbook.UpdatedAt = new Date().toISOString();
        return entry;
    }

    /**
     * Removes a protected range rule by `rangeId` if the actor is authorized (`§ 6.2`).
     */
    public RemoveProtectedRange(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        rangeId: string,
        editContext?: SpreadsheetCellEditContext
    ): boolean {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet || !Array.isArray(sheet.ProtectedRanges)) {
            return false;
        }
        const target = sheet.ProtectedRanges.find((p) => p.RangeID === rangeId);
        if (!target) {
            return false;
        }
        if (!editContext?.BypassProtection && !this.isActorAllowedForProtectedRule(target, editContext)) {
            throw new Error(
                `Cannot unlock protected range '${target.Range}' (locked by ${target.LockedByUserID}).`
            );
        }
        sheet.ProtectedRanges = sheet.ProtectedRanges.filter((p) => p.RangeID !== rangeId);
        workbook.UpdatedAt = new Date().toISOString();
        return true;
    }

    /**
     * Merges a rectangular A1 range (`>= 2` cells) on `sheetIdOrName` and stores its canonical A1 range in `sheet.MergeRanges`.
     */
    public MergeCells(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        range: string,
        editContext?: SpreadsheetCellEditContext
    ): string {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const bounds = ParseRangeAddress(range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds || (bounds.startRow === bounds.endRow && bounds.startCol === bounds.endCol)) {
            throw new Error(`Invalid merge range '${range}': must cover at least two cells.`);
        }
        this.assertProtectedRangesAllowStructuralEdit(sheet, bounds, 'merge cells', editContext);
        const canonical = `${FormatCellAddress(bounds.startRow, bounds.startCol)}:${FormatCellAddress(bounds.endRow, bounds.endCol)}`;
        if (!Array.isArray(sheet.MergeRanges)) {
            sheet.MergeRanges = [];
        }
        for (const existing of sheet.MergeRanges) {
            if (existing.toUpperCase() === canonical) {
                return existing;
            }
            const eb = ParseRangeAddress(existing, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (
                eb &&
                eb.startRow <= bounds.endRow &&
                eb.endRow >= bounds.startRow &&
                eb.startCol <= bounds.endCol &&
                eb.endCol >= bounds.startCol
            ) {
                throw new Error(`Cannot merge '${canonical}': overlaps existing merged range '${existing}'.`);
            }
        }
        sheet.MergeRanges.push(canonical);
        workbook.UpdatedAt = new Date().toISOString();
        return canonical;
    }

    /**
     * Unmerges any merged ranges matching or overlapping `range` on `sheetIdOrName`.
     */
    public UnmergeCells(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        range: string,
        editContext?: SpreadsheetCellEditContext
    ): number {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet || !Array.isArray(sheet.MergeRanges) || sheet.MergeRanges.length === 0) {
            return 0;
        }
        const bounds = ParseRangeAddress(range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            throw new Error(`Invalid merge range '${range}'.`);
        }
        this.assertProtectedRangesAllowStructuralEdit(sheet, bounds, 'unmerge cells', editContext);
        const before = sheet.MergeRanges.length;
        sheet.MergeRanges = sheet.MergeRanges.filter((existing) => {
            const eb = ParseRangeAddress(existing, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (!eb) return true;
            const overlaps =
                eb.startRow <= bounds.endRow &&
                eb.endRow >= bounds.startRow &&
                eb.startCol <= bounds.endCol &&
                eb.endCol >= bounds.startCol;
            return !overlaps;
        });
        const removed = before - sheet.MergeRanges.length;
        if (removed > 0) {
            workbook.UpdatedAt = new Date().toISOString();
        }
        return removed;
    }

    /**
     * Adds or updates a data validation rule on `sheetIdOrName` and re-validates affected cells.
     */
    public AddValidationRule(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        rule: SpreadsheetValidationRuleSpec,
        editContext?: SpreadsheetCellEditContext
    ): SpreadsheetValidationRuleSpec {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const bounds = ParseRangeAddress(rule.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            throw new Error(`Invalid validation A1 range '${rule.Range}'.`);
        }
        this.assertProtectedRangesAllowStructuralEdit(sheet, bounds, 'add validation rule', editContext);
        const canonicalRange =
            bounds.startRow === bounds.endRow && bounds.startCol === bounds.endCol
                ? FormatCellAddress(bounds.startRow, bounds.startCol)
                : `${FormatCellAddress(bounds.startRow, bounds.startCol)}:${FormatCellAddress(bounds.endRow, bounds.endCol)}`;
        const entry: SpreadsheetValidationRuleSpec = { ...rule, Range: canonicalRange };
        const idx = sheet.ValidationRules.findIndex((r) => r.RuleID === entry.RuleID);
        if (idx >= 0) {
            const prevBounds = ParseRangeAddress(sheet.ValidationRules[idx].Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (prevBounds) {
                this.assertProtectedRangesAllowStructuralEdit(sheet, prevBounds, 'update validation rule', editContext);
            }
            sheet.ValidationRules[idx] = entry;
        } else {
            sheet.ValidationRules.push(entry);
        }
        this.validationIndexCache.delete(sheet);
        for (const cell of Object.values(sheet.Cells)) {
            this.validateCellAgainstSheetRules(sheet, cell);
        }
        workbook.UpdatedAt = new Date().toISOString();
        return entry;
    }

    /**
     * Removes a data validation rule by `ruleId` from `sheetIdOrName` and clears stale rule errors.
     */
    public RemoveValidationRule(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        ruleId: string,
        editContext?: SpreadsheetCellEditContext
    ): boolean {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) return false;
        const targets = sheet.ValidationRules.filter((r) => r.RuleID === ruleId);
        if (targets.length === 0) return false;
        for (const target of targets) {
            const bounds = ParseRangeAddress(target.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (bounds) {
                this.assertProtectedRangesAllowStructuralEdit(sheet, bounds, 'remove validation rule', editContext);
            }
        }
        sheet.ValidationRules = sheet.ValidationRules.filter((r) => r.RuleID !== ruleId);
        this.validationIndexCache.delete(sheet);
        for (const cell of Object.values(sheet.Cells)) {
            this.validateCellAgainstSheetRules(sheet, cell);
        }
        workbook.UpdatedAt = new Date().toISOString();
        return true;
    }

    /**
     * Adds or updates a conditional formatting rule on `sheetIdOrName`.
     */
    public AddConditionalFormat(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        rule: SpreadsheetConditionalFormatRuleSpec,
        editContext?: SpreadsheetCellEditContext
    ): SpreadsheetConditionalFormatRuleSpec {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const bounds = ParseRangeAddress(rule.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            throw new Error(`Invalid conditional format A1 range '${rule.Range}'.`);
        }
        this.assertProtectedRangesAllowStructuralEdit(sheet, bounds, 'add conditional format', editContext);
        const canonicalRange =
            bounds.startRow === bounds.endRow && bounds.startCol === bounds.endCol
                ? FormatCellAddress(bounds.startRow, bounds.startCol)
                : `${FormatCellAddress(bounds.startRow, bounds.startCol)}:${FormatCellAddress(bounds.endRow, bounds.endCol)}`;
        const entry: SpreadsheetConditionalFormatRuleSpec = { ...rule, Range: canonicalRange };
        const idx = sheet.ConditionalFormats.findIndex((r) => r.RuleID === entry.RuleID);
        if (idx >= 0) {
            const prevBounds = ParseRangeAddress(sheet.ConditionalFormats[idx].Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (prevBounds) {
                this.assertProtectedRangesAllowStructuralEdit(
                    sheet,
                    prevBounds,
                    'update conditional format',
                    editContext
                );
            }
            sheet.ConditionalFormats[idx] = entry;
        } else {
            sheet.ConditionalFormats.push(entry);
        }
        workbook.UpdatedAt = new Date().toISOString();
        return entry;
    }

    /**
     * Removes a conditional formatting rule by `ruleId` from `sheetIdOrName`.
     */
    public RemoveConditionalFormat(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        ruleId: string,
        editContext?: SpreadsheetCellEditContext
    ): boolean {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) return false;
        const targets = sheet.ConditionalFormats.filter((r) => r.RuleID === ruleId);
        if (targets.length === 0) return false;
        for (const target of targets) {
            const bounds = ParseRangeAddress(target.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (bounds) {
                this.assertProtectedRangesAllowStructuralEdit(
                    sheet,
                    bounds,
                    'remove conditional format',
                    editContext
                );
            }
        }
        sheet.ConditionalFormats = sheet.ConditionalFormats.filter((r) => r.RuleID !== ruleId);
        workbook.UpdatedAt = new Date().toISOString();
        return true;
    }

    /**
     * Creates or updates a workbook-level named range and recalculates dependent formulas.
     */
    public SetNamedRange(workbook: WorkbookSpec, spec: SpreadsheetNamedRangeSpec): SpreadsheetNamedRangeSpec {
        const cleanName = spec.Name.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(cleanName)) {
            throw new Error(`Invalid named range identifier '${spec.Name}'.`);
        }
        const targetSheet = this.GetWorksheet(workbook, spec.SheetID);
        if (!targetSheet) {
            throw new Error(`Worksheet '${spec.SheetID}' not found for named range '${cleanName}'.`);
        }
        const bounds = ParseRangeAddress(spec.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            throw new Error(`Invalid A1 range '${spec.Range}' for named range '${cleanName}'.`);
        }
        const canonicalRange =
            bounds.startRow === bounds.endRow && bounds.startCol === bounds.endCol
                ? FormatCellAddress(bounds.startRow, bounds.startCol)
                : `${FormatCellAddress(bounds.startRow, bounds.startCol)}:${FormatCellAddress(bounds.endRow, bounds.endCol)}`;
        const entry: SpreadsheetNamedRangeSpec = {
            Name: cleanName,
            SheetID: targetSheet.SheetID,
            Range: canonicalRange,
            Description: spec.Description
        };
        const idx = workbook.NamedRanges.findIndex((nr) => nr.Name.toLowerCase() === cleanName.toLowerCase());
        if (idx >= 0) {
            workbook.NamedRanges[idx] = entry;
        } else {
            workbook.NamedRanges.push(entry);
        }
        this.ensureAllWorkbookFormulasHaveStableIds(workbook, true);
        this.EvaluateWorkbook(workbook);
        workbook.UpdatedAt = new Date().toISOString();
        return entry;
    }

    /**
     * Removes a workbook-level named range by `name`.
     */
    public RemoveNamedRange(workbook: WorkbookSpec, name: string): boolean {
        const targetLower = name.trim().toLowerCase();
        const before = workbook.NamedRanges.length;
        workbook.NamedRanges = workbook.NamedRanges.filter((nr) => nr.Name.toLowerCase() !== targetLower);
        if (workbook.NamedRanges.length === before) return false;
        this.EvaluateWorkbook(workbook);
        workbook.UpdatedAt = new Date().toISOString();
        return true;
    }

    /**
     * Returns all {@link SpreadsheetProtectedRangeSpec} rules covering `address`.
     */
    private getProtectedRangesForCell(
        sheet: WorksheetSpec,
        address: string
    ): SpreadsheetProtectedRangeSpec[] {
        const rules = sheet.ProtectedRanges;
        if (!Array.isArray(rules) || rules.length === 0) {
            return [];
        }
        const pos = ParseCellAddress(address);
        if (!pos) return [];
        const matches: SpreadsheetProtectedRangeSpec[] = [];
        for (const rule of rules) {
            const bounds = ParseRangeAddress(rule.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (!bounds) continue;
            if (
                pos.row >= bounds.startRow &&
                pos.row <= bounds.endRow &&
                pos.col >= bounds.startCol &&
                pos.col <= bounds.endCol
            ) {
                matches.push(rule);
            }
        }
        return matches;
    }

    /**
     * Returns the most-restrictive {@link SpreadsheetProtectedRangeSpec} covering `address`, or `null`.
     * Evaluates all overlapping ranges and prefers `AllowEditors !== true` (`AllowEditors === false`)
     * over `AllowEditors === true`.
     */
    public GetProtectedRangeForCell(
        sheet: WorksheetSpec,
        address: string
    ): SpreadsheetProtectedRangeSpec | null {
        const matches = this.getProtectedRangesForCell(sheet, address);
        if (matches.length === 0) {
            return null;
        }
        const restrictive = matches.find((rule) => !rule.AllowEditors);
        return restrictive ?? matches[0];
    }

    /**
     * Checks whether an actor may write or clear `address` on `sheet` given `ProtectedRanges` (`§ 6.2`).
     * Evaluates all overlapping protected ranges using most-restrictive precedence.
     */
    public CheckCellWritePermission(
        sheet: WorksheetSpec,
        address: string,
        editContext?: SpreadsheetCellEditContext
    ): { Allowed: boolean; ProtectedRange?: SpreadsheetProtectedRangeSpec; Reason?: string } {
        if (editContext?.BypassProtection) {
            return { Allowed: true };
        }
        const matches = this.getProtectedRangesForCell(sheet, address);
        if (matches.length === 0) {
            return { Allowed: true };
        }
        for (const rule of matches) {
            if (!this.isActorAllowedForProtectedRule(rule, editContext)) {
                return {
                    Allowed: false,
                    ProtectedRange: rule,
                    Reason: `Cell '${address}' falls inside protected range '${rule.Range}' (locked by ${rule.LockedByUserID}).`
                };
            }
        }
        return {
            Allowed: true,
            ProtectedRange: this.GetProtectedRangeForCell(sheet, address) ?? undefined
        };
    }

    private isActorAllowedForProtectedRule(
        rule: SpreadsheetProtectedRangeSpec,
        editContext?: SpreadsheetCellEditContext
    ): boolean {
        if (editContext?.BypassProtection) {
            return true;
        }
        const actor = (editContext?.UserID ?? '').trim();
        if (actor && editContext?.OwnerUserID && UUIDsEqual(actor, editContext.OwnerUserID)) {
            return true;
        }
        if (actor && rule.LockedByUserID && UUIDsEqual(actor, rule.LockedByUserID)) {
            return true;
        }
        if (rule.AllowEditors && editContext?.IsEditor) {
            return true;
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // =MJ.QUERY(...), =MJ.VIEW(...), =MJ.IMPORTRANGE(...), and =MJ.AI(...) Functions
    // -----------------------------------------------------------------------

    /**
     * Parses an `=MJ.QUERY(name, ...params)`, `=MJ.VIEW(entity, view, ...params)`, or
     * `=MJ.IMPORTRANGE(artifact, range, [versionNumber])` formula string.
     * Returns `null` if `formula` is not one of those calls.
     */
    public ParseMjCustomFunctionFormula(
        formula?: string | null,
        workbook?: WorkbookSpec,
        sheet?: WorksheetSpec,
        currentCellAddress?: string
    ): ParsedMjCustomFunctionCall | null {
        if (!formula || typeof formula !== 'string') return null;
        const trimmed = formula.trim();
        const match = /^=\s*(?:_xll\.)?MJ\.(QUERY|VIEW|IMPORTRANGE|AI)\s*\(([\s\S]*)\)$/i.exec(trimmed);
        if (!match) return null;

        const kind = match[1].toUpperCase() as 'QUERY' | 'VIEW' | 'IMPORTRANGE' | 'AI';
        const rawArgs = this.splitTopLevelArgs(match[2]);
        if (rawArgs.length === 0) return null;

        const isSingleExcelStringLiteral = (t: string, quoteChar: '"' | "'"): boolean => {
            if (t.length < 2 || !t.startsWith(quoteChar) || !t.endsWith(quoteChar)) return false;
            for (let i = 1; i < t.length; i++) {
                if (t[i] === quoteChar) {
                    if (t[i + 1] === quoteChar) {
                        i++;
                        continue;
                    }
                    return i === t.length - 1;
                }
            }
            return false;
        };

        const parseLiteral = (token: string): { isLiteral: boolean; value: SpreadsheetCellValue } => {
            const t = token.trim();
            if (isSingleExcelStringLiteral(t, '"')) {
                return { isLiteral: true, value: t.slice(1, -1).replace(/""/g, '"') };
            }
            if (isSingleExcelStringLiteral(t, "'")) {
                return { isLiteral: true, value: t.slice(1, -1).replace(/''/g, "'") };
            }
            if (t.toUpperCase() === 'TRUE') return { isLiteral: true, value: true };
            if (t.toUpperCase() === 'FALSE') return { isLiteral: true, value: false };
            if (t !== '' && !Number.isNaN(Number(t))) return { isLiteral: true, value: Number(t) };
            return { isLiteral: false, value: t };
        };

        const evalTokenScalar = (token: string): SpreadsheetCellValue => {
            const lit = parseLiteral(token);
            if (lit.isLiteral) return lit.value;
            const trimmedTok = token.trim();
            if (!workbook || !sheet || !trimmedTok || kind === 'AI') {
                return lit.value;
            }
            if (kind === 'QUERY') {
                const kvMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(trimmedTok);
                if (kvMatch && !trimmedTok.startsWith('"') && !trimmedTok.startsWith("'")) {
                    const paramName = kvMatch[1];
                    const rhsRaw = kvMatch[2].trim();
                    const rhsLit = parseLiteral(rhsRaw);
                    if (rhsLit.isLiteral) {
                        return `${paramName}=${rhsLit.value ?? ''}`;
                    }
                    try {
                        const rhsAst = compileFormulaAstCached(rhsRaw);
                        const rhsVal = this.evalAstNode(rhsAst, workbook, sheet, null, currentCellAddress);
                        if (rhsVal !== '#NAME?' || ParseCellAddress(rhsRaw)) {
                            return `${paramName}=${rhsVal ?? ''}`;
                        }
                    } catch (err) {
                        if (err instanceof EvalBudgetExceededError) {
                            throw err;
                        }
                        // Fall through to raw assignment token
                    }
                    return trimmedTok;
                }
            }
            try {
                const ast = compileFormulaAstCached(trimmedTok);
                const val = this.evalAstNode(ast, workbook, sheet, null, currentCellAddress);
                if (val === '#NAME?' && /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(trimmedTok) && !ParseCellAddress(trimmedTok)) {
                    return trimmedTok;
                }
                return val;
            } catch (err) {
                if (err instanceof EvalBudgetExceededError) {
                    throw err;
                }
                return trimmedTok;
            }
        };

        let evaluatedArgs: SpreadsheetCellValue[];
        try {
            evaluatedArgs = this.runWithEvalBudget(() => rawArgs.map(evalTokenScalar));
        } catch (err) {
            if (err instanceof EvalBudgetExceededError) {
                return null;
            }
            throw err;
        }
        const primaryTarget = String(evaluatedArgs[0] ?? '').trim();
        if (!primaryTarget) return null;

        let secondaryTarget: string | undefined;
        let paramStartIndex = 1;
        if (kind === 'VIEW' || kind === 'IMPORTRANGE') {
            if (evaluatedArgs.length >= 2) {
                secondaryTarget = String(evaluatedArgs[1] ?? '').trim();
                paramStartIndex = 2;
            }
        }
        if (kind === 'IMPORTRANGE' && !secondaryTarget) {
            return null;
        }

        const namedParameters: Record<string, SpreadsheetCellValue> = {};
        const positionalArgs: SpreadsheetCellValue[] = [];
        const remaining = evaluatedArgs.slice(paramStartIndex);

        if (kind === 'VIEW' || kind === 'IMPORTRANGE' || kind === 'AI') {
            // Preserve positional args intact (VIEW filter, IMPORTRANGE optional versionNumber, or AI cell/range context args)
            positionalArgs.push(...remaining);
        } else {
            for (let i = 0; i < remaining.length; i++) {
                const val = remaining[i];
                if (typeof val === 'string' && val.includes('=')) {
                    const eqIdx = val.indexOf('=');
                    const k = val.slice(0, eqIdx).trim();
                    const vRaw = val.slice(eqIdx + 1).trim();
                    if (
                        k !== '__proto__' &&
                        k !== 'constructor' &&
                        k !== 'prototype' &&
                        /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) &&
                        !vRaw.includes("'") &&
                        !vRaw.includes('"')
                    ) {
                        Object.defineProperty(namedParameters, k, {
                            value: vRaw !== '' && !Number.isNaN(Number(vRaw)) ? Number(vRaw) : vRaw,
                            writable: true,
                            enumerable: true,
                            configurable: true
                        });
                        continue;
                    }
                }
                positionalArgs.push(val);
            }
        }

        return {
            Kind: kind,
            PrimaryTarget: primaryTarget,
            SecondaryTarget: secondaryTarget,
            Arguments: positionalArgs,
            NamedParameters: namedParameters
        };
    }

    /**
     * Evaluates all `=MJ.QUERY(...)` and `=MJ.VIEW(...)` custom function cells across `workbook`
     * under the active viewer's `contextUser` permissions (`§ 6.3`, `§ 7.2`, `§ 8`).
     *
     * Enforces:
     * - Viewer-scoped RLS + FLS projection (`ProjectEntityValueRowsForUser`)
     * - Server-set parameter stripping (`StripServerOnlyRunQueryParams`)
     * - No raw SQL `WhereClause` injection in `=MJ.VIEW`
     * - Per-viewer 60s result caching (`contextUser.ID + canonicalKey`)
     * - Concurrency cap (default 5 simultaneous queries)
     * - Multi-cell spill or scalar return, followed by full workbook formula recalculation
     */
    public async EvaluateMjCustomFunctions(
        workbook: WorkbookSpec,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        options?: SpreadsheetMjEvaluationOptions
    ): Promise<{ EvaluatedCount: number; AccessDeniedCount: number }> {
        const effectiveProvider = provider ?? Metadata.Provider;
        const ttlMs = options?.CacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
        const maxConcurrency = Math.max(1, options?.MaxConcurrency ?? DEFAULT_MAX_CONCURRENCY);

        // Clear any previously spilled cells first, then ensure non-MJ precedent formulas are up to date
        // so dynamic AST arguments inside =MJ.QUERY / =MJ.VIEW / =MJ.IMPORTRANGE see current values.
        for (const sheet of workbook.Worksheets) {
            for (const [addr, cell] of Object.entries(sheet.Cells)) {
                if (cell.SpilledFrom) {
                    delete sheet.Cells[addr];
                }
            }
        }
        this.EvaluateWorkbook(workbook);

        interface PendingFunctionTask {
            sheet: WorksheetSpec;
            cell: SpreadsheetCellSpec;
            parsed: ParsedMjCustomFunctionCall;
        }

        const tasks: PendingFunctionTask[] = [];
        let scanBudgetExceeded = false;
        try {
            this.runWithEvalBudget(() => {
                for (const sheet of workbook.Worksheets) {
                    for (const cell of Object.values(sheet.Cells)) {
                        if (!cell.Formula) continue;
                        this.consumeEvalBudget(1);
                        const parsed = this.ParseMjCustomFunctionFormula(cell.Formula, workbook, sheet, cell.Address);
                        if (parsed && parsed.Kind !== 'AI') {
                            tasks.push({ sheet, cell, parsed });
                        }
                    }
                }
            });
        } catch (err) {
            if (err instanceof EvalBudgetExceededError) {
                scanBudgetExceeded = true;
            } else {
                throw err;
            }
        }
        if (scanBudgetExceeded) {
            return { EvaluatedCount: 0, AccessDeniedCount: 0 };
        }

        let evaluatedCount = 0;
        let accessDeniedCount = 0;

        // Execute in bounded concurrency batches
        for (let i = 0; i < tasks.length; i += maxConcurrency) {
            const batch = tasks.slice(i, i + maxConcurrency);
            await Promise.all(
                batch.map(async ({ sheet, cell, parsed }) => {
                    evaluatedCount++;
                    const execResult = await this.executeSingleMjCustomFunction(
                        parsed,
                        contextUser,
                        effectiveProvider,
                        ttlMs,
                        options?.BypassCache === true,
                        options
                    );

                    if (!execResult.Success || execResult.AccessDenied) {
                        if (execResult.AccessDenied) {
                            accessDeniedCount++;
                            cell.AccessDenied = true;
                            cell.ErrorMessage =
                                execResult.ErrorMessage ||
                                'You do not have permission to run this MemberJunction function.';
                            cell.ComputedValue = '#MJ_ACCESS_DENIED!';
                            cell.DisplayValue = '#MJ_ACCESS_DENIED!';
                        } else {
                            cell.AccessDenied = false;
                            cell.ErrorMessage = execResult.ErrorMessage || 'Invalid MemberJunction function call.';
                            cell.ComputedValue = '#VALUE!';
                            cell.DisplayValue = '#VALUE!';
                        }
                        return;
                    }

                    cell.AccessDenied = false;
                    cell.ErrorMessage = null;
                    this.applyMjFunctionResultToSheet(sheet, cell, execResult, options?.EditContext);
                })
            );
        }

        this.EvaluateWorkbook(workbook, options?.EditContext);
        return { EvaluatedCount: evaluatedCount, AccessDeniedCount: accessDeniedCount };
    }

    /**
     * Validates a structured `=MJ.VIEW` filter expression, permitting column names like
     * `APP_NAME = 'Portal'` and `USER_NAME = 'alice'` while blocking SQL function calls
     * (`USER_NAME()`, `APP_NAME()`), niladic SQL session tokens (`SYSTEM_USER`, `CURRENT_USER`,
     * `SESSION_USER`), `@@` global variables (`@@VERSION`), and raw DDL/DML syntax.
     */
    public ValidateExtraFilter(extraFilter: string): {
        Valid: boolean;
        NormalizedFilter?: string;
        AccessDenied?: boolean;
        ErrorMessage?: string;
    } {
        return ValidateExtraFilter(extraFilter);
    }

    private async executeSingleMjCustomFunction(
        parsed: ParsedMjCustomFunctionCall,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        ttlMs: number,
        bypassCache: boolean,
        options?: SpreadsheetMjEvaluationOptions
    ): Promise<DocumentBlockExecutionResult> {
        if (!contextUser?.ID) {
            return {
                BlockID: 'mj-fn',
                Kind: parsed.Kind === 'QUERY' ? 'SavedQuery' : parsed.Kind === 'IMPORTRANGE' ? 'Artifact' : 'EntityView',
                Mode: 'Live',
                Success: false,
                AccessDenied: true,
                ErrorMessage: 'Authenticated UserInfo is required to execute =MJ.* functions.',
                Columns: [],
                Rows: [],
                TotalRowCount: 0
            };
        }

        if (parsed.Kind === 'IMPORTRANGE') {
            return this.executeImportRangeFunction(parsed, contextUser, provider, ttlMs, bypassCache, options);
        }

        const cacheKey = `${contextUser.ID.toLowerCase()}::${JSON.stringify(parsed)}`;
        const now = Date.now();
        if (!bypassCache) {
            const cached = this.viewerCache.get(cacheKey);
            if (cached && cached.ExpiresAt > now) {
                return cached.Result;
            }
        }

        let spec: DocumentBlockSpec;
        if (parsed.Kind === 'QUERY') {
            // Map positional args to non-server-set query parameters if the query metadata is available
            const params: Record<string, SpreadsheetCellValue> = { ...parsed.NamedParameters };
            const queries: QueryInfo[] = provider?.Queries ?? [];
            const matchedQuery = queries.find(
                (q) =>
                    UUIDsEqual(q.ID, parsed.PrimaryTarget) ||
                    q.Name.toLowerCase() === parsed.PrimaryTarget.toLowerCase()
            );
            if (matchedQuery && parsed.Arguments.length > 0) {
                const clientParams = (matchedQuery.Parameters ?? []).filter((p) => !p.IsServerSet);
                for (let idx = 0; idx < parsed.Arguments.length && idx < clientParams.length; idx++) {
                    const paramName = clientParams[idx].Name;
                    if (params[paramName] === undefined) {
                        params[paramName] = parsed.Arguments[idx];
                    }
                }
            } else if (parsed.Arguments.length > 0 && Object.keys(params).length === 0) {
                // Provide positional fallback parameter keys (Param1, Year, etc.)
                params['Year'] = parsed.Arguments[0];
                parsed.Arguments.forEach((arg, idx) => {
                    params[`Param${idx + 1}`] = arg;
                });
            }

            const isUuid = /^[0-9a-fA-F-]{36}$/.test(parsed.PrimaryTarget);
            spec = {
                BlockID: `mj-query-${parsed.PrimaryTarget}`,
                Kind: 'SavedQuery',
                Mode: 'Live',
                QueryID: isUuid ? parsed.PrimaryTarget : matchedQuery?.ID,
                QueryName: isUuid ? matchedQuery?.Name : parsed.PrimaryTarget,
                Parameters: params,
                MaxRows: 100
            };
        } else {
            // =MJ.VIEW(EntityName, ViewNameOrId, OptionalStructuredEqFilter)
            // Enforce § 7.1: No raw filter SQL! Only allow simple Field=Value equality or reject unsafe SQL tokens.
            let safeExtraFilter: string | undefined;
            const rawFilterCandidate = parsed.Arguments[0];
            if (typeof rawFilterCandidate === 'string' && rawFilterCandidate.trim().length > 0) {
                const filterCheck = this.ValidateExtraFilter(rawFilterCandidate);
                if (!filterCheck.Valid) {
                    return {
                        BlockID: 'mj-view-filter-rejected',
                        Kind: 'EntityView',
                        Mode: 'Live',
                        Success: false,
                        AccessDenied: Boolean(filterCheck.AccessDenied),
                        ErrorMessage: filterCheck.ErrorMessage ?? 'Unsafe SQL filter expression rejected in =MJ.VIEW.',
                        Columns: [],
                        Rows: [],
                        TotalRowCount: 0
                    };
                }
                safeExtraFilter = filterCheck.NormalizedFilter;
            }

            const secondary = (parsed.SecondaryTarget ?? '').trim();
            const isViewUuid = /^[0-9a-fA-F-]{36}$/.test(secondary);
            spec = {
                BlockID: `mj-view-${parsed.PrimaryTarget}`,
                Kind: 'EntityView',
                Mode: 'Live',
                EntityName: parsed.PrimaryTarget,
                ViewID: isViewUuid ? secondary : undefined,
                ViewName: !isViewUuid && secondary && secondary.toLowerCase() !== '(default)' ? secondary : undefined,
                ExtraFilter: safeExtraFilter,
                MaxRows: 100
            };
        }

        const result = await DocumentLiveBlockEngine.Instance.ExecuteBlock(spec, contextUser, provider);
        this.viewerCache.set(cacheKey, {
            ExpiresAt: now + ttlMs,
            Result: result
        });
        return result;
    }

    private async executeImportRangeFunction(
        parsed: ParsedMjCustomFunctionCall,
        contextUser: UserInfo,
        provider: IMetadataProvider,
        ttlMs: number,
        bypassCache: boolean,
        options?: SpreadsheetMjEvaluationOptions
    ): Promise<DocumentBlockExecutionResult> {
        const makeError = (message: string, accessDenied = false): DocumentBlockExecutionResult => ({
            BlockID: `mj-importrange-${parsed.PrimaryTarget}`,
            Kind: 'Artifact',
            Mode: 'Live',
            Success: false,
            AccessDenied: accessDenied,
            ErrorMessage: message,
            Columns: [],
            Rows: [],
            TotalRowCount: 0
        });

        const rangeSpec = (parsed.SecondaryTarget ?? '').trim();
        if (!rangeSpec) {
            return makeError('=MJ.IMPORTRANGE requires a target range string such as "Sheet 1!A1:D20".');
        }

        const rawVersion = parsed.Arguments[0];
        let versionNumber: number | undefined;
        if (rawVersion !== undefined && rawVersion !== null && rawVersion !== '') {
            const num = Number(rawVersion);
            if (!Number.isInteger(num) || num <= 0) {
                return makeError('=MJ.IMPORTRANGE optional versionNumber must be a positive integer.');
            }
            versionNumber = num;
        }

        const depth = options?.ImportRangeDepth ?? 0;
        const maxDepth = 3;
        if (depth >= maxDepth) {
            return makeError(`Maximum =MJ.IMPORTRANGE recursion depth (${maxDepth}) exceeded.`);
        }

        const visitedKeys = [...(options?.ImportRangeVisitedKeys ?? [])];
        if (options?.HostArtifactID && visitedKeys.length === 0) {
            visitedKeys.push(options.HostArtifactID.trim().toLowerCase());
        }

        const requestedKey = `${parsed.PrimaryTarget.trim().toLowerCase()}::${versionNumber ?? 'latest'}`;
        if (
            visitedKeys.some(
                (v) =>
                    v === requestedKey ||
                    v === parsed.PrimaryTarget.trim().toLowerCase()
            )
        ) {
            return makeError('Circular =MJ.IMPORTRANGE reference detected.');
        }

        const cacheKey = `${contextUser.ID.toLowerCase()}::IMPORTRANGE::${requestedKey}::${rangeSpec}`;
        const now = Date.now();
        if (!bypassCache && !options?.ImportRangeResolver) {
            const cached = this.viewerCache.get(cacheKey);
            if (cached && cached.ExpiresAt > now) {
                return cached.Result;
            }
        }

        if (options?.ImportRangeResolver) {
            return await options.ImportRangeResolver({
                ArtifactIDOrName: parsed.PrimaryTarget,
                RangeString: rangeSpec,
                VersionNumber: versionNumber,
                ContextUser: contextUser,
                Provider: provider,
                VisitedArtifactKeys: visitedKeys,
                Depth: depth
            });
        }

        const rv = RunView.FromMetadataProvider(provider);
        const safeTarget = EscapeSQLString(parsed.PrimaryTarget);
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            parsed.PrimaryTarget
        );
        const artifactFilter = isUuid ? `ID='${safeTarget}'` : `Name='${safeTarget}'`;
        const artifactRes = await rv.RunView<{ ID: string; Name: string }>(
            {
                EntityName: 'MJ: Artifacts',
                ExtraFilter: artifactFilter,
                Fields: ['ID', 'Name'],
                MaxRows: 1,
                ResultType: 'simple'
            },
            contextUser
        );
        if (!artifactRes.Success || !artifactRes.Results || artifactRes.Results.length === 0) {
            return makeError(`Target artifact '${parsed.PrimaryTarget}' was not found.`);
        }

        const targetArtifact = artifactRes.Results[0];
        const canonicalArtifactKey = `${targetArtifact.ID.toLowerCase()}::${versionNumber ?? 'latest'}`;
        if (
            visitedKeys.some(
                (v) =>
                    v === canonicalArtifactKey ||
                    UUIDsEqual(v, targetArtifact.ID)
            )
        ) {
            return makeError(`Circular =MJ.IMPORTRANGE reference detected on artifact '${targetArtifact.Name}'.`);
        }

        const permissions = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            targetArtifact.ID,
            contextUser
        );
        if (!permissions.CanRead) {
            return makeError(
                `Access denied reading artifact '${targetArtifact.Name}' (${targetArtifact.ID}) for =MJ.IMPORTRANGE.`,
                true
            );
        }

        const safeArtifactId = EscapeSQLString(targetArtifact.ID);
        const versionFilter =
            versionNumber !== undefined
                ? `ArtifactID='${safeArtifactId}' AND VersionNumber=${versionNumber}`
                : `ArtifactID='${safeArtifactId}'`;
        const versionRes = await rv.RunView<{
            ID: string;
            VersionNumber: number;
            ContentMode: string | null;
            FileID: string | null;
            Content: string | null;
            Configuration: string | null;
        }>(
            {
                EntityName: 'MJ: Artifact Versions',
                ExtraFilter: versionFilter,
                OrderBy: 'VersionNumber DESC',
                Fields: ['ID', 'VersionNumber', 'ContentMode', 'FileID', 'Content', 'Configuration'],
                MaxRows: 1,
                ResultType: 'simple'
            },
            contextUser
        );
        if (!versionRes.Success || !versionRes.Results || versionRes.Results.length === 0) {
            return makeError(
                versionNumber !== undefined
                    ? `Version ${versionNumber} not found for artifact '${targetArtifact.Name}'.`
                    : `No versions found for artifact '${targetArtifact.Name}'.`
            );
        }

        const versionRow = versionRes.Results[0];
        let targetWorkbook: WorkbookSpec;
        if (versionRow.ContentMode === 'File' && !versionRow.Content) {
            const fileBytes = options?.ResolveFileBytes
                ? await options.ResolveFileBytes(versionRow.FileID ?? '', versionRow.ID)
                : versionRow.FileID
                  ? await DocumentLiveBlockEngine.Instance.LoadArtifactFileBytes(
                        versionRow.FileID,
                        contextUser,
                        provider
                    )
                  : null;
            if (!fileBytes) {
                return makeError(
                    `Target artifact '${targetArtifact.Name}' stores its workbook as a binary file (${versionRow.FileID ?? 'File'}); text workbook content is unavailable for =MJ.IMPORTRANGE.`
                );
            }
            targetWorkbook = await this.ImportFromXlsxBytesIsolated(fileBytes, versionRow.Configuration);
        } else {
            targetWorkbook = this.ParseWorkbook(versionRow.Content, versionRow.Configuration);
        }

        const nextVisited = [...visitedKeys, targetArtifact.ID.toLowerCase(), canonicalArtifactKey];
        const hasLiveTables = targetWorkbook.Worksheets.some((ws) => ws.LiveTables && ws.LiveTables.length > 0);
        if (hasLiveTables) {
            await this.RefreshLiveTables(targetWorkbook, contextUser, provider);
        }
        const hasNestedCustomFns = targetWorkbook.Worksheets.some((ws) =>
            Object.values(ws.Cells).some((c) => {
                const p = c.Formula ? this.ParseMjCustomFunctionFormula(c.Formula) : null;
                return Boolean(p && p.Kind !== 'AI');
            })
        );
        if (hasNestedCustomFns) {
            await this.EvaluateMjCustomFunctions(targetWorkbook, contextUser, provider, {
                CacheTtlMs: ttlMs,
                BypassCache: bypassCache,
                MaxConcurrency: options?.MaxConcurrency,
                ImportRangeVisitedKeys: nextVisited,
                ImportRangeDepth: depth + 1,
                HostArtifactID: targetArtifact.ID
            });
        } else {
            await this.EvaluateWorkbookIsolated(targetWorkbook);
        }

        const extracted = this.extractWorkbookRangeResult(targetWorkbook, targetArtifact.ID, rangeSpec);
        if (extracted.Success) {
            this.viewerCache.set(cacheKey, {
                ExpiresAt: now + ttlMs,
                Result: extracted
            });
        }
        return extracted;
    }

    /**
     * Parses `'Sheet Name'!A1:D20`, `Sheet2!A1:D20`, or bare `A1:D20` range specifiers for `=MJ.IMPORTRANGE`.
     */
    public ParseSheetAndRangeSpecifier(
        rangeSpec: string
    ): { SheetName?: string; RangeA1: string } | null {
        const trimmed = (rangeSpec ?? '').trim();
        if (!trimmed) return null;
        const bangIdx = trimmed.lastIndexOf('!');
        if (bangIdx < 0) {
            const bounds = ParseRangeAddress(trimmed, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            return bounds ? { RangeA1: trimmed.toUpperCase() } : null;
        }
        let rawSheet = trimmed.slice(0, bangIdx).trim();
        const rangePart = trimmed.slice(bangIdx + 1).trim();
        if (rawSheet.startsWith("'") && rawSheet.endsWith("'") && rawSheet.length >= 2) {
            rawSheet = rawSheet.slice(1, -1).replace(/''/g, "'");
        }
        const bounds = ParseRangeAddress(rangePart, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!rawSheet || !bounds) return null;
        return {
            SheetName: rawSheet,
            RangeA1: rangePart.toUpperCase()
        };
    }

    private extractWorkbookRangeResult(
        workbook: WorkbookSpec,
        artifactId: string,
        rangeSpec: string
    ): DocumentBlockExecutionResult {
        const makeError = (msg: string): DocumentBlockExecutionResult => ({
            BlockID: `mj-importrange-${artifactId}`,
            Kind: 'Artifact',
            Mode: 'Live',
            Success: false,
            ErrorMessage: msg,
            Columns: [],
            Rows: [],
            TotalRowCount: 0
        });

        const parsedRef = this.ParseSheetAndRangeSpecifier(rangeSpec);
        if (!parsedRef) {
            return makeError(`Invalid =MJ.IMPORTRANGE range specifier '${rangeSpec}'.`);
        }

        const ws = parsedRef.SheetName
            ? this.GetWorksheet(workbook, parsedRef.SheetName)
            : this.GetWorksheet(workbook, workbook.ActiveSheetID) ?? workbook.Worksheets[0];
        if (!ws) {
            return makeError(`Worksheet '${parsedRef.SheetName ?? ''}' not found in target artifact.`);
        }

        const bounds = ParseRangeAddress(parsedRef.RangeA1, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
        if (!bounds) {
            return makeError(`Invalid A1 range '${parsedRef.RangeA1}'.`);
        }

        const colCount = bounds.endCol - bounds.startCol + 1;
        const rowCount = bounds.endRow - bounds.startRow + 1;
        if (rowCount * colCount > 25_000) {
            return makeError(`=MJ.IMPORTRANGE slice exceeds 25,000 cells (${rowCount}x${colCount}).`);
        }

        const columns: DocumentBlockColumn[] = [];
        for (let c = 0; c < colCount; c++) {
            const key = `Col${c}`;
            columns.push({
                Name: key,
                DisplayName: ColumnIndexToLetter(bounds.startCol + c)
            });
        }

        const rows: Array<Record<string, SpreadsheetCellValue>> = [];
        for (let r = bounds.startRow; r <= bounds.endRow; r++) {
            const rowObj: Record<string, SpreadsheetCellValue> = {};
            for (let c = bounds.startCol; c <= bounds.endCol; c++) {
                const addr = FormatCellAddress(r, c);
                const cell = ws.Cells[addr];
                const colKey = `Col${c - bounds.startCol}`;
                rowObj[colKey] = cell ? (cell.ComputedValue ?? cell.RawValue ?? null) : null;
            }
            rows.push(rowObj);
        }

        return {
            BlockID: `mj-importrange-${artifactId}`,
            Kind: 'Artifact',
            Mode: 'Live',
            Success: true,
            Columns: columns,
            Rows: rows,
            TotalRowCount: rows.length
        };
    }

    /**
     * Parses an opt-in `=MJ.AI("prompt", [cellOrRange...])` formula string (`§ 5.2b`).
     * Returns `null` if `formula` is not an `=MJ.AI` call.
     */
    public ParseMjAiFormula(formula?: string | null): ParsedMjAiFormulaCall | null {
        if (!formula || typeof formula !== 'string') return null;
        const trimmed = formula.trim();
        const match = /^=\s*(?:_xll\.)?MJ\.AI\s*\(([\s\S]*)\)$/i.exec(trimmed);
        if (!match) return null;

        const rawArgs = this.splitTopLevelArgs(match[1]);
        if (rawArgs.length === 0) return null;

        let prompt = rawArgs[0].trim();
        if (prompt.startsWith('"') && prompt.endsWith('"') && prompt.length >= 2) {
            prompt = prompt.slice(1, -1).replace(/""/g, '"');
        } else if (prompt.startsWith("'") && prompt.endsWith("'") && prompt.length >= 2) {
            prompt = prompt.slice(1, -1).replace(/''/g, "'");
        }
        if (!prompt.trim()) return null;

        const references = rawArgs.slice(1).map((r) => r.trim()).filter(Boolean);
        return {
            Prompt: prompt,
            References: references
        };
    }

    /**
     * Builds the serialized context payload and deterministic content hash for a single `=MJ.AI(...)` cell.
     */
    public ComputeAiFormulaContextAndHash(
        workbook: WorkbookSpec,
        sheet: WorksheetSpec,
        parsed: ParsedMjAiFormulaCall
    ): { ContextValuesJSON: string; InputHash: string; AccessDenied: boolean } {
        const resolvedArgs: Array<{ Ref: string; Value: SpreadsheetCellValue | SpreadsheetCellValue[][] }> = [];
        let accessDenied = false;
        const isCellDenied = (cell: SpreadsheetCellSpec | undefined): boolean =>
            Boolean(cell && (cell.AccessDenied === true || (cell.ComputedValue ?? cell.RawValue) === '#MJ_ACCESS_DENIED!'));

        for (const ref of parsed.References) {
            if (ref.startsWith('"') && ref.endsWith('"') && ref.length >= 2) {
                resolvedArgs.push({ Ref: ref, Value: ref.slice(1, -1).replace(/""/g, '"') });
                continue;
            }
            let targetSheet = sheet;
            let coordPart = ref;
            const bangIdx = ref.lastIndexOf('!');
            if (bangIdx > 0) {
                let rawSheet = ref.slice(0, bangIdx).trim();
                if (rawSheet.startsWith("'") && rawSheet.endsWith("'") && rawSheet.length >= 2) {
                    rawSheet = rawSheet.slice(1, -1).replace(/''/g, "'");
                }
                const foundSheet = this.GetWorksheet(workbook, rawSheet);
                if (foundSheet) {
                    targetSheet = foundSheet;
                    coordPart = ref.slice(bangIdx + 1).trim();
                }
            }
            const rangeBounds = ParseRangeAddress(coordPart, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (rangeBounds) {
                if (rangeBounds.startRow === rangeBounds.endRow && rangeBounds.startCol === rangeBounds.endCol) {
                    const addr = FormatCellAddress(rangeBounds.startRow, rangeBounds.startCol);
                    const c = targetSheet.Cells[addr];
                    if (isCellDenied(c)) accessDenied = true;
                    resolvedArgs.push({ Ref: ref, Value: c ? (c.ComputedValue ?? c.RawValue ?? null) : null });
                } else {
                    const matrix: SpreadsheetCellValue[][] = [];
                    const maxCells = 500;
                    let count = 0;
                    for (let r = rangeBounds.startRow; r <= rangeBounds.endRow && count < maxCells; r++) {
                        const rowArr: SpreadsheetCellValue[] = [];
                        for (let col = rangeBounds.startCol; col <= rangeBounds.endCol && count < maxCells; col++) {
                            const addr = FormatCellAddress(r, col);
                            const c = targetSheet.Cells[addr];
                            if (isCellDenied(c)) accessDenied = true;
                            rowArr.push(c ? (c.ComputedValue ?? c.RawValue ?? null) : null);
                            count++;
                        }
                        matrix.push(rowArr);
                    }
                    resolvedArgs.push({ Ref: ref, Value: matrix });
                }
            } else {
                try {
                    const exprAst = compileFormulaAstCached(ref);
                    const deps = this.extractAstCellDependencies(exprAst, workbook, sheet);
                    for (const depKey of deps.cellDeps) {
                        const sep = depKey.indexOf('::');
                        const depSheetId = depKey.slice(0, sep);
                        const depAddr = depKey.slice(sep + 2);
                        const depWs = workbook.Worksheets.find((w) => w.SheetID === depSheetId);
                        if (depWs && isCellDenied(depWs.Cells[depAddr])) {
                            accessDenied = true;
                        }
                    }
                    const getVal = (targetWs: WorksheetSpec, addr: string): SpreadsheetCellValue => {
                        const c = targetWs.Cells[addr];
                        if (isCellDenied(c)) {
                            accessDenied = true;
                            return '#MJ_ACCESS_DENIED!';
                        }
                        return c ? (c.ComputedValue ?? c.RawValue ?? null) : null;
                    };
                    if (this.nodeContainsArray(exprAst, workbook)) {
                        const evaluatedMatrix = this.runWithEvalBudget(() =>
                            this.evalAstMatrix(exprAst, workbook, sheet, getVal, getVal)
                        );
                        for (const rowArr of evaluatedMatrix) {
                            for (const v of rowArr) {
                                if (v === '#MJ_ACCESS_DENIED!') accessDenied = true;
                            }
                        }
                        resolvedArgs.push({
                            Ref: ref,
                            Value:
                                evaluatedMatrix.length === 1 && (evaluatedMatrix[0]?.length ?? 0) === 1
                                    ? (evaluatedMatrix[0][0] ?? null)
                                    : evaluatedMatrix
                        });
                    } else {
                        const evaluatedVal = this.runWithEvalBudget(() =>
                            this.evalAstNode(exprAst, workbook, sheet, getVal)
                        );
                        if (evaluatedVal === '#MJ_ACCESS_DENIED!') accessDenied = true;
                        resolvedArgs.push({ Ref: ref, Value: evaluatedVal === '#NAME?' ? ref : evaluatedVal });
                    }
                } catch (err) {
                    if (err instanceof EvalBudgetExceededError) {
                        resolvedArgs.push({ Ref: ref, Value: '#CALC!' });
                    } else {
                        resolvedArgs.push({ Ref: ref, Value: ref });
                    }
                }
            }
        }

        const contextValuesJson = JSON.stringify(resolvedArgs);
        const inputString = `${parsed.Prompt}\n---\n${contextValuesJson}`;
        const inputHash = computeStableAiInputHash(inputString);
        return { ContextValuesJSON: contextValuesJson, InputHash: inputHash, AccessDenied: accessDenied };
    }

    /**
     * Summarizes all `=MJ.AI(...)` cells in `workbook` and how many are pending or have stale inputs.
     */
    public CountPendingAiFormulaCells(workbook: WorkbookSpec): {
        TotalCount: number;
        PendingOrStaleCount: number;
        CellKeys: string[];
    } {
        let total = 0;
        let pending = 0;
        const cellKeys: string[] = [];
        for (const ws of workbook.Worksheets) {
            for (const cell of Object.values(ws.Cells)) {
                const parsed = this.ParseMjAiFormula(cell.Formula);
                if (!parsed) continue;
                total++;
                cellKeys.push(`${ws.SheetID}::${cell.Address}`);
                const { InputHash } = this.ComputeAiFormulaContextAndHash(workbook, ws, parsed);
                const hasCached =
                    cell.ComputedValue !== undefined &&
                    cell.ComputedValue !== null &&
                    cell.ComputedValue !== '' &&
                    cell.ComputedValue !== '#AI_PENDING';
                if (!hasCached || cell.AiInputHash !== InputHash) {
                    pending++;
                }
            }
        }
        return { TotalCount: total, PendingOrStaleCount: pending, CellKeys: cellKeys };
    }

    /**
     * Explicitly evaluates opt-in `=MJ.AI(...)` cells across `workbook` (`§ 5.2b`).
     * Enforces a hard batch cap of 50 cells per invocation and skips cells whose `AiInputHash`
     * already matches (unless `ForceRefresh: true`). Never invoked automatically on open/recalc.
     */
    public async EvaluateAiFormulas(
        workbook: WorkbookSpec,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        options?: SpreadsheetAiEvaluationOptions
    ): Promise<SpreadsheetAiEvaluationResult> {
        const targetFilter = options?.TargetAddresses
            ? new Set(options.TargetAddresses.map((k) => k.toUpperCase()))
            : null;
        const maxCells = Math.max(1, Math.min(options?.MaxCells ?? MAX_AI_FORMULA_BATCH_CELLS, MAX_AI_FORMULA_BATCH_CELLS));

        interface PendingAiCell {
            sheet: WorksheetSpec;
            cell: SpreadsheetCellSpec;
            parsed: ParsedMjAiFormulaCall;
            contextValuesJson: string;
            inputHash: string;
            accessDenied: boolean;
        }

        const matchedCells: PendingAiCell[] = [];
        for (const sheet of workbook.Worksheets) {
            const sortedAddrs = Object.keys(sheet.Cells).sort();
            for (const addr of sortedAddrs) {
                const cell = sheet.Cells[addr];
                if (!cell?.Formula) continue;
                const parsed = this.ParseMjAiFormula(cell.Formula);
                if (!parsed) continue;
                if (targetFilter) {
                    const sheetKey = `${sheet.SheetID}::${cell.Address}`.toUpperCase();
                    if (!targetFilter.has(sheetKey) && !targetFilter.has(cell.Address.toUpperCase())) {
                        continue;
                    }
                }
                if (options?.EditContext) {
                    const perm = this.CheckCellWritePermission(sheet, cell.Address, options.EditContext);
                    if (!perm.Allowed) {
                        throw new Error(perm.Reason);
                    }
                }
                const { ContextValuesJSON, InputHash, AccessDenied } = this.ComputeAiFormulaContextAndHash(
                    workbook,
                    sheet,
                    parsed
                );
                matchedCells.push({
                    sheet,
                    cell,
                    parsed,
                    contextValuesJson: ContextValuesJSON,
                    inputHash: InputHash,
                    accessDenied: AccessDenied
                });
            }
        }

        let cacheHitCount = 0;
        let preAccessDeniedCount = 0;
        const toEvaluate: PendingAiCell[] = [];
        for (const item of matchedCells) {
            if (item.accessDenied) {
                preAccessDeniedCount++;
                item.cell.AccessDenied = true;
                item.cell.ErrorMessage = 'Upstream referenced cell access denied.';
                item.cell.ComputedValue = '#MJ_ACCESS_DENIED!';
                item.cell.DisplayValue = '#MJ_ACCESS_DENIED!';
                delete item.cell.AiInputHash;
                continue;
            }
            const hasCached =
                item.cell.ComputedValue !== undefined &&
                item.cell.ComputedValue !== null &&
                item.cell.ComputedValue !== '' &&
                item.cell.ComputedValue !== '#AI_PENDING' &&
                item.cell.ComputedValue !== '#MJ_ACCESS_DENIED!';
            if (!options?.ForceRefresh && hasCached && item.cell.AiInputHash === item.inputHash) {
                cacheHitCount++;
            } else {
                toEvaluate.push(item);
            }
        }

        const batch = toEvaluate.slice(0, maxCells);
        const skippedOverCapCount = Math.max(0, toEvaluate.length - batch.length);

        if (batch.length === 0) {
            if (preAccessDeniedCount > 0) {
                this.EvaluateWorkbook(workbook);
            }
            return {
                EvaluatedCount: 0,
                CacheHitCount: cacheHitCount,
                SkippedOverCapCount: 0,
                AccessDeniedCount: preAccessDeniedCount,
                ErrorCount: 0
            };
        }

        const requests: ArtifactAiFormulaCellRequest[] = batch.map((b) => ({
            SheetID: b.sheet.SheetID,
            Address: b.cell.Address,
            Prompt: b.parsed.Prompt,
            ContextValuesJSON: b.contextValuesJson,
            InputHash: b.inputHash
        }));

        let results: Array<{
            SheetID: string;
            Address: string;
            InputHash: string;
            Value: string;
            ErrorMessage?: string | null;
            AccessDenied?: boolean;
        }>;

        if (options?.AiEvaluator) {
            results = await options.AiEvaluator(requests);
        } else {
            const artifactId = (options?.ArtifactID ?? '').trim();
            if (!artifactId) {
                for (const item of batch) {
                    item.cell.ErrorMessage = 'ArtifactID is required to evaluate =MJ.AI formulas.';
                    item.cell.AccessDenied = false;
                    item.cell.ComputedValue = '#VALUE!';
                    item.cell.DisplayValue = String(item.cell.ComputedValue);
                }
                this.EvaluateWorkbook(workbook);
                return {
                    EvaluatedCount: 0,
                    CacheHitCount: cacheHitCount,
                    SkippedOverCapCount: skippedOverCapCount,
                    AccessDeniedCount: 0,
                    ErrorCount: batch.length
                };
            }
            const effectiveProvider = provider ?? Metadata.Provider;
            const op = new ArtifactEvaluateAiFormulaOperation();
            const res = await op.Execute(
                {
                    ArtifactID: artifactId,
                    Cells: requests,
                    ModelOverride: options?.ModelOverride ?? null
                },
                { provider: effectiveProvider, user: contextUser }
            );
            if (!res.Success || !res.Output) {
                const errMsg = res.ErrorMessage || 'Failed to evaluate =MJ.AI formulas.';
                for (const item of batch) {
                    item.cell.ErrorMessage = errMsg;
                    item.cell.AccessDenied = res.ResultCode === 'ACCESS_DENIED' || res.ResultCode === 'FORBIDDEN';
                    item.cell.ComputedValue = item.cell.AccessDenied ? '#MJ_ACCESS_DENIED!' : '#VALUE!';
                    item.cell.DisplayValue = String(item.cell.ComputedValue);
                }
                this.EvaluateWorkbook(workbook);
                return {
                    EvaluatedCount: 0,
                    CacheHitCount: cacheHitCount,
                    SkippedOverCapCount: skippedOverCapCount,
                    AccessDeniedCount: res.ResultCode === 'ACCESS_DENIED' || res.ResultCode === 'FORBIDDEN' ? batch.length : 0,
                    ErrorCount: batch.length
                };
            }
            results = res.Output.Results;
        }

        const resultByKey = new Map<string, (typeof results)[number]>();
        for (const r of results) {
            resultByKey.set(`${r.SheetID}::${r.Address.toUpperCase()}`, r);
        }

        let evaluatedCount = 0;
        let accessDeniedCount = preAccessDeniedCount;
        let errorCount = 0;

        for (const item of batch) {
            const match = resultByKey.get(`${item.sheet.SheetID}::${item.cell.Address.toUpperCase()}`);
            if (!match) {
                errorCount++;
                item.cell.ErrorMessage = 'Missing AI evaluation result for cell.';
                item.cell.ComputedValue = '#VALUE!';
                item.cell.DisplayValue = '#VALUE!';
                continue;
            }
            if (match.AccessDenied) {
                accessDeniedCount++;
                item.cell.AccessDenied = true;
                item.cell.ErrorMessage = match.ErrorMessage || 'Access denied running =MJ.AI formula.';
                item.cell.ComputedValue = '#MJ_ACCESS_DENIED!';
                item.cell.DisplayValue = '#MJ_ACCESS_DENIED!';
                continue;
            }
            if (match.ErrorMessage) {
                errorCount++;
                item.cell.AccessDenied = false;
                item.cell.ErrorMessage = match.ErrorMessage;
                item.cell.ComputedValue = '#VALUE!';
                item.cell.DisplayValue = '#VALUE!';
                continue;
            }

            evaluatedCount++;
            item.cell.AccessDenied = false;
            item.cell.ErrorMessage = null;
            item.cell.AiInputHash = match.InputHash || item.inputHash;
            const coerced = this.coerceCsvScalar(match.Value);
            item.cell.ComputedValue = coerced;
            item.cell.DisplayValue = this.FormatCellValue(coerced, item.cell.Style);
        }

        this.EvaluateWorkbook(workbook);
        return {
            EvaluatedCount: evaluatedCount,
            CacheHitCount: cacheHitCount,
            SkippedOverCapCount: skippedOverCapCount,
            AccessDeniedCount: accessDeniedCount,
            ErrorCount: errorCount
        };
    }

    private applyMjFunctionResultToSheet(
        sheet: WorksheetSpec,
        anchorCell: SpreadsheetCellSpec,
        result: DocumentBlockExecutionResult,
        editContext?: SpreadsheetCellEditContext
    ): void {
        const rows = result.Rows ?? [];
        const cols =
            result.Columns && result.Columns.length > 0
                ? result.Columns.map((c) => c.Name)
                : rows[0]
                  ? Object.keys(rows[0])
                  : [];

        if (rows.length === 0 || cols.length === 0) {
            delete anchorCell.SpillRange;
            anchorCell.ComputedValue = 0;
            anchorCell.DisplayValue = '0';
            return;
        }

        // Single scalar result (1 row x 1 col, or 1 row where the last column is a numeric metric)
        if (rows.length === 1 && cols.length === 1) {
            delete anchorCell.SpillRange;
            const raw = rows[0][cols[0]];
            const scalar = this.toCellScalar(raw);
            anchorCell.ComputedValue = scalar;
            anchorCell.DisplayValue = this.FormatCellValue(scalar, anchorCell.Style);
            return;
        }

        // Multi-row or multi-column spill starting at anchorCell: check bounds, ProtectedRanges & collisions BEFORE mutating any cell
        const anchorPos = ParseCellAddress(anchorCell.Address);
        if (!anchorPos) return;
        if (anchorPos.row + rows.length - 1 > EXCEL_MAX_ROWS || anchorPos.col + cols.length - 1 > EXCEL_MAX_COLS) {
            delete anchorCell.SpillRange;
            anchorCell.ComputedValue = '#SPILL!';
            anchorCell.DisplayValue = '#SPILL!';
            anchorCell.ErrorMessage = 'Spill range exceeds worksheet bounds.';
            return;
        }
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            for (let cIdx = 0; cIdx < cols.length; cIdx++) {
                if (rIdx === 0 && cIdx === 0) continue;
                const targetAddr = FormatCellAddress(anchorPos.row + rIdx, anchorPos.col + cIdx);
                const perm = this.CheckCellWritePermission(sheet, targetAddr, editContext);
                if (!perm.Allowed) {
                    delete anchorCell.SpillRange;
                    anchorCell.ComputedValue = '#SPILL!';
                    anchorCell.DisplayValue = '#SPILL!';
                    anchorCell.ErrorMessage =
                        perm.Reason ?? `Spill range intersects protected range containing '${targetAddr}'.`;
                    return;
                }
                const existing = sheet.Cells[targetAddr];
                if (
                    existing &&
                    !existing.SpilledFrom &&
                    (Boolean(existing.Formula && existing.Formula.trim().length > 0) ||
                        (existing.RawValue !== null && existing.RawValue !== undefined && existing.RawValue !== ''))
                ) {
                    delete anchorCell.SpillRange;
                    anchorCell.ComputedValue = '#SPILL!';
                    anchorCell.DisplayValue = '#SPILL!';
                    anchorCell.ErrorMessage = 'Spill range is blocked by non-empty cell(s).';
                    return;
                }
            }
        }

        const firstVal = this.toCellScalar(rows[0][cols[0]]);
        anchorCell.ComputedValue = firstVal;
        anchorCell.DisplayValue = this.FormatCellValue(firstVal, anchorCell.Style);

        this.ensureSheetCapacity(sheet, anchorPos.row + rows.length - 1, anchorPos.col + cols.length - 1);
        const endAddr = FormatCellAddress(anchorPos.row + rows.length - 1, anchorPos.col + cols.length - 1);
        anchorCell.SpillRange = `${anchorCell.Address}:${endAddr}`;
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const rowObj = rows[rIdx];
            for (let cIdx = 0; cIdx < cols.length; cIdx++) {
                if (rIdx === 0 && cIdx === 0) continue;
                const targetR = anchorPos.row + rIdx;
                const targetC = anchorPos.col + cIdx;
                const targetAddr = FormatCellAddress(targetR, targetC);
                const val = this.toCellScalar(rowObj[cols[cIdx]]);
                const existing = sheet.Cells[targetAddr];
                sheet.Cells[targetAddr] = {
                    RowID: sheet.Rows[targetR - 1].RowID,
                    ColumnID: sheet.Columns[targetC - 1].ColumnID,
                    Address: targetAddr,
                    RawValue: val,
                    ComputedValue: val,
                    DisplayValue: this.FormatCellValue(val, existing?.Style),
                    Style: existing?.Style,
                    Note: existing?.Note ?? null,
                    SpilledFrom: anchorCell.Address
                };
            }
        }
    }

    private toCellScalar(val: SpreadsheetCellValue | Date | Record<string, SpreadsheetCellValue> | object | undefined): SpreadsheetCellValue {
        if (val === null || val === undefined) return null;
        if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') return val;
        if (val instanceof Date) return val.toISOString().slice(0, 10);
        return JSON.stringify(val);
    }

    // -----------------------------------------------------------------------
    // Live Data Table Ranges Bound to Views / Queries (§ 6.3, Accept #2, O5)
    // -----------------------------------------------------------------------

    /**
     * Refreshes all `LiveTables` across `workbook` under `contextUser`'s permissions (`§ 6.3`, `Accept #2`),
     * expanding rows, filling down `CalculatedColumns` formulas, and recalculating the workbook.
     */
    public async RefreshLiveTables(
        workbook: WorkbookSpec,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
        options?: { TableID?: string; ForceRefreshFrozen?: boolean }
    ): Promise<Record<string, DocumentBlockExecutionResult>> {
        const effectiveProvider = provider ?? Metadata.Provider;
        const resultsByTableId: Record<string, DocumentBlockExecutionResult> = {};

        for (const sheet of workbook.Worksheets) {
            for (const table of sheet.LiveTables) {
                if (options?.TableID && table.TableID !== options.TableID) continue;
                if (table.Mode === 'Frozen' && !options?.ForceRefreshFrozen) {
                    const validation = ValidateFrozenBlockSnapshot(
                        table.FrozenSnapshot,
                        undefined,
                        BuildLiveTableIdentityBinding(table)
                    );
                    if (!validation.Valid || !table.FrozenSnapshot || table.FrozenSnapshot.SecurityWarningAcknowledged !== true) {
                        const errMsg =
                            validation.ErrorMessage ||
                            'Invalid FrozenSnapshot: Mode is Frozen but snapshot is missing or SecurityWarningAcknowledged is not true.';
                        const failedFrozenRes: DocumentBlockExecutionResult = {
                            BlockID: table.TableID,
                            Kind: table.SourceType,
                            Mode: 'Frozen',
                            Success: false,
                            ErrorMessage: errMsg,
                            Columns: [],
                            Rows: [],
                            TotalRowCount: 0
                        };
                        resultsByTableId[table.TableID] = failedFrozenRes;
                        table.LastError = errMsg;
                        table.LastRowCount = 0;
                        this.clearLiveTableCellsOnAccessDenied(sheet, table);
                        continue;
                    }

                    const snap = table.FrozenSnapshot;
                    const frozenByName = snap.FrozenByUserName || snap.FrozenByUserID;
                    const frozenRes: DocumentBlockExecutionResult = {
                        BlockID: table.TableID,
                        Kind: table.SourceType,
                        Mode: 'Frozen',
                        Success: true,
                        Columns: snap.Columns,
                        Rows: snap.Rows,
                        TotalRowCount: snap.TotalRowCount ?? snap.Rows.length,
                        FrozenMetadata: {
                            FrozenAt: snap.FrozenAt,
                            FrozenByUserID: snap.FrozenByUserID,
                            FrozenByUserName: frozenByName,
                            SnapshotVerified: validation.SnapshotVerified
                        },
                        FrozenSnapshot: {
                            SnapshotVerified: validation.SnapshotVerified,
                            FrozenAt: snap.FrozenAt,
                            FrozenByUserID: snap.FrozenByUserID,
                            FrozenByUserName: frozenByName,
                            SnapshotContentHash: snap.SnapshotContentHash
                        }
                    };
                    resultsByTableId[table.TableID] = frozenRes;
                    table.AccessDenied = false;
                    table.LastError = null;
                    table.LastRowCount = snap.Rows.length;
                    this.populateSheetCellsFromLiveTable(sheet, table, frozenRes);
                    continue;
                }

                const blockSpec: DocumentBlockSpec = {
                    BlockID: table.TableID,
                    Kind: table.SourceType,
                    Title: table.Title,
                    Mode: 'Live',
                    EntityName: table.EntityName,
                    ViewID: table.ViewID,
                    ViewName: table.ViewName,
                    ExtraFilter: table.ExtraFilter,
                    Fields: table.Fields,
                    QueryID: table.QueryID,
                    QueryName: table.QueryName,
                    Parameters: table.QueryParameters,
                    MaxRows: table.MaxRows ?? 100
                };

                const execRes = await DocumentLiveBlockEngine.Instance.ExecuteBlock(
                    blockSpec,
                    contextUser,
                    effectiveProvider
                );
                resultsByTableId[table.TableID] = execRes;

                if (!execRes.Success || execRes.AccessDenied) {
                    table.AccessDenied = Boolean(execRes.AccessDenied);
                    table.LastError =
                        execRes.ErrorMessage || 'You do not have permission to view this bound data source.';
                    table.LastRowCount = 0;
                    this.clearLiveTableCellsOnAccessDenied(sheet, table);
                    continue;
                }

                table.AccessDenied = false;
                table.LastError = null;
                table.LastRefreshedAt = new Date().toISOString();
                table.LastRowCount = execRes.Rows.length;
                this.populateSheetCellsFromLiveTable(sheet, table, execRes);
            }
        }

        this.EvaluateWorkbook(workbook);
        return resultsByTableId;
    }

    private clearPreviousLiveTableCells(sheet: WorksheetSpec, tableId: string): void {
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (cell?.LiveTableID === tableId) {
                delete sheet.Cells[addr];
            }
        }
    }

    private clearLiveTableCellsOnAccessDenied(sheet: WorksheetSpec, table: SpreadsheetLiveTableSpec): void {
        const affectedAddrs = new Set<string>();
        const preservedMeta = new Map<string, { Style?: SpreadsheetCellStyleSpec; Note?: string | null }>();
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (cell?.LiveTableID === table.TableID) {
                affectedAddrs.add(addr);
                if (cell.Style || cell.Note) {
                    preservedMeta.set(addr, {
                        Style: cell.Style ? { ...cell.Style } : undefined,
                        Note: cell.Note ?? null
                    });
                }
            }
        }
        const anchor = ParseCellAddress(table.AnchorCell || 'A1');
        if (anchor) {
            const anchorAddr = FormatCellAddress(anchor.row, anchor.col);
            affectedAddrs.add(anchorAddr);
            const existingAnchor = sheet.Cells[anchorAddr];
            if (existingAnchor && (existingAnchor.Style || existingAnchor.Note) && !preservedMeta.has(anchorAddr)) {
                preservedMeta.set(anchorAddr, {
                    Style: existingAnchor.Style ? { ...existingAnchor.Style } : undefined,
                    Note: existingAnchor.Note ?? null
                });
            }
            // Also mark the table's known header + data footprint as #MJ_ACCESS_DENIED! so dependent formulas
            // referencing any cell in the denied table propagate #MJ_ACCESS_DENIED! rather than evaluating against blanks
            let existingColSpan = 0;
            let existingRowSpan = 0;
            for (const existingAddr of affectedAddrs) {
                const pos = ParseCellAddress(existingAddr);
                if (pos) {
                    existingColSpan = Math.max(existingColSpan, pos.col - anchor.col + 1);
                    existingRowSpan = Math.max(existingRowSpan, pos.row - anchor.row + 1);
                }
            }
            const declaredColCount = (table.Fields?.length ?? 0) + (table.CalculatedColumns?.length ?? 0);
            const colCount = Math.max(
                1,
                table.LastColumnCount ?? 0,
                declaredColCount,
                existingColSpan
            );
            const rowCount = Math.max(
                1,
                (table.IncludeHeaders !== false ? 1 : 0) + Math.max(1, table.LastRowCount ?? 1),
                existingRowSpan
            );
            for (let r = anchor.row; r < anchor.row + rowCount; r++) {
                for (let c = anchor.col; c < anchor.col + colCount; c++) {
                    affectedAddrs.add(FormatCellAddress(r, c));
                }
            }
        }
        this.clearPreviousLiveTableCells(sheet, table.TableID);
        for (const addr of affectedAddrs) {
            const pos = ParseCellAddress(addr);
            if (!pos) continue;
            this.ensureSheetCapacity(sheet, pos.row, pos.col);
            const meta = preservedMeta.get(addr);
            sheet.Cells[addr] = {
                RowID: sheet.Rows[pos.row - 1].RowID,
                ColumnID: sheet.Columns[pos.col - 1].ColumnID,
                Address: addr,
                RawValue: '#MJ_ACCESS_DENIED!',
                ComputedValue: '#MJ_ACCESS_DENIED!',
                DisplayValue: '#MJ_ACCESS_DENIED!',
                Style: meta?.Style,
                Note: meta?.Note ?? null,
                AccessDenied: true,
                ErrorMessage: table.LastError ?? 'Access denied.',
                LiveTableID: table.TableID
            };
        }
    }

    private populateSheetCellsFromLiveTable(
        sheet: WorksheetSpec,
        table: SpreadsheetLiveTableSpec,
        result: DocumentBlockExecutionResult
    ): void {
        // Snapshot any user-authored Style and Note on existing cells in the table footprint before clearing
        const preservedMeta = new Map<string, { Style?: SpreadsheetCellStyleSpec; Note?: string | null }>();
        for (const [addr, cell] of Object.entries(sheet.Cells)) {
            if (cell && (cell.Style || cell.Note)) {
                preservedMeta.set(addr, {
                    Style: cell.Style ? { ...cell.Style } : undefined,
                    Note: cell.Note ?? null
                });
            }
        }

        // Delete any previously populated cells for this live table so shrinking results never leave stale rows (B4)
        this.clearPreviousLiveTableCells(sheet, table.TableID);

        // Always stamp LiveTableID even when Mode === 'Frozen' so UnfreezeLiveTable can purge all table cells reliably
        const liveTableStamp = table.TableID;
        const anchor = ParseCellAddress(table.AnchorCell || 'A1') ?? { row: 1, col: 1 };
        const includeHeaders = table.IncludeHeaders !== false;
        const columns: DocumentBlockColumn[] =
            result.Columns && result.Columns.length > 0
                ? result.Columns
                : result.Rows[0]
                  ? Object.keys(result.Rows[0]).map((k) => ({ Name: k, DisplayName: k }))
                  : [];
        const calcCols = table.CalculatedColumns ?? [];
        table.LastRowCount = result.Rows.length;
        table.LastColumnCount = columns.length + calcCols.length;
        const totalRowsNeeded = anchor.row + (includeHeaders ? 1 : 0) + result.Rows.length + 2;
        const totalColsNeeded = anchor.col + columns.length + calcCols.length + 1;
        this.ensureSheetCapacity(sheet, totalRowsNeeded, totalColsNeeded);

        let currentRow = anchor.row;
        if (includeHeaders) {
            for (let c = 0; c < columns.length; c++) {
                const colIdx = anchor.col + c;
                const addr = FormatCellAddress(currentRow, colIdx);
                const headerText = columns[c].DisplayName || columns[c].Name;
                const prev = preservedMeta.get(addr);
                const style: SpreadsheetCellStyleSpec = { Bold: true, ...(prev?.Style ?? {}) };
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[currentRow - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: headerText,
                    ComputedValue: headerText,
                    DisplayValue: this.FormatCellValue(headerText, style),
                    Style: style,
                    Note: prev?.Note ?? null,
                    LiveTableID: liveTableStamp
                };
            }
            for (let cc = 0; cc < calcCols.length; cc++) {
                const colIdx = anchor.col + columns.length + cc;
                const addr = FormatCellAddress(currentRow, colIdx);
                const headerText = calcCols[cc].Header;
                const prev = preservedMeta.get(addr);
                const style: SpreadsheetCellStyleSpec = { Bold: true, ...(prev?.Style ?? {}) };
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[currentRow - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: headerText,
                    ComputedValue: headerText,
                    DisplayValue: this.FormatCellValue(headerText, style),
                    Style: style,
                    Note: prev?.Note ?? null,
                    LiveTableID: liveTableStamp
                };
            }
            currentRow++;
        }

        for (let r = 0; r < result.Rows.length; r++) {
            const rowData = result.Rows[r];
            const sheetRowNum = currentRow + r;
            for (let c = 0; c < columns.length; c++) {
                const colIdx = anchor.col + c;
                const addr = FormatCellAddress(sheetRowNum, colIdx);
                const fieldVal = this.toCellScalar(rowData[columns[c].Name]);
                const prev = preservedMeta.get(addr);
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[sheetRowNum - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: fieldVal,
                    ComputedValue: fieldVal,
                    DisplayValue: this.FormatCellValue(fieldVal, prev?.Style),
                    Style: prev?.Style,
                    Note: prev?.Note ?? null,
                    LiveTableID: liveTableStamp
                };
            }

            // Fill down calculated formula columns (§ 6.3)
            for (let cc = 0; cc < calcCols.length; cc++) {
                const calcCol = calcCols[cc];
                const colIdx = anchor.col + columns.length + cc;
                const addr = FormatCellAddress(sheetRowNum, colIdx);
                const expandedFormula = calcCol.FormulaTemplate.replace(/\{ROW\}/gi, () => String(sheetRowNum));
                const normalizedFormula = expandedFormula.trim().startsWith('=')
                    ? expandedFormula.trim()
                    : `=${expandedFormula.trim()}`;
                const formulaStable = this.CompileFormulaToStableIds(sheet, normalizedFormula, workbookFromSheet(this.sheetToWorkbook, sheet));
                const prev = preservedMeta.get(addr);
                const defaultCalcStyle: SpreadsheetCellStyleSpec = {
                    FormatType: calcCol.FormatType,
                    NumberFormatPattern:
                        calcCol.NumberFormatPattern ?? this.DefaultPatternForFormatType(calcCol.FormatType)
                };
                const mergedCalcStyle: SpreadsheetCellStyleSpec = prev?.Style
                    ? { ...defaultCalcStyle, ...prev.Style }
                    : defaultCalcStyle;
                sheet.Cells[addr] = {
                    RowID: sheet.Rows[sheetRowNum - 1].RowID,
                    ColumnID: sheet.Columns[colIdx - 1].ColumnID,
                    Address: addr,
                    RawValue: null,
                    Formula: normalizedFormula,
                    FormulaStable: formulaStable,
                    Style: mergedCalcStyle,
                    Note: prev?.Note ?? null,
                    LiveTableID: liveTableStamp
                };
            }
        }
    }

    /**
     * Explicitly freezes a live table into a static snapshot (`O5`, `B7`, `C2`), requiring
     * `acknowledgeSecurityWarning === true` because frozen rows become visible to all readers.
     * Supports an optional `preSignedSnapshot` from browser callers that sign via `DocumentCollaborationService.FreezeLiveBlock`.
     */
    public FreezeLiveTable(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        tableId: string,
        executionResult: DocumentBlockExecutionResult,
        freezingUser: Pick<UserInfo, 'ID' | 'Name'>,
        acknowledgeSecurityWarning: boolean,
        preSignedSnapshot?: DocumentFrozenSnapshot,
        hostArtifactId?: string | null
    ): SpreadsheetLiveTableSpec {
        if (!acknowledgeSecurityWarning) {
            throw new Error(
                'Freezing a live table requires explicit security warning acknowledgment (acknowledgeSecurityWarning: true).'
            );
        }
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const table = sheet.LiveTables.find((t) => t.TableID === tableId);
        if (!table) {
            throw new Error(`Live table '${tableId}' not found on worksheet '${sheet.Name}'.`);
        }
        const expectedBinding = BuildLiveTableIdentityBinding(table, hostArtifactId);
        const frozenAt = new Date().toISOString();
        const baseSnapshot = {
            FrozenAt: frozenAt,
            FrozenByUserID: freezingUser.ID,
            FrozenByUserName: freezingUser.Name || freezingUser.ID,
            Columns: executionResult.Columns,
            Rows: executionResult.Rows,
            TotalRowCount: executionResult.TotalRowCount,
            SecurityWarningAcknowledged: true,
            Binding: expectedBinding
        };
        const resolvedSnapshot: DocumentFrozenSnapshot = preSignedSnapshot
            ? { ...preSignedSnapshot }
            : {
                  ...baseSnapshot,
                  SnapshotContentHash: ComputeFrozenSnapshotHash(baseSnapshot)
              };
        if (
            !resolvedSnapshot.SecurityWarningAcknowledged ||
            typeof resolvedSnapshot.SnapshotContentHash !== 'string' ||
            resolvedSnapshot.SnapshotContentHash.trim().length === 0
        ) {
            throw new Error('Frozen live table snapshot requires a valid non-empty SnapshotContentHash.');
        }

        // Mutate table.Mode and table.FrozenSnapshot ONLY AFTER hash computation/validation succeeds!
        table.Mode = 'Frozen';
        table.FrozenSnapshot = resolvedSnapshot;
        const effectiveResult: DocumentBlockExecutionResult = preSignedSnapshot
            ? {
                  ...executionResult,
                  Columns: resolvedSnapshot.Columns,
                  Rows: resolvedSnapshot.Rows,
                  TotalRowCount: resolvedSnapshot.TotalRowCount
              }
            : executionResult;
        this.populateSheetCellsFromLiveTable(sheet, table, effectiveResult);
        this.EvaluateWorkbook(workbook);
        workbook.UpdatedAt = new Date().toISOString();
        return table;
    }

    /**
     * Unfreezes a frozen table back to `'Live'` viewer-scoped mode.
     */
    public UnfreezeLiveTable(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        tableId: string
    ): SpreadsheetLiveTableSpec {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) {
            throw new Error(`Worksheet '${sheetIdOrName}' not found.`);
        }
        const table = sheet.LiveTables.find((t) => t.TableID === tableId);
        if (!table) {
            throw new Error(`Live table '${tableId}' not found on worksheet '${sheet.Name}'.`);
        }
        const prevSnapCols = table.FrozenSnapshot?.Columns?.length ?? 0;
        const prevSnapRows = table.FrozenSnapshot?.Rows?.length ?? 0;
        const anchor = ParseCellAddress(table.AnchorCell || 'A1');
        const colCount = Math.max(
            1,
            table.LastColumnCount ??
                (prevSnapCols + (table.CalculatedColumns?.length ?? 0) ||
                    (table.Fields?.length ?? 0) + (table.CalculatedColumns?.length ?? 0))
        );
        const rowCount =
            (table.IncludeHeaders !== false ? 1 : 0) + Math.max(table.LastRowCount ?? 0, prevSnapRows);

        // Purge every cell tagged with this LiveTableID OR sitting within its frozen footprint
        this.clearPreviousLiveTableCells(sheet, tableId);
        if (anchor && rowCount > 0) {
            for (let r = anchor.row; r < anchor.row + rowCount; r++) {
                for (let c = anchor.col; c < anchor.col + colCount; c++) {
                    const addr = FormatCellAddress(r, c);
                    const cell = sheet.Cells[addr];
                    if (cell && (!cell.LiveTableID || cell.LiveTableID === tableId)) {
                        this.removeCellFromVirtualAxisIndex(sheet, cell);
                        delete sheet.Cells[addr];
                    }
                }
            }
        }

        table.Mode = 'Live';
        delete table.FrozenSnapshot;
        table.LastRowCount = 0;
        table.LastColumnCount = 0;
        this.workbookDagCache.delete(workbook);
        this.EvaluateWorkbook(workbook);
        workbook.UpdatedAt = new Date().toISOString();
        return table;
    }

    // -----------------------------------------------------------------------
    // Range Charts & Cross-Artifact Sheet-to-Slide / Sheet-to-Doc Extraction (§ 6.3, Accept #5)
    // -----------------------------------------------------------------------

    /**
     * Extracts a live {@link SpreadsheetChartDataset} from a chart spec (or ad-hoc range) on `workbook`.
     * Always evaluates the workbook first so formula cells in the chart range reflect latest values (`Accept #5`).
     */
    /**
     * Reads one or more comma-separated A1 ranges (supporting optional `'SheetName'!` prefixes)
     * into a single aligned 2D cell grid for chart dataset extraction.
     */
    private readChartSourceGrid(
        workbook: WorkbookSpec,
        defaultSheet: WorksheetSpec,
        sourceRange: string
    ): Array<Array<SpreadsheetCellSpec | null>> | null {
        const parts = sourceRange
            .split(',')
            .map((p) => p.trim())
            .filter((p) => p.length > 0);
        if (parts.length === 0) return null;

        const segmentGrids: Array<{
            bounds: { startRow: number; endRow: number; startCol: number; endCol: number };
            grid: Array<Array<SpreadsheetCellSpec | null>>;
        }> = [];

        for (const part of parts) {
            let segSheet = defaultSheet;
            let addrPart = part;
            const bangIdx = part.lastIndexOf('!');
            if (bangIdx > 0) {
                const rawSheetToken = part.slice(0, bangIdx).trim().replace(/^'+|'+$/g, '').replace(/''/g, "'");
                const matched = this.GetWorksheet(workbook, rawSheetToken);
                if (!matched) {
                    return null;
                }
                segSheet = matched;
                addrPart = part.slice(bangIdx + 1).trim();
            }
            const bounds = ParseRangeAddress(addrPart);
            if (!bounds) {
                return null;
            }
            const grid = this.ReadRange(workbook, segSheet.SheetID, addrPart);
            if (grid.length > 0 && grid[0].length > 0) {
                segmentGrids.push({ bounds, grid });
            }
        }

        if (segmentGrids.length === 0) return null;
        if (segmentGrids.length === 1) {
            return segmentGrids[0].grid;
        }

        const firstBounds = segmentGrids[0].bounds;
        const allSameColumns = segmentGrids.every(
            (s) => s.bounds.startCol === firstBounds.startCol && s.bounds.endCol === firstBounds.endCol
        );
        if (allSameColumns) {
            const stacked: Array<Array<SpreadsheetCellSpec | null>> = [];
            for (const seg of segmentGrids) {
                for (const row of seg.grid) {
                    stacked.push(row);
                }
            }
            return stacked;
        }

        const maxRows = Math.max(...segmentGrids.map((s) => s.grid.length));
        const combined: Array<Array<SpreadsheetCellSpec | null>> = [];
        for (let r = 0; r < maxRows; r++) {
            const rowCells: Array<SpreadsheetCellSpec | null> = [];
            for (const seg of segmentGrids) {
                const segWidth = seg.grid[0]?.length ?? 0;
                const segRow = seg.grid[r];
                if (segRow) {
                    rowCells.push(...segRow);
                } else {
                    for (let c = 0; c < segWidth; c++) {
                        rowCells.push(null);
                    }
                }
            }
            combined.push(rowCells);
        }
        return combined;
    }

    /**
     * Transposes a 2D cell grid for row-oriented chart extraction (`SeriesOrientation === 'rows'`).
     */
    private transposeChartGrid(
        grid: Array<Array<SpreadsheetCellSpec | null>>
    ): Array<Array<SpreadsheetCellSpec | null>> {
        const rowCount = grid.length;
        const colCount = Math.max(0, ...grid.map((r) => r.length));
        const transposed: Array<Array<SpreadsheetCellSpec | null>> = [];
        for (let c = 0; c < colCount; c++) {
            const outRow: Array<SpreadsheetCellSpec | null> = [];
            for (let r = 0; r < rowCount; r++) {
                outRow.push(grid[r]?.[c] ?? null);
            }
            transposed.push(outRow);
        }
        return transposed;
    }

    public ExtractChartDataset(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        chartIdOrRange: string,
        overrideSpec?: Partial<SpreadsheetChartSpec>
    ): SpreadsheetChartDataset | null {
        this.EvaluateWorkbook(workbook);
        const sheet = this.GetWorksheet(workbook, sheetIdOrName) ?? workbook.Worksheets[0];
        if (!sheet) return null;

        const existingChart = sheet.Charts.find((c) => c.ChartID === chartIdOrRange);
        const effectiveChart: Partial<SpreadsheetChartSpec> | undefined =
            existingChart || overrideSpec ? { ...existingChart, ...overrideSpec } : undefined;
        const sourceRange = effectiveChart?.SourceRange ?? chartIdOrRange;
        const rawGrid = this.readChartSourceGrid(workbook, sheet, sourceRange);
        if (!rawGrid || rawGrid.length === 0 || rawGrid[0].length === 0) return null;

        const orientation = effectiveChart?.SeriesOrientation === 'rows' ? 'rows' : 'columns';
        const grid = orientation === 'rows' ? this.transposeChartGrid(rawGrid) : rawGrid;
        if (grid.length === 0 || grid[0].length === 0) return null;

        const firstRow = grid[0];
        const autoHasHeader =
            grid.length > 1 &&
            firstRow.some((cell) => {
                const raw = cell?.ComputedValue ?? cell?.RawValue;
                return typeof raw === 'string' && raw.trim() !== '' && parseChartNumericValue(raw) === null;
            });
        const hasHeaderPref = effectiveChart?.HasHeaderRow ?? 'auto';
        const hasHeaderRow =
            hasHeaderPref === true ? grid.length > 1 : hasHeaderPref === false ? false : autoHasHeader;

        const dataRows = hasHeaderRow ? grid.slice(1) : grid;
        const colCount = firstRow.length;

        const columnNumericCounts: number[] = [];
        const columnNonEmptyCounts: number[] = [];
        for (let c = 0; c < colCount; c++) {
            let numCount = 0;
            let nonEmptyCount = 0;
            for (const row of dataRows) {
                const raw = row[c]?.ComputedValue ?? row[c]?.RawValue;
                if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
                    nonEmptyCount++;
                    if (parseChartNumericValue(raw) !== null) {
                        numCount++;
                    }
                }
            }
            columnNumericCounts.push(numCount);
            columnNonEmptyCounts.push(nonEmptyCount);
        }

        const explicitCatIdx =
            typeof effectiveChart?.CategoryColumnIndex === 'number' &&
            Number.isInteger(effectiveChart.CategoryColumnIndex) &&
            effectiveChart.CategoryColumnIndex >= 0 &&
            effectiveChart.CategoryColumnIndex < colCount
                ? effectiveChart.CategoryColumnIndex
                : undefined;

        const detectedColumns: Array<{ Index: number; Name: string; IsNumeric: boolean }> = [];
        const numericColIndices: number[] = [];
        const textColIndices: number[] = [];
        for (let c = 0; c < colCount; c++) {
            const nonEmpty = columnNonEmptyCounts[c];
            const isNumericDataCol = nonEmpty > 0 && columnNumericCounts[c] >= Math.ceil(nonEmpty * 0.5);
            const rawHeader = firstRow[c]?.ComputedValue ?? firstRow[c]?.RawValue;
            const colLabel =
                hasHeaderRow && rawHeader !== null && rawHeader !== undefined && String(rawHeader).trim() !== ''
                    ? String(rawHeader).trim()
                    : colCount === 1
                      ? 'Value'
                      : orientation === 'rows'
                        ? `Row ${c + 1}`
                        : `Series ${c}`;
            detectedColumns.push({ Index: c, Name: colLabel, IsNumeric: isNumericDataCol });

            if (explicitCatIdx !== undefined) {
                if (c === explicitCatIdx) {
                    textColIndices.push(c);
                } else if (isNumericDataCol) {
                    numericColIndices.push(c);
                }
            } else if (isNumericDataCol && (colCount === 1 || c > 0)) {
                numericColIndices.push(c);
            } else {
                textColIndices.push(c);
            }
        }

        let activeSeriesIndices =
            numericColIndices.length > 0
                ? numericColIndices
                : colCount === 1
                  ? [0]
                  : [];

        if (Array.isArray(effectiveChart?.IncludedSeriesIndices) && effectiveChart.IncludedSeriesIndices.length > 0) {
            const explicitIndices: number[] = [];
            const seen = new Set<number>();
            for (const idx of effectiveChart.IncludedSeriesIndices) {
                if (Number.isInteger(idx) && idx >= 0 && idx < colCount && !seen.has(idx)) {
                    seen.add(idx);
                    explicitIndices.push(idx);
                }
            }
            if (explicitIndices.length > 0) {
                activeSeriesIndices = explicitIndices;
            }
        }

        const categoryColIndices =
            explicitCatIdx !== undefined
                ? [explicitCatIdx]
                : textColIndices.length > 0
                  ? textColIndices
                  : colCount > 1
                    ? [0]
                    : [];

        const categories: string[] = dataRows.map((r, idx) => {
            if (categoryColIndices.length === 0) {
                return orientation === 'rows' ? `Column ${idx + 1}` : `Row ${idx + 1}`;
            }
            const parts = categoryColIndices
                .map((cIdx) => {
                    const v = r[cIdx]?.ComputedValue ?? r[cIdx]?.RawValue;
                    return v !== null && v !== undefined ? String(v).trim() : '';
                })
                .filter((s) => s.length > 0);
            return parts.length > 0 ? parts.join(' · ') : orientation === 'rows' ? `Column ${idx + 1}` : `Row ${idx + 1}`;
        });

        const categoryColName =
            hasHeaderRow && categoryColIndices.length > 0
                ? categoryColIndices
                      .map((cIdx) => String(firstRow[cIdx]?.ComputedValue ?? firstRow[cIdx]?.RawValue ?? '').trim())
                      .filter((s) => s.length > 0)
                      .join(' · ') || 'Category'
                : 'Category';

        const rawSeriesNameCounts = new Map<string, number>();
        for (const c of activeSeriesIndices) {
            const rawName = detectedColumns[c]?.Name ?? `Series ${c}`;
            rawSeriesNameCounts.set(rawName, (rawSeriesNameCounts.get(rawName) ?? 0) + 1);
        }
        const usedColumnKeys = new Set<string>([categoryColName]);

        const series: Array<{ Name: string; Values: number[]; ColumnIndex?: number }> = activeSeriesIndices.map((c) => {
            const colMeta = detectedColumns[c];
            const baseName = colMeta ? colMeta.Name : `Series ${c}`;
            const hasCollision = (rawSeriesNameCounts.get(baseName) ?? 0) > 1 || usedColumnKeys.has(baseName);
            let sName = hasCollision ? `${baseName} (${ColumnIndexToLetter(c + 1)})` : baseName;
            if (usedColumnKeys.has(sName)) {
                let suffix = 2;
                while (usedColumnKeys.has(`${sName}_${suffix}`)) {
                    suffix++;
                }
                sName = `${sName}_${suffix}`;
            }
            usedColumnKeys.add(sName);
            const vals = dataRows.map((r) => {
                const raw = r[c]?.ComputedValue ?? r[c]?.RawValue;
                return parseChartNumericValue(raw) ?? 0;
            });
            return { Name: sName, Values: vals, ColumnIndex: c };
        });

        const columns: DocumentBlockColumn[] = [
            { Name: categoryColName, DisplayName: categoryColName, Type: 'string' },
            ...series.map((s) => ({ Name: s.Name, DisplayName: s.Name, Type: 'number' }))
        ];
        const rows: Array<Record<string, string | number>> = categories.map((cat, rIdx) => {
            const rowObj: Record<string, string | number> = {};
            const safeSet = (key: string, value: string | number): void => {
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    Object.defineProperty(rowObj, key, {
                        value,
                        writable: true,
                        enumerable: true,
                        configurable: true
                    });
                } else {
                    rowObj[key] = value;
                }
            };
            safeSet(categoryColName, cat);
            for (const s of series) {
                safeSet(s.Name, s.Values[rIdx] ?? 0);
            }
            return rowObj;
        });

        return {
            ChartID: effectiveChart?.ChartID ?? `range-${sourceRange}`,
            Title: effectiveChart?.Title ?? `${sheet.Name} (${sourceRange})`,
            ChartType: effectiveChart?.ChartType ?? 'bar',
            SheetID: sheet.SheetID,
            SourceRange: sourceRange,
            Categories: categories,
            Series: series,
            Columns: columns,
            Rows: rows,
            RevisionHash: this.ComputeRevisionHash(workbook),
            DetectedColumns: detectedColumns,
            EffectiveHasHeaderRow: hasHeaderRow
        };
    }

    // -----------------------------------------------------------------------
    // Sort & Filter Evaluation (§ 6.3)
    // -----------------------------------------------------------------------

    /**
     * Sorts the data rows of `sheetIdOrName` in-place by `sortSpec.ColumnLetter` while preserving
     * each row's stable `RowID` so formulas referencing those rows update cleanly (`§ 6.2`, `§ 6.3`).
     */
    public SortWorksheet(
        workbook: WorkbookSpec,
        sheetIdOrName: string,
        sortSpec: SpreadsheetSortSpec,
        editContext?: SpreadsheetCellEditContext
    ): void {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) return;
        const headerRows = Math.max(0, sortSpec.HeaderRows ?? 1);
        this.assertProtectedRangesAllowStructuralEdit(
            sheet,
            { startRow: headerRows + 1, endRow: EXCEL_MAX_ROWS, startCol: 1, endCol: EXCEL_MAX_COLS },
            'sort worksheet',
            editContext
        );
        sheet.SortSpec = sortSpec;
        const colIdx = ColumnLetterToIndex(sortSpec.ColumnLetter);
        const targetColId = sheet.Columns[colIdx - 1]?.ColumnID;
        if (!targetColId) return;

        // Build map of (RowID, ColumnID) -> Cell for fast lookup
        const cellByRowId = new Map<string, SpreadsheetCellValue>();
        for (const cell of Object.values(sheet.Cells)) {
            if (cell.ColumnID === targetColId) {
                cellByRowId.set(cell.RowID, cell.ComputedValue ?? cell.RawValue ?? null);
            }
        }

        // Only sort populated rows (up to the last row containing any cell)
        let lastPopulatedRowIndex = headerRows;
        for (const cell of Object.values(sheet.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (pos && pos.row > lastPopulatedRowIndex) {
                lastPopulatedRowIndex = pos.row;
            }
        }
        if (lastPopulatedRowIndex <= headerRows + 1) return;

        const fixedTop = sheet.Rows.slice(0, headerRows);
        const sortable = sheet.Rows.slice(headerRows, lastPopulatedRowIndex);
        const trailingEmpty = sheet.Rows.slice(lastPopulatedRowIndex);

        const dir = sortSpec.Direction === 'desc' ? -1 : 1;
        sortable.sort((rA, rB) => {
            const vA = cellByRowId.get(rA.RowID) ?? null;
            const vB = cellByRowId.get(rB.RowID) ?? null;
            if (vA === null && vB === null) return 0;
            if (vA === null) return 1;
            if (vB === null) return -1;
            if (typeof vA === 'number' && typeof vB === 'number') {
                return (vA - vB) * dir;
            }
            return String(vA).localeCompare(String(vB)) * dir;
        });

        const anchorRowIdForSingleRowRange = (rangeStr: string): { rowId: string; startCol: number; endCol: number; singleCell: boolean } | null => {
            const b = ParseRangeAddress(rangeStr, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (!b || b.startRow !== b.endRow || b.startRow <= headerRows || b.startRow > lastPopulatedRowIndex) {
                return null;
            }
            const rowObj = sheet.Rows[b.startRow - 1];
            if (!rowObj) return null;
            return {
                rowId: rowObj.RowID,
                startCol: b.startCol,
                endCol: b.endCol,
                singleCell: b.startCol === b.endCol
            };
        };
        const vrAnchors = sheet.ValidationRules.map((vr) => anchorRowIdForSingleRowRange(vr.Range));
        const cfAnchors = sheet.ConditionalFormats.map((cf) => anchorRowIdForSingleRowRange(cf.Range));
        const prAnchors = (sheet.ProtectedRanges ?? []).map((pr) => anchorRowIdForSingleRowRange(pr.Range));
        const mrAnchors = (sheet.MergeRanges ?? []).map((mr) => anchorRowIdForSingleRowRange(mr));
        const nrAnchors = workbook.NamedRanges.map((nr) =>
            nr.SheetID === sheet.SheetID && nr.Range !== '#REF!' ? anchorRowIdForSingleRowRange(nr.Range) : null
        );

        sheet.Rows = [...fixedTop, ...sortable, ...trailingEmpty];
        this.reindexSheetStructureAndFormulas(sheet);

        const rowIndexByIdAfterSort = new Map<string, number>();
        for (let idx = 0; idx < sheet.Rows.length; idx++) {
            rowIndexByIdAfterSort.set(sheet.Rows[idx].RowID, idx + 1);
        }
        const reformatAnchoredRange = (
            anchor: { rowId: string; startCol: number; endCol: number; singleCell: boolean } | null,
            fallback: string
        ): string => {
            if (!anchor) return fallback;
            const newRow = rowIndexByIdAfterSort.get(anchor.rowId);
            if (!newRow) return fallback;
            const startAddr = FormatCellAddress(newRow, anchor.startCol);
            return anchor.singleCell ? startAddr : `${startAddr}:${FormatCellAddress(newRow, anchor.endCol)}`;
        };
        sheet.ValidationRules = sheet.ValidationRules.map((vr, idx) => ({
            ...vr,
            Range: reformatAnchoredRange(vrAnchors[idx] ?? null, vr.Range)
        }));
        sheet.ConditionalFormats = sheet.ConditionalFormats.map((cf, idx) => ({
            ...cf,
            Range: reformatAnchoredRange(cfAnchors[idx] ?? null, cf.Range)
        }));
        if (Array.isArray(sheet.ProtectedRanges)) {
            sheet.ProtectedRanges = sheet.ProtectedRanges.map((pr, idx) => ({
                ...pr,
                Range: reformatAnchoredRange(prAnchors[idx] ?? null, pr.Range)
            }));
        }
        if (Array.isArray(sheet.MergeRanges)) {
            sheet.MergeRanges = sheet.MergeRanges.map((mr, idx) => reformatAnchoredRange(mrAnchors[idx] ?? null, mr));
        }
        workbook.NamedRanges.forEach((nr, idx) => {
            const anchor = nrAnchors[idx];
            if (anchor) {
                nr.Range = reformatAnchoredRange(anchor, nr.Range);
            }
        });
        this.EvaluateWorkbook(workbook);
    }

    /**
     * Applies `sheet.FilterSpecs` to mark non-matching data rows as `Hidden = true` (`§ 6.3`).
     */
    public ApplyWorksheetFilters(workbook: WorkbookSpec, sheetIdOrName: string): void {
        const sheet = this.GetWorksheet(workbook, sheetIdOrName);
        if (!sheet) return;
        const filters = sheet.FilterSpecs ?? [];
        if (filters.length === 0) {
            for (const row of sheet.Rows) {
                row.Hidden = false;
            }
            return;
        }
        const headerRows = Math.max(0, filters[0]?.HeaderRows ?? 1);
        for (let rIdx = 0; rIdx < sheet.Rows.length; rIdx++) {
            const row = sheet.Rows[rIdx];
            if (rIdx < headerRows) {
                row.Hidden = false;
                continue;
            }
            let matchesAll = true;
            for (const f of filters) {
                const colNum = ColumnLetterToIndex(f.ColumnLetter);
                const addr = FormatCellAddress(rIdx + 1, colNum);
                const cell = sheet.Cells[addr];
                const val = cell ? (cell.ComputedValue ?? cell.RawValue) : null;
                const strVal = val === null || val === undefined ? '' : String(val);

                switch (f.Operator) {
                    case 'notEmpty':
                        if (strVal.trim() === '') matchesAll = false;
                        break;
                    case 'equals':
                        if (strVal.toLowerCase() !== f.Value.trim().toLowerCase()) matchesAll = false;
                        break;
                    case 'contains':
                        if (!strVal.toLowerCase().includes(f.Value.trim().toLowerCase())) matchesAll = false;
                        break;
                    case 'gt':
                        if (Number.isNaN(Number(val)) || Number(val) <= Number(f.Value)) matchesAll = false;
                        break;
                    case 'lt':
                        if (Number.isNaN(Number(val)) || Number(val) >= Number(f.Value)) matchesAll = false;
                        break;
                }
                if (!matchesAll) break;
            }
            row.Hidden = !matchesAll;
        }
    }

    // -----------------------------------------------------------------------
    // CSV Import & Export (§ 6.3)
    // -----------------------------------------------------------------------

    /**
     * Imports a CSV string into a single-tab {@link WorkbookSpec}, inferring numeric/boolean values.
     * By default (`AllowFormulas: false`), leading `=...` strings are imported safely as literal text
     * to prevent CSV formula injection (`P1-6`); pass `{ AllowFormulas: true }` when formula promotion is desired.
     */
    public ImportFromCsv(
        csvText: string,
        sheetName = 'Sheet 1',
        workbookTitle = 'Imported CSV',
        options?: { AllowFormulas?: boolean; SkipEvaluate?: boolean }
    ): WorkbookSpec {
        const allowFormulas = options?.AllowFormulas === true;
        const lines = this.parseCsvRows(csvText);
        const rowCount = Math.max(DEFAULT_ROW_COUNT, lines.length + 5);
        const maxCols = lines.reduce((acc, r) => Math.max(acc, r.length), 0);
        const colCount = Math.max(DEFAULT_COLUMN_COUNT, maxCols + 2);

        const wb = this.CreateEmptyWorkbook(workbookTitle, [sheetName], rowCount, colCount);
        const ws = wb.Worksheets[0];

        for (let r = 0; r < lines.length; r++) {
            const rowVals = lines[r];
            for (let c = 0; c < rowVals.length; c++) {
                const rawToken = rowVals[c];
                if (rawToken === '') continue;
                const addr = FormatCellAddress(r + 1, c + 1);
                const startsWithFormulaEquals = rawToken.trimStart().startsWith('=');
                if (allowFormulas && startsWithFormulaEquals) {
                    this.SetCell(wb, ws.SheetID, addr, { Formula: rawToken.trimStart() }, false);
                } else {
                    const coerced = startsWithFormulaEquals ? rawToken : this.coerceCsvScalar(rawToken);
                    this.SetCell(
                        wb,
                        ws.SheetID,
                        addr,
                        {
                            Value: coerced,
                            Literal: true,
                            Style: r === 0 ? { Bold: true } : undefined
                        },
                        false
                    );
                }
            }
        }
        this.AssertWorkbookWithinLimits(wb);
        if (!options?.SkipEvaluate) {
            this.EvaluateWorkbook(wb);
        }
        return wb;
    }

    /**
     * Exports a worksheet of `workbook` to RFC 4180 CSV format (using computed values).
     * By default, strips viewer-scoped live table/spill/`=MJ.*` values (`IncludeViewerScopedValues: false`)
     * and neutralizes formula-injection prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) on string cells (`NeutralizeFormulas: true`).
     */
    public ExportToCsv(
        workbook: WorkbookSpec,
        sheetIdOrName?: string,
        options?: { IncludeViewerScopedValues?: boolean; NeutralizeFormulas?: boolean }
    ): string {
        this.EvaluateWorkbook(workbook);
        const effectiveWorkbook =
            options?.IncludeViewerScopedValues === true
                ? workbook
                : this.cloneWorkbookWithoutViewerScopedData(workbook);
        const neutralize = options?.NeutralizeFormulas !== false;
        const sheet = sheetIdOrName
            ? this.GetWorksheet(effectiveWorkbook, sheetIdOrName)
            : this.GetWorksheet(effectiveWorkbook, effectiveWorkbook.ActiveSheetID) ?? effectiveWorkbook.Worksheets[0];
        if (!sheet) return '';

        let maxRow = 0;
        let maxCol = 0;
        for (const cell of Object.values(sheet.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (!pos) continue;
            if (pos.row > MAX_DENSE_ROWS || pos.col > MAX_DENSE_COLS) continue;
            const val = cell.ComputedValue ?? cell.RawValue;
            if (val !== null && val !== undefined && String(val) !== '') {
                if (pos.row > maxRow) maxRow = pos.row;
                if (pos.col > maxCol) maxCol = pos.col;
            }
        }
        if (maxRow === 0 || maxCol === 0) return '';
        if (maxRow * maxCol > MAX_EXPORT_CSV_CELLS) {
            throw new Error(
                `CSV export grid (${maxRow}x${maxCol}) exceeds maximum allowed ${MAX_EXPORT_CSV_CELLS} cells.`
            );
        }

        const outLines: string[] = [];
        for (let r = 1; r <= maxRow; r++) {
            const rowTokens: string[] = [];
            for (let c = 1; c <= maxCol; c++) {
                const addr = FormatCellAddress(r, c);
                const cell = sheet.Cells[addr];
                const val = cell ? (cell.ComputedValue ?? cell.RawValue) : null;
                let text = val === null || val === undefined ? '' : String(val);
                if (
                    neutralize &&
                    typeof val === 'string' &&
                    text.length > 0 &&
                    (/^[=+\-@\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text))
                ) {
                    text = `'${text}`;
                }
                if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
                    rowTokens.push(`"${text.replace(/"/g, '""')}"`);
                } else {
                    rowTokens.push(text);
                }
            }
            outLines.push(rowTokens.join(','));
        }
        return outLines.join('\n');
    }

    private parseCsvRows(csvText: string): string[][] {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < csvText.length; i++) {
            const ch = csvText[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (csvText[i + 1] === '"') {
                        currentField += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    currentField += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    currentRow.push(currentField);
                    currentField = '';
                } else if (ch === '\r') {
                    if (csvText[i + 1] === '\n') i++;
                    currentRow.push(currentField);
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                } else if (ch === '\n') {
                    currentRow.push(currentField);
                    rows.push(currentRow);
                    currentRow = [];
                    currentField = '';
                } else {
                    currentField += ch;
                }
            }
        }
        if (currentField.length > 0 || currentRow.length > 0) {
            currentRow.push(currentField);
            rows.push(currentRow);
        }
        return rows;
    }

    private coerceCsvScalar(token: string): SpreadsheetCellValue {
        const trimmed = token.trim();
        if (trimmed === '') return null;
        if (trimmed.toUpperCase() === 'TRUE') return true;
        if (trimmed.toUpperCase() === 'FALSE') return false;
        if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
            return Number(trimmed);
        }
        return token;
    }

    // -----------------------------------------------------------------------
    // OpenXML .xlsx Export & Import (§ 6.2, § 6.3, Accept #4)
    // -----------------------------------------------------------------------

    /**
     * Exports `workbook` to a standards-compliant OpenXML `.xlsx` binary (`Uint8Array`)
     * that opens cleanly in Microsoft Excel, Apple Numbers, LibreOffice, and `exceljs` (`Accept #4`).
     *
     * Preserves:
     * - Multiple worksheet tabs
     * - Cell values (`n`, `b`, `inlineStr`, `str`)
     * - Standard Excel formulas (`<f>SUM(B2:B9)</f>`) with pre-evaluated `<v>` results
     *   (while freezing `=MJ.QUERY`/`=MJ.VIEW` cells to their computed scalar values so Excel never shows `#NAME?`)
     * - Number formats (`numFmt`: currency `$#,##0.00`, percent `0.0%`, integer `#,##0`, date `yyyy-mm-dd`)
     * - Bold styles and custom column widths (`<col min="..." max="..." width="..." customWidth="1"/>`)
     * - Frozen panes (`<pane ySplit="..." xSplit="..." state="frozen"/>`)
     * - Hidden `_mj_sheets_meta` worksheet holding the chunked `WorkbookSpec` JSON for lossless round-tripping
     */
    public ExportToXlsxBytes(workbook: WorkbookSpec, includeMjMetadataSheet = true): Uint8Array {
        this.EvaluateWorkbook(workbook);

        // Build custom numFmt + font + fill + xf style table
        const numFmts: Array<{ Id: number; FormatCode: string }> = [];
        const numFmtIdByPattern = new Map<string, number>();
        let nextNumFmtId = 164;

        interface OoxmlFontEntry {
            Bold: boolean;
            Italic: boolean;
            ColorArgb?: string;
        }
        const fonts: OoxmlFontEntry[] = [
            { Bold: false, Italic: false },
            { Bold: true, Italic: false }
        ];
        const fontIndexByKey = new Map<string, number>([
            ['0:0:', 0],
            ['1:0:', 1]
        ]);
        const getFontIndex = (bold: boolean, italic: boolean, colorArgb?: string): number => {
            const key = `${bold ? 1 : 0}:${italic ? 1 : 0}:${colorArgb ?? ''}`;
            const existing = fontIndexByKey.get(key);
            if (existing !== undefined) return existing;
            const idx = fonts.length;
            fonts.push({ Bold: bold, Italic: italic, ColorArgb: colorArgb });
            fontIndexByKey.set(key, idx);
            return idx;
        };

        const fillFgs: string[] = []; // index 0 = none, index 1 = gray125, index >= 2 -> fillFgs[idx - 2]
        const fillIndexByArgb = new Map<string, number>();
        const getFillIndex = (colorArgb?: string): number => {
            if (!colorArgb) return 0;
            const existing = fillIndexByArgb.get(colorArgb);
            if (existing !== undefined) return existing;
            const idx = 2 + fillFgs.length;
            fillFgs.push(colorArgb);
            fillIndexByArgb.set(colorArgb, idx);
            return idx;
        };

        interface XfStyleEntry {
            NumFmtId: number;
            FontId: number;
            FillId: number;
            HorizontalAlign?: 'left' | 'center' | 'right';
        }
        // Index 0 = default general, Index 1 = bold general
        const cellXfs: XfStyleEntry[] = [
            { NumFmtId: 0, FontId: 0, FillId: 0 },
            { NumFmtId: 0, FontId: 1, FillId: 0 }
        ];
        const xfIndexByKey = new Map<string, number>([
            ['0:0:0:', 0],
            ['0:1:0:', 1]
        ]);

        const getStyleIndex = (style?: SpreadsheetCellStyleSpec): number => {
            if (!style) return 0;
            const pattern = style.NumberFormatPattern ?? this.DefaultPatternForFormatType(style.FormatType);
            let numFmtId = 0;
            if (pattern) {
                const existingId = numFmtIdByPattern.get(pattern);
                if (existingId !== undefined) {
                    numFmtId = existingId;
                } else {
                    numFmtId = nextNumFmtId++;
                    numFmtIdByPattern.set(pattern, numFmtId);
                    numFmts.push({ Id: numFmtId, FormatCode: pattern });
                }
            }
            const textArgb = cssColorToOoxmlArgb(style.TextColor);
            const fillArgb = cssColorToOoxmlArgb(style.BackgroundColor);
            const fontId = getFontIndex(Boolean(style.Bold), Boolean(style.Italic), textArgb);
            const fillId = getFillIndex(fillArgb);
            const align = style.HorizontalAlign;
            const key = `${numFmtId}:${fontId}:${fillId}:${align ?? ''}`;
            const existingXf = xfIndexByKey.get(key);
            if (existingXf !== undefined) return existingXf;
            const newIdx = cellXfs.length;
            cellXfs.push({ NumFmtId: numFmtId, FontId: fontId, FillId: fillId, HorizontalAlign: align });
            xfIndexByKey.set(key, newIdx);
            return newIdx;
        };

        const zipEntries: Array<{ Name: string; Data: Uint8Array }> = [];
        const sheetDefs: Array<{ Name: string; SheetId: number; RelId: string; Path: string; Hidden: boolean }> = [];
        const extraContentTypeOverrides: string[] = [];

        let hasDynamicArrayCm = false;
        let globalChartNum = 1;
        const usedExcelSheetNamesLower = new Set<string>([HIDDEN_META_SHEET_NAME.toLowerCase()]);
        const sanitizedWorkbook = this.cloneWorkbookWithoutViewerScopedData(workbook);
        sanitizedWorkbook.Worksheets.forEach((ws, idx) => {
            const sheetNum = idx + 1;
            const relId = `rId${sheetNum}`;
            const path = `xl/worksheets/sheet${sheetNum}.xml`;
            const safeSheetName = SanitizeWorksheetName(ws.Name || `Sheet ${sheetNum}`, usedExcelSheetNamesLower);
            usedExcelSheetNamesLower.add(safeSheetName.toLowerCase());
            sheetDefs.push({
                Name: safeSheetName,
                SheetId: sheetNum,
                RelId: relId,
                Path: path,
                Hidden: false
            });

            const wsRels: Array<{ Id: string; Type: string; Target: string; TargetMode?: string }> = [];
            let nextWsRelIdx = 1;

            // 1. External http(s) hyperlinks on worksheet cells
            const sheetHyperlinks: Array<{ Ref: string; RelId: string; Display?: string }> = [];
            const sortedCellEntries = Object.values(ws.Cells).sort((a, b) => a.Address.localeCompare(b.Address));
            for (const cell of sortedCellEntries) {
                let targetUrl: string | null = null;
                let displayLabel: string | undefined;
                if (typeof cell.RawValue === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(cell.RawValue.trim())) {
                    targetUrl = cell.RawValue.trim();
                } else if (cell.Formula) {
                    const hlMatch = /^=\s*HYPERLINK\s*\(\s*"(https?:\/\/[^"]+)"(?:\s*,\s*"([^"]*)")?\s*\)$/i.exec(
                        cell.Formula.trim()
                    );
                    if (hlMatch) {
                        targetUrl = hlMatch[1];
                        displayLabel = hlMatch[2];
                    }
                }
                if (targetUrl) {
                    const hRelId = `rId${nextWsRelIdx++}`;
                    wsRels.push({
                        Id: hRelId,
                        Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
                        Target: targetUrl,
                        TargetMode: 'External'
                    });
                    sheetHyperlinks.push({ Ref: cell.Address, RelId: hRelId, Display: displayLabel });
                }
            }

            // 2. Native xl/comments*.xml for cell notes
            const notedCells = sortedCellEntries.filter((c) => typeof c.Note === 'string' && c.Note.trim().length > 0);
            if (notedCells.length > 0) {
                const commentsFileName = `comments${sheetNum}.xml`;
                const commentsPath = `xl/${commentsFileName}`;
                const cmtRelId = `rId${nextWsRelIdx++}`;
                wsRels.push({
                    Id: cmtRelId,
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
                    Target: `../${commentsFileName}`
                });
                extraContentTypeOverrides.push(
                    `<Override PartName="/${commentsPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`
                );
                const commentTags = notedCells
                    .map(
                        (c) =>
                            `<comment ref="${this.escapeXml(c.Address)}" authorId="0"><text><r><t xml:space="preserve">${this.escapeXml(c.Note ?? '')}</t></r></text></comment>`
                    )
                    .join('');
                const commentsXml = [
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                    '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
                    '<authors><author>MemberJunction</author></authors>',
                    `<commentList>${commentTags}</commentList>`,
                    '</comments>'
                ].join('');
                zipEntries.push({ Name: commentsPath, Data: this.encodeUtf8(commentsXml) });
            }

            // 3. Native DrawingML charts (xl/drawings/drawing*.xml + xl/charts/chart*.xml)
            let drawingRelId: string | undefined;
            if (Array.isArray(ws.Charts) && ws.Charts.length > 0) {
                const drawingFileName = `drawing${sheetNum}.xml`;
                const drawingPath = `xl/drawings/${drawingFileName}`;
                drawingRelId = `rId${nextWsRelIdx++}`;
                wsRels.push({
                    Id: drawingRelId,
                    Type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
                    Target: `../drawings/${drawingFileName}`
                });
                extraContentTypeOverrides.push(
                    `<Override PartName="/${drawingPath}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
                );

                const drawingRels: string[] = [];
                const anchorsXml: string[] = [];
                for (let cIdx = 0; cIdx < ws.Charts.length; cIdx++) {
                    const chart = ws.Charts[cIdx];
                    const chartNum = globalChartNum++;
                    const chartFileName = `chart${chartNum}.xml`;
                    const chartPath = `xl/charts/${chartFileName}`;
                    const cRelId = `rId${cIdx + 1}`;
                    drawingRels.push(
                        `<Relationship Id="${cRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/${chartFileName}"/>`
                    );
                    extraContentTypeOverrides.push(
                        `<Override PartName="/${chartPath}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
                    );

                    const dataset = this.ExtractChartDataset(sanitizedWorkbook, chart.SheetID || ws.SheetID, chart.ChartID);
                    const chartXml = this.buildSpreadsheetDrawingMlChartXml(chart, safeSheetName, dataset);
                    zipEntries.push({ Name: chartPath, Data: this.encodeUtf8(chartXml) });

                    const pos = ParseCellAddress(chart.PositionCell || 'E2') ?? { row: 2, col: 5 };
                    const fromCol = Math.max(0, pos.col - 1);
                    const fromRow = Math.max(0, pos.row - 1);
                    const toCol = fromCol + 7;
                    const toRow = fromRow + 15;
                    anchorsXml.push(
                        `<xdr:twoCellAnchor>` +
                            `<xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
                            `<xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
                            `<xdr:graphicFrame macro="">` +
                            `<xdr:nvGraphicFramePr><xdr:cNvPr id="${cIdx + 2}" name="${this.escapeXml(chart.Title || chart.ChartID)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
                            `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
                            `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
                            `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${cRelId}"/>` +
                            `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/>` +
                            `</xdr:twoCellAnchor>`
                    );
                }
                const drawingXml = [
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">',
                    anchorsXml.join(''),
                    '</xdr:wsDr>'
                ].join('');
                const drawingRelsXml = [
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                    drawingRels.join(''),
                    '</Relationships>'
                ].join('');
                zipEntries.push({ Name: drawingPath, Data: this.encodeUtf8(drawingXml) });
                zipEntries.push({
                    Name: `xl/drawings/_rels/${drawingFileName}.rels`,
                    Data: this.encodeUtf8(drawingRelsXml)
                });
            }

            if (wsRels.length > 0) {
                const wsRelsXml = [
                    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
                    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
                    wsRels
                        .map(
                            (r) =>
                                `<Relationship Id="${r.Id}" Type="${r.Type}" Target="${this.escapeXml(r.Target)}"${
                                    r.TargetMode ? ` TargetMode="${r.TargetMode}"` : ''
                                }/>`
                        )
                        .join(''),
                    '</Relationships>'
                ].join('');
                zipEntries.push({ Name: `xl/worksheets/_rels/sheet${sheetNum}.xml.rels`, Data: this.encodeUtf8(wsRelsXml) });
            }

            const xml = this.buildWorksheetXml(ws, getStyleIndex, 1, {
                drawingRelId,
                hyperlinks: sheetHyperlinks
            });
            if (/ cm="\d+"/.test(xml)) {
                hasDynamicArrayCm = true;
            }
            zipEntries.push({ Name: path, Data: this.encodeUtf8(xml) });
        });

        if (includeMjMetadataSheet) {
            const metaSheetNum = sheetDefs.length + 1;
            const metaRelId = `rId${metaSheetNum}`;
            const metaPath = `xl/worksheets/sheet${metaSheetNum}.xml`;
            sheetDefs.push({
                Name: HIDDEN_META_SHEET_NAME,
                SheetId: metaSheetNum,
                RelId: metaRelId,
                Path: metaPath,
                Hidden: true
            });
            const metaXml = this.buildHiddenMetadataSheetXml(sanitizedWorkbook, true);
            zipEntries.push({ Name: metaPath, Data: this.encodeUtf8(metaXml) });
        }

        const stylesRelId = `rId${sheetDefs.length + 1}`;
        const metadataRelId = hasDynamicArrayCm ? `rId${sheetDefs.length + 2}` : undefined;
        if (hasDynamicArrayCm) {
            zipEntries.push({ Name: 'xl/metadata.xml', Data: this.encodeUtf8(this.buildCellMetadataXml()) });
        }
        zipEntries.unshift(
            {
                Name: '[Content_Types].xml',
                Data: this.encodeUtf8(
                    this.buildContentTypesXml(sheetDefs.length, hasDynamicArrayCm, extraContentTypeOverrides)
                )
            },
            { Name: '_rels/.rels', Data: this.encodeUtf8(this.buildRootRelsXml()) },
            { Name: 'xl/workbook.xml', Data: this.encodeUtf8(this.buildWorkbookXml(sheetDefs)) },
            {
                Name: 'xl/_rels/workbook.xml.rels',
                Data: this.encodeUtf8(this.buildWorkbookRelsXml(sheetDefs, stylesRelId, metadataRelId))
            },
            { Name: 'xl/styles.xml', Data: this.encodeUtf8(this.buildStylesXml(numFmts, cellXfs, fonts, fillFgs)) }
        );

        return this.buildZipArchive(zipEntries);
    }

    /**
     * Patches an existing `.xlsx` archive (`originalBytes`) in-place with updated cell values and formulas
     * from `workbook`, preserving all non-cell ZIP entries (drawings, charts, styles, comments, relationships)
     * and all non-`<sheetData>` worksheet XML elements (`<mergeCells>`, `<hyperlinks>`, `<dataValidations>`,
     * `<conditionalFormatting>`, `<drawing>`, `<legacyDrawing>`, etc.).
     */
    public PatchXlsxBytes(originalBytes: Uint8Array | ArrayBuffer, workbook: WorkbookSpec): Uint8Array {
        const u8 = originalBytes instanceof Uint8Array ? originalBytes : new Uint8Array(originalBytes);
        const baselineWb = this.ImportFromXlsxBytes(u8);
        const files = this.extractZipArchive(u8);
        const sanitized = this.cloneWorkbookWithoutViewerScopedData(workbook);

        const stripSelfClosingTagsWithAttr = (xml: string, openTagPrefix: string, attrPredicate: (tagBody: string) => boolean): string => {
            let out = '';
            let cursor = 0;
            const lowerXml = xml.toLowerCase();
            const lowerPrefix = openTagPrefix.toLowerCase();
            while (cursor < xml.length) {
                const start = lowerXml.indexOf(lowerPrefix, cursor);
                if (start === -1) {
                    out += xml.slice(cursor);
                    break;
                }
                const afterPrefix = xml[start + openTagPrefix.length] ?? '';
                if (!/\s/.test(afterPrefix)) {
                    out += xml.slice(cursor, start + openTagPrefix.length);
                    cursor = start + openTagPrefix.length;
                    continue;
                }
                const closeIdx = xml.indexOf('>', start + openTagPrefix.length);
                if (closeIdx === -1) {
                    out += xml.slice(cursor);
                    break;
                }
                const tagText = xml.slice(start, closeIdx + 1);
                const isSelfClosing = xml[closeIdx - 1] === '/';
                if (isSelfClosing && attrPredicate(tagText)) {
                    out += xml.slice(cursor, start);
                } else {
                    out += xml.slice(cursor, closeIdx + 1);
                }
                cursor = closeIdx + 1;
            }
            return out;
        };

        // Item 13: Remove stale xl/calcChain.xml and its references so Excel recalculates cleanly without repair prompts
        if (files.has('xl/calcChain.xml')) {
            files.delete('xl/calcChain.xml');
            if (files.has('[Content_Types].xml')) {
                const ctXml = this.decodeUtf8(files.get('[Content_Types].xml')!);
                const cleanedCt = stripSelfClosingTagsWithAttr(
                    ctXml,
                    '<Override',
                    (tag) => /PartName="\/?xl\/calcChain\.xml"/i.test(tag)
                );
                files.set('[Content_Types].xml', this.encodeUtf8(cleanedCt));
            }
            if (files.has('xl/_rels/workbook.xml.rels')) {
                const relsXml = this.decodeUtf8(files.get('xl/_rels/workbook.xml.rels')!);
                const cleanedRels = stripSelfClosingTagsWithAttr(
                    relsXml,
                    '<Relationship',
                    (tag) => /Target="\/?(?:xl\/)?calcChain\.xml"/i.test(tag)
                );
                files.set('xl/_rels/workbook.xml.rels', this.encodeUtf8(cleanedRels));
            }
        }

        const wbXml = files.has('xl/workbook.xml') ? this.decodeUtf8(files.get('xl/workbook.xml')!) : '';
        const wbRelsXml = files.has('xl/_rels/workbook.xml.rels')
            ? this.decodeUtf8(files.get('xl/_rels/workbook.xml.rels')!)
            : '';

        const targetByRelId = new Map<string, string>();
        const relRegex = /<Relationship\b[^>]*?>/g;
        let relMatch: RegExpExecArray | null;
        while ((relMatch = relRegex.exec(wbRelsXml)) !== null) {
            const tag = relMatch[0];
            const id = this.extractXmlAttr(tag, 'Id');
            const target = this.extractXmlAttr(tag, 'Target');
            if (id && target) {
                const cleanTarget = normalizeOoxmlRelTarget('xl', target);
                if (cleanTarget) {
                    targetByRelId.set(id, cleanTarget);
                }
            }
        }

        const sheetPathByName = new Map<string, string>();
        const orderedSheetPaths: string[] = [];
        const sheetTagRegex = /<sheet\b[^>]*?>/g;
        let sheetMatch: RegExpExecArray | null;
        while ((sheetMatch = sheetTagRegex.exec(wbXml)) !== null) {
            const tag = sheetMatch[0];
            const name = this.unescapeXml(this.extractXmlAttr(tag, 'name') || '');
            const rId = this.extractXmlAttr(tag, 'r:id') || this.extractXmlAttr(tag, 'id') || '';
            const path = targetByRelId.get(rId) || `xl/worksheets/sheet${orderedSheetPaths.length + 1}.xml`;
            if (name === HIDDEN_META_SHEET_NAME) {
                files.set(path, this.encodeUtf8(this.buildHiddenMetadataSheetXml(sanitized, true)));
                continue;
            }
            if (name) {
                sheetPathByName.set(name.toLowerCase(), path);
            }
            orderedSheetPaths.push(path);
        }

        const existingMetaXml = files.has('xl/metadata.xml')
            ? this.decodeUtf8(files.get('xl/metadata.xml')!)
            : null;
        const xldaprPlan = this.resolveOrEnsureXldaprMetadataXml(existingMetaXml);
        const cmAttrToken = ` cm="${xldaprPlan.cmIndex}"`;

        let patchedAnyDynamicArrayCm = false;
        sanitized.Worksheets.forEach((ws, idx) => {
            const targetPath =
                sheetPathByName.get(ws.Name.toLowerCase()) ??
                orderedSheetPaths[idx] ??
                `xl/worksheets/sheet${idx + 1}.xml`;
            const existingBytes = files.get(targetPath);
            if (!existingBytes) {
                const freshXml = this.buildWorksheetXml(ws, () => 0, xldaprPlan.cmIndex);
                if (freshXml.includes(cmAttrToken)) {
                    patchedAnyDynamicArrayCm = true;
                }
                files.set(targetPath, this.encodeUtf8(freshXml));
                return;
            }
            const baselineWs =
                baselineWb.Worksheets.find((b) => b.Name.toLowerCase() === ws.Name.toLowerCase()) ??
                baselineWb.Worksheets[idx];
            const origXml = this.decodeUtf8(existingBytes);
            const patchedXml = this.patchSingleWorksheetXml(origXml, ws, baselineWs, xldaprPlan.cmIndex);
            if (patchedXml.includes(cmAttrToken) || / cm="\d+"/.test(patchedXml)) {
                patchedAnyDynamicArrayCm = true;
            }
            files.set(targetPath, this.encodeUtf8(patchedXml));
        });

        if (patchedAnyDynamicArrayCm) {
            if (xldaprPlan.needsWrite) {
                files.set('xl/metadata.xml', this.encodeUtf8(xldaprPlan.metadataXml));
            }
            if (files.has('[Content_Types].xml')) {
                const ctXml = this.decodeUtf8(files.get('[Content_Types].xml')!);
                if (!/PartName="\/?xl\/metadata\.xml"/i.test(ctXml)) {
                    const updatedCt = ctXml.replace(
                        /<\/Types>/i,
                        () =>
                            '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/></Types>'
                    );
                    files.set('[Content_Types].xml', this.encodeUtf8(updatedCt));
                }
            }
            if (files.has('xl/_rels/workbook.xml.rels')) {
                const relsXml = this.decodeUtf8(files.get('xl/_rels/workbook.xml.rels')!);
                if (!/Target="\/?(?:xl\/)?metadata\.xml"/i.test(relsXml)) {
                    let maxRelNum = 0;
                    const idRx = /Id="rId(\d+)"/gi;
                    let idMatch: RegExpExecArray | null;
                    while ((idMatch = idRx.exec(relsXml)) !== null) {
                        const n = parseInt(idMatch[1], 10);
                        if (n > maxRelNum) maxRelNum = n;
                    }
                    const nextRelId = `rId${maxRelNum + 1}`;
                    const updatedRels = relsXml.replace(
                        /<\/Relationships>/i,
                        () =>
                            `<Relationship Id="${nextRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/></Relationships>`
                    );
                    files.set('xl/_rels/workbook.xml.rels', this.encodeUtf8(updatedRels));
                }
            }
        }

        const updatedEntries: Array<{ Name: string; Data: Uint8Array }> = [];
        for (const [name, data] of files.entries()) {
            updatedEntries.push({ Name: name, Data: data });
        }
        return this.buildZipArchive(updatedEntries);
    }

    private resolveOrEnsureXldaprMetadataXml(
        existingXml: string | null
    ): { cmIndex: number; metadataXml: string; needsWrite: boolean } {
        if (!existingXml) {
            return {
                cmIndex: 1,
                metadataXml: this.buildCellMetadataXml(),
                needsWrite: true
            };
        }

        let xml = existingXml;
        let mutated = false;

        if (!/xmlns:xda=/i.test(xml)) {
            xml = xml.replace(
                /<metadata\b/,
                () => '<metadata xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray"'
            );
            mutated = true;
        }

        const xldaprTypeTag =
            '<metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/>';
        const xldaprFutureBlock =
            '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>';

        let xldaprTypeIdx = 1;
        const typesBlockMatch = /<metadataTypes\b([^>]*)>([\s\S]*?)<\/metadataTypes>/i.exec(xml);
        if (typesBlockMatch) {
            const innerTypes = typesBlockMatch[2] ?? '';
            const typeTags = innerTypes.match(/<metadataType\b[^>]*\/?>/gi) ?? [];
            const foundZeroIdx = typeTags.findIndex((t) => /\bname="XLDAPR"/i.test(t));
            if (foundZeroIdx >= 0) {
                xldaprTypeIdx = foundZeroIdx + 1;
            } else {
                xldaprTypeIdx = typeTags.length + 1;
                const nextAttrs = /\bcount="\d+"/i.test(typesBlockMatch[1])
                    ? typesBlockMatch[1].replace(/\bcount="\d+"/i, () => `count="${xldaprTypeIdx}"`)
                    : `${typesBlockMatch[1]} count="${xldaprTypeIdx}"`;
                const nextTypesBlock = `<metadataTypes${nextAttrs}>${innerTypes}${xldaprTypeTag}</metadataTypes>`;
                xml = xml.replace(/<metadataTypes\b[^>]*>[\s\S]*?<\/metadataTypes>/i, () => nextTypesBlock);
                mutated = true;
            }
        } else {
            xldaprTypeIdx = 1;
            xml = xml.replace(
                /(<metadata\b[^>]*>)/i,
                (_m, openTag: string) => `${openTag}<metadataTypes count="1">${xldaprTypeTag}</metadataTypes>`
            );
            mutated = true;
        }

        if (!/<futureMetadata\b[^>]*\bname="XLDAPR"/i.test(xml)) {
            if (/<cellMetadata\b/i.test(xml)) {
                xml = xml.replace(/<cellMetadata\b/i, () => `${xldaprFutureBlock}<cellMetadata`);
            } else if (/<valueMetadata\b/i.test(xml)) {
                xml = xml.replace(/<valueMetadata\b/i, () => `${xldaprFutureBlock}<valueMetadata`);
            } else {
                xml = xml.replace(/<\/metadata>/i, () => `${xldaprFutureBlock}</metadata>`);
            }
            mutated = true;
        }

        let cmIndex = 1;
        const cellMetaMatch = /<cellMetadata\b([^>]*)>([\s\S]*?)<\/cellMetadata>/i.exec(xml);
        if (cellMetaMatch) {
            const innerCellMeta = cellMetaMatch[2] ?? '';
            const bkBlocks = innerCellMeta.match(/<bk\b[^>]*>[\s\S]*?<\/bk>/gi) ?? [];
            const targetRcRx = new RegExp(`<rc\\b[^>]*\\bt="${xldaprTypeIdx}"`, 'i');
            const foundBkZeroIdx = bkBlocks.findIndex((bk) => targetRcRx.test(bk));
            if (foundBkZeroIdx >= 0) {
                cmIndex = foundBkZeroIdx + 1;
            } else {
                cmIndex = bkBlocks.length + 1;
                const nextAttrs = /\bcount="\d+"/i.test(cellMetaMatch[1])
                    ? cellMetaMatch[1].replace(/\bcount="\d+"/i, () => `count="${cmIndex}"`)
                    : `${cellMetaMatch[1]} count="${cmIndex}"`;
                const nextCellMeta = `<cellMetadata${nextAttrs}>${innerCellMeta}<bk><rc t="${xldaprTypeIdx}" v="0"/></bk></cellMetadata>`;
                xml = xml.replace(/<cellMetadata\b[^>]*>[\s\S]*?<\/cellMetadata>/i, () => nextCellMeta);
                mutated = true;
            }
        } else {
            cmIndex = 1;
            const freshCellMeta = `<cellMetadata count="1"><bk><rc t="${xldaprTypeIdx}" v="0"/></bk></cellMetadata>`;
            if (/<valueMetadata\b/i.test(xml)) {
                xml = xml.replace(/<valueMetadata\b/i, () => `${freshCellMeta}<valueMetadata`);
            } else {
                xml = xml.replace(/<\/metadata>/i, () => `${freshCellMeta}</metadata>`);
            }
            mutated = true;
        }

        return {
            cmIndex,
            metadataXml: xml,
            needsWrite: mutated
        };
    }

    private patchSingleWorksheetXml(
        origXml: string,
        ws: WorksheetSpec,
        baselineWs?: WorksheetSpec,
        dynamicArrayCmIndex: number = 1
    ): string {
        interface OrigXmlCellMeta {
            addr: string;
            row: number;
            col: number;
            openAttrs: string;
            sAttr: string | null;
            cmAttr: string | null;
            vmAttr: string | null;
            fFullXml: string | null;
            fType: string;
            sharedSi: string | null;
            fRef: string | null;
            fBodyRaw: string;
        }

        const origCellsByAddr = new Map<string, OrigXmlCellMeta>();
        const sharedGroupsBySi = new Map<string, { master: OrigXmlCellMeta | null; followers: OrigXmlCellMeta[] }>();

        const cScanRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cScanMatch: RegExpExecArray | null;
        while ((cScanMatch = cScanRegex.exec(origXml)) !== null) {
            const openAttrs = cScanMatch[1] ?? '';
            const inner = cScanMatch[2] ?? '';
            const rRaw = this.extractXmlAttr(openAttrs, 'r');
            if (!rRaw) continue;
            const addr = rRaw.toUpperCase();
            const pos = ParseCellAddress(addr);
            if (!pos) continue;

            const sAttr = this.extractXmlAttr(openAttrs, 's');
            const cmAttr = this.extractXmlAttr(openAttrs, 'cm');
            const vmAttr = this.extractXmlAttr(openAttrs, 'vm');

            let fFullXml: string | null = null;
            let fType = '';
            let sharedSi: string | null = null;
            let fRef: string | null = null;
            let fBodyRaw = '';

            const fMatch = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner);
            if (fMatch) {
                fFullXml = fMatch[0];
                const fAttrs = fMatch[1] ?? '';
                fType = (this.extractXmlAttr(fAttrs, 't') ?? '').toLowerCase();
                sharedSi = this.extractXmlAttr(fAttrs, 'si');
                fRef = this.extractXmlAttr(fAttrs, 'ref');
                fBodyRaw = this.unescapeXml((fMatch[2] ?? '').trim());
            }

            const meta: OrigXmlCellMeta = {
                addr,
                row: pos.row,
                col: pos.col,
                openAttrs,
                sAttr,
                cmAttr,
                vmAttr,
                fFullXml,
                fType,
                sharedSi,
                fRef,
                fBodyRaw
            };
            origCellsByAddr.set(addr, meta);

            if (fType === 'shared' && sharedSi !== null) {
                let grp = sharedGroupsBySi.get(sharedSi);
                if (!grp) {
                    grp = { master: null, followers: [] };
                    sharedGroupsBySi.set(sharedSi, grp);
                }
                if (fBodyRaw.length > 0 || fRef !== null) {
                    grp.master = meta;
                } else {
                    grp.followers.push(meta);
                }
            }
        }

        const normalizeFormulaForXmlDiff = (f: string | null | undefined): string => {
            if (!f) return '';
            const trimmed = f.trim();
            const body = trimmed.startsWith('=') ? trimmed.slice(1).trim() : trimmed;
            return stripOoxmlFormulaPrefixes(body).trim();
        };

        // Determine which cell addresses actually changed compared to baselineWs
        const dirtyAddrs = new Set<string>();
        const allAddrs = new Set<string>([
            ...Object.keys(ws.Cells).map((a) => a.toUpperCase()),
            ...Object.keys(baselineWs?.Cells ?? {}).map((a) => a.toUpperCase())
        ]);
        for (const addr of allAddrs) {
            const cur = ws.Cells[addr];
            const base = baselineWs?.Cells[addr];
            if (!cur && base) {
                dirtyAddrs.add(addr);
                continue;
            }
            if (cur && !base) {
                dirtyAddrs.add(addr);
                continue;
            }
            if (cur && base) {
                const curFormula = normalizeFormulaForXmlDiff(cur.Formula);
                const baseFormula = normalizeFormulaForXmlDiff(base.Formula);
                const curVal = cur.ComputedValue ?? cur.RawValue ?? null;
                const baseVal = base.ComputedValue ?? base.RawValue ?? null;
                if (curFormula !== baseFormula || curVal !== baseVal) {
                    dirtyAddrs.add(addr);
                }
            }
        }

        const clearedSpillSet = getClearedSpillSet(ws);
        if (clearedSpillSet) {
            for (const clearedAddr of clearedSpillSet) {
                dirtyAddrs.add(clearedAddr.toUpperCase());
            }
        }

        // D2 Case B: Check whether any shared-formula master had its formula edited, overwritten with a literal, or deleted.
        // If so, expand all surviving follower cells with matching `si` into explicit translated <f>...</f> elements!
        const invalidatedSharedSi = new Set<string>();
        for (const [si, grp] of sharedGroupsBySi.entries()) {
            if (!grp.master) {
                invalidatedSharedSi.add(si);
                for (const fol of grp.followers) dirtyAddrs.add(fol.addr);
                continue;
            }
            const curMaster = ws.Cells[grp.master.addr];
            const baseMaster = baselineWs?.Cells[grp.master.addr];
            const origMasterNorm = normalizeFormulaForXmlDiff(baseMaster?.Formula ?? grp.master.fBodyRaw);
            const curMasterNorm = normalizeFormulaForXmlDiff(curMaster?.Formula);
            if (!curMaster || !curMaster.Formula || curMasterNorm !== origMasterNorm) {
                invalidatedSharedSi.add(si);
                dirtyAddrs.add(grp.master.addr);
                for (const fol of grp.followers) {
                    dirtyAddrs.add(fol.addr);
                }
            }
        }

        // R7-8, R8-8, R5-3 & R6-1: Enforce non-overlapping array anchors up front before clearing stale child cells.
        const patchArrayAnchorRects: ArrayAnchorRect[] = [];
        for (const orig of origCellsByAddr.values()) {
            if (!(orig.fType === 'array' || Boolean(orig.cmAttr)) || !orig.fRef || !orig.fRef.includes(':')) continue;
            if (!orig.fBodyRaw && !baselineWs?.Cells[orig.addr]?.Formula && !ws.Cells[orig.addr]?.Formula) continue;
            const spillBounds = ParseRangeAddress(orig.fRef, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (!spillBounds) continue;
            if (orig.row !== spillBounds.startRow || orig.col !== spillBounds.startCol) {
                throw new Error(
                    `Spreadsheet patch rejected: array anchor ${orig.addr} is not the top-left cell of '${orig.fRef}'.`
                );
            }
            patchArrayAnchorRects.push({
                anchorAddr: orig.addr,
                startRow: spillBounds.startRow,
                endRow: spillBounds.endRow,
                startCol: spillBounds.startCol,
                endCol: spillBounds.endCol
            });
        }
        assertNoOverlappingArrayAnchors(patchArrayAnchorRects);

        let sharedPatchAddrIndex: Map<number, Array<{ row: number; addr: string }>> | null = null;
        for (const orig of origCellsByAddr.values()) {
            if (!(orig.fType === 'array' || Boolean(orig.cmAttr)) || !orig.fRef || !orig.fRef.includes(':')) continue;
            const curAnchor = ws.Cells[orig.addr];
            const baseAnchor = baselineWs?.Cells[orig.addr];
            if (!orig.fBodyRaw && !baseAnchor?.Formula && !curAnchor?.Formula) {
                continue;
            }
            const hasCurStandardFormula = Boolean(
                curAnchor?.Formula &&
                    curAnchor.Formula.trim().startsWith('=') &&
                    !this.ParseMjCustomFunctionFormula(curAnchor.Formula)
            );
            const curNorm = normalizeFormulaForXmlDiff(curAnchor?.Formula);
            const baseNorm = normalizeFormulaForXmlDiff(baseAnchor?.Formula ?? orig.fBodyRaw);
            if (!curAnchor || !hasCurStandardFormula || curNorm !== baseNorm) {
                const spillBounds = ParseRangeAddress(orig.fRef, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                if (!spillBounds) continue;
                const fRefArea =
                    (spillBounds.endRow - spillBounds.startRow + 1) *
                    (spillBounds.endCol - spillBounds.startCol + 1);
                if (fRefArea <= 0 || fRefArea > MAX_DYNAMIC_ARRAY_CELLS) continue;
                const clearChildAt = (childAddr: string): void => {
                    if (childAddr === orig.addr) return;
                    const childOrig = origCellsByAddr.get(childAddr);
                    if (childOrig?.fFullXml && childOrig.fBodyRaw.length > 0) return;
                    const curChild = ws.Cells[childAddr];
                    const baseChild = baselineWs?.Cells[childAddr];
                    if (curChild) {
                        const hasNewUserFormula = Boolean(curChild.Formula && curChild.Formula.trim().length > 0);
                        const userEditedRaw = (curChild.RawValue ?? null) !== (baseChild?.RawValue ?? null);
                        if (!hasNewUserFormula && !userEditedRaw) {
                            if (curChild.Style || curChild.Note || childOrig?.sAttr) {
                                ws.Cells[childAddr] = {
                                    ...curChild,
                                    RawValue: null,
                                    ComputedValue: null,
                                    DisplayValue: ''
                                };
                            } else {
                                delete ws.Cells[childAddr];
                            }
                            dirtyAddrs.add(childAddr);
                        }
                    } else if (childOrig) {
                        dirtyAddrs.add(childAddr);
                    }
                };
                if (fRefArea > 256) {
                    if (!sharedPatchAddrIndex) {
                        const allAddrs = new Set<string>(origCellsByAddr.keys());
                        for (const k of Object.keys(ws.Cells)) {
                            allAddrs.add(k);
                        }
                        sharedPatchAddrIndex = buildColSortedAddrIndex(allAddrs);
                    }
                    scanColSortedAddrIndex(
                        sharedPatchAddrIndex,
                        spillBounds.startRow,
                        spillBounds.endRow,
                        spillBounds.startCol,
                        spillBounds.endCol,
                        clearChildAt
                    );
                } else {
                    for (let r = spillBounds.startRow; r <= spillBounds.endRow; r++) {
                        for (let c = spillBounds.startCol; c <= spillBounds.endCol; c++) {
                            clearChildAt(FormatCellAddress(r, c));
                        }
                    }
                }
            }
        }

        // If no cells changed on this worksheet, return origXml byte-for-byte untouched
        if (dirtyAddrs.size === 0 && baselineWs) {
            return origXml;
        }

        const rewriteCellOpenAttrsWithType = (rawOpenAttrs: string, targetType: string | null): string => {
            const hasExistingT = /(?:^|\s)t="[^"]*"/i.test(rawOpenAttrs);
            if (targetType === null) {
                return rawOpenAttrs.replace(/\s+t="[^"]*"/gi, () => '');
            }
            if (hasExistingT) {
                return rawOpenAttrs.replace(/(^|\s)t="[^"]*"/i, (_m, lead: string) => `${lead}t="${targetType}"`);
            }
            return `${rawOpenAttrs} t="${targetType}"`;
        };

        const buildCellTagXml = (cell: SpreadsheetCellSpec): string | null => {
            const addr = cell.Address.toUpperCase();
            const orig = origCellsByAddr.get(addr);
            const baseCell = baselineWs?.Cells[addr];
            const val = cell.ComputedValue ?? cell.RawValue;
            const hasStandardFormula = Boolean(
                cell.Formula &&
                cell.Formula.trim().startsWith('=') &&
                !this.ParseMjCustomFunctionFormula(cell.Formula)
            );

            const curNorm = normalizeFormulaForXmlDiff(cell.Formula);
            const baseNorm = normalizeFormulaForXmlDiff(baseCell?.Formula ?? orig?.fBodyRaw);
            const isInvalidatedSharedCell = Boolean(
                orig?.fType === 'shared' && orig.sharedSi !== null && invalidatedSharedSi.has(orig.sharedSi)
            );

            // D2 & E7 Case A: Formula text did NOT change (only cached <v> changed) -> preserve <c> attrs and <f ...>...</f> verbatim!
            const cellMeta = getCellXmlMetaMap().get(cell);
            const arrayRefMismatch = orig?.fType === 'array' && (
                cellMeta?.fType !== 'array' || (cellMeta?.fRef ?? null) !== (orig.fRef ?? null)
            );
            if (hasStandardFormula && orig?.fFullXml && curNorm === baseNorm && !isInvalidatedSharedCell && !arrayRefMismatch) {
                const formulaBodyA = cell.Formula!.trim().slice(1);
                if (isUnimplementedDynamicArrayError(formulaBodyA, val)) {
                    const cAttrs = rewriteCellOpenAttrsWithType(orig.openAttrs, null);
                    return `<c${cAttrs}>${orig.fFullXml}</c>`;
                }
                if (typeof val === 'number' && Number.isFinite(val)) {
                    const cAttrs = rewriteCellOpenAttrsWithType(orig.openAttrs, 'n');
                    return `<c${cAttrs}>${orig.fFullXml}<v>${val}</v></c>`;
                }
                if (typeof val === 'boolean') {
                    const cAttrs = rewriteCellOpenAttrsWithType(orig.openAttrs, 'b');
                    return `<c${cAttrs}>${orig.fFullXml}<v>${val ? 1 : 0}</v></c>`;
                }
                if (typeof val === 'string' && this.isErrorValue(val)) {
                    const cAttrs = rewriteCellOpenAttrsWithType(orig.openAttrs, 'e');
                    return `<c${cAttrs}>${orig.fFullXml}<v>${this.escapeXml(val)}</v></c>`;
                }
                if (val !== null && val !== undefined && String(val) !== '') {
                    const cAttrs = rewriteCellOpenAttrsWithType(orig.openAttrs, 'str');
                    return `<c${cAttrs}>${orig.fFullXml}<v>${this.escapeXml(String(val))}</v></c>`;
                }
                const cAttrs = rewriteCellOpenAttrsWithType(orig.openAttrs, null);
                return `<c${cAttrs}>${orig.fFullXml}</c>`;
            }

            // Case B: Formula was newly authored, explicitly edited, expanded from an invalidated shared master, or cleared
            const origS = orig?.sAttr ?? null;
            const sAttr = origS ? ` s="${this.escapeXml(origS)}"` : '';

            let rawFormulaBody = '';
            if (hasStandardFormula) {
                rawFormulaBody = cell.Formula!.trim().slice(1);
            } else if (isInvalidatedSharedCell && orig?.sharedSi !== null && cell.Formula === undefined) {
                const grp = sharedGroupsBySi.get(orig.sharedSi);
                if (grp?.master && (orig.row !== grp.master.row || orig.col !== grp.master.col)) {
                    rawFormulaBody = shiftSharedFormulaRelativeRefs(
                        grp.master.fBodyRaw.startsWith('=') ? grp.master.fBodyRaw.slice(1) : grp.master.fBodyRaw,
                        orig.row - grp.master.row,
                        orig.col - grp.master.col
                    );
                }
            }

            let cExtraMetaAttrs = '';
            let formulaXml = '';
            if (rawFormulaBody.length > 0) {
                const prefixedFormula = prefixOoxmlFutureFunctions(rawFormulaBody);
                const isSpillDynArray = isSpillDynamicArrayFormulaBody(rawFormulaBody);
                const origMeta: { fType?: string; fRef?: string | null; cmAttr?: string | null } = {
                    fType: cellMeta?.fType ?? (orig?.fType !== 'array' ? orig?.fType : undefined),
                    fRef: cellMeta?.fRef ?? (orig?.fType !== 'array' ? orig?.fRef : null),
                    cmAttr: cellMeta?.cmAttr ?? orig?.cmAttr
                };
                const formulaDirty = cellMeta?.formulaDirty ?? true;
                const isCseExpr = this.isCseOrArrayFormula('=' + rawFormulaBody, this.sheetToWorkbook.get(ws));
                const keepCseArray = origMeta.fType === 'array' && (
                    !formulaDirty || isCseExpr
                );
                if (isSpillDynArray || keepCseArray) {
                    const arrayRef = isSpillDynArray || Boolean(origMeta.cmAttr)
                        ? cell.Address
                        : origMeta.fRef || cell.Address;
                    const cmVal = isSpillDynArray
                        ? String(dynamicArrayCmIndex)
                        : origMeta.cmAttr
                          ? origMeta.cmAttr
                          : null;
                    if (cmVal) {
                        cExtraMetaAttrs += ` cm="${this.escapeXml(cmVal)}"`;
                    }
                    formulaXml = `<f t="array" ref="${this.escapeXml(arrayRef)}">${this.escapeXml(prefixedFormula)}</f>`;
                } else {
                    formulaXml = `<f>${this.escapeXml(prefixedFormula)}</f>`;
                }
            }

            const cBaseAttrs = ` r="${cell.Address}"${sAttr}${cExtraMetaAttrs}`;
            if (rawFormulaBody.length > 0 && isUnimplementedDynamicArrayError(rawFormulaBody, val)) {
                return `<c${cBaseAttrs}>${formulaXml}</c>`;
            }
            if (typeof val === 'number' && Number.isFinite(val)) {
                return `<c${cBaseAttrs} t="n">${formulaXml}<v>${val}</v></c>`;
            }
            if (typeof val === 'boolean') {
                return `<c${cBaseAttrs} t="b">${formulaXml}<v>${val ? 1 : 0}</v></c>`;
            }
            if (typeof val === 'string' && this.isErrorValue(val)) {
                return `<c${cBaseAttrs} t="e">${formulaXml}<v>${this.escapeXml(val)}</v></c>`;
            }
            if (val !== null && val !== undefined && String(val) !== '') {
                if (formulaXml) {
                    return `<c${cBaseAttrs} t="str">${formulaXml}<v>${this.escapeXml(String(val))}</v></c>`;
                }
                return `<c r="${cell.Address}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(String(val))}</t></is></c>`;
            }
            if (formulaXml) {
                return `<c${cBaseAttrs}>${formulaXml}</c>`;
            }
            if (origS) {
                return `<c r="${cell.Address}"${sAttr}/>`;
            }
            return null;
        };

        // Group dirty cells by row number
        const dirtyRowsMap = new Map<number, Set<string>>();
        for (const addr of dirtyAddrs) {
            const pos = ParseCellAddress(addr);
            if (!pos) continue;
            let rowSet = dirtyRowsMap.get(pos.row);
            if (!rowSet) {
                rowSet = new Set<string>();
                dirtyRowsMap.set(pos.row, rowSet);
            }
            rowSet.add(addr);
        }

        // Parse existing <row ...>...</row> or <row .../> blocks from origXml's <sheetData>
        const existingRowByNum = new Map<number, { openAttrs: string; innerXml: string; fullRowXml: string }>();
        const sheetDataMatch = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(origXml);
        if (sheetDataMatch) {
            const sdInner = sheetDataMatch[1];
            const rowBlockRegex = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
            let rm: RegExpExecArray | null;
            while ((rm = rowBlockRegex.exec(sdInner)) !== null) {
                const openAttrs = rm[1] ?? '';
                const innerXml = rm[2] ?? '';
                const rAttr = this.extractXmlAttr(openAttrs, 'r');
                const rNum = rAttr ? parseInt(rAttr, 10) : NaN;
                if (!Number.isNaN(rNum) && rNum >= 1) {
                    existingRowByNum.set(rNum, { openAttrs, innerXml, fullRowXml: rm[0] });
                }
            }
        }

        const allRowNumsSet = new Set<number>([
            ...existingRowByNum.keys(),
            ...dirtyRowsMap.keys()
        ]);
        const sortedRowNums = Array.from(allRowNumsSet).sort((a, b) => a - b);

        let maxRow = 1;
        let maxCol = 1;
        for (const cell of Object.values(ws.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (pos) {
                if (pos.row > maxRow) maxRow = pos.row;
                if (pos.col > maxCol) maxCol = pos.col;
            }
        }
        for (const rNum of sortedRowNums) {
            if (rNum > maxRow) maxRow = rNum;
        }

        const rowsXmlParts: string[] = [];
        for (const rNum of sortedRowNums) {
            const existingRow = existingRowByNum.get(rNum);
            const dirtyInRow = dirtyRowsMap.get(rNum);
            // If this row has no dirty cells, preserve its original XML byte-for-byte (including ht, customHeight, hidden, styled blanks, rich text)
            if (existingRow && (!dirtyInRow || dirtyInRow.size === 0)) {
                rowsXmlParts.push(existingRow.fullRowXml);
                continue;
            }

            // Collect untouched <c> tags from existingRow and merge with updated dirty <c> tags sorted by column
            const cellsByCol = new Map<number, string>();
            if (existingRow && existingRow.innerXml) {
                const cellBlockRegex = /<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g;
                let cbm: RegExpExecArray | null;
                while ((cbm = cellBlockRegex.exec(existingRow.innerXml)) !== null) {
                    const cAddr = (this.extractXmlAttr(cbm[1], 'r') || '').toUpperCase();
                    const pos = ParseCellAddress(cAddr);
                    if (!pos) continue;
                    if (pos.col > maxCol) maxCol = pos.col;
                    if (!dirtyInRow?.has(cAddr)) {
                        cellsByCol.set(pos.col, cbm[0]);
                    }
                }
            }

            if (dirtyInRow) {
                for (const dAddr of dirtyInRow) {
                    const pos = ParseCellAddress(dAddr);
                    if (!pos) continue;
                    const cellSpec = ws.Cells[dAddr];
                    if (!cellSpec) {
                        const origS = origCellsByAddr.get(dAddr)?.sAttr ?? null;
                        if (origS) {
                            cellsByCol.set(pos.col, `<c r="${dAddr}" s="${this.escapeXml(origS)}"/>`);
                        } else {
                            cellsByCol.delete(pos.col);
                        }
                        continue;
                    }
                    const built = buildCellTagXml(cellSpec);
                    if (built) {
                        cellsByCol.set(pos.col, built);
                    } else {
                        cellsByCol.delete(pos.col);
                    }
                }
            }

            const sortedCols = Array.from(cellsByCol.keys()).sort((a, b) => a - b);
            const mergedCellsXml = sortedCols.map((c) => cellsByCol.get(c)!).join('');
            if (existingRow) {
                const openTag = `<row${existingRow.openAttrs}>`;
                rowsXmlParts.push(`${openTag}${mergedCellsXml}</row>`);
            } else if (mergedCellsXml.length > 0) {
                rowsXmlParts.push(`<row r="${rNum}">${mergedCellsXml}</row>`);
            }
        }

        const newSheetDataXml = `<sheetData>${rowsXmlParts.join('')}</sheetData>`;
        let resultXml = origXml;
        if (/<sheetData\b[^>]*\/>/.test(resultXml)) {
            resultXml = resultXml.replace(/<sheetData\b[^>]*\/>/, () => newSheetDataXml);
        } else if (/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/.test(resultXml)) {
            resultXml = resultXml.replace(/<sheetData\b[^>]*>[\s\S]*?<\/sheetData>/, () => newSheetDataXml);
        }

        const dimRef = `A1:${FormatCellAddress(maxRow, maxCol)}`;
        if (/<dimension\b[^>]*ref="[^"]*"[^>]*\/>/.test(resultXml)) {
            resultXml = resultXml.replace(
                /<dimension\b([^>]*)ref="[^"]*"([^>]*)\/>/,
                (_m, g1: string, g2: string) => `<dimension${g1}ref="${dimRef}"${g2}/>`
            );
        }
        return resultXml;
    }

    /**
     * Imports an OpenXML `.xlsx` binary (`Uint8Array` or `ArrayBuffer`) into a {@link WorkbookSpec},
     * preserving worksheets, cell values, formulas (`<f>`), number/currency/percent/date formats (`numFmt`),
     * column widths, frozen panes, and any MJ metadata (`_mj_sheets_meta` or `configuration`) (`Accept #4`).
     */
    public ImportFromXlsxBytes(
        bytes: Uint8Array | ArrayBuffer,
        configurationJson?: string | null
    ): WorkbookSpec {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const files = this.extractZipArchive(u8);

        // Parse sharedStrings.xml if present using O(N) indexOf tag scanning (avoids polynomial regex backtracking)
        const sharedStrings: string[] = [];
        const ssBytes = files.get('xl/sharedStrings.xml');
        if (ssBytes) {
            const ssXml = this.decodeUtf8(ssBytes);
            for (const siInner of this.extractXmlElementBodies(ssXml, 'si')) {
                const tParts = this.extractXmlElementBodies(siInner, 't').map((part) => this.unescapeXml(part));
                sharedStrings.push(tParts.join(''));
            }
        }

        // Parse styles.xml for numFmt and bold fonts
        const styleLookup = this.parseStylesXml(
            files.has('xl/styles.xml') ? this.decodeUtf8(files.get('xl/styles.xml')!) : ''
        );

        // Parse workbook.xml + workbook.xml.rels to map sheet names to worksheet XML paths
        const wbXml = files.has('xl/workbook.xml') ? this.decodeUtf8(files.get('xl/workbook.xml')!) : '';
        const wbRelsXml = files.has('xl/_rels/workbook.xml.rels')
            ? this.decodeUtf8(files.get('xl/_rels/workbook.xml.rels')!)
            : '';

        const targetByRelId = new Map<string, string>();
        const relRegex = /<Relationship\b[^>]*?>/g;
        let relMatch: RegExpExecArray | null;
        while ((relMatch = relRegex.exec(wbRelsXml)) !== null) {
            const tag = relMatch[0];
            const id = this.extractXmlAttr(tag, 'Id');
            const target = this.extractXmlAttr(tag, 'Target');
            if (id && target) {
                const cleanTarget = normalizeOoxmlRelTarget('xl', target);
                if (cleanTarget) {
                    targetByRelId.set(id, cleanTarget);
                }
            }
        }

        interface SheetEntry {
            name: string;
            path: string;
            hidden: boolean;
        }
        const sheetEntries: SheetEntry[] = [];
        const seenSheetPaths = new Set<string>();
        const registerSheetEntry = (entry: SheetEntry): void => {
            const normPath = entry.path.replace(/^\/+/, '').toLowerCase();
            if (seenSheetPaths.has(normPath)) {
                throw new Error(`Spreadsheet import rejected: duplicate worksheet part path '${entry.path}'.`);
            }
            seenSheetPaths.add(normPath);
            sheetEntries.push(entry);
            if (sheetEntries.length > MAX_IMPORT_SHEETS) {
                throw new Error(
                    `Spreadsheet import rejected: workbook exceeds maximum sheet limit (${MAX_IMPORT_SHEETS}).`
                );
            }
        };
        const sheetTagRegex = /<sheet\b[^>]*?>/g;
        let sheetMatch: RegExpExecArray | null;
        while ((sheetMatch = sheetTagRegex.exec(wbXml)) !== null) {
            const tag = sheetMatch[0];
            const name = this.unescapeXml(this.extractXmlAttr(tag, 'name') || 'Sheet');
            const rId = this.extractXmlAttr(tag, 'r:id') || this.extractXmlAttr(tag, 'id') || '';
            const state = this.extractXmlAttr(tag, 'state') || '';
            const path = targetByRelId.get(rId) || `xl/worksheets/sheet${sheetEntries.length + 1}.xml`;
            registerSheetEntry({
                name,
                path,
                hidden: state === 'hidden' || state === 'veryHidden'
            });
        }

        if (sheetEntries.length === 0) {
            for (const key of Array.from(files.keys()).sort()) {
                if (/^xl\/worksheets\/sheet\d+\.xml$/.test(key)) {
                    registerSheetEntry({
                        name: `Sheet ${sheetEntries.length + 1}`,
                        path: key,
                        hidden: false
                    });
                }
            }
        }

        let embeddedMetaJson: string | null = null;
        for (let idx = 0; idx < sheetEntries.length; idx++) {
            const entry = sheetEntries[idx];
            if (entry.name !== HIDDEN_META_SHEET_NAME) continue;
            const wsBytes = files.get(entry.path);
            if (!wsBytes) continue;
            embeddedMetaJson = this.extractMetadataFromHiddenSheetXml(this.decodeUtf8(wsBytes), sharedStrings);
            break;
        }

        // Parse MJ metadata upfront if present so worksheet SheetIDs match before formula stable-ID compilation
        const metaCandidate = configurationJson || embeddedMetaJson;
        let metaWorkbook: Partial<WorkbookSpec> | null = null;
        if (metaCandidate && metaCandidate.trim().startsWith('{')) {
            try {
                metaWorkbook = JSON.parse(metaCandidate) as Partial<WorkbookSpec>;
            } catch {
                metaWorkbook = null;
            }
        }

        const importBudget: SpreadsheetImportBudget = {
            cells: 0,
            formulas: 0,
            formulaBytes: 0,
            arrayAnchors: 0,
            validationRules: 0,
            colTags: 0,
            merges: 0,
            charts: 0,
            drawingAnchors: 0
        };
        const worksheets: WorksheetSpec[] = [];
        let totalCommentsSeen = 0;
        for (let idx = 0; idx < sheetEntries.length; idx++) {
            const entry = sheetEntries[idx];
            if (entry.name === HIDDEN_META_SHEET_NAME) continue;
            const wsBytes = files.get(entry.path);
            if (!wsBytes) continue;
            const wsXml = this.decodeUtf8(wsBytes);

            const sheetOrdinal = worksheets.length;
            const matchedMetaWs = Array.isArray(metaWorkbook?.Worksheets)
                ? (metaWorkbook!.Worksheets!.find((m) => m.Name === entry.name) ??
                  metaWorkbook!.Worksheets![sheetOrdinal])
                : undefined;
            const targetSheetId = matchedMetaWs?.SheetID || `sheet-${sheetOrdinal + 1}`;

            const ws = this.parseWorksheetXml(
                wsXml,
                targetSheetId,
                entry.name,
                sharedStrings,
                styleLookup,
                importBudget
            );

            // Resolve per-worksheet relationships (comments, drawings/charts) safely
            const slashIdx = entry.path.lastIndexOf('/');
            const wsDir = slashIdx >= 0 ? entry.path.slice(0, slashIdx) : 'xl/worksheets';
            const wsFileName = slashIdx >= 0 ? entry.path.slice(slashIdx + 1) : entry.path;
            const wsRelsPath = `${wsDir}/_rels/${wsFileName}.rels`;
            if (files.has(wsRelsPath)) {
                const wsRelsXml = this.decodeUtf8(files.get(wsRelsPath)!);
                const wsRelRegex = /<Relationship\b[^>]*?>/g;
                let wsRelMatch: RegExpExecArray | null;
                while ((wsRelMatch = wsRelRegex.exec(wsRelsXml)) !== null) {
                    const relTag = wsRelMatch[0];
                    const relType = this.extractXmlAttr(relTag, 'Type') || '';
                    const relTarget = this.extractXmlAttr(relTag, 'Target') || '';
                    const targetMode = this.extractXmlAttr(relTag, 'TargetMode') || '';
                    if (targetMode.toLowerCase() === 'external') continue;
                    const resolvedPath = normalizeOoxmlRelTarget(wsDir, relTarget);
                    if (!resolvedPath || !files.has(resolvedPath)) continue;

                    if (relType.endsWith('/comments')) {
                        const commentsXml = this.decodeUtf8(files.get(resolvedPath)!);
                        const cmtRegex = /<comment\b([^>]*)>([\s\S]*?)<\/comment>/g;
                        let cmtMatch: RegExpExecArray | null;
                        while ((cmtMatch = cmtRegex.exec(commentsXml)) !== null) {
                            if (++totalCommentsSeen > MAX_IMPORT_WORKBOOK_CELLS) {
                                throw new Error(
                                    `Spreadsheet import rejected: workbook exceeds maximum comment limit (${MAX_IMPORT_WORKBOOK_CELLS}).`
                                );
                            }
                            const refAttr = this.extractXmlAttr(cmtMatch[1], 'ref');
                            if (!refAttr) continue;
                            const pos = ParseCellAddress(refAttr);
                            if (!pos) continue;
                            const canonical = FormatCellAddress(pos.row, pos.col);
                            const tBodies = this.extractXmlElementBodies(cmtMatch[2], 't');
                            const noteText = tBodies.map((tb) => this.unescapeXml(tb)).join('');
                            if (!noteText) continue;
                            const existingCell = Object.hasOwn(ws.Cells, canonical) ? ws.Cells[canonical] : undefined;
                            if (existingCell) {
                                if (!existingCell.Note) existingCell.Note = noteText;
                            } else {
                                if (++importBudget.cells > MAX_IMPORT_WORKBOOK_CELLS) {
                                    throw new Error(
                                        `Spreadsheet import rejected: workbook exceeds maximum cell limit (${MAX_IMPORT_WORKBOOK_CELLS}).`
                                    );
                                }
                                this.ensureSheetCapacity(ws, pos.row, pos.col);
                                ws.Cells[canonical] = {
                                    RowID: this.getStableRowIdForIndex(ws, pos.row),
                                    ColumnID: this.getStableColIdForIndex(ws, pos.col),
                                    Address: canonical,
                                    RawValue: null,
                                    ComputedValue: null,
                                    DisplayValue: '',
                                    Note: noteText
                                };
                            }
                        }
                    } else if (relType.endsWith('/drawing') && (!matchedMetaWs?.Charts || matchedMetaWs.Charts.length === 0)) {
                        const drawingXml = this.decodeUtf8(files.get(resolvedPath)!);
                        const dSlash = resolvedPath.lastIndexOf('/');
                        const dDir = dSlash >= 0 ? resolvedPath.slice(0, dSlash) : 'xl/drawings';
                        const dFile = dSlash >= 0 ? resolvedPath.slice(dSlash + 1) : resolvedPath;
                        const dRelsPath = `${dDir}/_rels/${dFile}.rels`;
                        const chartByRelId = new Map<string, string>();
                        if (files.has(dRelsPath)) {
                            const dRelsXml = this.decodeUtf8(files.get(dRelsPath)!);
                            const dRelRegex = /<Relationship\b[^>]*?>/g;
                            let dm: RegExpExecArray | null;
                            while ((dm = dRelRegex.exec(dRelsXml)) !== null) {
                                const dId = this.extractXmlAttr(dm[0], 'Id');
                                const dTarget = this.extractXmlAttr(dm[0], 'Target');
                                const dType = this.extractXmlAttr(dm[0], 'Type') || '';
                                if (dId && dTarget && dType.endsWith('/chart')) {
                                    const chartPath = normalizeOoxmlRelTarget(dDir, dTarget);
                                    if (chartPath) chartByRelId.set(dId, chartPath);
                                }
                            }
                        }
                        const anchors = this.extractXmlElementBodies(drawingXml, 'xdr:twoCellAnchor');
                        importBudget.drawingAnchors += anchors.length;
                        if (importBudget.drawingAnchors > MAX_IMPORT_DRAWING_ANCHORS) {
                            throw new Error(
                                `Spreadsheet import rejected: workbook exceeds maximum drawing anchor limit (${MAX_IMPORT_DRAWING_ANCHORS}).`
                            );
                        }
                        for (let aIdx = 0; aIdx < anchors.length; aIdx++) {
                            const anchorXml = anchors[aIdx];
                            const chartRefMatch = /<c:chart\b[^>]*\br:id="([^"]+)"/i.exec(anchorXml);
                            if (!chartRefMatch) continue;
                            const chartPath = chartByRelId.get(chartRefMatch[1]);
                            if (!chartPath || !files.has(chartPath)) continue;
                            if (++importBudget.charts > MAX_IMPORT_WORKBOOK_CHARTS) {
                                throw new Error(
                                    `Spreadsheet import rejected: workbook exceeds maximum chart limit (${MAX_IMPORT_WORKBOOK_CHARTS}).`
                                );
                            }
                            const chartXml = this.decodeUtf8(files.get(chartPath)!);
                            const chartType: SpreadsheetChartType = chartXml.includes('<c:lineChart')
                                ? 'line'
                                : chartXml.includes('<c:pieChart')
                                  ? 'pie'
                                  : chartXml.includes('<c:areaChart')
                                    ? 'area'
                                    : 'bar';
                            const titleBodies = this.extractXmlElementBodies(chartXml, 'a:t');
                            const chartTitle = titleBodies.length > 0 ? this.unescapeXml(titleBodies.join(' ')) : `Chart ${ws.Charts.length + 1}`;
                            const fBodies = this.extractXmlElementBodies(chartXml, 'c:f');
                            let sourceRange = 'A1:B5';
                            if (fBodies.length > 0) {
                                const firstF = this.unescapeXml(fBodies[0]);
                                const bangIdx = firstF.lastIndexOf('!');
                                const rawA1 = (bangIdx >= 0 ? firstF.slice(bangIdx + 1) : firstF).replace(/\$/g, '');
                                const lastF = fBodies.length > 1 ? this.unescapeXml(fBodies[fBodies.length - 1]) : firstF;
                                const lastBang = lastF.lastIndexOf('!');
                                const lastA1 = (lastBang >= 0 ? lastF.slice(lastBang + 1) : lastF).replace(/\$/g, '');
                                const b1 = ParseRangeAddress(rawA1, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                                const b2 = ParseRangeAddress(lastA1, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                                if (b1 && b2) {
                                    const minR = Math.max(1, Math.min(b1.startRow, b2.startRow) - 1);
                                    const maxR = Math.max(b1.endRow, b2.endRow);
                                    const minC = Math.min(b1.startCol, b2.startCol);
                                    const maxC = Math.max(b1.endCol, b2.endCol);
                                    sourceRange = `${FormatCellAddress(minR, minC)}:${FormatCellAddress(maxR, maxC)}`;
                                }
                            }
                            const fromColMatch = /<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/i.exec(
                                anchorXml
                            );
                            const posCell = fromColMatch
                                ? FormatCellAddress(parseInt(fromColMatch[2], 10) + 1, parseInt(fromColMatch[1], 10) + 1)
                                : 'E2';
                            ws.Charts.push({
                                ChartID: `chart-${ws.Charts.length + 1}`,
                                Title: chartTitle,
                                ChartType: chartType,
                                SheetID: ws.SheetID,
                                SourceRange: sourceRange,
                                PositionCell: posCell,
                                ShowLegend: chartXml.includes('<c:legend')
                            });
                        }
                    }
                }
            }
            worksheets.push(ws);
        }

        const now = new Date().toISOString();
        const finalWorksheets =
            worksheets.length > 0 ? worksheets : [this.CreateEmptyWorksheet('sheet-1', 'Sheet 1')];

        if (metaWorkbook && Array.isArray(metaWorkbook.Worksheets)) {
            for (let i = 0; i < finalWorksheets.length; i++) {
                const ws = finalWorksheets[i];
                const metaWs =
                    metaWorkbook.Worksheets.find((m) => m.Name === ws.Name || m.SheetID === ws.SheetID) ??
                    metaWorkbook.Worksheets[i];
                if (metaWs) {
                    ws.SheetID = metaWs.SheetID || ws.SheetID;
                    ws.SortSpec = metaWs.SortSpec ?? null;
                    ws.FilterSpecs = Array.isArray(metaWs.FilterSpecs) ? metaWs.FilterSpecs : ws.FilterSpecs;
                    ws.LiveTables = Array.isArray(metaWs.LiveTables) ? metaWs.LiveTables : ws.LiveTables;
                    ws.Charts = Array.isArray(metaWs.Charts) && metaWs.Charts.length > 0 ? metaWs.Charts : ws.Charts;
                    ws.EmbeddedArtifacts = Array.isArray(metaWs.EmbeddedArtifacts)
                        ? metaWs.EmbeddedArtifacts
                        : ws.EmbeddedArtifacts;
                    ws.ValidationRules =
                        Array.isArray(metaWs.ValidationRules) && metaWs.ValidationRules.length > 0
                            ? metaWs.ValidationRules
                            : ws.ValidationRules;
                    ws.ConditionalFormats = Array.isArray(metaWs.ConditionalFormats)
                        ? metaWs.ConditionalFormats
                        : ws.ConditionalFormats;
                    ws.ProtectedRanges = Array.isArray(metaWs.ProtectedRanges)
                        ? metaWs.ProtectedRanges
                        : (ws.ProtectedRanges ?? []);
                    if ((!ws.MergeRanges || ws.MergeRanges.length === 0) && Array.isArray(metaWs.MergeRanges)) {
                        ws.MergeRanges = metaWs.MergeRanges;
                    }
                    if (Array.isArray(metaWs.Rows) && metaWs.Rows.length > 0) {
                        let maxMetaRow = ws.Rows.length;
                        for (const mr of metaWs.Rows) {
                            if (typeof mr.Index === 'number' && mr.Index > maxMetaRow) {
                                maxMetaRow = mr.Index;
                            }
                        }
                        this.ensureSheetCapacity(ws, maxMetaRow, 1);
                        for (const mr of metaWs.Rows) {
                            if (typeof mr.Index !== 'number' || mr.Index < 1 || mr.Index > ws.Rows.length) continue;
                            const targetRow = ws.Rows[mr.Index - 1];
                            if (typeof mr.Height === 'number' && Number.isFinite(mr.Height) && mr.Height > 0) {
                                targetRow.Height = mr.Height;
                            }
                            if (mr.Hidden !== undefined) {
                                targetRow.Hidden = Boolean(mr.Hidden);
                            }
                        }
                    }
                    if (Array.isArray(metaWs.Columns) && metaWs.Columns.length > 0) {
                        let maxMetaCol = ws.Columns.length;
                        for (const mc of metaWs.Columns) {
                            if (typeof mc.Index === 'number' && mc.Index > maxMetaCol) {
                                maxMetaCol = mc.Index;
                            }
                        }
                        this.ensureSheetCapacity(ws, 1, maxMetaCol);
                        for (const mc of metaWs.Columns) {
                            if (typeof mc.Index !== 'number' || mc.Index < 1 || mc.Index > ws.Columns.length) continue;
                            const targetCol = ws.Columns[mc.Index - 1];
                            if (typeof mc.Width === 'number' && Number.isFinite(mc.Width) && mc.Width > 0) {
                                targetCol.Width = mc.Width;
                            }
                            if (mc.Hidden !== undefined) {
                                targetCol.Hidden = Boolean(mc.Hidden);
                            }
                        }
                    }
                    if (Array.isArray(metaWs.ClearedSpillChildren) && metaWs.ClearedSpillChildren.length > 0) {
                        for (const addr of metaWs.ClearedSpillChildren) {
                            if (typeof addr === 'string') {
                                addClearedSpillAddr(ws, addr);
                            }
                        }
                    }
                    // Restore =MJ.* formulas, AiInputHash, notes, and extended/CSS-token styles preserved in metaWs
                    if (metaWs.Cells) {
                        for (const [addr, metaCell] of Object.entries(metaWs.Cells)) {
                            if (!metaCell) continue;
                            if (addr === '__proto__' || addr === 'constructor' || addr === 'prototype') continue;
                            const pos = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
                            if (!pos) continue;
                            const canonical = FormatCellAddress(pos.row, pos.col);
                            const parsedMjMeta = metaCell.Formula
                                ? this.ParseMjCustomFunctionFormula(metaCell.Formula)
                                : null;
                            const isMjFormula = Boolean(parsedMjMeta);
                            const hasMetaStyle = Boolean(
                                metaCell.Style &&
                                    (metaCell.Style.Bold ||
                                        metaCell.Style.Italic ||
                                        metaCell.Style.TextColor ||
                                        metaCell.Style.BackgroundColor ||
                                        metaCell.Style.HorizontalAlign ||
                                        metaCell.Style.FormatType ||
                                        metaCell.Style.NumberFormatPattern)
                            );
                            let targetCell = Object.hasOwn(ws.Cells, canonical) ? ws.Cells[canonical] : undefined;
                            if (!targetCell && (isMjFormula || hasMetaStyle || Boolean(metaCell.Note))) {
                                this.ensureSheetCapacity(ws, pos.row, pos.col);
                                targetCell = Object.hasOwn(ws.Cells, canonical) ? ws.Cells[canonical] : undefined;
                                if (!targetCell) {
                                    targetCell = {
                                        RowID: this.getStableRowIdForIndex(ws, pos.row),
                                        ColumnID: this.getStableColIdForIndex(ws, pos.col),
                                        Address: canonical,
                                        RawValue: null,
                                        Formula: isMjFormula ? metaCell.Formula : null,
                                        FormulaStable: null,
                                        ComputedValue: null,
                                        DisplayValue: '',
                                        Style: metaCell.Style
                                    };
                                    ws.Cells[canonical] = targetCell;
                                }
                            }
                            if (targetCell && isMjFormula && metaCell.Formula) {
                                targetCell.Formula = metaCell.Formula;
                                targetCell.FormulaStable =
                                    metaCell.FormulaStable ??
                                    this.CompileFormulaToStableIds(ws, metaCell.Formula);
                                if (parsedMjMeta?.Kind === 'AI') {
                                    if (typeof metaCell.AiInputHash === 'string' && metaCell.AiInputHash.length > 0) {
                                        targetCell.AiInputHash = metaCell.AiInputHash;
                                    }
                                    if (metaCell.ComputedValue !== undefined && metaCell.ComputedValue !== null) {
                                        targetCell.ComputedValue = metaCell.ComputedValue;
                                        targetCell.DisplayValue =
                                            metaCell.DisplayValue ?? this.FormatCellValue(metaCell.ComputedValue, targetCell.Style);
                                    }
                                    if (metaCell.AccessDenied !== undefined) {
                                        targetCell.AccessDenied = metaCell.AccessDenied;
                                    }
                                    if (metaCell.ErrorMessage !== undefined) {
                                        targetCell.ErrorMessage = metaCell.ErrorMessage;
                                    }
                                }
                                this.syncCellVirtualAxisIndex(ws, targetCell);
                            }
                            if (targetCell && hasMetaStyle && metaCell.Style) {
                                targetCell.Style = { ...(targetCell.Style ?? {}), ...metaCell.Style };
                                targetCell.DisplayValue = this.FormatCellValue(
                                    targetCell.ComputedValue ?? targetCell.RawValue,
                                    targetCell.Style
                                );
                            }
                            if (targetCell && metaCell.Note) {
                                targetCell.Note = metaCell.Note;
                            }
                        }
                    }
                }
            }
        }

        const wb: WorkbookSpec = {
            WorkbookID: metaWorkbook?.WorkbookID || `wb-${Date.now().toString(36)}`,
            Title: metaWorkbook?.Title || 'Imported Workbook',
            ActiveSheetID: finalWorksheets[0].SheetID,
            Worksheets: finalWorksheets,
            NamedRanges: Array.isArray(metaWorkbook?.NamedRanges) ? metaWorkbook!.NamedRanges! : [],
            ...(typeof metaWorkbook?.PreferredObjectsPaneHeightPx === 'number' &&
            Number.isFinite(metaWorkbook.PreferredObjectsPaneHeightPx) &&
            metaWorkbook.PreferredObjectsPaneHeightPx > 0
                ? { PreferredObjectsPaneHeightPx: Math.round(metaWorkbook.PreferredObjectsPaneHeightPx) }
                : {}),
            CreatedAt: metaWorkbook?.CreatedAt || now,
            UpdatedAt: now
        };

        this.bindSheetsToWorkbook(wb);
        this.AssertWorkbookWithinLimits(wb);
        this.EvaluateWorkbook(wb);
        return wb;
    }

    // -----------------------------------------------------------------------
    // OpenXML Worksheet & Styles Builders / Parsers
    // -----------------------------------------------------------------------

    private buildWorksheetXml(
        ws: WorksheetSpec,
        getStyleIndex: (style?: SpreadsheetCellStyleSpec) => number,
        dynamicArrayCmIndex: number = 1,
        ooxmlExtras?: {
            drawingRelId?: string;
            hyperlinks?: Array<{ Ref: string; RelId: string; Display?: string }>;
        }
    ): string {
        let maxRow = 1;
        let maxCol = 1;
        for (const cell of Object.values(ws.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (pos) {
                if (pos.row > maxRow) maxRow = pos.row;
                if (pos.col > maxCol) maxCol = pos.col;
            }
        }

        const colsXmlParts: string[] = [];
        for (const col of ws.Columns) {
            const hasCustomWidth = typeof col.Width === 'number' && col.Width !== DEFAULT_COLUMN_WIDTH;
            if (hasCustomWidth || col.Hidden) {
                const widthVal = col.Width ?? DEFAULT_COLUMN_WIDTH;
                const customAttr = hasCustomWidth ? ' customWidth="1"' : '';
                const hiddenAttr = col.Hidden ? ' hidden="1"' : '';
                colsXmlParts.push(
                    `<col min="${col.Index}" max="${col.Index}" width="${widthVal}"${customAttr}${hiddenAttr}/>`
                );
            }
        }
        const colsSection = colsXmlParts.length > 0 ? `<cols>${colsXmlParts.join('')}</cols>` : '';

        const sheetViewsXml =
            ws.FrozenRows > 0 || ws.FrozenColumns > 0
                ? `<sheetViews><sheetView workbookViewId="0"><pane ${
                      ws.FrozenColumns > 0 ? `xSplit="${ws.FrozenColumns}" ` : ''
                  }${
                      ws.FrozenRows > 0 ? `ySplit="${ws.FrozenRows}" ` : ''
                  }topLeftCell="${FormatCellAddress(ws.FrozenRows + 1, ws.FrozenColumns + 1)}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>`
                : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';

        // Group cells by row number
        const cellsByRow = new Map<number, SpreadsheetCellSpec[]>();
        for (const cell of Object.values(ws.Cells)) {
            const pos = ParseCellAddress(cell.Address);
            if (!pos) continue;
            const list = cellsByRow.get(pos.row) ?? [];
            list.push(cell);
            cellsByRow.set(pos.row, list);
        }

        const rowSpecByIndex = new Map<number, SpreadsheetRowSpec>();
        const rowNumSet = new Set<number>(cellsByRow.keys());
        for (const row of ws.Rows) {
            rowSpecByIndex.set(row.Index, row);
            const hasCustomHeight = typeof row.Height === 'number' && row.Height !== DEFAULT_ROW_HEIGHT;
            if (hasCustomHeight || row.Hidden) {
                rowNumSet.add(row.Index);
                if (row.Index > maxRow) maxRow = row.Index;
            }
        }

        const rowNums = Array.from(rowNumSet).sort((a, b) => a - b);
        const rowsXmlParts: string[] = [];

        for (const rNum of rowNums) {
            const rowSpec = rowSpecByIndex.get(rNum);
            const hasCustomHeight =
                typeof rowSpec?.Height === 'number' &&
                Number.isFinite(rowSpec.Height) &&
                rowSpec.Height > 0 &&
                rowSpec.Height !== DEFAULT_ROW_HEIGHT;
            const rowAttrs = `${hasCustomHeight ? ` ht="${rowSpec!.Height}" customHeight="1"` : ''}${
                rowSpec?.Hidden ? ' hidden="1"' : ''
            }`;

            const rowCells = (cellsByRow.get(rNum) ?? []).sort((a, b) => {
                const pA = ParseCellAddress(a.Address);
                const pB = ParseCellAddress(b.Address);
                return (pA?.col ?? 0) - (pB?.col ?? 0);
            });
            const cellTags: string[] = [];
            for (const cell of rowCells) {
                const sIdx = getStyleIndex(cell.Style);
                const sAttr = sIdx > 0 ? ` s="${sIdx}"` : '';
                const val = cell.ComputedValue ?? cell.RawValue;
                const hasStandardFormula = Boolean(
                    cell.Formula &&
                    cell.Formula.trim().startsWith('=') &&
                    !this.ParseMjCustomFunctionFormula(cell.Formula)
                );
                const rawFormulaBody = hasStandardFormula ? cell.Formula!.trim().slice(1) : '';
                const isSpillDynArray = rawFormulaBody.length > 0 && isSpillDynamicArrayFormulaBody(rawFormulaBody);
                const origMeta = getCellXmlMetaMap().get(cell);
                const formulaDirty = origMeta?.formulaDirty ?? true;
                const isCseExpr = this.isCseOrArrayFormula('=' + rawFormulaBody, this.sheetToWorkbook.get(ws));
                const keepCseArray = origMeta?.fType === 'array' && (
                    !formulaDirty || isCseExpr
                );
                let cExtraMetaAttrs = '';
                const prefixedFormula = rawFormulaBody.length > 0 ? prefixOoxmlFutureFunctions(rawFormulaBody) : '';
                let formulaXml = '';
                if (hasStandardFormula) {
                    if (isSpillDynArray || keepCseArray) {
                        const arrayRef = isSpillDynArray || Boolean(origMeta?.cmAttr)
                            ? cell.Address
                            : origMeta?.fRef || cell.Address;
                        const cmVal = (isSpillDynArray || Boolean(origMeta?.cmAttr)) && dynamicArrayCmIndex
                            ? String(dynamicArrayCmIndex)
                            : null;
                        if (cmVal) {
                            cExtraMetaAttrs = ` cm="${this.escapeXml(cmVal)}"`;
                        }
                        formulaXml = `<f t="array" ref="${this.escapeXml(arrayRef)}">${this.escapeXml(prefixedFormula)}</f>`;
                    } else {
                        formulaXml = `<f>${this.escapeXml(prefixedFormula)}</f>`;
                    }
                }

                if (rawFormulaBody.length > 0 && isUnimplementedDynamicArrayError(rawFormulaBody, val)) {
                    cellTags.push(`<c r="${cell.Address}"${sAttr}${cExtraMetaAttrs}>${formulaXml}</c>`);
                } else if (typeof val === 'number' && !Number.isNaN(val)) {
                    cellTags.push(`<c r="${cell.Address}"${sAttr}${cExtraMetaAttrs} t="n">${formulaXml}<v>${val}</v></c>`);
                } else if (typeof val === 'boolean') {
                    cellTags.push(`<c r="${cell.Address}"${sAttr}${cExtraMetaAttrs} t="b">${formulaXml}<v>${val ? 1 : 0}</v></c>`);
                } else if (typeof val === 'string' && this.isErrorValue(val)) {
                    cellTags.push(
                        `<c r="${cell.Address}"${sAttr}${cExtraMetaAttrs} t="e">${formulaXml}<v>${this.escapeXml(val)}</v></c>`
                    );
                } else if (val !== null && val !== undefined && String(val) !== '') {
                    if (formulaXml) {
                        cellTags.push(
                            `<c r="${cell.Address}"${sAttr}${cExtraMetaAttrs} t="str">${formulaXml}<v>${this.escapeXml(String(val))}</v></c>`
                        );
                    } else {
                        cellTags.push(
                            `<c r="${cell.Address}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(String(val))}</t></is></c>`
                        );
                    }
                } else if (formulaXml) {
                    cellTags.push(`<c r="${cell.Address}"${sAttr}${cExtraMetaAttrs}>${formulaXml}</c>`);
                } else if (sIdx > 0) {
                    cellTags.push(`<c r="${cell.Address}"${sAttr}/>`);
                }
            }
            if (cellTags.length > 0) {
                rowsXmlParts.push(`<row r="${rNum}"${rowAttrs}>${cellTags.join('')}</row>`);
            } else if (rowAttrs.length > 0) {
                rowsXmlParts.push(`<row r="${rNum}"${rowAttrs}/>`);
            }
        }

        const mergeRanges = (ws.MergeRanges ?? []).filter((mr) => {
            const b = ParseRangeAddress(mr, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            return Boolean(b && (b.endRow > b.startRow || b.endCol > b.startCol));
        });
        const mergeCellsXml =
            mergeRanges.length > 0
                ? `<mergeCells count="${mergeRanges.length}">${mergeRanges
                      .map((mr) => `<mergeCell ref="${this.escapeXml(mr.toUpperCase())}"/>`)
                      .join('')}</mergeCells>`
                : '';

        const dvTags: string[] = [];
        for (const vr of ws.ValidationRules ?? []) {
            if (!ParseRangeAddress(vr.Range, EXCEL_MAX_ROWS, EXCEL_MAX_COLS)) continue;
            const errAttr = vr.ErrorMessage
                ? ` showErrorMessage="1" error="${this.escapeXml(vr.ErrorMessage)}"`
                : '';
            if (vr.RuleType === 'list') {
                const listCsv = (vr.AllowedValues ?? []).join(',');
                dvTags.push(
                    `<dataValidation type="list" allowBlank="1" showDropDown="0" sqref="${this.escapeXml(vr.Range.toUpperCase())}"${errAttr}><formula1>&quot;${this.escapeXml(listCsv)}&quot;</formula1></dataValidation>`
                );
            } else if (vr.RuleType === 'numberRange') {
                const minV = vr.MinValue !== undefined ? String(vr.MinValue) : '0';
                const maxV = vr.MaxValue !== undefined ? String(vr.MaxValue) : '999999999';
                dvTags.push(
                    `<dataValidation type="decimal" operator="between" allowBlank="1" sqref="${this.escapeXml(vr.Range.toUpperCase())}"${errAttr}><formula1>${this.escapeXml(minV)}</formula1><formula2>${this.escapeXml(maxV)}</formula2></dataValidation>`
                );
            } else if (vr.RuleType === 'notEmpty') {
                const firstCell = vr.Range.split(':')[0].trim().toUpperCase();
                dvTags.push(
                    `<dataValidation type="custom" allowBlank="0" sqref="${this.escapeXml(vr.Range.toUpperCase())}"${errAttr}><formula1>LEN(TRIM(${this.escapeXml(firstCell)}))&gt;0</formula1></dataValidation>`
                );
            }
        }
        const dataValidationsXml =
            dvTags.length > 0 ? `<dataValidations count="${dvTags.length}">${dvTags.join('')}</dataValidations>` : '';

        const hyperlinksXml =
            ooxmlExtras?.hyperlinks && ooxmlExtras.hyperlinks.length > 0
                ? `<hyperlinks>${ooxmlExtras.hyperlinks
                      .map(
                          (h) =>
                              `<hyperlink ref="${this.escapeXml(h.Ref)}" r:id="${h.RelId}"${
                                  h.Display ? ` display="${this.escapeXml(h.Display)}"` : ''
                              }/>`
                      )
                      .join('')}</hyperlinks>`
                : '';

        const drawingXml = ooxmlExtras?.drawingRelId ? `<drawing r:id="${ooxmlExtras.drawingRelId}"/>` : '';

        const dimensionRef = `A1:${FormatCellAddress(maxRow, maxCol)}`;
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
            `<dimension ref="${dimensionRef}"/>`,
            sheetViewsXml,
            '<sheetFormatPr defaultRowHeight="15"/>',
            colsSection,
            `<sheetData>${rowsXmlParts.join('')}</sheetData>`,
            mergeCellsXml,
            dataValidationsXml,
            hyperlinksXml,
            drawingXml,
            '</worksheet>'
        ].join('');
    }

    private buildHiddenMetadataSheetXml(workbook: WorkbookSpec, alreadySanitized = false): string {
        // B4 & R8-3: Strip viewer-scoped values AND omit redundant plain scalar/standard-formula cells & default axis arrays
        // already persisted in the visible OOXML worksheets so large exports (e.g. 10k x 6) keep _mj_sheets_meta compact.
        const sanitized = alreadySanitized ? workbook : this.cloneWorkbookWithoutViewerScopedData(workbook);
        const compactMeta = {
            WorkbookID: sanitized.WorkbookID,
            Title: sanitized.Title,
            ActiveSheetID: sanitized.ActiveSheetID,
            NamedRanges: sanitized.NamedRanges,
            ...(typeof sanitized.PreferredObjectsPaneHeightPx === 'number' &&
            Number.isFinite(sanitized.PreferredObjectsPaneHeightPx) &&
            sanitized.PreferredObjectsPaneHeightPx > 0
                ? { PreferredObjectsPaneHeightPx: Math.round(sanitized.PreferredObjectsPaneHeightPx) }
                : {}),
            CreatedAt: sanitized.CreatedAt,
            UpdatedAt: sanitized.UpdatedAt,
            Worksheets: sanitized.Worksheets.map((ws) => {
                const mjOnlyCells: Record<string, SpreadsheetCellSpec> = {};
                for (const [addr, cell] of Object.entries(ws.Cells)) {
                    if (!cell) continue;
                    const hasExtendedStyle = Boolean(
                        cell.Style &&
                            (cell.Style.Italic ||
                                cell.Style.TextColor ||
                                cell.Style.BackgroundColor ||
                                cell.Style.HorizontalAlign)
                    );
                    if (
                        (cell.Formula && this.ParseMjCustomFunctionFormula(cell.Formula)) ||
                        Boolean(cell.Note) ||
                        hasExtendedStyle
                    ) {
                        mjOnlyCells[addr] = cell;
                    }
                }
                const nonDefaultRows = ws.Rows.filter(
                    (r) => Boolean(r.Hidden) || (typeof r.Height === 'number' && r.Height !== DEFAULT_ROW_HEIGHT)
                ).map((r) => ({
                    RowID: r.RowID,
                    Index: r.Index,
                    ...(typeof r.Height === 'number' && r.Height !== DEFAULT_ROW_HEIGHT ? { Height: r.Height } : {}),
                    ...(r.Hidden ? { Hidden: true } : {})
                }));
                const nonDefaultCols = ws.Columns.filter(
                    (c) => Boolean(c.Hidden) || (typeof c.Width === 'number' && c.Width !== DEFAULT_COLUMN_WIDTH)
                ).map((c) => ({
                    ColumnID: c.ColumnID,
                    Index: c.Index,
                    Letter: c.Letter,
                    ...(typeof c.Width === 'number' && c.Width !== DEFAULT_COLUMN_WIDTH ? { Width: c.Width } : {}),
                    ...(c.Hidden ? { Hidden: true } : {})
                }));
                return {
                    SheetID: ws.SheetID,
                    Name: ws.Name,
                    FrozenRows: ws.FrozenRows,
                    FrozenColumns: ws.FrozenColumns,
                    SortSpec: ws.SortSpec,
                    FilterSpecs: ws.FilterSpecs,
                    ValidationRules: ws.ValidationRules,
                    ConditionalFormats: ws.ConditionalFormats,
                    LiveTables: ws.LiveTables,
                    Charts: ws.Charts,
                    EmbeddedArtifacts: ws.EmbeddedArtifacts,
                    ProtectedRanges: ws.ProtectedRanges ?? [],
                    MergeRanges: ws.MergeRanges ?? [],
                    Rows: nonDefaultRows,
                    Columns: nonDefaultCols,
                    Cells: mjOnlyCells
                };
            })
        };
        const json = JSON.stringify(compactMeta);
        const chunks: string[] = [];
        for (let i = 0; i < json.length; i += META_CHUNK_SIZE) {
            chunks.push(json.slice(i, i + META_CHUNK_SIZE));
        }
        const rowsXml = chunks
            .map(
                (chunk, idx) =>
                    `<row r="${idx + 1}"><c r="A${idx + 1}" t="inlineStr"><is><t xml:space="preserve">${this.escapeXml(chunk)}</t></is></c></row>`
            )
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            `<sheetData>${rowsXml}</sheetData>`,
            '</worksheet>'
        ].join('');
    }

    /**
     * Linear O(N) XML element body scanner (`<tag ...>body</tag>`) that avoids polynomial regex backtracking on untrusted OOXML.
     */
    private extractXmlElementBodies(xml: string, tagName: string): string[] {
        const results: string[] = [];
        const openPrefix = `<${tagName}`;
        const closeTag = `</${tagName}>`;
        let cursor = 0;
        while (cursor < xml.length) {
            const openIdx = xml.indexOf(openPrefix, cursor);
            if (openIdx === -1) break;
            const afterNameIdx = openIdx + openPrefix.length;
            const nextCh = xml[afterNameIdx];
            if (nextCh !== '>' && nextCh !== ' ' && nextCh !== '\t' && nextCh !== '\r' && nextCh !== '\n' && nextCh !== '/') {
                cursor = afterNameIdx;
                continue;
            }
            const tagEndIdx = xml.indexOf('>', afterNameIdx);
            if (tagEndIdx === -1) break;
            if (xml[tagEndIdx - 1] === '/') {
                cursor = tagEndIdx + 1;
                continue;
            }
            const closeIdx = xml.indexOf(closeTag, tagEndIdx + 1);
            if (closeIdx === -1) break;
            results.push(xml.slice(tagEndIdx + 1, closeIdx));
            cursor = closeIdx + closeTag.length;
        }
        return results;
    }

    private extractFirstXmlElementBody(xml: string, tagName: string): string | null {
        const bodies = this.extractXmlElementBodies(xml, tagName);
        return bodies.length > 0 ? bodies[0] : null;
    }

    private extractMetadataFromHiddenSheetXml(wsXml: string, sharedStrings: string[]): string | null {
        const chunks: string[] = [];
        const cRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
        let match: RegExpExecArray | null;
        while ((match = cRegex.exec(wsXml)) !== null) {
            const attrs = match[1];
            const inner = match[2];
            const t = this.extractXmlAttr(attrs, 't');
            if (t === 's') {
                const vBody = this.extractFirstXmlElementBody(inner, 'v');
                if (vBody !== null && /^\d+$/.test(vBody.trim())) {
                    chunks.push(sharedStrings[parseInt(vBody.trim(), 10)] ?? '');
                }
            } else {
                const tBody = this.extractFirstXmlElementBody(inner, 't');
                if (tBody !== null) {
                    chunks.push(this.unescapeXml(tBody));
                }
            }
        }
        const combined = chunks.join('').trim();
        return combined.startsWith('{') ? combined : null;
    }

    private parseWorksheetXml(
        wsXml: string,
        sheetId: string,
        sheetName: string,
        sharedStrings: string[],
        styleLookup: Array<{
            FormatPattern?: string;
            Bold?: boolean;
            Italic?: boolean;
            TextColor?: string;
            BackgroundColor?: string;
            HorizontalAlign?: 'left' | 'center' | 'right';
        }>,
        importBudget?: SpreadsheetImportBudget
    ): WorksheetSpec {
        const budget: SpreadsheetImportBudget = importBudget ?? {
            cells: 0,
            formulas: 0,
            formulaBytes: 0,
            arrayAnchors: 0,
            validationRules: 0,
            colTags: 0,
            merges: 0,
            charts: 0,
            drawingAnchors: 0
        };
        const ws = this.CreateEmptyWorksheet(sheetId, sheetName);

        // Parse frozen panes if present
        const paneMatch = /<pane\b([^>]*?)\/?>/.exec(wsXml);
        if (paneMatch) {
            const ySplit = this.extractXmlAttr(paneMatch[1], 'ySplit');
            const xSplit = this.extractXmlAttr(paneMatch[1], 'xSplit');
            if (ySplit) ws.FrozenRows = parseInt(ySplit, 10) || 0;
            if (xSplit) ws.FrozenColumns = parseInt(xSplit, 10) || 0;
        }

        // Pre-calculate max row & col dimensions upfront (R8-3) so ensureSheetCapacity allocates in a single call
        let preMaxRow = ws.Rows.length;
        let preMaxCol = ws.Columns.length;

        const dimMatch = /<dimension\b([^>]*?)\/?>/.exec(wsXml);
        if (dimMatch) {
            const dimRef = this.extractXmlAttr(dimMatch[1], 'ref');
            if (dimRef) {
                const dimBounds = ParseRangeAddress(dimRef, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                if (dimBounds) {
                    if (dimBounds.endRow > preMaxRow) preMaxRow = dimBounds.endRow;
                    if (dimBounds.endCol > preMaxCol) preMaxCol = dimBounds.endCol;
                } else {
                    const singleDim = parseCellCoordsFast(dimRef) ?? ParseCellAddress(dimRef);
                    if (singleDim) {
                        if (singleDim.row > preMaxRow) preMaxRow = singleDim.row;
                        if (singleDim.col > preMaxCol) preMaxCol = singleDim.col;
                    }
                }
            }
        }

        // Check trailing <row r="..."> in case of sized sheets with empty trailing rows
        const lastRowOpenIdx = wsXml.lastIndexOf('<row');
        if (lastRowOpenIdx !== -1) {
            const lastRowEndIdx = wsXml.indexOf('>', lastRowOpenIdx + 4);
            if (lastRowEndIdx !== -1) {
                const lastRAttr = this.extractXmlAttr(wsXml.slice(lastRowOpenIdx + 4, lastRowEndIdx), 'r');
                const lastRNum = lastRAttr ? parseInt(lastRAttr, 10) : 0;
                if (lastRNum > preMaxRow) preMaxRow = lastRNum;
            }
        }

        // Parse row height & hidden overrides when present
        const parsedRowProps: Array<{ row: number; height?: number; hidden: boolean }> = [];
        if (wsXml.indexOf('ht=') !== -1 || wsXml.indexOf('hidden=') !== -1) {
            const rowOpenRegex = /<row\b([^>]*?)(?:\/>|>)/g;
            let rowMatch: RegExpExecArray | null;
            while ((rowMatch = rowOpenRegex.exec(wsXml)) !== null) {
                const attrs = rowMatch[1];
                if (attrs.indexOf('ht=') === -1 && attrs.indexOf('hidden=') === -1) {
                    continue;
                }
                const rNum = parseInt(this.extractXmlAttr(attrs, 'r') || '0', 10);
                if (rNum <= 0) continue;
                const htNum = parseFloat(this.extractXmlAttr(attrs, 'ht') || '0');
                const hiddenAttr = this.extractXmlAttr(attrs, 'hidden');
                const isHidden = hiddenAttr === '1' || hiddenAttr?.toLowerCase() === 'true';
                if (htNum > 0 || isHidden) {
                    if (rNum > preMaxRow) preMaxRow = rNum;
                    parsedRowProps.push({
                        row: rNum,
                        height: htNum > 0 ? Number(htNum.toFixed(2)) : undefined,
                        hidden: isHidden
                    });
                }
            }
        }

        // Parse column widths & hidden flags (enforcing workbook-wide <col> limit, R6-1)
        const parsedCols: Array<{ min: number; max: number; width?: number; hidden: boolean }> = [];
        const colRegex = /<col\b([^>]*?)\/?>/g;
        let colMatch: RegExpExecArray | null;
        while ((colMatch = colRegex.exec(wsXml)) !== null) {
            if (++budget.colTags > MAX_IMPORT_WORKBOOK_COL_TAGS) {
                throw new Error(
                    `Spreadsheet import rejected: workbook exceeds maximum <col> entry limit (${MAX_IMPORT_WORKBOOK_COL_TAGS}).`
                );
            }
            const attrs = colMatch[1];
            const min = parseInt(this.extractXmlAttr(attrs, 'min') || '0', 10);
            const max = parseInt(this.extractXmlAttr(attrs, 'max') || '0', 10);
            const width = parseFloat(this.extractXmlAttr(attrs, 'width') || '0');
            const hiddenAttr = this.extractXmlAttr(attrs, 'hidden');
            const isHidden = hiddenAttr === '1' || hiddenAttr?.toLowerCase() === 'true';
            if (min > 0 && min <= EXCEL_MAX_COLS && max >= min && (width > 0 || isHidden)) {
                const cappedMax = Math.min(max, EXCEL_MAX_COLS);
                const allocColMax = Math.min(cappedMax, MAX_DENSE_COLS);
                if (allocColMax > preMaxCol) preMaxCol = allocColMax;
                parsedCols.push({
                    min,
                    max: cappedMax,
                    width: width > 0 ? width : undefined,
                    hidden: isHidden
                });
            }
        }

        // Scan <c> tags once to determine exact max coordinates and enforce workbook cell limit before materializing
        interface RawParsedXmlCell {
            row: number;
            col: number;
            attrs: string;
            inner: string;
        }
        const rawCells: RawParsedXmlCell[] = [];
        const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cellMatch: RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(wsXml)) !== null) {
            const attrs = cellMatch[1];
            const inner = cellMatch[2] || '';
            const addr = this.extractXmlAttr(attrs, 'r');
            if (!addr) continue;
            const parsedPos = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
            if (!parsedPos) continue;
            if (parsedPos.row > preMaxRow) preMaxRow = parsedPos.row;
            if (parsedPos.col > preMaxCol) preMaxCol = parsedPos.col;
            if (inner.length === 0 && attrs.indexOf('s=') === -1 && attrs.indexOf('S=') === -1) {
                continue;
            }
            if (++budget.cells > MAX_IMPORT_WORKBOOK_CELLS) {
                throw new Error(
                    `Spreadsheet import rejected: workbook exceeds maximum cell limit (${MAX_IMPORT_WORKBOOK_CELLS}).`
                );
            }
            rawCells.push({
                row: parsedPos.row,
                col: parsedPos.col,
                attrs,
                inner
            });
        }

        // Single upfront capacity allocation for the entire worksheet!
        this.ensureSheetCapacity(ws, preMaxRow, preMaxCol);

        // Iterate <col> rules in reverse so each dense column (<= MAX_DENSE_COLS) is written at most once (`S5-7`, `R6-1`).
        const appliedColWidth = new Uint8Array(ws.Columns.length + 1);
        const appliedColHidden = new Uint8Array(ws.Columns.length + 1);
        let remainingWidthCols = ws.Columns.length;
        let remainingHiddenCols = ws.Columns.length;
        for (let i = parsedCols.length - 1; i >= 0; i--) {
            if (remainingWidthCols === 0 && remainingHiddenCols === 0) {
                break;
            }
            const cw = parsedCols[i];
            if (cw.min < 1 || cw.min > ws.Columns.length) {
                continue;
            }
            const maxDenseCol = Math.min(cw.max, ws.Columns.length);
            const roundedWidth = cw.width !== undefined ? Number(cw.width.toFixed(2)) : undefined;
            for (let c = cw.min; c <= maxDenseCol; c++) {
                if (roundedWidth !== undefined && appliedColWidth[c] === 0) {
                    ws.Columns[c - 1].Width = roundedWidth;
                    appliedColWidth[c] = 1;
                    remainingWidthCols--;
                }
                if (cw.hidden && appliedColHidden[c] === 0) {
                    ws.Columns[c - 1].Hidden = true;
                    appliedColHidden[c] = 1;
                    remainingHiddenCols--;
                }
            }
        }

        for (const rp of parsedRowProps) {
            if (rp.row <= ws.Rows.length) {
                if (rp.height !== undefined) {
                    ws.Rows[rp.row - 1].Height = rp.height;
                }
                if (rp.hidden) {
                    ws.Rows[rp.row - 1].Hidden = true;
                }
            }
        }

        // Track OOXML shared formula masters (<f t="shared" si="0">...</f>) for follower expansion (E6)
        const sharedFormulaMasters = new Map<string, { masterRow: number; masterCol: number; formulaBody: string }>();
        // Track array/spill anchor ranges (R8-8, R6-1: both modern dynamic arrays with `cm` and legacy CSE `t="array"`)
        const arrayAnchorRanges: Array<{
            anchorAddr: string;
            fRef: string;
            startRow: number;
            endRow: number;
            startCol: number;
            endCol: number;
        }> = [];
        const recordFormulaBudget = (bodyLen: number): string => {
            if (bodyLen >= MAX_FORMULA_LENGTH) {
                throw new Error(
                    `Spreadsheet import rejected: formula exceeds maximum length (${MAX_FORMULA_LENGTH} chars).`
                );
            }
            if (++budget.formulas > MAX_IMPORT_WORKBOOK_FORMULAS) {
                throw new Error(
                    `Spreadsheet import rejected: workbook exceeds maximum formula count (${MAX_IMPORT_WORKBOOK_FORMULAS}).`
                );
            }
            if (budget.formulaBytes + bodyLen + 1 > MAX_IMPORTED_FORMULA_BYTES) {
                throw new Error(
                    `Spreadsheet import rejected: workbook exceeds maximum formula bytes (${MAX_IMPORTED_FORMULA_BYTES} bytes).`
                );
            }
            budget.formulaBytes += bodyLen + 1;
            return '=';
        };
        const fTagRegex = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/;

        for (let idx = 0; idx < rawCells.length; idx++) {
            const rc = rawCells[idx];
            const attrs = rc.attrs;
            const inner = rc.inner;

            const tAttr = this.extractXmlAttr(attrs, 't') || '';
            const sAttr = this.extractXmlAttr(attrs, 's');
            const cmAttr = this.extractXmlAttr(attrs, 'cm');
            const styleIdx = sAttr ? parseInt(sAttr, 10) : 0;
            const styleInfo = styleLookup[styleIdx];

            let cellStyle: SpreadsheetCellStyleSpec | undefined;
            if (
                styleInfo &&
                (styleInfo.FormatPattern ||
                    styleInfo.Bold ||
                    styleInfo.Italic ||
                    styleInfo.TextColor ||
                    styleInfo.BackgroundColor ||
                    styleInfo.HorizontalAlign)
            ) {
                cellStyle = {
                    ...(styleInfo.Bold ? { Bold: true } : {}),
                    ...(styleInfo.Italic ? { Italic: true } : {}),
                    ...(styleInfo.TextColor ? { TextColor: styleInfo.TextColor } : {}),
                    ...(styleInfo.BackgroundColor ? { BackgroundColor: styleInfo.BackgroundColor } : {}),
                    ...(styleInfo.HorizontalAlign ? { HorizontalAlign: styleInfo.HorizontalAlign } : {}),
                    ...(styleInfo.FormatPattern ? { NumberFormatPattern: styleInfo.FormatPattern } : {}),
                    FormatType: this.InferFormatTypeFromPattern(styleInfo.FormatPattern)
                };
            }
            if (inner.length === 0 && !cellStyle) {
                continue;
            }

            const fTagMatch = inner.indexOf('<f') !== -1 ? fTagRegex.exec(inner) : null;
            const vBody = inner.indexOf('<v') !== -1 ? this.extractFirstXmlElementBody(inner, 'v') : null;
            const isBody =
                tAttr === 'inlineStr' || inner.indexOf('<is') !== -1
                    ? this.extractFirstXmlElementBody(inner, 'is')
                    : null;
            const isTBody = isBody !== null ? this.extractFirstXmlElementBody(isBody, 't') : null;

            let rawVal: SpreadsheetCellValue = null;
            if (tAttr === 's' && vBody !== null) {
                const ssIdx = parseInt(vBody.trim(), 10);
                rawVal = sharedStrings[ssIdx] ?? '';
            } else if (tAttr === 'inlineStr' && isTBody !== null) {
                rawVal = this.unescapeXml(isTBody);
            } else if (tAttr === 'b' && vBody !== null) {
                rawVal = vBody.trim() === '1' || vBody.trim().toLowerCase() === 'true';
            } else if ((tAttr === 'str' || tAttr === 'e') && vBody !== null) {
                rawVal = this.unescapeXml(vBody);
            } else if (vBody !== null) {
                const vText = this.unescapeXml(vBody.trim());
                const num = Number(vText);
                rawVal = vText !== '' && !Number.isNaN(num) ? num : vText;
            } else if (isTBody !== null) {
                rawVal = this.unescapeXml(isTBody);
            }

            const canonicalAddr = FormatCellAddress(rc.row, rc.col);
            let formula: string | null = null;
            let formulaStable: string | null = null;
            let spillRange: string | undefined;
            let fType = '';
            let fRef: string | null = null;

            if (fTagMatch) {
                const fAttrs = fTagMatch[1] ?? '';
                const fBodyRaw = this.unescapeXml((fTagMatch[2] ?? '').trim());
                fType = (this.extractXmlAttr(fAttrs, 't') ?? '').toLowerCase();
                const sharedIdx = this.extractXmlAttr(fAttrs, 'si');
                fRef = this.extractXmlAttr(fAttrs, 'ref');

                if (fType === 'shared' && sharedIdx !== null) {
                    if (fBodyRaw.length > 0) {
                        const cleanMasterBody = stripOoxmlFormulaPrefixes(
                            fBodyRaw.startsWith('=') ? fBodyRaw.slice(1) : fBodyRaw
                        );
                        recordFormulaBudget(cleanMasterBody.length);
                        sharedFormulaMasters.set(sharedIdx, {
                            masterRow: rc.row,
                            masterCol: rc.col,
                            formulaBody: cleanMasterBody
                        });
                        formula = `=${cleanMasterBody}`;
                    } else {
                        const master = sharedFormulaMasters.get(sharedIdx);
                        if (master) {
                            const shiftedBody = shiftSharedFormulaRelativeRefs(
                                master.formulaBody,
                                rc.row - master.masterRow,
                                rc.col - master.masterCol
                            );
                            recordFormulaBudget(shiftedBody.length);
                            formula = `=${shiftedBody}`;
                        }
                    }
                } else if (fBodyRaw.length > 0) {
                    const cleanBody = stripOoxmlFormulaPrefixes(
                        fBodyRaw.startsWith('=') ? fBodyRaw.slice(1) : fBodyRaw
                    );
                    recordFormulaBudget(cleanBody.length);
                    formula = `=${cleanBody}`;
                    if (fType === 'array') {
                        const rawArrayRef = ((fRef || (!cmAttr ? canonicalAddr : '')) || '').toUpperCase();
                        if (rawArrayRef.includes(':')) {
                            const refBounds = ParseRangeAddress(rawArrayRef, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                            if (refBounds && (rc.row !== refBounds.startRow || rc.col !== refBounds.startCol)) {
                                throw new Error(
                                    `Spreadsheet import rejected: array anchor ${canonicalAddr} is not the top-left cell of '${rawArrayRef}'.`
                                );
                            }
                            const refArea = refBounds
                                ? (refBounds.endRow - refBounds.startRow + 1) * (refBounds.endCol - refBounds.startCol + 1)
                                : 0;
                            if (refBounds && refArea > 0 && refArea <= MAX_DYNAMIC_ARRAY_CELLS) {
                                if (++budget.arrayAnchors > MAX_IMPORT_WORKBOOK_ARRAY_ANCHORS) {
                                    throw new Error(
                                        `Spreadsheet import rejected: workbook exceeds maximum array anchor limit (${MAX_IMPORT_WORKBOOK_ARRAY_ANCHORS}).`
                                    );
                                }
                                spillRange = rawArrayRef;
                                arrayAnchorRanges.push({
                                    anchorAddr: canonicalAddr,
                                    fRef: rawArrayRef,
                                    startRow: refBounds.startRow,
                                    endRow: refBounds.endRow,
                                    startCol: refBounds.startCol,
                                    endCol: refBounds.endCol
                                });
                            }
                        } else if (!cmAttr && rawArrayRef) {
                            spillRange = rawArrayRef;
                        }
                    }
                }

                if (formula) {
                    formulaStable = this.CompileFormulaToStableIds(ws, formula);
                }
            }

            const createdCell: SpreadsheetCellSpec = {
                RowID: this.getStableRowIdForIndex(ws, rc.row),
                ColumnID: this.getStableColIdForIndex(ws, rc.col),
                Address: canonicalAddr,
                RawValue: formula ? null : rawVal,
                Formula: formula,
                FormulaStable: formulaStable,
                ComputedValue: rawVal,
                DisplayValue: this.FormatCellValue(rawVal, cellStyle),
                Style: cellStyle,
                ...(spillRange ? { SpillRange: spillRange } : {})
            };
            if (fType === 'array' || Boolean(cmAttr) || Boolean(sAttr)) {
                getCellXmlMetaMap().set(createdCell, {
                    fType: fType || undefined,
                    fRef: fRef || canonicalAddr,
                    cmAttr: cmAttr || undefined,
                    sAttr: sAttr || undefined,
                    formulaDirty: false
                });
            }
            ws.Cells[canonicalAddr] = createdCell;
            if (formulaStable) {
                this.syncCellVirtualAxisIndex(ws, createdCell);
            }
        }

        // Enforce non-overlapping array anchors up front before marking child cells (`R6-1`)
        assertNoOverlappingArrayAnchors(arrayAnchorRanges);

        // Mark non-formula child cells inside multi-cell array/spill ranges using a single column-sorted index (`R5-3`)
        const importedByCol = arrayAnchorRanges.length > 0 ? buildColSortedAddrIndex(Object.keys(ws.Cells)) : null;
        for (const anchorEntry of arrayAnchorRanges) {
            const bounds = ParseRangeAddress(anchorEntry.fRef, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
            if (!bounds) continue;
            const area = (bounds.endRow - bounds.startRow + 1) * (bounds.endCol - bounds.startCol + 1);
            if (area <= 0 || area > MAX_DYNAMIC_ARRAY_CELLS) {
                continue;
            }
            if (importedByCol) {
                scanColSortedAddrIndex(
                    importedByCol,
                    bounds.startRow,
                    bounds.endRow,
                    bounds.startCol,
                    bounds.endCol,
                    (key) => {
                        if (key === anchorEntry.anchorAddr) return;
                        const childCell = ws.Cells[key];
                        if (childCell && !childCell.Formula) {
                            childCell.ArrayMaster = anchorEntry.anchorAddr;
                        }
                    }
                );
            }
        }

        // Parse native OOXML <mergeCells>
        const mergeBody = this.extractFirstXmlElementBody(wsXml, 'mergeCells');
        if (mergeBody) {
            const mergeRegex = /<mergeCell\b([^>]*?)\/?>/g;
            let mm: RegExpExecArray | null;
            const mergeSeen = new Set<string>();
            const merged: string[] = [];
            while ((mm = mergeRegex.exec(mergeBody)) !== null) {
                const ref = this.extractXmlAttr(mm[1], 'ref');
                if (!ref) continue;
                const b = ParseRangeAddress(ref, EXCEL_MAX_ROWS, EXCEL_MAX_COLS);
                if (!b || (b.startRow === b.endRow && b.startCol === b.endCol)) continue;
                const canonical = `${FormatCellAddress(b.startRow, b.startCol)}:${FormatCellAddress(b.endRow, b.endCol)}`;
                if (!mergeSeen.has(canonical)) {
                    if (++budget.merges > MAX_IMPORT_WORKBOOK_MERGE_RANGES) {
                        throw new Error(
                            `Spreadsheet import rejected: workbook exceeds maximum merge range limit (${MAX_IMPORT_WORKBOOK_MERGE_RANGES}).`
                        );
                    }
                    mergeSeen.add(canonical);
                    merged.push(canonical);
                }
            }
            if (merged.length > 0) {
                ws.MergeRanges = merged;
            }
        }

        // Parse native OOXML <dataValidations> (enforcing workbook-wide limit with explicit rejection, R6-1/R6-2)
        const dvContainerBody = this.extractFirstXmlElementBody(wsXml, 'dataValidations');
        if (dvContainerBody) {
            const dvRegex = /<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g;
            let dm: RegExpExecArray | null;
            while ((dm = dvRegex.exec(dvContainerBody)) !== null) {
                if (++budget.validationRules > MAX_VALIDATION_RULES_PER_SHEET) {
                    throw new Error(
                        `Spreadsheet import rejected: workbook exceeds maximum validation rule limit (${MAX_VALIDATION_RULES_PER_SHEET}).`
                    );
                }
                const attrs = dm[1];
                const body = dm[2];
                const sqref = this.extractXmlAttr(attrs, 'sqref');
                const dvType = (this.extractXmlAttr(attrs, 'type') || '').toLowerCase();
                const allowBlank = this.extractXmlAttr(attrs, 'allowBlank');
                const errMsg = this.extractXmlAttr(attrs, 'error');
                if (!sqref) continue;
                const f1 = this.extractFirstXmlElementBody(body, 'formula1');
                const f2 = this.extractFirstXmlElementBody(body, 'formula2');
                const ruleId = `dv-xlsx-${ws.ValidationRules.length + 1}`;
                if (dvType === 'list' && f1 !== null) {
                    const decoded = this.unescapeXml(f1.trim());
                    const unquoted = decoded.startsWith('"') && decoded.endsWith('"') ? decoded.slice(1, -1) : decoded;
                    const allowed = unquoted
                        .split(',')
                        .map((s) => s.trim())
                        .filter((s) => s.length > 0);
                    ws.ValidationRules.push({
                        RuleID: ruleId,
                        Range: sqref.split(/\s+/)[0].toUpperCase(),
                        RuleType: 'list',
                        AllowedValues: allowed,
                        ...(errMsg ? { ErrorMessage: this.unescapeXml(errMsg) } : {})
                    });
                } else if (dvType === 'decimal' || dvType === 'whole') {
                    const minVal = f1 !== null && !Number.isNaN(Number(f1.trim())) ? Number(f1.trim()) : undefined;
                    const maxVal = f2 !== null && !Number.isNaN(Number(f2.trim())) ? Number(f2.trim()) : undefined;
                    ws.ValidationRules.push({
                        RuleID: ruleId,
                        Range: sqref.split(/\s+/)[0].toUpperCase(),
                        RuleType: 'numberRange',
                        MinValue: minVal,
                        MaxValue: maxVal,
                        ...(errMsg ? { ErrorMessage: this.unescapeXml(errMsg) } : {})
                    });
                } else if (allowBlank === '0' || dvType === 'custom') {
                    ws.ValidationRules.push({
                        RuleID: ruleId,
                        Range: sqref.split(/\s+/)[0].toUpperCase(),
                        RuleType: 'notEmpty',
                        ...(errMsg ? { ErrorMessage: this.unescapeXml(errMsg) } : {})
                    });
                }
            }
        }

        return ws;
    }

    private parseStylesXml(stylesXml: string): Array<{
        FormatPattern?: string;
        Bold?: boolean;
        Italic?: boolean;
        TextColor?: string;
        BackgroundColor?: string;
        HorizontalAlign?: 'left' | 'center' | 'right';
    }> {
        if (!stylesXml) return [{ FormatPattern: undefined, Bold: false }];

        // Map all standard OOXML built-in number, currency, percent, date, and datetime numFmtIds (E6)
        const builtinFormats: Record<number, string> = {
            1: '0',
            2: '0.00',
            3: '#,##0',
            4: '#,##0.00',
            5: '$#,##0_);($#,##0)',
            6: '$#,##0_);[Red]($#,##0)',
            7: '$#,##0.00_);($#,##0.00)',
            8: '$#,##0.00_);[Red]($#,##0.00)',
            9: '0%',
            10: '0.00%',
            14: 'yyyy-mm-dd',
            15: 'd-mmm-yy',
            16: 'd-mmm',
            17: 'mmm-yy',
            18: 'h:mm AM/PM',
            19: 'h:mm:ss AM/PM',
            20: 'h:mm',
            21: 'h:mm:ss',
            22: 'yyyy-mm-dd hh:mm',
            27: 'yyyy-mm-dd',
            28: 'yyyy-mm-dd',
            29: 'yyyy-mm-dd',
            30: 'yyyy-mm-dd',
            31: 'yyyy-mm-dd',
            32: 'hh:mm:ss',
            33: 'hh:mm:ss',
            34: 'hh:mm:ss',
            35: 'hh:mm:ss',
            36: 'yyyy-mm-dd',
            45: 'mm:ss',
            46: '[h]:mm:ss',
            47: 'mm:ss.0',
            49: '@'
        };
        const formatById = new Map<number, string>(Object.entries(builtinFormats).map(([k, v]) => [Number(k), v]));

        const numFmtRegex = /<numFmt\b([^>]*?)\/?>/g;
        let nfMatch: RegExpExecArray | null;
        while ((nfMatch = numFmtRegex.exec(stylesXml)) !== null) {
            const idStr = this.extractXmlAttr(nfMatch[1], 'numFmtId');
            const code = this.extractXmlAttr(nfMatch[1], 'formatCode');
            if (idStr && code) {
                formatById.set(parseInt(idStr, 10), this.unescapeXml(code));
            }
        }

        const parsedFonts: Array<{ bold: boolean; italic: boolean; color?: string }> = [];
        const fontsSection = /<fonts\b[^>]*>([\s\S]*?)<\/fonts>/.exec(stylesXml);
        if (fontsSection) {
            const fontRegex = /<font\b[^>]*>([\s\S]*?)<\/font>/g;
            let fMatch: RegExpExecArray | null;
            while ((fMatch = fontRegex.exec(fontsSection[1])) !== null) {
                const body = fMatch[1];
                const bold = /<b\b/.test(body) && !/<b\b[^>]*\bval=["']?(?:0|false)["']?/i.test(body);
                const italic = /<i\b/.test(body) && !/<i\b[^>]*\bval=["']?(?:0|false)["']?/i.test(body);
                const colorMatch = /<color\b([^>]*?)\/?>/.exec(body);
                const rgbAttr = colorMatch ? this.extractXmlAttr(colorMatch[1], 'rgb') : null;
                parsedFonts.push({
                    bold,
                    italic,
                    color: ooxmlRgbToCssHex(rgbAttr)
                });
            }
        }

        const parsedFills: Array<string | undefined> = [];
        const fillsSection = /<fills\b[^>]*>([\s\S]*?)<\/fills>/.exec(stylesXml);
        if (fillsSection) {
            const fillRegex = /<fill\b[^>]*>([\s\S]*?)<\/fill>/g;
            let fillMatch: RegExpExecArray | null;
            while ((fillMatch = fillRegex.exec(fillsSection[1])) !== null) {
                const body = fillMatch[1];
                const patMatch = /<patternFill\b([^>]*?)(?:\/>|>([\s\S]*?)<\/patternFill>)/.exec(body);
                const patType = patMatch ? this.extractXmlAttr(patMatch[1], 'patternType') : null;
                if (patType === 'solid' && patMatch?.[2]) {
                    const fgMatch = /<fgColor\b([^>]*?)\/?>/.exec(patMatch[2]);
                    const fgRgb = fgMatch ? this.extractXmlAttr(fgMatch[1], 'rgb') : null;
                    parsedFills.push(ooxmlRgbToCssHex(fgRgb));
                } else {
                    parsedFills.push(undefined);
                }
            }
        }

        const result: Array<{
            FormatPattern?: string;
            Bold?: boolean;
            Italic?: boolean;
            TextColor?: string;
            BackgroundColor?: string;
            HorizontalAlign?: 'left' | 'center' | 'right';
        }> = [];
        const cellXfsSection = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml);
        if (cellXfsSection) {
            const xfRegex = /<xf\b([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g;
            let xfMatch: RegExpExecArray | null;
            while ((xfMatch = xfRegex.exec(cellXfsSection[1])) !== null) {
                const attrs = xfMatch[1];
                const inner = xfMatch[2] || '';
                const nfId = parseInt(this.extractXmlAttr(attrs, 'numFmtId') || '0', 10);
                const fontId = parseInt(this.extractXmlAttr(attrs, 'fontId') || '0', 10);
                const fillId = parseInt(this.extractXmlAttr(attrs, 'fillId') || '0', 10);
                const fontMeta = parsedFonts[fontId];
                const bgHex = fillId > 1 ? parsedFills[fillId] : undefined;
                let align: 'left' | 'center' | 'right' | undefined;
                if (inner) {
                    const alignMatch = /<alignment\b([^>]*?)\/?>/.exec(inner);
                    const horiz = alignMatch ? this.extractXmlAttr(alignMatch[1], 'horizontal')?.toLowerCase() : null;
                    if (horiz === 'left' || horiz === 'center' || horiz === 'right') {
                        align = horiz;
                    }
                }
                result.push({
                    FormatPattern: formatById.get(nfId),
                    Bold: fontMeta?.bold ?? false,
                    ...(fontMeta?.italic ? { Italic: true } : {}),
                    ...(fontMeta?.color ? { TextColor: fontMeta.color } : {}),
                    ...(bgHex ? { BackgroundColor: bgHex } : {}),
                    ...(align ? { HorizontalAlign: align } : {})
                });
            }
        }

        if (result.length === 0) {
            result.push({ FormatPattern: undefined, Bold: false });
        }
        return result;
    }

    private buildContentTypesXml(
        sheetCount: number,
        includeCellMetadata = false,
        extraOverrides: string[] = []
    ): string {
        const sheetOverrides: string[] = [];
        for (let i = 1; i <= sheetCount; i++) {
            sheetOverrides.push(
                `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
            );
        }
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
            '<Default Extension="xml" ContentType="application/xml"/>',
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
            ...(includeCellMetadata
                ? [
                      '<Override PartName="/xl/metadata.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheetMetadata+xml"/>'
                  ]
                : []),
            ...sheetOverrides,
            ...extraOverrides,
            '</Types>'
        ].join('');
    }

    private buildSpreadsheetDrawingMlChartXml(
        chart: SpreadsheetChartSpec,
        sheetName: string,
        dataset: SpreadsheetChartDataset | null
    ): string {
        const tagByType: Record<SpreadsheetChartType, string> = {
            bar: 'c:barChart',
            line: 'c:lineChart',
            pie: 'c:pieChart',
            area: 'c:areaChart'
        };
        const chartTag = tagByType[chart.ChartType] ?? 'c:barChart';
        const categories = dataset?.Categories ?? [];
        const seriesList = dataset?.Series ?? [];
        const quotedSheet = `'${sheetName.replace(/'/g, "''")}'`;
        const bounds = ParseRangeAddress(chart.SourceRange.split(',')[0] ?? 'A1:B2', EXCEL_MAX_ROWS, EXCEL_MAX_COLS);

        const seriesXml = seriesList
            .map((ser, sIdx) => {
                const catPts = categories
                    .map((lbl, idx) => `<c:pt idx="${idx}"><c:v>${this.escapeXml(lbl)}</c:v></c:pt>`)
                    .join('');
                const valPts = ser.Values.map(
                    (val, idx) => `<c:pt idx="${idx}"><c:v>${Number.isFinite(val) ? val : 0}</c:v></c:pt>`
                ).join('');
                const catRefFormula = bounds
                    ? `${quotedSheet}!$${ColumnIndexToLetter(bounds.startCol)}$${bounds.startRow + 1}:$${ColumnIndexToLetter(bounds.startCol)}$${Math.max(bounds.startRow + 1, bounds.endRow)}`
                    : `${quotedSheet}!$A$2:$A$${Math.max(2, categories.length + 1)}`;
                const valColLetter = bounds
                    ? ColumnIndexToLetter(Math.min(bounds.endCol, bounds.startCol + sIdx + 1))
                    : ColumnIndexToLetter(sIdx + 2);
                const valRefFormula = bounds
                    ? `${quotedSheet}!$${valColLetter}$${bounds.startRow + 1}:$${valColLetter}$${Math.max(bounds.startRow + 1, bounds.endRow)}`
                    : `${quotedSheet}!$${valColLetter}$2:$${valColLetter}$${Math.max(2, ser.Values.length + 1)}`;
                return (
                    `<c:ser><c:idx val="${sIdx}"/><c:order val="${sIdx}"/>` +
                    `<c:tx><c:v>${this.escapeXml(ser.Name || `Series ${sIdx + 1}`)}</c:v></c:tx>` +
                    `<c:cat><c:strRef><c:f>${this.escapeXml(catRefFormula)}</c:f><c:strCache><c:ptCount val="${categories.length}"/>${catPts}</c:strCache></c:strRef></c:cat>` +
                    `<c:val><c:numRef><c:f>${this.escapeXml(valRefFormula)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${ser.Values.length}"/>${valPts}</c:numCache></c:numRef></c:val>` +
                    `</c:ser>`
                );
            })
            .join('');

        const isPie = chart.ChartType === 'pie';
        const chartBody =
            chart.ChartType === 'bar'
                ? `<c:barDir val="col"/><c:grouping val="clustered"/>${seriesXml}<c:axId val="1"/><c:axId val="2"/>`
                : isPie
                  ? `${seriesXml}`
                  : `<c:grouping val="standard"/>${seriesXml}<c:axId val="1"/><c:axId val="2"/>`;
        const axesXml = isPie
            ? ''
            : `<c:catAx><c:axId val="1"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:crossAx val="2"/></c:catAx>` +
              `<c:valAx><c:axId val="2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="1"/></c:valAx>`;

        const titleXml = chart.Title
            ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${this.escapeXml(chart.Title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
            : '';
        const legendXml = chart.ShowLegend !== false ? '<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' : '';

        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
            '<c:chart>',
            titleXml,
            `<c:plotArea><c:layout/><${chartTag}>${chartBody}</${chartTag}>${axesXml}</c:plotArea>`,
            legendXml,
            '<c:plotVisOnly val="1"/>',
            '</c:chart>',
            '</c:chartSpace>'
        ].join('');
    }

    private buildCellMetadataXml(): string {
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:xda="http://schemas.microsoft.com/office/spreadsheetml/2017/dynamicarray">',
            '<metadataTypes count="1"><metadataType name="XLDAPR" minSupportedVersion="120000" copy="1" pasteAll="1" pasteValues="1" merge="1" splitFirst="1" rowColShift="1" clearFormats="1" clearComments="1" assign="1" coerce="1" cellMeta="1"/></metadataTypes>',
            '<futureMetadata name="XLDAPR" count="1"><bk><extLst><ext uri="{bdbb8cdc-fa1e-496e-a857-3c3f30c029c3}"><xda:dynamicArrayProperties fDynamic="1" fCollapsed="0"/></ext></extLst></bk></futureMetadata>',
            '<cellMetadata count="1"><bk><rc t="1" v="0"/></bk></cellMetadata>',
            '</metadata>'
        ].join('');
    }

    private buildRootRelsXml(): string {
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
            '</Relationships>'
        ].join('');
    }

    private buildWorkbookXml(
        sheets: Array<{ Name: string; SheetId: number; RelId: string; Hidden: boolean }>
    ): string {
        const sheetTags = sheets
            .map(
                (s) =>
                    `<sheet name="${this.escapeXml(s.Name)}" sheetId="${s.SheetId}"${
                        s.Hidden ? ' state="veryHidden"' : ''
                    } r:id="${s.RelId}"/>`
            )
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
            `<sheets>${sheetTags}</sheets>`,
            '</workbook>'
        ].join('');
    }

    private buildWorkbookRelsXml(
        sheets: Array<{ RelId: string; SheetId: number }>,
        stylesRelId: string,
        metadataRelId?: string
    ): string {
        const rels = sheets
            .map(
                (s) =>
                    `<Relationship Id="${s.RelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.SheetId}.xml"/>`
            )
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            rels,
            `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`,
            ...(metadataRelId
                ? [
                      `<Relationship Id="${metadataRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sheetMetadata" Target="metadata.xml"/>`
                  ]
                : []),
            '</Relationships>'
        ].join('');
    }

    private buildStylesXml(
        numFmts: Array<{ Id: number; FormatCode: string }>,
        cellXfs: Array<{
            NumFmtId: number;
            FontId: number;
            FillId: number;
            HorizontalAlign?: 'left' | 'center' | 'right';
        }>,
        fonts: Array<{ Bold: boolean; Italic: boolean; ColorArgb?: string }>,
        fillFgs: string[]
    ): string {
        const numFmtsXml =
            numFmts.length > 0
                ? `<numFmts count="${numFmts.length}">${numFmts
                      .map((nf) => `<numFmt numFmtId="${nf.Id}" formatCode="${this.escapeXml(nf.FormatCode)}"/>`)
                      .join('')}</numFmts>`
                : '';
        const fontsXml = fonts
            .map(
                (f) =>
                    `<font>${f.Bold ? '<b/>' : ''}${f.Italic ? '<i/>' : ''}<sz val="11"/>${
                        f.ColorArgb ? `<color rgb="${this.escapeXml(f.ColorArgb)}"/>` : ''
                    }<name val="Calibri"/></font>`
            )
            .join('');
        const fillsXml = [
            '<fill><patternFill patternType="none"/></fill>',
            '<fill><patternFill patternType="gray125"/></fill>',
            ...fillFgs.map(
                (argb) =>
                    `<fill><patternFill patternType="solid"><fgColor rgb="${this.escapeXml(argb)}"/></patternFill></fill>`
            )
        ].join('');
        const xfsXml = cellXfs
            .map((xf) => {
                const attrs =
                    `numFmtId="${xf.NumFmtId}" fontId="${xf.FontId}" fillId="${xf.FillId}" borderId="0" xfId="0"` +
                    `${xf.NumFmtId > 0 ? ' applyNumberFormat="1"' : ''}` +
                    `${xf.FontId > 0 ? ' applyFont="1"' : ''}` +
                    `${xf.FillId > 1 ? ' applyFill="1"' : ''}` +
                    `${xf.HorizontalAlign ? ' applyAlignment="1"' : ''}`;
                if (xf.HorizontalAlign) {
                    return `<xf ${attrs}><alignment horizontal="${xf.HorizontalAlign}"/></xf>`;
                }
                return `<xf ${attrs}/>`;
            })
            .join('');
        return [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
            numFmtsXml,
            `<fonts count="${fonts.length}">${fontsXml}</fonts>`,
            `<fills count="${2 + fillFgs.length}">${fillsXml}</fills>`,
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
            `<cellXfs count="${cellXfs.length}">${xfsXml}</cellXfs>`,
            '</styleSheet>'
        ].join('');
    }

    private escapeXml(str: string): string {
        // Strip XML 1.0 illegal control characters (keeping tab \x09, LF \x0A, CR \x0D) and non-characters U+FFFE/U+FFFF
        const clean = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
        return clean
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    private unescapeXml(str: string): string {
        // Decode OOXML _xHHHH_ escapes and numeric character references (&#x...;, &#...;) before named entities
        return str
            .replace(/_x([0-9A-Fa-f]{4})_/g, (_m, hex: string) => {
                const cp = parseInt(hex, 16);
                if (cp === 0 || (cp >= 0x01 && cp <= 0x08) || cp === 0x0b || cp === 0x0c || (cp >= 0x0e && cp <= 0x1f)) {
                    return cp === 0x0d || cp === 0x0a || cp === 0x09 ? String.fromCharCode(cp) : '';
                }
                return String.fromCharCode(cp);
            })
            .replace(/&#x([0-9A-Fa-f]+);/gi, (_m, hex: string) => {
                const cp = parseInt(hex, 16);
                return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
            })
            .replace(/&#(\d+);/g, (_m, dec: string) => {
                const cp = parseInt(dec, 10);
                return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
            })
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }

    private extractXmlAttr(tagText: string, attrName: string): string | null {
        const tLen = tagText.length;
        const aLen = attrName.length;
        if (tLen === 0 || aLen === 0 || tLen < aLen + 3) return null;
        const targetLower = attrName.toLowerCase();
        let i = 0;
        while (i <= tLen - aLen - 2) {
            if (i > 0) {
                const prev = tagText.charCodeAt(i - 1);
                if (prev !== 32 && prev !== 9 && prev !== 10 && prev !== 13) {
                    i++;
                    continue;
                }
            }
            let matched = true;
            for (let k = 0; k < aLen; k++) {
                let ch = tagText.charCodeAt(i + k);
                if (ch >= 65 && ch <= 90) ch += 32;
                if (ch !== targetLower.charCodeAt(k)) {
                    matched = false;
                    break;
                }
            }
            if (!matched) {
                i++;
                continue;
            }
            let eqIdx = i + aLen;
            while (eqIdx < tLen && (tagText.charCodeAt(eqIdx) === 32 || tagText.charCodeAt(eqIdx) === 9)) {
                eqIdx++;
            }
            if (eqIdx >= tLen || tagText.charCodeAt(eqIdx) !== 61) {
                i = eqIdx;
                continue;
            }
            let qIdx = eqIdx + 1;
            while (qIdx < tLen && (tagText.charCodeAt(qIdx) === 32 || tagText.charCodeAt(qIdx) === 9)) {
                qIdx++;
            }
            if (qIdx >= tLen) return null;
            const quoteCode = tagText.charCodeAt(qIdx);
            if (quoteCode !== 34 && quoteCode !== 39) {
                i = qIdx;
                continue;
            }
            const closeIdx = tagText.indexOf(quoteCode === 34 ? '"' : "'", qIdx + 1);
            return closeIdx === -1 ? null : tagText.slice(qIdx + 1, closeIdx);
        }
        return null;
    }

    private encodeUtf8(str: string): Uint8Array {
        return encodeUtf8Bytes(str);
    }

    private decodeUtf8(bytes: Uint8Array): string {
        return decodeUtf8Bytes(bytes);
    }

    private decodeBase64OrDataUrl(input: string): Uint8Array | null {
        try {
            const commaIdx = input.indexOf(',');
            const rawB64 = input.startsWith('data:') && commaIdx >= 0 ? input.slice(commaIdx + 1) : input;
            const clean = rawB64.replace(/\s+/g, '');
            if (typeof Buffer !== 'undefined') {
                return new Uint8Array(Buffer.from(clean, 'base64'));
            }
            const bin = atob(clean);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                out[i] = bin.charCodeAt(i);
            }
            return out;
        } catch {
            return null;
        }
    }

    // -----------------------------------------------------------------------
    // Isomorphic Bounded ZIP Archive Builder & Reader (Stored + Safe RFC 1951 Deflate, B6)
    // -----------------------------------------------------------------------

    public BuildZipArchive(entries: Array<{ Name: string; Data: Uint8Array }>): Uint8Array {
        return this.buildZipArchive(entries);
    }

    public ExtractZipArchive(zipBytes: Uint8Array): Map<string, Uint8Array> {
        return this.extractZipArchive(zipBytes);
    }

    private buildZipArchive(entries: Array<{ Name: string; Data: Uint8Array }>): Uint8Array {
        const localParts: Uint8Array[] = [];
        const centralParts: Uint8Array[] = [];
        let offset = 0;

        for (const entry of entries) {
            const nameBytes = this.encodeUtf8(entry.Name);
            const crc = this.crc32(entry.Data);
            const uncompSize = entry.Data.length;
            let payload = entry.Data;
            let method = 0;
            if (uncompSize >= 64) {
                const deflated = this.deflateRawFixedHuffman(entry.Data);
                if (deflated.length < uncompSize) {
                    payload = deflated;
                    method = 8;
                }
            }
            const compSize = payload.length;

            const localHeader = new Uint8Array(30 + nameBytes.length);
            const lv = new DataView(localHeader.buffer);
            lv.setUint32(0, 0x04034b50, true);
            lv.setUint16(4, 20, true);
            lv.setUint16(6, 0, true);
            lv.setUint16(8, method, true);
            lv.setUint16(10, 0, true);
            lv.setUint16(12, 0x0021, true); // Valid MS-DOS date: 1980-01-01 ((0 << 9) | (1 << 5) | 1 = 0x0021)
            lv.setUint32(14, crc, true);
            lv.setUint32(18, compSize, true);
            lv.setUint32(22, uncompSize, true);
            lv.setUint16(26, nameBytes.length, true);
            lv.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);

            const centralHeader = new Uint8Array(46 + nameBytes.length);
            const cv = new DataView(centralHeader.buffer);
            cv.setUint32(0, 0x02014b50, true);
            cv.setUint16(4, 20, true);
            cv.setUint16(6, 20, true);
            cv.setUint16(8, 0, true);
            cv.setUint16(10, method, true);
            cv.setUint16(12, 0, true);
            cv.setUint16(14, 0x0021, true); // Valid MS-DOS date: 1980-01-01 (0x0021)
            cv.setUint32(16, crc, true);
            cv.setUint32(20, compSize, true);
            cv.setUint32(24, uncompSize, true);
            cv.setUint16(28, nameBytes.length, true);
            cv.setUint16(30, 0, true);
            cv.setUint16(32, 0, true);
            cv.setUint16(34, 0, true);
            cv.setUint16(36, 0, true);
            cv.setUint32(38, 0, true);
            cv.setUint32(42, offset, true);
            centralHeader.set(nameBytes, 46);

            localParts.push(localHeader, payload);
            centralParts.push(centralHeader);
            offset += localHeader.length + compSize;
        }

        const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, centralSize, true);
        ev.setUint32(16, offset, true);
        ev.setUint16(20, 0, true);

        const total = offset + centralSize + eocd.length;
        const out = new Uint8Array(total);
        let pos = 0;
        for (const p of localParts) {
            out.set(p, pos);
            pos += p.length;
        }
        for (const p of centralParts) {
            out.set(p, pos);
            pos += p.length;
        }
        out.set(eocd, pos);
        return out;
    }

    /**
     * Pure-TypeScript RFC 1951 raw DEFLATE compressor using LZ77 + fixed Huffman codes (`BTYPE=01`).
     * Isomorphic (runs in both Node and browser without external dependencies) and produces compact
     * ZIP entries that round-trip losslessly with `inflateRawDeflate`, `zlib.inflateRawSync`, and Excel.
     */
    private deflateRawFixedHuffman(data: Uint8Array): Uint8Array {
        const lenBase = [
            3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
            35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
        ];
        const lenExtra = [
            0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
            3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
        ];
        const distBase = [
            1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
            257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
        ];
        const distExtra = [
            0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
            7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
        ];

        const out = new Uint8Array(data.length + 64);
        let outIdx = 0;
        let bitBuf = 0;
        let bitCount = 0;

        const writeBitsLsb = (val: number, nBits: number): void => {
            for (let i = 0; i < nBits; i++) {
                bitBuf |= ((val >>> i) & 1) << bitCount;
                bitCount++;
                if (bitCount === 8) {
                    if (outIdx < out.length) out[outIdx++] = bitBuf;
                    bitBuf = 0;
                    bitCount = 0;
                }
            }
        };

        const writeBitsMsb = (code: number, nBits: number): void => {
            for (let i = nBits - 1; i >= 0; i--) {
                bitBuf |= ((code >>> i) & 1) << bitCount;
                bitCount++;
                if (bitCount === 8) {
                    if (outIdx < out.length) out[outIdx++] = bitBuf;
                    bitBuf = 0;
                    bitCount = 0;
                }
            }
        };

        const writeFixedSym = (sym: number): void => {
            if (sym <= 143) {
                writeBitsMsb(0x30 + sym, 8);
            } else if (sym <= 255) {
                writeBitsMsb(0x190 + (sym - 144), 9);
            } else if (sym <= 279) {
                writeBitsMsb(sym - 256, 7);
            } else {
                writeBitsMsb(0xc0 + (sym - 280), 8);
            }
        };

        // Block header: BFINAL=1 (1 bit), BTYPE=01 fixed Huffman (2 bits)
        writeBitsLsb(1, 1);
        writeBitsLsb(1, 2);

        const hashBits = 13;
        const hashMask = (1 << hashBits) - 1;
        const head = new Int32Array(1 << hashBits).fill(-1);
        const prev = new Int32Array(32768).fill(-1);

        let pos = 0;
        const n = data.length;
        while (pos < n) {
            let bestLen = 0;
            let bestDist = 0;
            if (pos + 3 <= n) {
                const h = (((data[pos] << 8) ^ (data[pos + 1] << 4) ^ data[pos + 2]) * 0x1e35a7bd) & hashMask;
                let cand = head[h];
                prev[pos & 32767] = cand;
                head[h] = pos;

                let chainDepth = 0;
                const maxLen = Math.min(258, n - pos);
                while (cand >= 0 && pos - cand <= 32768 && chainDepth < 16) {
                    chainDepth++;
                    if (data[cand + bestLen] === data[pos + bestLen] && data[cand] === data[pos]) {
                        let mLen = 0;
                        while (mLen < maxLen && data[cand + mLen] === data[pos + mLen]) {
                            mLen++;
                        }
                        if (mLen >= 3 && mLen > bestLen) {
                            bestLen = mLen;
                            bestDist = pos - cand;
                            if (bestLen === maxLen) break;
                        }
                    }
                    cand = prev[cand & 32767];
                }
            }

            if (bestLen >= 3) {
                let lenCodeIdx = 0;
                for (let k = lenBase.length - 1; k >= 0; k--) {
                    if (bestLen >= lenBase[k]) {
                        lenCodeIdx = k;
                        break;
                    }
                }
                writeFixedSym(257 + lenCodeIdx);
                if (lenExtra[lenCodeIdx] > 0) {
                    writeBitsLsb(bestLen - lenBase[lenCodeIdx], lenExtra[lenCodeIdx]);
                }

                let distCodeIdx = 0;
                for (let k = distBase.length - 1; k >= 0; k--) {
                    if (bestDist >= distBase[k]) {
                        distCodeIdx = k;
                        break;
                    }
                }
                writeBitsMsb(distCodeIdx, 5);
                if (distExtra[distCodeIdx] > 0) {
                    writeBitsLsb(bestDist - distBase[distCodeIdx], distExtra[distCodeIdx]);
                }

                for (let s = 1; s < bestLen; s++) {
                    const p = pos + s;
                    if (p + 3 <= n) {
                        const sh = (((data[p] << 8) ^ (data[p + 1] << 4) ^ data[p + 2]) * 0x1e35a7bd) & hashMask;
                        prev[p & 32767] = head[sh];
                        head[sh] = p;
                    }
                }
                pos += bestLen;
            } else {
                writeFixedSym(data[pos]);
                pos++;
            }
        }

        // End of block symbol 256
        writeFixedSym(256);
        if (bitCount > 0) {
            if (outIdx < out.length) out[outIdx++] = bitBuf;
        }
        return out.subarray(0, outIdx);
    }

    private extractZipArchive(zipBytes: Uint8Array): Map<string, Uint8Array> {
        if (zipBytes.byteLength > MAX_XLSX_COMPRESSED_BYTES) {
            throw new Error(
                `XLSX archive size (${zipBytes.byteLength} bytes) exceeds maximum allowed compressed size (${MAX_XLSX_COMPRESSED_BYTES} bytes).`
            );
        }
        if (zipBytes.byteLength < 22) {
            throw new Error('Invalid or truncated ZIP archive.');
        }

        const files = new Map<string, Uint8Array>();
        const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);

        // Locate End of Central Directory (EOCD) signature 0x06054b50 from end
        let eocdOffset = -1;
        for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset < 0) {
            throw new Error('Invalid ZIP archive: End of Central Directory signature not found.');
        }

        let totalUncompressedBytes = 0;
        const totalEntries = view.getUint16(eocdOffset + 10, true);
        let cdOffset = view.getUint32(eocdOffset + 16, true);

        for (let e = 0; e < totalEntries; e++) {
            if (cdOffset + 46 > zipBytes.length) {
                throw new Error('Truncated ZIP Central Directory entry.');
            }
            if (view.getUint32(cdOffset, true) !== 0x02014b50) {
                throw new Error('Corrupt ZIP Central Directory signature.');
            }
            const method = view.getUint16(cdOffset + 10, true);
            const expectedCrc = view.getUint32(cdOffset + 16, true);
            const compSize = view.getUint32(cdOffset + 20, true);
            const uncompSize = view.getUint32(cdOffset + 24, true);
            const nameLen = view.getUint16(cdOffset + 28, true);
            const extraLen = view.getUint16(cdOffset + 30, true);
            const commentLen = view.getUint16(cdOffset + 32, true);
            const localHeaderOffset = view.getUint32(cdOffset + 42, true);

            if (cdOffset + 46 + nameLen > zipBytes.length) {
                throw new Error('Truncated ZIP entry filename.');
            }
            if (uncompSize > MAX_XLSX_ENTRY_BYTES) {
                throw new Error(
                    `ZIP entry declared size (${uncompSize} bytes) exceeds maximum entry limit (${MAX_XLSX_ENTRY_BYTES} bytes).`
                );
            }

            const fileName = this.decodeUtf8(zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
            if (localHeaderOffset + 30 > zipBytes.length || view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
                throw new Error(`Invalid or truncated local ZIP header for '${fileName}'.`);
            }

            const localNameLen = view.getUint16(localHeaderOffset + 26, true);
            const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
            const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
            if (dataStart + compSize > zipBytes.length) {
                throw new Error(`Truncated compressed payload for ZIP entry '${fileName}'.`);
            }

            const rawSlice = zipBytes.subarray(dataStart, dataStart + compSize);
            const remainingBudget = MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES - totalUncompressedBytes;
            const declaredValidLargeSheet =
                uncompSize > 0 && uncompSize <= MAX_XLSX_ENTRY_BYTES && compSize >= 64 * 1024 ? uncompSize : 0;
            const ratioCap = Math.max(12 * 1024 * 1024, compSize * 100, declaredValidLargeSheet);
            const entryCap = Math.min(MAX_XLSX_ENTRY_BYTES, remainingBudget, ratioCap);

            if (method === 0) {
                if (rawSlice.byteLength > entryCap) {
                    throw new Error(
                        `Uncompressed ZIP size exceeds maximum allowed limit (${MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES} bytes).`
                    );
                }
                if (expectedCrc !== 0 && this.crc32(rawSlice) !== expectedCrc) {
                    throw new Error(`ZIP CRC-32 mismatch for '${fileName}'.`);
                }
                totalUncompressedBytes += rawSlice.byteLength;
                files.set(fileName, rawSlice);
            } else if (method === 8) {
                const inflated = this.inflateRawDeflate(rawSlice, entryCap);
                if (uncompSize > 0 && inflated.byteLength !== uncompSize) {
                    throw new Error(
                        `ZIP entry size mismatch for '${fileName}': expected ${uncompSize} bytes, got ${inflated.byteLength}.`
                    );
                }
                if (expectedCrc !== 0 && this.crc32(inflated) !== expectedCrc) {
                    throw new Error(`ZIP CRC-32 mismatch for '${fileName}'.`);
                }
                totalUncompressedBytes += inflated.byteLength;
                if (totalUncompressedBytes > MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES) {
                    throw new Error(
                        `Total uncompressed XLSX size exceeds maximum allowed limit (${MAX_XLSX_UNCOMPRESSED_TOTAL_BYTES} bytes).`
                    );
                }
                files.set(fileName, inflated);
            } else {
                throw new Error(`Unsupported ZIP compression method ${method} for '${fileName}'.`);
            }

            cdOffset += 46 + nameLen + extraLen + commentLen;
        }
        return files;
    }

    /**
     * Bounded, browser-clean pure-TypeScript RFC 1951 raw DEFLATE decompressor (`B6`).
     * Throws immediately on truncated bitstreams, oversubscribed/invalid Huffman codes,
     * invalid lookback distances, or decompression bombs exceeding `maxEntryBytes`.
     */
    private inflateRawDeflate(data: Uint8Array, maxEntryBytes = MAX_XLSX_ENTRY_BYTES): Uint8Array {
        if (maxEntryBytes <= 0) {
            throw new Error('DEFLATE stream exceeds maximum allowed uncompressed size.');
        }
        const totalBitsAvailable = data.length * 8;
        let bitPos = 0;

        let buf = new Uint8Array(Math.min(Math.max(256, data.length * 2), maxEntryBytes));
        let outLen = 0;

        const ensureOutputCapacity = (additional: number): void => {
            const needed = outLen + additional;
            if (needed > maxEntryBytes) {
                throw new Error(`DEFLATE stream exceeds maximum allowed entry size (${maxEntryBytes} bytes).`);
            }
            if (needed <= buf.length) return;
            let nextCap = Math.max(256, buf.length);
            while (nextCap < needed) {
                nextCap = Math.min(maxEntryBytes, nextCap * 2);
                if (nextCap === maxEntryBytes && nextCap < needed) {
                    throw new Error(`DEFLATE stream exceeds maximum allowed entry size (${maxEntryBytes} bytes).`);
                }
            }
            const next = new Uint8Array(nextCap);
            next.set(buf.subarray(0, outLen), 0);
            buf = next;
        };

        const readBits = (n: number): number => {
            if (bitPos + n > totalBitsAvailable) {
                throw new Error('Truncated DEFLATE stream');
            }
            let val = 0;
            for (let i = 0; i < n; i++) {
                const byteIdx = bitPos >>> 3;
                const bit = (data[byteIdx] >>> (bitPos & 7)) & 1;
                val |= bit << i;
                bitPos++;
            }
            return val;
        };

        interface HuffmanTree {
            counts: number[];
            symbols: number[];
            totalSymbols: number;
        }

        const buildHuffman = (lengths: number[]): HuffmanTree => {
            const maxBits = 15;
            const counts = new Array<number>(maxBits + 1).fill(0);
            let totalSymbols = 0;
            for (const len of lengths) {
                if (len < 0 || len > maxBits) {
                    throw new Error('Invalid Huffman code length in DEFLATE stream');
                }
                if (len > 0) {
                    counts[len]++;
                    totalSymbols++;
                }
            }
            // Verify tree is not oversubscribed
            let left = 1;
            for (let bits = 1; bits <= maxBits; bits++) {
                left = (left << 1) - counts[bits];
                if (left < 0) {
                    throw new Error('Invalid oversubscribed Huffman tree in DEFLATE stream');
                }
            }
            const offsets = new Array<number>(maxBits + 1).fill(0);
            for (let bits = 1; bits < maxBits; bits++) {
                offsets[bits + 1] = offsets[bits] + counts[bits];
            }
            const symbols = new Array<number>(totalSymbols).fill(0);
            for (let sym = 0; sym < lengths.length; sym++) {
                const len = lengths[sym];
                if (len > 0) {
                    symbols[offsets[len]++] = sym;
                }
            }
            return { counts, symbols, totalSymbols };
        };

        const decodeSymbol = (tree: HuffmanTree): number => {
            if (tree.totalSymbols === 0) {
                throw new Error('Invalid empty Huffman tree in DEFLATE stream');
            }
            let code = 0;
            let first = 0;
            let index = 0;
            for (let len = 1; len <= 15; len++) {
                code |= readBits(1);
                const count = tree.counts[len];
                if (code - count < first) {
                    return tree.symbols[index + (code - first)];
                }
                index += count;
                first += count;
                first <<= 1;
                code <<= 1;
            }
            throw new Error('Invalid Huffman code in DEFLATE stream');
        };

        const lengthBase = [
            3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195,
            227, 258
        ];
        const lengthExtra = [
            0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
        ];
        const distBase = [
            1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
            4097, 6145, 8193, 12289, 16385, 24577
        ];
        const distExtra = [
            0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
        ];

        const fixedLitLengths = new Array<number>(288);
        for (let i = 0; i <= 143; i++) fixedLitLengths[i] = 8;
        for (let i = 144; i <= 255; i++) fixedLitLengths[i] = 9;
        for (let i = 256; i <= 279; i++) fixedLitLengths[i] = 7;
        for (let i = 280; i <= 287; i++) fixedLitLengths[i] = 8;
        const fixedDistLengths = new Array<number>(30).fill(5);

        let isFinal = 0;
        while (!isFinal) {
            isFinal = readBits(1);
            const bType = readBits(2);
            if (bType === 0) {
                // Stored block
                bitPos = (bitPos + 7) & ~7;
                const len = readBits(16);
                const nlen = readBits(16);
                if ((len ^ 0xffff) !== nlen) {
                    throw new Error('Corrupt stored DEFLATE block length complement');
                }
                const byteStart = bitPos >>> 3;
                if (byteStart + len > data.length) {
                    throw new Error('Truncated DEFLATE stream');
                }
                ensureOutputCapacity(len);
                buf.set(data.subarray(byteStart, byteStart + len), outLen);
                outLen += len;
                bitPos += len * 8;
            } else if (bType === 1 || bType === 2) {
                let litTree: HuffmanTree;
                let distTree: HuffmanTree;
                if (bType === 1) {
                    litTree = buildHuffman(fixedLitLengths);
                    distTree = buildHuffman(fixedDistLengths);
                } else {
                    const hlit = readBits(5) + 257;
                    const hdist = readBits(5) + 1;
                    const hclen = readBits(4) + 4;
                    if (hlit > 286 || hdist > 30) {
                        throw new Error('Invalid DEFLATE dynamic Huffman counts');
                    }
                    const clOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
                    const clLengths = new Array<number>(19).fill(0);
                    for (let i = 0; i < hclen; i++) {
                        clLengths[clOrder[i]] = readBits(3);
                    }
                    const clTree = buildHuffman(clLengths);
                    const totalCodes = hlit + hdist;
                    const codeLengths = new Array<number>(totalCodes).fill(0);
                    let idx = 0;
                    while (idx < totalCodes) {
                        const sym = decodeSymbol(clTree);
                        if (sym < 16) {
                            codeLengths[idx++] = sym;
                        } else if (sym === 16) {
                            if (idx === 0) {
                                throw new Error('Invalid DEFLATE repeat previous code at start of table');
                            }
                            const prev = codeLengths[idx - 1];
                            const rep = readBits(2) + 3;
                            if (idx + rep > totalCodes) {
                                throw new Error('Invalid DEFLATE code length repeat overflow');
                            }
                            for (let r = 0; r < rep; r++) codeLengths[idx++] = prev;
                        } else if (sym === 17) {
                            const rep = readBits(3) + 3;
                            if (idx + rep > totalCodes) {
                                throw new Error('Invalid DEFLATE zero repeat overflow');
                            }
                            for (let r = 0; r < rep; r++) codeLengths[idx++] = 0;
                        } else if (sym === 18) {
                            const rep = readBits(7) + 11;
                            if (idx + rep > totalCodes) {
                                throw new Error('Invalid DEFLATE zero repeat overflow');
                            }
                            for (let r = 0; r < rep; r++) codeLengths[idx++] = 0;
                        } else {
                            throw new Error('Invalid DEFLATE code length symbol');
                        }
                    }
                    litTree = buildHuffman(codeLengths.slice(0, hlit));
                    distTree = buildHuffman(codeLengths.slice(hlit));
                }

                while (true) {
                    const sym = decodeSymbol(litTree);
                    if (sym === 256) break;
                    if (sym < 256) {
                        ensureOutputCapacity(1);
                        buf[outLen++] = sym;
                    } else {
                        const lenIdx = sym - 257;
                        if (lenIdx < 0 || lenIdx >= lengthBase.length) {
                            throw new Error('Invalid DEFLATE length symbol');
                        }
                        const length = lengthBase[lenIdx] + readBits(lengthExtra[lenIdx]);
                        const distSym = decodeSymbol(distTree);
                        if (distSym < 0 || distSym >= distBase.length) {
                            throw new Error('Invalid DEFLATE distance symbol');
                        }
                        const distance = distBase[distSym] + readBits(distExtra[distSym]);
                        if (distance <= 0 || distance > outLen) {
                            throw new Error('Invalid DEFLATE lookback distance');
                        }
                        ensureOutputCapacity(length);
                        let srcPos = outLen - distance;
                        for (let i = 0; i < length; i++) {
                            buf[outLen++] = buf[srcPos++];
                        }
                    }
                }
            } else {
                throw new Error('Invalid DEFLATE block type 3');
            }
        }
        return buf.subarray(0, outLen);
    }

    private crc32(bytes: Uint8Array): number {
        let c = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) {
            c ^= bytes[i];
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
        }
        return (c ^ 0xffffffff) >>> 0;
    }
}

// ---------------------------------------------------------------------------
// Formula Tokenizer, AST Compiler, DAG Structures, Date & Range Shift Helpers
// ---------------------------------------------------------------------------

/** Excel 1900 serial date offset from Unix epoch days (`1970-01-01 === 25569`). */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
const MAX_AST_CACHE_ENTRIES = 10_000;

interface RangeWatcherEntry {
    watcherKey: string;
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

interface WorkbookDependencyGraph {
    namedRangesSignature: string;
    astByCellKey: Map<string, FormulaAstNode | null>;
    directCellDeps: Map<string, string[]>;
    directCellDepSets: Map<string, Set<string>>;
    reverseCellDeps: Map<string, Set<string>>;
    rangeWatchersBySheet: Map<string, RangeWatcherEntry[]>;
    rangeWatchesByCell: Map<string, Array<{ sheetId: string; startRow: number; endRow: number; startCol: number; endCol: number }>>;
    watchedSheetsByCell: Map<string, string[]>;
    formulaCellsBySheet: Map<WorksheetSpec, Map<number, Array<{ row: number; key: string }>>>;
    spillBlockedKeysBySheet: Map<string, Set<string>>;
    sheetById: Map<string, WorksheetSpec>;
}

type BinaryOperator = '=' | '<>' | '<' | '<=' | '>' | '>=' | '&' | '+' | '-' | '*' | '/' | '^';

type FormulaAstNode =
    | { kind: 'EmptyArg' }
    | { kind: 'NumberLiteral'; value: number }
    | { kind: 'StringLiteral'; value: string }
    | { kind: 'BooleanLiteral'; value: boolean }
    | { kind: 'ErrorLiteral'; error: string }
    | { kind: 'ArrayLiteral'; rows: FormulaAstNode[][] }
    | { kind: 'CellRef'; sheetName?: string; address: string }
    | { kind: 'RangeRef'; sheetName?: string; startAddress: string; endAddress: string }
    | { kind: 'Identifier'; name: string }
    | { kind: 'UnaryOp'; op: '+' | '-'; operand: FormulaAstNode }
    | { kind: 'PostfixPercent'; operand: FormulaAstNode }
    | { kind: 'BinaryOp'; op: BinaryOperator; left: FormulaAstNode; right: FormulaAstNode }
    | { kind: 'FunctionCall'; name: string; args: FormulaAstNode[] }
    | { kind: 'InvokeLambda'; callee: FormulaAstNode; args: FormulaAstNode[] };

type SpreadsheetLexicalBinding =
    | { kind: 'scalar'; value: SpreadsheetCellValue }
    | { kind: 'matrix'; value: SpreadsheetCellValue[][] }
    | {
          kind: 'lambda';
          params: string[];
          body: FormulaAstNode;
          closureScope?: ReadonlyMap<string, SpreadsheetLexicalBinding>;
      };

const DYNAMIC_ARRAY_FN_SET = new Set<string>([
    'FILTER',
    'UNIQUE',
    'SORT',
    'SORTBY',
    'SEQUENCE',
    'LET',
    'LAMBDA'
]);

type FormulaToken =
    | { type: 'Number'; value: number }
    | { type: 'String'; value: string }
    | { type: 'Error'; value: string }
    | { type: 'SheetPrefix'; sheetName: string }
    | { type: 'Ident'; value: string }
    | { type: 'Op'; value: BinaryOperator }
    | { type: 'Percent' }
    | { type: 'Colon' }
    | { type: 'Comma' }
    | { type: 'LParen' }
    | { type: 'RParen' }
    | { type: 'LBrace' }
    | { type: 'RBrace' }
    | { type: 'Semicolon' };

const FORMULA_AST_CACHE_STORE_KEY = '___MJ_SPREADSHEET_FORMULA_AST_CACHE';
function getFormulaAstCache(): Map<string, FormulaAstNode> {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    let cache = store[FORMULA_AST_CACHE_STORE_KEY] as Map<string, FormulaAstNode> | undefined;
    if (!cache) {
        cache = new Map<string, FormulaAstNode>();
        store[FORMULA_AST_CACHE_STORE_KEY] = cache;
    }
    return cache;
}

function compileFormulaAstCached(exprBody: string): FormulaAstNode {
    const cache = getFormulaAstCache();
    const existing = cache.get(exprBody);
    if (existing) {
        return existing;
    }
    const ast = parseFormulaAst(exprBody);
    if (cache.size >= MAX_AST_CACHE_ENTRIES) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) {
            cache.delete(firstKey);
        }
    }
    cache.set(exprBody, ast);
    return ast;
}

interface ScannedFormulaToken {
    token: FormulaToken;
    start: number;
    end: number;
}

function tokenizeFormula(expr: string): FormulaToken[] | { error: string } {
    const scanned = scanFormulaTokens(expr);
    if (!Array.isArray(scanned)) {
        return scanned;
    }
    return scanned.map((entry) => entry.token);
}

function scanFormulaTokens(expr: string): ScannedFormulaToken[] | { error: string } {
    if (expr.length > MAX_FORMULA_LENGTH) {
        return { error: '#VALUE!' };
    }
    const tokens: ScannedFormulaToken[] = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
        const ch = expr[i];
        if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
            i++;
            continue;
        }
        const tokenStart = i;

        // String literal with doubled "" escapes
        if (ch === '"') {
            i++;
            let buf = '';
            let closed = false;
            while (i < len) {
                if (expr[i] === '"') {
                    if (expr[i + 1] === '"') {
                        buf += '"';
                        i += 2;
                        continue;
                    }
                    i++;
                    closed = true;
                    break;
                }
                buf += expr[i++];
            }
            if (!closed) {
                return { error: '#VALUE!' };
            }
            tokens.push({ token: { type: 'String', value: buf }, start: tokenStart, end: i });
            continue;
        }

        // Single-quoted sheet prefix: '2025-2026'! or 'O''Brien'!
        if (ch === "'") {
            i++;
            let sheetBuf = '';
            let closed = false;
            while (i < len) {
                if (expr[i] === "'") {
                    if (expr[i + 1] === "'") {
                        sheetBuf += "'";
                        i += 2;
                        continue;
                    }
                    i++;
                    closed = true;
                    break;
                }
                sheetBuf += expr[i++];
            }
            if (!closed || expr[i] !== '!') {
                return { error: '#VALUE!' };
            }
            i++; // consume '!'
            tokens.push({ token: { type: 'SheetPrefix', sheetName: sheetBuf }, start: tokenStart, end: i });
            continue;
        }

        // Error literal: #REF!, #DIV/0!, #VALUE!, #NAME?, #N/A, #NUM!, #NULL!, #CYCLE!, #SPILL!, #CALC!, #MJ_*!
        if (ch === '#') {
            const rest = expr.slice(i);
            const errMatch = /^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|CYCLE!|SPILL!|CALC!|MJ_ACCESS_DENIED!|MJ_PENDING!)/i.exec(rest);
            if (errMatch) {
                i += errMatch[0].length;
                tokens.push({ token: { type: 'Error', value: `#${errMatch[1].toUpperCase()}` }, start: tokenStart, end: i });
                continue;
            }
            return { error: '#VALUE!' };
        }

        // Numeric literal (including leading dot .5 and scientific notation 1e-11, 1.5E+3)
        if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
            const numMatch = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(expr.slice(i));
            if (numMatch) {
                i += numMatch[0].length;
                tokens.push({ token: { type: 'Number', value: Number(numMatch[0]) }, start: tokenStart, end: i });
                continue;
            }
        }

        // Two-character comparison operators
        const twoChar = expr.slice(i, i + 2);
        if (twoChar === '<>' || twoChar === '<=' || twoChar === '>=') {
            i += 2;
            tokens.push({ token: { type: 'Op', value: twoChar }, start: tokenStart, end: i });
            continue;
        }

        // Single-character operators and punctuation
        if (ch === '=' || ch === '<' || ch === '>' || ch === '&' || ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
            i++;
            tokens.push({ token: { type: 'Op', value: ch }, start: tokenStart, end: i });
            continue;
        }
        if (ch === '%') {
            i++;
            tokens.push({ token: { type: 'Percent' }, start: tokenStart, end: i });
            continue;
        }
        if (ch === ':') {
            i++;
            tokens.push({ token: { type: 'Colon' }, start: tokenStart, end: i });
            continue;
        }
        if (ch === ',') {
            i++;
            tokens.push({ token: { type: 'Comma' }, start: tokenStart, end: i });
            continue;
        }
        if (ch === '(') {
            i++;
            tokens.push({ token: { type: 'LParen' }, start: tokenStart, end: i });
            continue;
        }
        if (ch === ')') {
            i++;
            tokens.push({ token: { type: 'RParen' }, start: tokenStart, end: i });
            continue;
        }
        if (ch === '{') {
            i++;
            tokens.push({ token: { type: 'LBrace' }, start: tokenStart, end: i });
            continue;
        }
        if (ch === '}') {
            i++;
            tokens.push({ token: { type: 'RBrace' }, start: tokenStart, end: i });
            continue;
        }
        if (ch === ';') {
            i++;
            tokens.push({ token: { type: 'Semicolon' }, start: tokenStart, end: i });
            continue;
        }

        // Cell reference ($B$2), unquoted SheetName! prefix, function identifier, or NamedRange identifier
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_' || ch === '$') {
            const identMatch = /^[\$A-Za-z_][\$A-Za-z0-9_.]*/.exec(expr.slice(i));
            if (identMatch) {
                const rawIdent = identMatch[0];
                i += rawIdent.length;
                if (expr[i] === '!') {
                    i++; // consume '!'
                    tokens.push({ token: { type: 'SheetPrefix', sheetName: rawIdent }, start: tokenStart, end: i });
                } else {
                    tokens.push({ token: { type: 'Ident', value: rawIdent }, start: tokenStart, end: i });
                }
                continue;
            }
        }

        return { error: '#VALUE!' };
    }

    return tokens;
}

function parseFormulaAst(expr: string): FormulaAstNode {
    const tokRes = tokenizeFormula(expr);
    if (!Array.isArray(tokRes)) {
        return { kind: 'ErrorLiteral', error: tokRes.error };
    }
    const tokens = tokRes;
    if (tokens.length === 0) {
        return { kind: 'EmptyArg' };
    }

    let pos = 0;
    let astDepth = 0;
    let astDepthExceeded = false;
    const peek = (): FormulaToken | undefined => tokens[pos];
    const consume = (): FormulaToken | undefined => tokens[pos++];

    // Precedence 1 (lowest): Comparison (=, <>, <, <=, >, >=)
    const parseComparison = (): FormulaAstNode => {
        if (astDepth >= MAX_AST_DEPTH) {
            astDepthExceeded = true;
            return { kind: 'ErrorLiteral', error: '#VALUE!' };
        }
        astDepth++;
        try {
            let left = parseConcat();
            while (!astDepthExceeded) {
                const t = peek();
                if (
                    t?.type === 'Op' &&
                    (t.value === '=' || t.value === '<>' || t.value === '<' || t.value === '<=' || t.value === '>' || t.value === '>=')
                ) {
                    consume();
                    const right = parseConcat();
                    left = { kind: 'BinaryOp', op: t.value, left, right };
                } else {
                    break;
                }
            }
            return left;
        } finally {
            astDepth--;
        }
    };

    // Precedence 2: Concatenation (&)
    const parseConcat = (): FormulaAstNode => {
        let left = parseAddSub();
        while (peek()?.type === 'Op' && (peek() as { type: 'Op'; value: BinaryOperator }).value === '&') {
            consume();
            const right = parseAddSub();
            left = { kind: 'BinaryOp', op: '&', left, right };
        }
        return left;
    };

    // Precedence 3: Addition / Subtraction (+, -)
    const parseAddSub = (): FormulaAstNode => {
        let left = parseMulDiv();
        while (true) {
            const t = peek();
            if (t?.type === 'Op' && (t.value === '+' || t.value === '-')) {
                consume();
                const right = parseMulDiv();
                left = { kind: 'BinaryOp', op: t.value, left, right };
            } else {
                break;
            }
        }
        return left;
    };

    // Precedence 4: Multiplication / Division (*, /)
    const parseMulDiv = (): FormulaAstNode => {
        let left = parseUnary();
        while (true) {
            const t = peek();
            if (t?.type === 'Op' && (t.value === '*' || t.value === '/')) {
                consume();
                const right = parseUnary();
                left = { kind: 'BinaryOp', op: t.value, left, right };
            } else {
                break;
            }
        }
        return left;
    };

    // Precedence 5: Prefix Unary (+, -) and Exponentiation (^)
    const parseUnary = (): FormulaAstNode => {
        if (astDepth >= MAX_AST_DEPTH) {
            astDepthExceeded = true;
            return { kind: 'ErrorLiteral', error: '#VALUE!' };
        }
        astDepth++;
        try {
            const t = peek();
            if (t?.type === 'Op' && (t.value === '+' || t.value === '-')) {
                consume();
                const operand = parseUnary();
                return { kind: 'UnaryOp', op: t.value, operand };
            }
            return parsePower();
        } finally {
            astDepth--;
        }
    };

    const parsePower = (): FormulaAstNode => {
        let left = parsePostfix();
        while (peek()?.type === 'Op' && (peek() as { type: 'Op'; value: BinaryOperator }).value === '^') {
            consume();
            const right = parseUnary();
            left = { kind: 'BinaryOp', op: '^', left, right };
        }
        return left;
    };

    // Precedence 6: Postfix % (supports 12%, (A1)%, (B2+C2)%)
    const parsePostfix = (): FormulaAstNode => {
        let node = parsePrimary();
        while (peek()?.type === 'Percent') {
            consume();
            node = { kind: 'PostfixPercent', operand: node };
        }
        return node;
    };

    // Precedence 7: Literals, Parenthesized Expressions, Function Calls, Cell/Range Refs, Named Ranges
    const parsePrimary = (): FormulaAstNode => {
        const t = peek();
        if (!t) {
            return { kind: 'ErrorLiteral', error: '#VALUE!' };
        }

        const isColOnlyRef = (s: string): boolean => {
            const m = /^\$?([A-Za-z]{1,3})$/.exec(s);
            return Boolean(m && ColumnLetterToIndex(m[1]) <= 16384);
        };
        const isRowOnlyRef = (s: string): boolean => /^\$?[1-9][0-9]*$/.test(s);

        if (t.type === 'Number') {
            consume();
            // Whole-row range reference like 1:1 or 2:10
            if (Number.isInteger(t.value) && t.value >= 1 && peek()?.type === 'Colon') {
                consume();
                const endTok = peek();
                if (endTok?.type === 'Number' && Number.isInteger(endTok.value) && endTok.value >= 1) {
                    consume();
                    return { kind: 'RangeRef', startAddress: String(t.value), endAddress: String(endTok.value) };
                }
                if (endTok?.type === 'Ident' && isRowOnlyRef(endTok.value)) {
                    consume();
                    return { kind: 'RangeRef', startAddress: String(t.value), endAddress: endTok.value };
                }
                return { kind: 'ErrorLiteral', error: '#REF!' };
            }
            return { kind: 'NumberLiteral', value: t.value };
        }
        if (t.type === 'String') {
            consume();
            return { kind: 'StringLiteral', value: t.value };
        }
        if (t.type === 'Error') {
            consume();
            return { kind: 'ErrorLiteral', error: t.value };
        }
        if (t.type === 'LParen') {
            consume();
            const inner = parseComparison();
            if (peek()?.type !== 'RParen') {
                return { kind: 'ErrorLiteral', error: '#VALUE!' };
            }
            consume();
            return inner;
        }
        if (t.type === 'LBrace') {
            consume();
            const rows: FormulaAstNode[][] = [];
            let currentRow: FormulaAstNode[] = [];
            if (peek()?.type === 'RBrace') {
                consume();
                return { kind: 'ArrayLiteral', rows: [] };
            }
            while (true) {
                const element = parseComparison();
                currentRow.push(element);
                const nextTok = peek();
                if (nextTok?.type === 'Comma') {
                    consume();
                    continue;
                }
                if (nextTok?.type === 'Semicolon') {
                    consume();
                    rows.push(currentRow);
                    currentRow = [];
                    continue;
                }
                if (nextTok?.type === 'RBrace') {
                    consume();
                    rows.push(currentRow);
                    break;
                }
                return { kind: 'ErrorLiteral', error: '#VALUE!' };
            }
            return { kind: 'ArrayLiteral', rows };
        }
        if (t.type === 'SheetPrefix') {
            consume();
            const next = peek();
            if (next?.type === 'Error') {
                consume();
                return { kind: 'ErrorLiteral', error: next.value };
            }
            if (next?.type === 'Number' && Number.isInteger(next.value) && next.value >= 1) {
                consume();
                if (peek()?.type === 'Colon') {
                    consume();
                    if (peek()?.type === 'SheetPrefix') {
                        consume();
                    }
                    const endTok = peek();
                    if (endTok?.type === 'Number' && Number.isInteger(endTok.value) && endTok.value >= 1) {
                        consume();
                        return {
                            kind: 'RangeRef',
                            sheetName: t.sheetName,
                            startAddress: String(next.value),
                            endAddress: String(endTok.value)
                        };
                    }
                    if (endTok?.type === 'Ident' && isRowOnlyRef(endTok.value)) {
                        consume();
                        return {
                            kind: 'RangeRef',
                            sheetName: t.sheetName,
                            startAddress: String(next.value),
                            endAddress: endTok.value
                        };
                    }
                }
                return { kind: 'ErrorLiteral', error: '#REF!' };
            }
            if (next?.type === 'Ident' && (ParseCellAddress(next.value) || isColOnlyRef(next.value) || isRowOnlyRef(next.value))) {
                const startAddr = next.value;
                consume();
                if (peek()?.type === 'Colon') {
                    consume();
                    // Optional repeated sheet prefix on second endpoint ('Sheet'!A1:'Sheet'!B5)
                    if (peek()?.type === 'SheetPrefix') {
                        consume();
                    }
                    const endTok = peek();
                    if (
                        endTok?.type === 'Ident' &&
                        (ParseCellAddress(endTok.value) || isColOnlyRef(endTok.value) || isRowOnlyRef(endTok.value))
                    ) {
                        consume();
                        return {
                            kind: 'RangeRef',
                            sheetName: t.sheetName,
                            startAddress: startAddr,
                            endAddress: endTok.value
                        };
                    }
                    if (
                        isRowOnlyRef(startAddr) &&
                        endTok?.type === 'Number' &&
                        Number.isInteger(endTok.value) &&
                        endTok.value >= 1
                    ) {
                        consume();
                        return {
                            kind: 'RangeRef',
                            sheetName: t.sheetName,
                            startAddress: startAddr,
                            endAddress: String(endTok.value)
                        };
                    }
                    return { kind: 'ErrorLiteral', error: '#REF!' };
                }
                if (ParseCellAddress(startAddr)) {
                    return { kind: 'CellRef', sheetName: t.sheetName, address: startAddr };
                }
                return { kind: 'ErrorLiteral', error: '#REF!' };
            }
            return { kind: 'ErrorLiteral', error: '#REF!' };
        }
        if (t.type === 'Ident') {
            consume();
            // Function call: IDENT(...)
            if (peek()?.type === 'LParen') {
                consume(); // '('
                const fnArgs: FormulaAstNode[] = [];
                if (peek()?.type === 'RParen') {
                    consume();
                    let node: FormulaAstNode = { kind: 'FunctionCall', name: t.value, args: fnArgs };
                while (t.value.toUpperCase() === 'LAMBDA' && peek()?.type === 'LParen') {
                    consume(); // '('
                    const callArgs: FormulaAstNode[] = [];
                    if (peek()?.type === 'RParen') {
                        consume();
                    } else {
                        while (true) {
                            if (peek()?.type === 'Comma' || peek()?.type === 'RParen') {
                                callArgs.push({ kind: 'EmptyArg' });
                            } else {
                                callArgs.push(parseComparison());
                            }
                            if (peek()?.type === 'Comma') {
                                consume();
                                if (peek()?.type === 'RParen') {
                                    callArgs.push({ kind: 'EmptyArg' });
                                    consume();
                                    break;
                                }
                                continue;
                            }
                            if (peek()?.type === 'RParen') {
                                consume();
                                break;
                            }
                            return { kind: 'ErrorLiteral', error: '#VALUE!' };
                        }
                    }
                    node = { kind: 'InvokeLambda', callee: node, args: callArgs };
                }
                return node;
                }
                while (true) {
                    if (peek()?.type === 'Comma' || peek()?.type === 'RParen') {
                        fnArgs.push({ kind: 'EmptyArg' });
                    } else {
                        fnArgs.push(parseComparison());
                    }
                    if (peek()?.type === 'Comma') {
                        consume();
                        if (peek()?.type === 'RParen') {
                            fnArgs.push({ kind: 'EmptyArg' });
                            consume();
                            break;
                        }
                        continue;
                    }
                    if (peek()?.type === 'RParen') {
                        consume();
                        break;
                    }
                    return { kind: 'ErrorLiteral', error: '#VALUE!' };
                }
                let node: FormulaAstNode = { kind: 'FunctionCall', name: t.value, args: fnArgs };
                while (t.value.toUpperCase() === 'LAMBDA' && peek()?.type === 'LParen') {
                    consume(); // '('
                    const callArgs: FormulaAstNode[] = [];
                    if (peek()?.type === 'RParen') {
                        consume();
                    } else {
                        while (true) {
                            if (peek()?.type === 'Comma' || peek()?.type === 'RParen') {
                                callArgs.push({ kind: 'EmptyArg' });
                            } else {
                                callArgs.push(parseComparison());
                            }
                            if (peek()?.type === 'Comma') {
                                consume();
                                if (peek()?.type === 'RParen') {
                                    callArgs.push({ kind: 'EmptyArg' });
                                    consume();
                                    break;
                                }
                                continue;
                            }
                            if (peek()?.type === 'RParen') {
                                consume();
                                break;
                            }
                            return { kind: 'ErrorLiteral', error: '#VALUE!' };
                        }
                    }
                    node = { kind: 'InvokeLambda', callee: node, args: callArgs };
                }
                return node;
            }

            // Boolean literals
            const upper = t.value.toUpperCase();
            if (upper === 'TRUE') return { kind: 'BooleanLiteral', value: true };
            if (upper === 'FALSE') return { kind: 'BooleanLiteral', value: false };

            // Whole-column (A:A, $A:$C) or dollar-row ($1:$5) range reference
            if (!ParseCellAddress(t.value) && peek()?.type === 'Colon' && (isColOnlyRef(t.value) || isRowOnlyRef(t.value))) {
                consume();
                const endTok = peek();
                if (isColOnlyRef(t.value) && endTok?.type === 'Ident' && isColOnlyRef(endTok.value)) {
                    consume();
                    return { kind: 'RangeRef', startAddress: t.value, endAddress: endTok.value };
                }
                if (isRowOnlyRef(t.value)) {
                    if (endTok?.type === 'Ident' && isRowOnlyRef(endTok.value)) {
                        consume();
                        return { kind: 'RangeRef', startAddress: t.value, endAddress: endTok.value };
                    }
                    if (endTok?.type === 'Number' && Number.isInteger(endTok.value) && endTok.value >= 1) {
                        consume();
                        return { kind: 'RangeRef', startAddress: t.value, endAddress: String(endTok.value) };
                    }
                }
                return { kind: 'ErrorLiteral', error: '#REF!' };
            }

            // Local cell or range reference
            if (ParseCellAddress(t.value)) {
                if (peek()?.type === 'Colon') {
                    consume();
                    const endTok = peek();
                    if (endTok?.type === 'Ident' && ParseCellAddress(endTok.value)) {
                        consume();
                        return { kind: 'RangeRef', startAddress: t.value, endAddress: endTok.value };
                    }
                    if (endTok?.type === 'Error') {
                        consume();
                        return { kind: 'ErrorLiteral', error: endTok.value };
                    }
                    return { kind: 'ErrorLiteral', error: '#REF!' };
                }
                return { kind: 'CellRef', address: t.value };
            }

            return { kind: 'Identifier', name: t.value };
        }

        consume();
        return { kind: 'ErrorLiteral', error: '#VALUE!' };
    };

    const root = parseComparison();
    if (astDepthExceeded || pos < tokens.length) {
        return { kind: 'ErrorLiteral', error: '#VALUE!' };
    }
    return root;
}

function cleanExcelFloat(n: number): number {
    if (!Number.isFinite(n)) return n;
    if (n === 0) return 0;
    const p12 = Number(n.toPrecision(12));
    if (Math.abs(n - p12) <= 1e-14 * Math.abs(n)) {
        return p12 === 0 ? 0 : p12;
    }
    return n;
}

function generateSpreadsheetUuid(): string {
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * OpenXML `.xlsx` import/export and in-place patching adapter backed by {@link SpreadsheetEngine}.
 */
export class XlsxOpenXmlAdapter extends BaseSingleton<XlsxOpenXmlAdapter> {
    protected constructor() {
        super();
    }

    public static get Instance(): XlsxOpenXmlAdapter {
        return super.getInstance<XlsxOpenXmlAdapter>();
    }

    public ExportXlsx(workbook: WorkbookSpec, includeMjMetadataSheet = true): Uint8Array {
        return SpreadsheetEngine.Instance.ExportToXlsxBytes(workbook, includeMjMetadataSheet);
    }

    public ImportXlsx(bytes: Uint8Array | ArrayBuffer, configurationJson?: string | null): WorkbookSpec {
        return SpreadsheetEngine.Instance.ImportFromXlsxBytes(bytes, configurationJson);
    }

    public ImportXlsxIsolated(
        bytes: Uint8Array | ArrayBuffer,
        configurationJson?: string | null
    ): Promise<WorkbookSpec> {
        if (!GetSpreadsheetWorkerRunner()) {
            return Promise.resolve(this.ImportXlsx(bytes, configurationJson));
        }
        return SpreadsheetEngine.Instance.ImportFromXlsxBytesIsolated(bytes, configurationJson);
    }

    public PatchXlsxBytes(originalBytes: Uint8Array | ArrayBuffer, workbook: WorkbookSpec): Uint8Array {
        return SpreadsheetEngine.Instance.PatchXlsxBytes(originalBytes, workbook);
    }

    public PatchXlsxBytesIsolated(
        originalBytes: Uint8Array | ArrayBuffer,
        workbook: WorkbookSpec
    ): Promise<Uint8Array> {
        if (!GetSpreadsheetWorkerRunner()) {
            return Promise.resolve(this.PatchXlsxBytes(originalBytes, workbook));
        }
        return SpreadsheetEngine.Instance.PatchXlsxBytesIsolated(originalBytes, workbook);
    }
}

function decimalShift(absVal: number, expShift: number): number {
    if (absVal === 0 || expShift === 0) return absVal;
    const parts = absVal.toString().split(/[eE]/);
    const mantissa = parts[0];
    const currentExp = parts[1] ? parseInt(parts[1], 10) : 0;
    return Number(`${mantissa}e${currentExp + expShift}`);
}

function excelSerialToUtcDate(serial: number): Date {
    const daySerial = Math.floor(serial);
    const fracMs = Math.round((serial - daySerial) * 86_400_000);
    return new Date((daySerial - EXCEL_EPOCH_OFFSET_DAYS) * 86_400_000 + fracMs);
}

function formatExcelSerialDate(serial: number, includeTime: boolean): string {
    const dt = excelSerialToUtcDate(serial);
    const yyyy = String(dt.getUTCFullYear()).padStart(4, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    if (!includeTime) {
        return `${yyyy}-${mm}-${dd}`;
    }
    const hh = String(dt.getUTCHours()).padStart(2, '0');
    const min = String(dt.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function isAutoDateFormattedFormula(formula: string): boolean {
    const body = formula.trim().replace(/^=\s*/, '');
    if (/^(?:YEAR|MONTH|DAY|DAYS)\s*\(/i.test(body)) {
        return false;
    }
    return /\b(?:TODAY|NOW|DATE|EDATE|EOMONTH)\s*\(/i.test(body);
}

function hasExcelWildcard(pattern: string): boolean {
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i] === '~') {
            i++;
            continue;
        }
        if (pattern[i] === '*' || pattern[i] === '?') {
            return true;
        }
    }
    return false;
}

function normalizeCompareFloat15(n: number): number {
    return !Number.isFinite(n) || n === 0 ? n : Number(n.toPrecision(15));
}

function needsSheetQuotes(sheetName: string): boolean {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sheetName)) {
        return true;
    }
    if (/^(?:TRUE|FALSE)$/i.test(sheetName)) {
        return true;
    }
    if (/^R(\d+)?C(\d+)?$/i.test(sheetName)) {
        return true;
    }
    if (/^[A-Za-z]{1,3}\d+$/.test(sheetName) || Boolean(ParseCellAddress(sheetName))) {
        return true;
    }
    return false;
}

function formatSheetQualifier(sheetName: string): string {
    if (!needsSheetQuotes(sheetName)) {
        return `${sheetName}!`;
    }
    return `'${sheetName.replace(/'/g, () => "''")}'!`;
}

function getEffectiveSheetDimensions(ws: WorksheetSpec): { maxRow: number; maxCol: number } {
    let maxRow = Math.max(1, ws.Rows.length);
    let maxCol = Math.max(1, ws.Columns.length);
    for (const addr of Object.keys(ws.Cells)) {
        const pos = parseCellCoordsFast(addr) ?? ParseCellAddress(addr);
        if (pos) {
            if (pos.row > maxRow) maxRow = pos.row;
            if (pos.col > maxCol) maxCol = pos.col;
        }
    }
    return { maxRow, maxCol };
}

const OOXML_FUTURE_FUNCTION_REGEX =
    /(?<![A-Za-z0-9_.])\b(SEQUENCE|XLOOKUP|XMATCH|FILTER|UNIQUE|SORT|SORTBY|RANDARRAY|LET|LAMBDA|TEXTJOIN|IFS|SWITCH|MAXIFS|MINIFS|CONCAT|IFNA|DAYS)(?=\s*\()/gi;

const UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL = '#UNIMPL_DYN!';
const UNIMPLEMENTED_DYNAMIC_ARRAY_FN_SET = new Set<string>([
    'RANDARRAY',
    'MAP',
    'REDUCE',
    'SCAN',
    'MAKEARRAY',
    'BYROW',
    'BYCOL',
    'VSTACK',
    'HSTACK',
    'TOCOL',
    'TOROW',
    'WRAPROWS',
    'WRAPCOLS',
    'TAKE',
    'DROP',
    'CHOOSEROWS',
    'CHOOSECOLS',
    'EXPAND'
]);

const UNIMPLEMENTED_DYNAMIC_ARRAY_CALL_REGEX =
    /\b(RANDARRAY|MAP|REDUCE|SCAN|MAKEARRAY|BYROW|BYCOL|VSTACK|HSTACK|TOCOL|TOROW|WRAPROWS|WRAPCOLS|TAKE|DROP|CHOOSEROWS|CHOOSECOLS|EXPAND)\s*\(/i;

function prefixLetParametersInMaskedFormula(expr: string, boundParams: ReadonlySet<string>): string {
    let out = '';
    let i = 0;
    while (i < expr.length) {
        const ch = expr[i];
        if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
            const start = i;
            i++;
            while (i < expr.length) {
                const c = expr[i];
                if (
                    (c >= 'A' && c <= 'Z') ||
                    (c >= 'a' && c <= 'z') ||
                    (c >= '0' && c <= '9') ||
                    c === '_' ||
                    c === '.'
                ) {
                    i++;
                } else {
                    break;
                }
            }
            const ident = expr.slice(start, i);
            if (/^__XLFN_(?:STR|SH)_\d+__$/.test(ident)) {
                out += ident;
                continue;
            }
            const prevChar = start > 0 ? expr[start - 1] : '';
            let wsEnd = i;
            while (wsEnd < expr.length && /\s/.test(expr[wsEnd])) {
                wsEnd++;
            }
            const nextNonWs = wsEnd < expr.length ? expr[wsEnd] : '';

            if (ident.toUpperCase() === 'LET' && prevChar !== '.' && prevChar !== '!' && nextNonWs === '(') {
                let depth = 1;
                let closeIdx = wsEnd + 1;
                while (closeIdx < expr.length && depth > 0) {
                    if (expr[closeIdx] === '(') depth++;
                    else if (expr[closeIdx] === ')') depth--;
                    if (depth === 0) break;
                    closeIdx++;
                }
                if (depth === 0) {
                    const innerRaw = expr.slice(wsEnd + 1, closeIdx);
                    const rawArgs: string[] = [];
                    let argStart = 0;
                    let argDepth = 0;
                    for (let k = 0; k < innerRaw.length; k++) {
                        if (innerRaw[k] === '(') argDepth++;
                        else if (innerRaw[k] === ')') argDepth--;
                        else if (innerRaw[k] === ',' && argDepth === 0) {
                            rawArgs.push(innerRaw.slice(argStart, k));
                            argStart = k + 1;
                        }
                    }
                    rawArgs.push(innerRaw.slice(argStart));

                    if (rawArgs.length >= 3) {
                        const localScope = new Set<string>(boundParams);
                        const transformedArgs: string[] = [];
                        let pendingParamLower: string | null = null;
                        for (let aIdx = 0; aIdx < rawArgs.length; aIdx++) {
                            const seg = rawArgs[aIdx];
                            const isParamDecl = aIdx < rawArgs.length - 1 && aIdx % 2 === 0;
                            if (isParamDecl) {
                                const paramMatch = /^(\s*)(?:_xlpm\.)?([A-Za-z_][A-Za-z0-9_.]*)(\s*)$/i.exec(seg);
                                if (paramMatch) {
                                    const paramName = paramMatch[2];
                                    pendingParamLower = paramName.toLowerCase();
                                    transformedArgs.push(`${paramMatch[1]}_xlpm.${paramName}${paramMatch[3]}`);
                                } else {
                                    pendingParamLower = null;
                                    transformedArgs.push(prefixLetParametersInMaskedFormula(seg, localScope));
                                }
                            } else {
                                transformedArgs.push(prefixLetParametersInMaskedFormula(seg, localScope));
                                if (pendingParamLower) {
                                    localScope.add(pendingParamLower);
                                    pendingParamLower = null;
                                }
                            }
                        }
                        out += `${ident}${expr.slice(i, wsEnd)}(${transformedArgs.join(',')})`;
                        i = closeIdx + 1;
                        continue;
                    }
                }
            }

            if (
                boundParams.size > 0 &&
                prevChar !== '.' &&
                prevChar !== '!' &&
                nextNonWs !== '!' &&
                nextNonWs !== '(' &&
                !ident.toLowerCase().startsWith('_xlpm.') &&
                boundParams.has(ident.toLowerCase())
            ) {
                out += `_xlpm.${ident}`;
                continue;
            }
            out += ident;
            continue;
        }
        out += ch;
        i++;
    }
    return out;
}

function prefixOoxmlFutureFunctions(formulaBody: string): string {
    if (!formulaBody) return formulaBody;
    const strippedBody = stripOoxmlFormulaPrefixes(formulaBody);
    const strLiterals: string[] = [];
    let masked = strippedBody.replace(/"(?:""|[^"])*"/g, (m) => {
        strLiterals.push(m);
        return `__XLFN_STR_${strLiterals.length - 1}__`;
    });
    const sheetQuotes: string[] = [];
    masked = masked.replace(/'(?:''|[^'])*'/g, (m) => {
        sheetQuotes.push(m);
        return `__XLFN_SH_${sheetQuotes.length - 1}__`;
    });
    if (/\bLET\s*\(/i.test(masked)) {
        masked = prefixLetParametersInMaskedFormula(masked, new Set<string>());
    }
    const prefixed = masked.replace(OOXML_FUTURE_FUNCTION_REGEX, (_full, fn: string) => {
        const upper = fn.toUpperCase();
        if (upper === 'SORT' || upper === 'FILTER') {
            return `_xlfn._xlws.${upper}`;
        }
        return `_xlfn.${upper}`;
    });
    const withSheets = prefixed.replace(
        /__XLFN_SH_(\d+)__/g,
        (_m, idx: string) => sheetQuotes[parseInt(idx, 10)] ?? ''
    );
    return withSheets.replace(
        /__XLFN_STR_(\d+)__/g,
        (_m, idx: string) => strLiterals[parseInt(idx, 10)] ?? ''
    );
}

function stripOoxmlFormulaPrefixes(formulaBody: string): string {
    if (!formulaBody || !/_xlfn\.|_xlws\.|_xlpm\./i.test(formulaBody)) return formulaBody;
    const strLiterals: string[] = [];
    let masked = formulaBody.replace(/"(?:""|[^"])*"/g, (m) => {
        strLiterals.push(m);
        return `__UNXLFN_STR_${strLiterals.length - 1}__`;
    });
    const sheetQuotes: string[] = [];
    masked = masked.replace(/'(?:''|[^'])*'/g, (m) => {
        sheetQuotes.push(m);
        return `__UNXLFN_SH_${sheetQuotes.length - 1}__`;
    });
    const stripped = masked.replace(/(?<![A-Za-z0-9_])(?:_xlfn\.|_xlws\.|_xlpm\.)+(?=[A-Za-z_])/gi, () => '');
    const withSheets = stripped.replace(
        /__UNXLFN_SH_(\d+)__/g,
        (_m, idx: string) => sheetQuotes[parseInt(idx, 10)] ?? ''
    );
    return withSheets.replace(
        /__UNXLFN_STR_(\d+)__/g,
        (_m, idx: string) => strLiterals[parseInt(idx, 10)] ?? ''
    );
}

function isSpillDynamicArrayFormulaBody(formulaBody: string): boolean {
    const clean = stripOoxmlFormulaPrefixes(formulaBody).replace(/"(?:""|[^"])*"/g, () => '""');
    return /\b(SEQUENCE|FILTER|UNIQUE|SORT|SORTBY|RANDARRAY)\s*\(/i.test(clean);
}

function containsUnimplementedDynamicArrayCall(formulaBody: string): boolean {
    if (!formulaBody) return false;
    const clean = stripOoxmlFormulaPrefixes(formulaBody).replace(/"(?:""|[^"])*"/g, () => '""');
    return UNIMPLEMENTED_DYNAMIC_ARRAY_CALL_REGEX.test(clean);
}

function isUnimplementedDynamicArrayError(formulaBody: string, val: SpreadsheetCellValue): boolean {
    if (!formulaBody) return false;
    if (val === '#NAME?' || val === UNIMPLEMENTED_DYNAMIC_ARRAY_SENTINEL) {
        return true;
    }
    return containsUnimplementedDynamicArrayCall(formulaBody);
}

/**
 * Validates a structured `=MJ.VIEW` filter expression, allowing column names like `[User] = 'bob'`,
 * `APP_NAME = 'Portal'`, `DB_NAME = 'Prod'`, bracketed column identifiers `[First Name] = 'Ada'`,
 * and Unicode string literals `Name = N'Renée'` while blocking SQL function-call syntax
 * (`USER_NAME()`, `APP_NAME()`), unbracketed niladic session tokens (`USER`, `SYSTEM_USER`, `CURRENT_USER`, `SESSION_USER`),
 * `@@` global variables, comments, semicolons, and DDL/DML keywords (`R7-9`, `R8-5`).
 */
export function ValidateExtraFilter(extraFilter: string): {
    Valid: boolean;
    NormalizedFilter?: string;
    AccessDenied?: boolean;
    ErrorMessage?: string;
} {
    const candidate = extraFilter.trim();
    if (candidate.length === 0) {
        return { Valid: true, NormalizedFilter: undefined };
    }

    // Scan character-by-character to mask bracketed column identifiers, Unicode N'...' literals, and '...' / "..." literals cleanly
    const quotedLiterals: Array<{ raw: string; unicode: boolean }> = [];
    const bracketedCols: string[] = [];
    let masked = '';
    for (let i = 0; i < candidate.length; i++) {
        const ch = candidate[i];
        if (ch === '[') {
            let j = i + 1;
            let closed = false;
            let inner = '';
            while (j < candidate.length) {
                if (candidate[j] === ']') {
                    if (j + 1 < candidate.length && candidate[j + 1] === ']') {
                        inner += ']';
                        j += 2;
                        continue;
                    }
                    closed = true;
                    break;
                }
                inner += candidate[j];
                j++;
            }
            if (!closed || inner.trim().length === 0) {
                return {
                    Valid: false,
                    AccessDenied: false,
                    ErrorMessage: 'Invalid or unclosed bracketed column identifier in =MJ.VIEW filter.'
                };
            }
            const idx = bracketedCols.length;
            bracketedCols.push(`[${inner.replace(/\]/g, () => ']]')}]`);
            masked += `__MJ_COL_${idx}__`;
            i = j;
        } else if (
            (ch === 'N' || ch === 'n') &&
            i + 1 < candidate.length &&
            candidate[i + 1] === "'" &&
            (i === 0 || !/[A-Za-z0-9_]/.test(candidate[i - 1]))
        ) {
            let j = i + 2;
            let closed = false;
            let raw = '';
            while (j < candidate.length) {
                if (candidate[j] === "'") {
                    if (j + 1 < candidate.length && candidate[j + 1] === "'") {
                        raw += "'";
                        j += 2;
                        continue;
                    }
                    closed = true;
                    break;
                }
                raw += candidate[j];
                j++;
            }
            if (!closed) {
                return {
                    Valid: false,
                    AccessDenied: true,
                    ErrorMessage: 'Unclosed Unicode string literal rejected in =MJ.VIEW filter.'
                };
            }
            const idx = quotedLiterals.length;
            quotedLiterals.push({ raw, unicode: true });
            masked += `__MJ_LIT_${idx}__`;
            i = j;
        } else if (ch === "'") {
            let j = i + 1;
            let closed = false;
            let raw = '';
            while (j < candidate.length) {
                if (candidate[j] === "'") {
                    if (j + 1 < candidate.length && candidate[j + 1] === "'") {
                        raw += "'";
                        j += 2;
                        continue;
                    }
                    closed = true;
                    break;
                }
                raw += candidate[j];
                j++;
            }
            if (!closed) {
                return {
                    Valid: false,
                    AccessDenied: true,
                    ErrorMessage: 'Unclosed string literal rejected in =MJ.VIEW filter.'
                };
            }
            const idx = quotedLiterals.length;
            quotedLiterals.push({ raw, unicode: false });
            masked += `__MJ_LIT_${idx}__`;
            i = j;
        } else if (ch === '"') {
            let j = i + 1;
            let closed = false;
            let raw = '';
            while (j < candidate.length) {
                if (candidate[j] === '"') {
                    if (j + 1 < candidate.length && candidate[j + 1] === '"') {
                        raw += '"';
                        j += 2;
                        continue;
                    }
                    closed = true;
                    break;
                }
                raw += candidate[j];
                j++;
            }
            if (!closed) {
                return {
                    Valid: false,
                    AccessDenied: true,
                    ErrorMessage: 'Unclosed string literal rejected in =MJ.VIEW filter.'
                };
            }
            const idx = quotedLiterals.length;
            quotedLiterals.push({ raw, unicode: false });
            masked += `__MJ_LIT_${idx}__`;
            i = j;
        } else {
            masked += ch;
        }
    }

    const hasSqlFunctionCall = (sqlText: string): boolean => {
        let searchFrom = 0;
        while (searchFrom < sqlText.length) {
            const openParen = sqlText.indexOf('(', searchFrom);
            if (openParen === -1) {
                return false;
            }
            let pos = openParen - 1;
            while (pos >= 0 && /\s/.test(sqlText[pos])) {
                pos--;
            }
            if (pos >= 0 && /[A-Za-z0-9_]/.test(sqlText[pos])) {
                let identStart = pos;
                while (identStart > 0 && /[A-Za-z0-9_]/.test(sqlText[identStart - 1])) {
                    identStart--;
                }
                if (/[A-Za-z_]/.test(sqlText[identStart])) {
                    return true;
                }
            }
            searchFrom = openParen + 1;
        }
        return false;
    };

    const splitSqlAndClauses = (sqlText: string): string[] => {
        const parts: string[] = [];
        const upper = sqlText.toUpperCase();
        let clauseStart = 0;
        let scan = 0;
        while (scan < upper.length) {
            const andIdx = upper.indexOf('AND', scan);
            if (andIdx === -1) {
                break;
            }
            const beforeOk = andIdx > clauseStart && /\s/.test(sqlText[andIdx - 1]);
            const afterIdx = andIdx + 3;
            const afterOk = afterIdx < sqlText.length && /\s/.test(sqlText[afterIdx]);
            if (beforeOk && afterOk) {
                let leftWs = andIdx - 1;
                while (leftWs > clauseStart && /\s/.test(sqlText[leftWs - 1])) {
                    leftWs--;
                }
                let rightWs = afterIdx + 1;
                while (rightWs < sqlText.length && /\s/.test(sqlText[rightWs])) {
                    rightWs++;
                }
                parts.push(sqlText.slice(clauseStart, leftWs));
                clauseStart = rightWs;
                scan = rightWs;
            } else {
                scan = andIdx + 3;
            }
        }
        parts.push(sqlText.slice(clauseStart));
        return parts;
    };

    // Reject SQL comments, statement separators, @@/@variables, unbracketed niladic session tokens, DDL/DML keywords, and all function calls!
    if (
        /;|--|\/\*|\*\/|@@?[A-Za-z_]/.test(masked) ||
        /\b(DROP|DELETE|UPDATE|INSERT|EXEC|EXECUTE|UNION|SELECT|ALTER|CREATE|TRUNCATE|MERGE|GRANT|REVOKE|WAITFOR|OPENROWSET|OPENQUERY|OPENDATASOURCE|USER|SYSTEM_USER|CURRENT_USER|SESSION_USER|CURRENT_ROLE|CURRENT_CATALOG|CURRENT_SCHEMA)\b/i.test(
            masked
        ) ||
        hasSqlFunctionCall(masked)
    ) {
        return {
            Valid: false,
            AccessDenied: true,
            ErrorMessage: 'Unsafe SQL filter expression rejected in =MJ.VIEW.'
        };
    }

    const maskedClauses = splitSqlAndClauses(masked);
    const parsedClauses: string[] = [];
    for (const maskedClause of maskedClauses) {
        const simpleCmp =
            /^((?:__MJ_COL_\d+__)|(?:[A-Za-z_][A-Za-z0-9_]*))\s*(<>|!=|<=|>=|=|<|>)\s*(?:(__MJ_LIT_(\d+)__)|([+-]?\d+(?:\.\d+)?)|(TRUE|FALSE))$/i.exec(
                maskedClause.trim()
            );
        if (!simpleCmp) {
            const hasDisallowedToken =
                /\b(USER|USER_NAME|USER_ID|APP_NAME|DB_NAME|DB_ID|HOST_NAME|HOST_ID|SUSER_NAME|SUSER_SNAME|SUSER_ID|SUSER_SID|ORIGINAL_LOGIN|SCHEMA_NAME|OBJECT_NAME|OBJECT_ID|OBJECT_DEFINITION|PERMISSIONS|HAS_PERMS_BY_NAME|IS_MEMBER|IS_SRVROLEMEMBER)\b/i.test(
                    maskedClause
                );
            return {
                Valid: false,
                AccessDenied: hasDisallowedToken,
                ErrorMessage: hasDisallowedToken
                    ? 'Unsafe SQL filter expression rejected in =MJ.VIEW.'
                    : `Invalid filter expression '${candidate}' in =MJ.VIEW. Only simple Field op Value comparisons (joined by AND) are supported.`
            };
        }
        const rawColToken = simpleCmp[1];
        const colMatch = /^__MJ_COL_(\d+)__$/.exec(rawColToken);
        const col = colMatch ? (bracketedCols[Number(colMatch[1])] ?? rawColToken) : rawColToken;
        const op = simpleCmp[2] === '!=' ? '<>' : simpleCmp[2];
        if (simpleCmp[5] !== undefined) {
            parsedClauses.push(`${col} ${op} ${Number(simpleCmp[5])}`);
        } else if (simpleCmp[6] !== undefined) {
            parsedClauses.push(`${col} ${op} ${simpleCmp[6].toUpperCase() === 'TRUE' ? 1 : 0}`);
        } else {
            const litEntry = quotedLiterals[Number(simpleCmp[4])] ?? { raw: '', unicode: false };
            const prefix = litEntry.unicode ? "N'" : "'";
            parsedClauses.push(`${col} ${op} ${prefix}${EscapeSQLString(litEntry.raw)}'`);
        }
    }

    return {
        Valid: true,
        NormalizedFilter: parsedClauses.join(' AND ')
    };
}

/**
 * Linear-time `O(N * M)` NFA/DP substring search for Excel `=SEARCH(find_text, within_text, [start_num])`
 * supporting `*`, `?`, and `~*` / `~?` / `~~` escapes (case-insensitive) with zero backtracking.
 */
function searchExcelWildcardLinear(findText: string, withinText: string, startNum: number): number | '#VALUE!' {
    const tokens: ExcelWildcardToken[] = [];
    for (let i = 0; i < findText.length; i++) {
        const ch = findText[i];
        if (ch === '~' && i + 1 < findText.length) {
            tokens.push({ kind: 'lit', ch: findText[++i].toLowerCase() });
        } else if (ch === '*') {
            if (tokens.length === 0 || tokens[tokens.length - 1].kind !== 'star') {
                tokens.push({ kind: 'star' });
            }
        } else if (ch === '?') {
            tokens.push({ kind: 'qmark' });
        } else {
            tokens.push({ kind: 'lit', ch: ch.toLowerCase() });
        }
    }

    const m = tokens.length;
    const startOffset = startNum - 1;
    const haystack = withinText.toLowerCase();
    const n = haystack.length;

    let cur = new Float64Array(m + 1);
    let nxt = new Float64Array(m + 1);
    cur.fill(Infinity);
    nxt.fill(Infinity);

    cur[0] = startOffset;
    for (let j = 0; j < m; j++) {
        if (tokens[j].kind === 'star' && cur[j] < cur[j + 1]) {
            cur[j + 1] = cur[j];
        }
    }

    let bestStart = cur[m];

    for (let i = startOffset; i < n; i++) {
        if (bestStart < Infinity) {
            let hasSmallerCandidate = false;
            for (let j = 0; j < m; j++) {
                if (cur[j] < bestStart) {
                    hasSmallerCandidate = true;
                    break;
                }
            }
            if (!hasSmallerCandidate) {
                break;
            }
        }

        nxt.fill(Infinity);
        const ch = haystack[i];
        for (let j = 0; j < m; j++) {
            const s = cur[j];
            if (s === Infinity) continue;
            const tok = tokens[j];
            if (tok.kind === 'star') {
                if (s < nxt[j]) nxt[j] = s;
            } else if (tok.kind === 'qmark' || tok.ch === ch) {
                if (s < nxt[j + 1]) nxt[j + 1] = s;
            }
        }

        const nextStart = i + 1;
        if (nextStart < nxt[0]) {
            nxt[0] = nextStart;
        }
        for (let j = 0; j < m; j++) {
            if (tokens[j].kind === 'star' && nxt[j] < nxt[j + 1]) {
                nxt[j + 1] = nxt[j];
            }
        }
        if (nxt[m] < bestStart) {
            bestStart = nxt[m];
        }

        const tmp = cur;
        cur = nxt;
        nxt = tmp;
    }

    return bestStart < Infinity ? bestStart + 1 : '#VALUE!';
}

type ExcelWildcardToken = { kind: 'star' } | { kind: 'qmark' } | { kind: 'lit'; ch: string };

/**
 * Linear-time O(N*M) two-pointer Excel wildcard matcher supporting `*`, `?`, and `~*` / `~?` / `~~`
 * escapes (case-insensitive) without backtracking regex blowup (`E8`).
 */
function matchExcelWildcard(pattern: string, candidate: string): boolean {
    const tokens: ExcelWildcardToken[] = [];
    for (let i = 0; i < pattern.length; i++) {
        const ch = pattern[i];
        if (ch === '~' && i + 1 < pattern.length) {
            tokens.push({ kind: 'lit', ch: pattern[++i].toLowerCase() });
        } else if (ch === '*') {
            if (tokens.length === 0 || tokens[tokens.length - 1].kind !== 'star') {
                tokens.push({ kind: 'star' });
            }
        } else if (ch === '?') {
            tokens.push({ kind: 'qmark' });
        } else {
            tokens.push({ kind: 'lit', ch: ch.toLowerCase() });
        }
    }

    const s = candidate.toLowerCase();
    let pi = 0;
    let si = 0;
    let starPi = -1;
    let starSi = -1;

    while (si < s.length) {
        const tok = pi < tokens.length ? tokens[pi] : null;
        if (tok && (tok.kind === 'qmark' || (tok.kind === 'lit' && tok.ch === s[si]))) {
            pi++;
            si++;
        } else if (tok && tok.kind === 'star') {
            starPi = pi;
            starSi = si;
            pi++;
        } else if (starPi !== -1) {
            pi = starPi + 1;
            starSi++;
            si = starSi;
        } else {
            return false;
        }
    }

    while (pi < tokens.length && tokens[pi].kind === 'star') {
        pi++;
    }
    return pi === tokens.length;
}

function parseWholeColumnToken(raw: string): { abs: boolean; col: number } | null {
    const match = /^(\$?)([A-Za-z]{1,3})$/.exec(raw);
    if (!match) return null;
    const col = ColumnLetterToIndex(match[2]);
    if (col < 1 || col > EXCEL_MAX_COLS) return null;
    return { abs: match[1] === '$', col };
}

function parseWholeRowToken(raw: string): { abs: boolean; row: number } | null {
    const match = /^(\$?)([1-9][0-9]*)$/.exec(raw);
    if (!match) return null;
    const row = parseInt(match[2], 10);
    if (!Number.isFinite(row) || row < 1 || row > EXCEL_MAX_ROWS) return null;
    return { abs: match[1] === '$', row };
}

function shiftFormulaBodyReferences(formulaBody: string, dRow: number, dCol: number): string {
    if (!formulaBody || (dRow === 0 && dCol === 0)) return formulaBody;
    const scanned = scanFormulaTokens(formulaBody);
    if (!Array.isArray(scanned)) return formulaBody;

    const edits: Array<{ start: number; end: number; text: string }> = [];
    for (let idx = 0; idx < scanned.length; idx++) {
        const entry = scanned[idx];
        const tok = entry.token;
        const prev = idx > 0 ? scanned[idx - 1].token : null;
        const next = idx + 1 < scanned.length ? scanned[idx + 1].token : null;
        const colonSiblingIdx = next?.type === 'Colon' ? idx + 2 : prev?.type === 'Colon' ? idx - 2 : -1;
        const colonSiblingRaw =
            colonSiblingIdx >= 0 && colonSiblingIdx < scanned.length
                ? formulaBody.slice(scanned[colonSiblingIdx].start, scanned[colonSiblingIdx].end)
                : null;

        if (tok.type === 'Ident') {
            if (next?.type === 'LParen') {
                continue; // Function identifier (e.g. LOG10(, ATAN2()
            }
            const parsed = ParseCellAddress(tok.value);
            if (parsed) {
                const nextRow = parsed.absRow ? parsed.row : parsed.row + dRow;
                const nextCol = parsed.absCol ? parsed.col : parsed.col + dCol;
                const text =
                    nextRow < 1 || nextRow > EXCEL_MAX_ROWS || nextCol < 1 || nextCol > EXCEL_MAX_COLS
                        ? '#REF!'
                        : FormatCellAddress(nextRow, nextCol, parsed.absRow, parsed.absCol);
                edits.push({ start: entry.start, end: entry.end, text });
                continue;
            }
            if (colonSiblingRaw !== null) {
                const colSpec = parseWholeColumnToken(tok.value);
                if (colSpec && parseWholeColumnToken(colonSiblingRaw)) {
                    const nextCol = colSpec.abs ? colSpec.col : colSpec.col + dCol;
                    const text =
                        nextCol < 1 || nextCol > EXCEL_MAX_COLS
                            ? '#REF!'
                            : `${colSpec.abs ? '$' : ''}${ColumnIndexToLetter(nextCol)}`;
                    edits.push({ start: entry.start, end: entry.end, text });
                    continue;
                }
                const rowSpec = parseWholeRowToken(tok.value);
                if (rowSpec && parseWholeRowToken(colonSiblingRaw)) {
                    const nextRow = rowSpec.abs ? rowSpec.row : rowSpec.row + dRow;
                    const text =
                        nextRow < 1 || nextRow > EXCEL_MAX_ROWS ? '#REF!' : `${rowSpec.abs ? '$' : ''}${nextRow}`;
                    edits.push({ start: entry.start, end: entry.end, text });
                }
            }
        } else if (tok.type === 'Number' && colonSiblingRaw !== null) {
            const rawSlice = formulaBody.slice(entry.start, entry.end);
            const rowSpec = parseWholeRowToken(rawSlice);
            if (rowSpec && parseWholeRowToken(colonSiblingRaw)) {
                const nextRow = rowSpec.abs ? rowSpec.row : rowSpec.row + dRow;
                const text = nextRow < 1 || nextRow > EXCEL_MAX_ROWS ? '#REF!' : String(nextRow);
                edits.push({ start: entry.start, end: entry.end, text });
            }
        }
    }

    if (edits.length === 0) return formulaBody;
    const parts: string[] = [];
    let cursor = 0;
    for (const edit of edits) {
        parts.push(formulaBody.slice(cursor, edit.start), edit.text);
        cursor = edit.end;
    }
    parts.push(formulaBody.slice(cursor));
    return parts.join('');
}

function shiftSharedFormulaRelativeRefs(formulaBody: string, dRow: number, dCol: number): string {
    return shiftFormulaBodyReferences(formulaBody, dRow, dCol);
}

function shiftA1RangeRows(
    rangeStr: string,
    op: 'insert' | 'delete',
    startRow1Based: number,
    count: number,
    isAnchorCell: boolean,
    maxSurvivingRow: number
): string | null {
    const trimmed = (rangeStr ?? '').trim();
    if (!trimmed || trimmed === '#REF!') return null;
    const parts = trimmed.split(':');
    if (parts.length === 1) {
        const p = ParseCellAddress(parts[0]);
        if (!p) return trimmed;
        if (op === 'insert') {
            const nextR = p.row >= startRow1Based ? p.row + count : p.row;
            return FormatCellAddress(nextR, p.col, p.absRow, p.absCol);
        }
        const delEnd = startRow1Based + count - 1;
        if (p.row >= startRow1Based && p.row <= delEnd) {
            if (isAnchorCell) {
                return FormatCellAddress(Math.min(startRow1Based, maxSurvivingRow), p.col, p.absRow, p.absCol);
            }
            return null;
        }
        const nextR = p.row > delEnd ? p.row - count : p.row;
        return FormatCellAddress(nextR, p.col, p.absRow, p.absCol);
    }
    if (parts.length === 2) {
        const rowOnlyA = /^(\$?)([1-9][0-9]*)$/.exec(parts[0].trim());
        const rowOnlyB = /^(\$?)([1-9][0-9]*)$/.exec(parts[1].trim());
        if (rowOnlyA && rowOnlyB) {
            const absA = rowOnlyA[1];
            const absB = rowOnlyB[1];
            const r1 = Math.min(parseInt(rowOnlyA[2], 10), parseInt(rowOnlyB[2], 10));
            const r2 = Math.max(parseInt(rowOnlyA[2], 10), parseInt(rowOnlyB[2], 10));
            if (op === 'insert') {
                const nextR1 = r1 >= startRow1Based ? r1 + count : r1;
                const nextR2 = r2 >= startRow1Based ? r2 + count : r2;
                return `${absA}${nextR1}:${absB}${nextR2}`;
            }
            const delEnd = startRow1Based + count - 1;
            if (r1 >= startRow1Based && r2 <= delEnd) return null;
            const survStart = r1 >= startRow1Based && r1 <= delEnd ? startRow1Based : r1 > delEnd ? r1 - count : r1;
            const survEnd = r2 >= startRow1Based && r2 <= delEnd ? startRow1Based - 1 : r2 > delEnd ? r2 - count : r2;
            if (survEnd < survStart || survStart < 1) return null;
            return `${absA}${survStart}:${absB}${survEnd}`;
        }
        const a = ParseCellAddress(parts[0]);
        const b = ParseCellAddress(parts[1]);
        if (!a || !b) return trimmed;
        const r1 = Math.min(a.row, b.row);
        const r2 = Math.max(a.row, b.row);
        if (op === 'insert') {
            const nextR1 = r1 >= startRow1Based ? r1 + count : r1;
            const nextR2 = r2 >= startRow1Based ? r2 + count : r2;
            return `${FormatCellAddress(nextR1, a.col, a.absRow, a.absCol)}:${FormatCellAddress(nextR2, b.col, b.absRow, b.absCol)}`;
        }
        const delEnd = startRow1Based + count - 1;
        if (r1 >= startRow1Based && r2 <= delEnd) {
            return null;
        }
        let survivingStart = r1;
        if (r1 >= startRow1Based && r1 <= delEnd) {
            survivingStart = startRow1Based;
        } else if (r1 > delEnd) {
            survivingStart = r1 - count;
        }
        let survivingEnd = r2;
        if (r2 >= startRow1Based && r2 <= delEnd) {
            survivingEnd = startRow1Based - 1;
        } else if (r2 > delEnd) {
            survivingEnd = r2 - count;
        }
        if (survivingEnd < survivingStart || survivingStart < 1) {
            return null;
        }
        return `${FormatCellAddress(survivingStart, a.col, a.absRow, a.absCol)}:${FormatCellAddress(survivingEnd, b.col, b.absRow, b.absCol)}`;
    }
    return trimmed;
}

function shiftA1RangeCols(
    rangeStr: string,
    op: 'insert' | 'delete',
    startCol1Based: number,
    count: number,
    isAnchorCell: boolean,
    maxSurvivingCol: number
): string | null {
    const trimmed = (rangeStr ?? '').trim();
    if (!trimmed || trimmed === '#REF!') return null;
    const parts = trimmed.split(':');
    if (parts.length === 1) {
        const p = ParseCellAddress(parts[0]);
        if (!p) return trimmed;
        if (op === 'insert') {
            const nextC = p.col >= startCol1Based ? p.col + count : p.col;
            return FormatCellAddress(p.row, nextC, p.absRow, p.absCol);
        }
        const delEnd = startCol1Based + count - 1;
        if (p.col >= startCol1Based && p.col <= delEnd) {
            if (isAnchorCell) {
                return FormatCellAddress(p.row, Math.min(startCol1Based, maxSurvivingCol), p.absRow, p.absCol);
            }
            return null;
        }
        const nextC = p.col > delEnd ? p.col - count : p.col;
        return FormatCellAddress(p.row, nextC, p.absRow, p.absCol);
    }
    if (parts.length === 2) {
        const colOnlyA = /^(\$?)([A-Za-z]{1,3})$/.exec(parts[0].trim());
        const colOnlyB = /^(\$?)([A-Za-z]{1,3})$/.exec(parts[1].trim());
        if (colOnlyA && colOnlyB && !ParseCellAddress(parts[0]) && !ParseCellAddress(parts[1])) {
            const absA = colOnlyA[1];
            const absB = colOnlyB[1];
            const c1 = Math.min(ColumnLetterToIndex(colOnlyA[2]), ColumnLetterToIndex(colOnlyB[2]));
            const c2 = Math.max(ColumnLetterToIndex(colOnlyA[2]), ColumnLetterToIndex(colOnlyB[2]));
            if (op === 'insert') {
                const nextC1 = c1 >= startCol1Based ? c1 + count : c1;
                const nextC2 = c2 >= startCol1Based ? c2 + count : c2;
                return `${absA}${ColumnIndexToLetter(nextC1)}:${absB}${ColumnIndexToLetter(nextC2)}`;
            }
            const delEnd = startCol1Based + count - 1;
            if (c1 >= startCol1Based && c2 <= delEnd) return null;
            const survStart = c1 >= startCol1Based && c1 <= delEnd ? startCol1Based : c1 > delEnd ? c1 - count : c1;
            const survEnd = c2 >= startCol1Based && c2 <= delEnd ? startCol1Based - 1 : c2 > delEnd ? c2 - count : c2;
            if (survEnd < survStart || survStart < 1) return null;
            return `${absA}${ColumnIndexToLetter(survStart)}:${absB}${ColumnIndexToLetter(survEnd)}`;
        }
        const a = ParseCellAddress(parts[0]);
        const b = ParseCellAddress(parts[1]);
        if (!a || !b) return trimmed;
        const c1 = Math.min(a.col, b.col);
        const c2 = Math.max(a.col, b.col);
        if (op === 'insert') {
            const nextC1 = c1 >= startCol1Based ? c1 + count : c1;
            const nextC2 = c2 >= startCol1Based ? c2 + count : c2;
            return `${FormatCellAddress(a.row, nextC1, a.absRow, a.absCol)}:${FormatCellAddress(b.row, nextC2, b.absRow, b.absCol)}`;
        }
        const delEnd = startCol1Based + count - 1;
        if (c1 >= startCol1Based && c2 <= delEnd) {
            return null;
        }
        let survivingStart = c1;
        if (c1 >= startCol1Based && c1 <= delEnd) {
            survivingStart = startCol1Based;
        } else if (c1 > delEnd) {
            survivingStart = c1 - count;
        }
        let survivingEnd = c2;
        if (c2 >= startCol1Based && c2 <= delEnd) {
            survivingEnd = startCol1Based - 1;
        } else if (c2 > delEnd) {
            survivingEnd = c2 - count;
        }
        if (survivingEnd < survivingStart || survivingStart < 1) {
            return null;
        }
        return `${FormatCellAddress(a.row, survivingStart, a.absRow, a.absCol)}:${FormatCellAddress(b.row, survivingEnd, b.absRow, b.absCol)}`;
    }
    return trimmed;
}

function shiftColumnLetter(
    colLetter: string,
    op: 'insert' | 'delete',
    startCol1Based: number,
    count: number
): string | null {
    const colIdx = ColumnLetterToIndex(colLetter);
    if (op === 'insert') {
        const nextCol = colIdx >= startCol1Based ? colIdx + count : colIdx;
        return ColumnIndexToLetter(nextCol);
    }
    const delEnd = startCol1Based + count - 1;
    if (colIdx >= startCol1Based && colIdx <= delEnd) {
        return null;
    }
    const nextCol = colIdx > delEnd ? colIdx - count : colIdx;
    return ColumnIndexToLetter(nextCol);
}

function workbookFromSheet(
    map: WeakMap<WorksheetSpec, WorkbookSpec>,
    sheet: WorksheetSpec
): WorkbookSpec | undefined {
    return map.get(sheet);
}

/**
 * Registers the {@link SpreadsheetEngine} chart/range dataset extractor with
 * {@link DocumentLiveBlockEngine} (`D5`, breaking circular module imports).
 */
export function LoadSpreadsheetEngine(): void {
    DocumentLiveBlockEngine.Instance.RegisterSpreadsheetChartExtractor(
        (content, configuration, sheetId, chartId, sheetRange) => {
            const wb = SpreadsheetEngine.Instance.ParseWorkbook(content, configuration);
            const targetSheetId = sheetId || wb.ActiveSheetID;
            let dataset = chartId
                ? SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, chartId)
                : null;
            if (!dataset && sheetRange) {
                dataset = SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, sheetRange);
            }
            return dataset;
        }
    );
    DocumentLiveBlockEngine.Instance.RegisterSpreadsheetXlsxChartExtractor(
        (bytes, configuration, sheetId, chartId, sheetRange) => {
            const wb = SpreadsheetEngine.Instance.ImportFromXlsxBytes(bytes, configuration);
            const targetSheetId = sheetId || wb.ActiveSheetID;
            let dataset = chartId
                ? SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, chartId)
                : null;
            if (!dataset && sheetRange) {
                dataset = SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, sheetRange);
            }
            return dataset;
        }
    );
    DocumentLiveBlockEngine.Instance.RegisterSpreadsheetXlsxWorkbookExtractor((bytes, configuration) => {
        const wb = SpreadsheetEngine.Instance.ImportFromXlsxBytes(bytes, configuration);
        return SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });
    });
    DocumentLiveBlockEngine.Instance.RegisterSpreadsheetXlsxChartExtractorAsync(
        async (bytes, configuration, sheetId, chartId, sheetRange) => {
            const wb = await SpreadsheetEngine.Instance.ImportFromXlsxBytesIsolated(bytes, configuration);
            const targetSheetId = sheetId || wb.ActiveSheetID;
            let dataset = chartId
                ? SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, chartId)
                : null;
            if (!dataset && sheetRange) {
                dataset = SpreadsheetEngine.Instance.ExtractChartDataset(wb, targetSheetId, sheetRange);
            }
            return dataset;
        }
    );
    DocumentLiveBlockEngine.Instance.RegisterSpreadsheetXlsxWorkbookExtractorAsync(async (bytes, configuration) => {
        const wb = await SpreadsheetEngine.Instance.ImportFromXlsxBytesIsolated(bytes, configuration);
        return SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });
    });
}

function cssColorToOoxmlArgb(color: string | undefined): string | undefined {
    if (!color) return undefined;
    const trimmed = color.trim();
    if (!trimmed) return undefined;
    const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed);
    if (hex3) {
        return `FF${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}`.toUpperCase();
    }
    const hex6 = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
    if (hex6) {
        return `FF${hex6[1]}`.toUpperCase();
    }
    const hex8 = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(trimmed);
    if (hex8) {
        return `${hex8[2]}${hex8[1]}`.toUpperCase();
    }
    const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i.exec(trimmed);
    if (rgbMatch) {
        const toHex = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
        const r = toHex(Number(rgbMatch[1]));
        const g = toHex(Number(rgbMatch[2]));
        const b = toHex(Number(rgbMatch[3]));
        const a = rgbMatch[4] !== undefined ? toHex(Number(rgbMatch[4]) * 255) : 'FF';
        return `${a}${r}${g}${b}`.toUpperCase();
    }
    return undefined;
}

function ooxmlRgbToCssHex(rgb: string | null | undefined): string | undefined {
    if (!rgb) return undefined;
    const clean = rgb.trim().replace(/^#/, '');
    if (/^[0-9a-fA-F]{8}$/.test(clean)) {
        const alpha = clean.slice(0, 2).toUpperCase();
        const hex6 = clean.slice(2).toLowerCase();
        return alpha === 'FF' ? `#${hex6}` : `#${hex6}${alpha.toLowerCase()}`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(clean)) {
        return `#${clean.toLowerCase()}`;
    }
    return undefined;
}

function parseChartNumericValue(raw: SpreadsheetCellValue | undefined): number | null {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : null;
    }
    if (typeof raw !== 'string') {
        return null;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }
    // Strip currency symbols, thousands separators, and optional trailing percent sign
    const normalized = trimmed.replace(/^[$€£¥+\s]+/, '').replace(/,/g, '').replace(/%$/, '');
    if (!normalized || normalized === '-' || normalized === '.') {
        return null;
    }
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
}

function computeStableAiInputHash(input: string): string {
    let h1 = 0x811c9dc5;
    let h2 = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 ^= ch & 0xff;
        h1 = Math.imul(h1, 0x01000193);
        h2 ^= (ch >>> 8) & 0xff;
        h2 = Math.imul(h2, 0x01000193);
    }
    return `ai-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

LoadSpreadsheetEngine();

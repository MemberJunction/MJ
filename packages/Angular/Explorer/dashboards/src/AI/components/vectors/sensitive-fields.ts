/**
 * Fields that must never be embedded into a vector index.
 *
 * Vectorizing a column copies its values into a third-party vector database, where they
 * live outside the entity permissions that normally guard them and are retrievable by
 * nearest-neighbour search rather than by an authorized query. For a password hash, a
 * national insurance or social security number, a bank account or a salary, that is not a
 * feature with a caveat — it is a disclosure.
 *
 * The field picker's suggestions come from a language model, which has no notion of which
 * columns are sensitive and will happily propose `PasswordHash` if the use case seems to
 * call for identity matching. So the refusal cannot live in the prompt: it has to be a
 * property of the code on both sides of the model.
 *
 * Two layers, deliberately:
 *
 *   1. The model never sees these fields, so it cannot suggest them.
 *   2. The saved template is re-checked, because the template is hand-editable after the
 *      model returns and a user can type a field name the picker never offered.
 *
 * Layer 1 alone would be a prompt-shaped guarantee, which is no guarantee at all.
 */

/**
 * Substrings that mark a column as unembeddable, matched case-insensitively against the
 * field name with separators ignored — so `password_hash`, `PasswordHash` and `PASSWORD`
 * all match the same rule.
 *
 * These are substrings rather than whole names on purpose. Real schemas spell the same
 * concept a dozen ways (`SSNumber`, `employee_ssn`, `ClientSecretEncrypted`), and the cost
 * of the two kinds of mistake is not symmetric: refusing a harmless column produces a
 * visible, correctable annoyance, while embedding a sensitive one is silent and, once
 * written to the index, not fully reversible.
 *
 * That asymmetry justifies over-refusing a column that RESEMBLES the concept — `AuthorName`
 * contains `auth`, and `auth` really is the prefix of authentication, so the resemblance
 * carries some signal and refusing it is a trade we accept. It does not justify a match
 * with no semantic relationship at all. `Rating` is not refused because it looks like a tax
 * identifier; it is refused because the letters `t-i-n` happen to sit inside an unrelated
 * English word, which trades away a usable column for no signal whatsoever. Patterns of
 * that shape belong in {@link SENSITIVE_FIELD_WORD_PATTERNS} or nowhere — see
 * `vector-sensitive-fields.test.ts`, which pins the refusal count over MJ's own field names
 * so that re-adding one is a red test rather than a quiet doubling of the blast radius.
 */
const SENSITIVE_FIELD_PATTERNS: ReadonlyArray<string> = [
    // Credentials and secrets. `token` is NOT here on its own: MJ alone has 36 columns that
    // are token *counts* (`ContextWindowMaxTokens`, `InputTokenLimit`, `FirstTokenTime`),
    // and a count is not a secret. The compounds below keep the credentials; `AuthToken`
    // and `OAuthToken` are still caught by `auth`.
    'password', 'passwd', 'pwd', 'secret', 'apikey', 'accesskey', 'privatekey',
    'accesstoken', 'refreshtoken', 'apitoken', 'bearertoken',
    'salt', 'hash', 'credential', 'auth',
    // Government and tax identifiers. `tin` is deliberately absent: `taxid` already covers
    // the concept, while `t-i-n` is a substring of ordinary English (Ra-tin-g, Marke-tin-g,
    // Set-tin-gs, Mee-tin-g) and matched 43 MJ columns, none of them a tax identifier.
    'socialsec', 'nationalinsurance', 'taxid', 'passport', 'driverlicense',
    // Financial
    'bank', 'routing', 'iban', 'swift', 'accountnumber', 'cardnumber', 'cardnum', 'cvv',
    'cvc', 'creditcard', 'salary', 'compensation', 'income',
    // Protected characteristics and other special-category data
    'ethnic', 'religion', 'political', 'sexualorientation', 'disability',
    'healthcondition', 'diagnosis', 'medicalrecord', 'dateofbirth', 'birthdate',
];

/**
 * Patterns that must BEGIN A WORD in the field name rather than appear anywhere in it.
 *
 * These three are short enough that as bare substrings they collide with unrelated words
 * and catch nothing real: `ssn` is inside `cla-ssn-ame` (every `*ClassName` column in MJ),
 * `dob` is inside `recor-dob-ject`, `race` is inside `StackT-race` and `T-race-ID`. Each of
 * those matches carries zero information about sensitivity, and because the template check
 * throws, a user who needs `{{Rating}}` or `{{StackTrace}}` has no workaround at all — it
 * is a feature they cannot use, not an annoyance they route around.
 *
 * Anchoring loses no true positives, because all three are whole words wherever they are
 * meant: `ssn`, `employee_ssn`, `EmployeeSSN`, `SSNumber`, `dob`, `DOB`, `race`,
 * `EmployeeRace`. (`date_of_birth` and `DateOfBirth` are covered by `dateofbirth` above.)
 */
const SENSITIVE_FIELD_WORD_PATTERNS: ReadonlyArray<string> = ['ssn', 'dob', 'race'];

/** Characters dropped by normalisation. The two spellings must stay in step. */
const SEPARATORS_GLOBAL = /[\s_\-.]/g;
const SEPARATOR = /[\s_\-.]/;
const LOWER_OR_DIGIT = /[a-z0-9]/;
const UPPER = /[A-Z]/;
const LOWER = /[a-z]/;

/** Normalises a field name for matching: lower-cased, separators and spaces removed. */
function normalizeFieldName(name: string): string {
    return name.toLowerCase().replace(SEPARATORS_GLOBAL, '');
}

/**
 * The offsets in `normalizeFieldName(name)` at which a word begins.
 *
 * Normalisation *removes* separators rather than replacing them, so by the time a pattern is
 * matched there is no separator left to anchor a `\b` against — `employee_ssn` and
 * `className` are both one unbroken run of letters (`employeessn`, `classname`). A regex word
 * boundary would therefore match at offset 0 and nowhere else, which is not the boundary we
 * need. So the word starts are computed from the ORIGINAL spelling, where the evidence still
 * exists, and carried as offsets into the normalised string.
 *
 * A word starts at the beginning, after a separator, and at the two camelCase transitions:
 * lower-or-digit followed by upper (`employee|SSN`), and the tail of an acronym run that
 * begins a capitalised word (`SS|Number`, so `SSNumber` still matches `ssn`).
 */
function wordStartOffsets(name: string): ReadonlySet<number> {
    const starts = new Set<number>();
    let offset = 0;
    let startsWord = true;
    for (let i = 0; i < name.length; i++) {
        const ch = name[i];
        if (SEPARATOR.test(ch)) {
            // Dropped by normalizeFieldName, so it consumes no offset — but whatever
            // survives next begins a word.
            startsWord = true;
            continue;
        }
        const prev = i > 0 ? name[i - 1] : '';
        const next = i + 1 < name.length ? name[i + 1] : '';
        if (UPPER.test(ch) && (LOWER_OR_DIGIT.test(prev) || (UPPER.test(prev) && LOWER.test(next)))) {
            startsWord = true;
        }
        if (startsWord) {
            starts.add(offset);
        }
        startsWord = false;
        offset++;
    }
    return starts;
}

/** True when `pattern` occurs in `normalized` starting at one of `wordStarts`. */
function matchesAtWordStart(normalized: string, wordStarts: ReadonlySet<number>, pattern: string): boolean {
    let at = normalized.indexOf(pattern);
    while (at !== -1) {
        if (wordStarts.has(at)) {
            return true;
        }
        at = normalized.indexOf(pattern, at + 1);
    }
    return false;
}

/**
 * True when this field name must not be embedded.
 *
 * Note `hash` and `auth` are deliberately broad. A column called `AuthorName` normalises to
 * `authorname`, which contains `auth` — so it is refused. That is the trade accepted above:
 * a visible false refusal the user can work around beats a silent disclosure they cannot.
 */
export function isSensitiveFieldName(name: string | null | undefined): boolean {
    if (!name) {
        return false;
    }
    const normalized = normalizeFieldName(name);
    if (SENSITIVE_FIELD_PATTERNS.some((pattern) => normalized.includes(pattern))) {
        return true;
    }
    const wordStarts = wordStartOffsets(name);
    return SENSITIVE_FIELD_WORD_PATTERNS.some((pattern) => matchesAtWordStart(normalized, wordStarts, pattern));
}

/** Drops every sensitive field from a list, preserving order. */
export function withoutSensitiveFields<T extends { Name: string }>(fields: ReadonlyArray<T>): T[] {
    return fields.filter((f) => !isSensitiveFieldName(f.Name));
}

/**
 * Sensitive field names referenced by a template's `{{Placeholder}}` tokens.
 *
 * This is the second layer. The template is hand-editable after the model returns, so a
 * user can type a field the picker never offered. Returns the offending names so the
 * refusal can say which ones, rather than only that something was wrong.
 */
export function sensitiveFieldsInTemplate(templateText: string | null | undefined): string[] {
    const found = new Set<string>();
    for (const token of templatePlaceholderNames(templateText)) {
        if (isSensitiveFieldName(token)) {
            found.add(token);
        }
    }
    return [...found].sort();
}

/**
 * Field names referenced by a template's `{{Placeholder}}` tokens, in order of appearance
 * and including repeats.
 *
 * Exported so the field-count cap in `vector-document-rules.ts` parses placeholders the same
 * way this refusal does. Two parsers that drift apart would mean a template that satisfies
 * one guard and evades the other.
 */
export function templatePlaceholderNames(templateText: string | null | undefined): string[] {
    if (!templateText) {
        return [];
    }
    // Nunjucks/Handlebars-style placeholders. The field name is the first identifier
    // inside the braces; filters and whitespace after it are ignored.
    const placeholder = /\{\{\s*([A-Za-z0-9_.\-]+)/g;
    const names: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = placeholder.exec(templateText)) !== null) {
        names.push(match[1]);
    }
    return names;
}

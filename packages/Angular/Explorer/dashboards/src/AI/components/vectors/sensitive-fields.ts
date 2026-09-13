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
 * concept a dozen ways (`ssn`, `SSNumber`, `employee_ssn`), and the cost of the two kinds
 * of mistake is not symmetric: refusing a harmless column produces a visible, correctable
 * annoyance, while embedding a sensitive one is silent and, once written to the index,
 * not fully reversible.
 */
const SENSITIVE_FIELD_PATTERNS: ReadonlyArray<string> = [
    // Credentials and secrets
    'password', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'accesskey', 'privatekey',
    'salt', 'hash', 'credential', 'auth',
    // Government and tax identifiers
    'ssn', 'socialsec', 'nationalinsurance', 'taxid', 'tin', 'passport', 'driverlicense',
    // Financial
    'bank', 'routing', 'iban', 'swift', 'accountnumber', 'cardnumber', 'cardnum', 'cvv',
    'cvc', 'creditcard', 'salary', 'compensation', 'income',
    // Protected characteristics and other special-category data
    'ethnic', 'race', 'religion', 'political', 'sexualorientation', 'disability',
    'healthcondition', 'diagnosis', 'medicalrecord', 'dateofbirth', 'dob', 'birthdate',
];

/** Normalises a field name for matching: lower-cased, separators and spaces removed. */
function normalizeFieldName(name: string): string {
    return name.toLowerCase().replace(/[\s_\-.]/g, '');
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
    return SENSITIVE_FIELD_PATTERNS.some((pattern) => normalized.includes(pattern));
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

/**
 * Tests for the vector picker's sensitive-field refusal.
 *
 * SAFETY: vectorizing a column copies its values into a third-party vector index, where
 * they live outside the entity permissions that normally guard them and are retrievable by
 * nearest-neighbour search rather than by an authorized query. For a password hash, a
 * national identifier, a bank account or a salary that is a disclosure, not a feature.
 *
 * The field suggestions come from a language model, which has no notion of which columns
 * are sensitive. So the refusal is a property of the code, in two layers: the model never
 * sees these fields, AND the saved template is re-checked because it is hand-editable
 * after the model returns. Layer 1 alone would be a prompt-shaped guarantee.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    isSensitiveFieldName,
    withoutSensitiveFields,
    sensitiveFieldsInTemplate,
} from '../AI/components/vectors/sensitive-fields';

describe('isSensitiveFieldName', () => {
    it('refuses credentials and secrets however they are spelled', () => {
        for (const name of [
            'Password', 'password_hash', 'PasswordHash', 'PWD', 'user_pwd',
            'Secret', 'ApiKey', 'api_key', 'API-KEY', 'AccessKey', 'PrivateKey',
            'RefreshToken', 'Salt', 'PasswordSalt', 'CredentialJSON',
        ]) {
            expect(isSensitiveFieldName(name), name).toBe(true);
        }
    });

    it('refuses government, financial and special-category identifiers', () => {
        for (const name of [
            'SSN', 'ssn', 'employee_ssn', 'SocialSecurityNumber', 'NationalInsuranceNo',
            'TaxID', 'PassportNumber', 'DriverLicense',
            'BankAccount', 'RoutingNumber', 'IBAN', 'AccountNumber', 'CardNumber', 'CVV',
            'CreditCardNum', 'Salary', 'AnnualCompensation', 'HouseholdIncome',
            'Ethnicity', 'Religion', 'PoliticalAffiliation', 'Disability', 'Diagnosis',
            'DateOfBirth', 'DOB', 'birth_date',
        ]) {
            expect(isSensitiveFieldName(name), name).toBe(true);
        }
    });

    it('allows ordinary business columns', () => {
        for (const name of [
            'ID', 'Name', 'FirstName', 'LastName', 'Email', 'Phone', 'City', 'Country',
            'CompanyName', 'JobTitle', 'Notes', 'Description', 'Status', 'CreatedAt',
            'OrderTotal', 'Quantity', 'ProductCode',
        ]) {
            expect(isSensitiveFieldName(name), name).toBe(false);
        }
    });

    it('is null-safe rather than throwing on an absent name', () => {
        expect(isSensitiveFieldName(null)).toBe(false);
        expect(isSensitiveFieldName(undefined)).toBe(false);
        expect(isSensitiveFieldName('')).toBe(false);
    });

    it('errs toward refusal on a broad substring, and that is deliberate', () => {
        // `AuthorName` normalises to `authorname`, which contains `auth`. Refusing a
        // harmless column is visible and correctable; embedding a sensitive one is silent
        // and, once written to the index, not fully reversible. The asymmetry is the whole
        // argument, so it is pinned rather than left to be "fixed" by someone later.
        expect(isSensitiveFieldName('AuthorName')).toBe(true);
    });
});

describe('withoutSensitiveFields — layer 1, the model never sees them', () => {
    it('drops sensitive fields and preserves the order of the rest', () => {
        const fields = [
            { Name: 'ID' },
            { Name: 'PasswordHash' },
            { Name: 'FirstName' },
            { Name: 'SSN' },
            { Name: 'Email' },
        ];
        expect(withoutSensitiveFields(fields).map(f => f.Name)).toEqual(['ID', 'FirstName', 'Email']);
    });

    it('returns everything when nothing is sensitive', () => {
        const fields = [{ Name: 'ID' }, { Name: 'Name' }];
        expect(withoutSensitiveFields(fields)).toHaveLength(2);
    });

    it('can return an empty list rather than falling back to everything', () => {
        // A table that is ALL sensitive columns must yield nothing to embed. Falling back
        // to the full list on an empty result would invert the guard exactly when it
        // matters most.
        expect(withoutSensitiveFields([{ Name: 'PasswordHash' }, { Name: 'SSN' }])).toEqual([]);
    });
});

describe('sensitiveFieldsInTemplate — layer 2, the hand-edited template', () => {
    it('finds a sensitive field a user typed into the template', () => {
        const tpl = 'Contact: {{ FirstName }} {{LastName}}, secret: {{ PasswordHash }}';
        expect(sensitiveFieldsInTemplate(tpl)).toEqual(['PasswordHash']);
    });

    it('reports every offender, sorted and de-duplicated', () => {
        const tpl = '{{SSN}} {{ Salary }} {{SSN}} {{Email}}';
        expect(sensitiveFieldsInTemplate(tpl)).toEqual(['SSN', 'Salary'].sort());
    });

    it('ignores filters and whitespace after the field name', () => {
        expect(sensitiveFieldsInTemplate('{{ PasswordHash | upper }}')).toEqual(['PasswordHash']);
    });

    it('passes a clean template', () => {
        expect(sensitiveFieldsInTemplate('{{FirstName}} {{LastName}} {{Email}}')).toEqual([]);
    });

    it('is null-safe', () => {
        expect(sensitiveFieldsInTemplate(null)).toEqual([]);
        expect(sensitiveFieldsInTemplate(undefined)).toEqual([]);
        expect(sensitiveFieldsInTemplate('')).toEqual([]);
    });

    it('does not flag a sensitive word that is only prose, not a placeholder', () => {
        // The refusal is about what gets INTERPOLATED. Prose mentioning the word is not a
        // disclosure, and refusing it would make the guard impossible to explain.
        expect(sensitiveFieldsInTemplate('Never include the password in this summary.')).toEqual([]);
    });
});

describe('the component actually uses the guard — wiring, not just the helper', () => {
    // The tests above prove the helpers refuse the right things. They would all still pass
    // if someone deleted the CALL. These read the component source so a silent unwiring is
    // a red test rather than a quiet regression.
    const SRC = readFileSync(
        join(__dirname, '..', 'AI', 'components', 'vectors', 'vector-management-resource.component.ts'),
        'utf-8'
    );
    /** Code only — prose about the guard must not be able to satisfy an assertion. */
    const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

    it('layer 1: the field list handed to the model is filtered', () => {
        expect(CODE).toMatch(/withoutSensitiveFields\(entity\.Fields\)/);
    });

    it('layer 1: the raw field list is NOT what reaches the prompt', () => {
        expect(CODE).not.toMatch(/const fields = entity\.Fields\.map/);
    });

    it('layer 2: the save path checks the template and throws', () => {
        expect(CODE).toMatch(/sensitiveFieldsInTemplate\(templateText\)/);
        expect(CODE).toMatch(/sensitive\.length > 0[\s\S]{0,400}?throw new Error/);
    });

    it('layer 2 runs BEFORE anything is written', () => {
        const check = CODE.indexOf('sensitiveFieldsInTemplate(templateText)');
        const firstSave = CODE.indexOf('template.Save()');
        expect(check).toBeGreaterThan(0);
        expect(firstSave).toBeGreaterThan(check);
    });

    it('the refusal names the offending fields, so it can be acted on', () => {
        expect(CODE).toMatch(/sensitive\.join\(', '\)/);
    });
});

// ---------------------------------------------------------------------------------------
// Calibration, measured against MJ's own field names.
//
// The patterns were originally written from first principles and never counted against a
// real schema. Reviewed on #4437, four of them turned out to match on spelling rather than
// meaning: `tin` inside `Ra-tin-g` and `Set-tin-gs`, `ssn` inside `cla-ssn-ame`, `dob`
// inside `recor-dob-ject`, `race` inside `StackT-race`, and a bare `token` across three
// dozen columns that count tokens rather than hold one.
//
// The asymmetry argument pinned above (refusing `AuthorName` beats embedding a secret) is
// what justifies over-refusing a column that RESEMBLES the concept. It cannot justify a
// match with no semantic relationship at all, because that trades a usable column away for
// no signal — and since layer 2 throws, `{{Rating}}` in a template is not an annoyance the
// user routes around, it is a feature they cannot use.
//
// So the calibration is measured, not asserted. These tests read the real field names out
// of MJ's generated core entity classes and pin the total refusal count as a bracket. That
// bracket is the test this PR was missing: a pattern re-added on a hunch shows up as a
// doubled blast radius rather than as nothing at all.
// ---------------------------------------------------------------------------------------

/**
 * Every distinct field name MemberJunction declares for its own core entities.
 *
 * Read out of the generated entity classes rather than hand-typed, so the fixture is the
 * real schema and grows with it: CodeGen emits a `* * Field Name: X` line per column into
 * the zod schema docblocks in `MJCoreEntities`. That file is the only generated field-name
 * source in the repo, which makes it the whole of MJ's own vocabulary — a little over two
 * thousand names, and the same population the review measured.
 */
function mjCoreEntityFieldNames(): string[] {
    const generated = join(
        __dirname, '..', '..', '..', '..', '..',
        'MJCoreEntities', 'src', 'generated', 'entities', '__mj.ts'
    );
    const source = readFileSync(generated, 'utf-8');
    const names = new Set<string>();
    const fieldName = /^\s*\* \* Field Name: (.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = fieldName.exec(source)) !== null) {
        names.add(match[1].trim());
    }
    return [...names].sort();
}

/** Normalises the same way the matcher does, so a collision set can be derived from it. */
function normalizedForFixture(name: string): string {
    return name.toLowerCase().replace(/[\s_\-.]/g, '');
}

describe('calibration against MJ core entity field names', () => {
    const FIELDS = mjCoreEntityFieldNames();

    it('the fixture really is the whole core vocabulary, not a handful of names', () => {
        // Guards the fixture itself: a broken path or a changed docblock format would
        // otherwise make every assertion below vacuously true over an empty list.
        expect(FIELDS.length).toBeGreaterThan(1800);
        expect(FIELDS).toContain('PasswordHash');
        expect(FIELDS).toContain('Rating');
        expect(FIELDS).toContain('DriverClassName');
        expect(FIELDS).toContain('ContextWindowMaxTokens');
    });

    it('refuses every name the pattern list is FOR', () => {
        for (const name of [
            // Government and tax identifiers
            'ssn', 'employee_ssn', 'EmployeeSSN', 'SSN', 'SSNumber', 'SocialSecurityNumber',
            'NationalInsuranceNumber', 'TaxID', 'tax_id', 'PassportNumber', 'DriverLicense',
            // Dates of birth
            'dob', 'DOB', 'date_of_birth', 'DateOfBirth', 'BirthDate',
            // Credentials — the four token compounds must survive the narrowing
            'AccessToken', 'access_token', 'RefreshToken', 'ApiToken', 'BearerToken',
            'AuthToken', 'OAuthToken', 'PasswordHash', 'ClientSecret', 'ApiKey', 'PrivateKey',
            // Financial
            'BankAccount', 'RoutingNumber', 'IBAN', 'AccountNumber', 'CardNumber', 'CVV',
            'CreditCardNumber', 'Salary', 'AnnualCompensation', 'HouseholdIncome',
            // Special-category
            'Race', 'EmployeeRace', 'race_ethnicity', 'Ethnicity', 'Religion', 'Disability',
            'Diagnosis', 'MedicalRecordNumber',
        ]) {
            expect(isSensitiveFieldName(name), `must refuse ${name}`).toBe(true);
        }
    });

    it('accepts the names that were refused for spelling rather than meaning', () => {
        // Ten of these are real MJ core columns; `MarketingConsent`, `StackTrace`, `TraceID`
        // and `EmbeddedRecordObject` are from the review's own worked examples and are
        // ordinary names in real schemas. Every one of them was refused before the
        // recalibration, and not one has any relationship to the concept that caught it.
        for (const name of [
            'Rating', 'MarketingConsent', 'AgentSettings', 'CapabilitySettings',
            'DriverClassName', 'EntityClassName', 'ClassName', 'EntityObjectSubclassName',
            'StackTrace', 'TraceID', 'EmbeddedRecordObject',
            'ContextWindowMaxTokens', 'FirstTokenTime', 'InputTokenLimit', 'MaxOutputTokens',
        ]) {
            expect(isSensitiveFieldName(name), `must accept ${name}`).toBe(false);
        }
    });

    it('drops the whole `ssn`-as-substring collision set, derived from the fixture', () => {
        // Every MJ field a bare `ssn` substring used to catch — all of them `*ClassName`
        // variants, none of them an identifier. Derived rather than listed so a new
        // `*ClassName` column is covered the day CodeGen emits it. This is the assertion
        // that goes red if the word boundary is removed from `ssn`.
        const collisions = FIELDS.filter((f) => normalizedForFixture(f).includes('ssn'));
        expect(collisions.length).toBeGreaterThanOrEqual(6);
        expect(collisions.filter(isSensitiveFieldName)).toEqual([]);
    });

    it('drops the whole `tin`-as-substring collision set, derived from the fixture', () => {
        // `t-i-n` is a substring of ordinary English, so this set is large (43 fields) and
        // contains no tax identifier at all. `RoutingOrder` is the single member still
        // refused, and it is refused by `routing` on its own merits, not by `tin`.
        const collisions = FIELDS.filter((f) => normalizedForFixture(f).includes('tin'));
        expect(collisions.length).toBeGreaterThanOrEqual(40);
        expect(collisions.filter(isSensitiveFieldName)).toEqual(['RoutingOrder']);
    });

    it('accepts every plural `Tokens` field, because a count is not a secret', () => {
        // `TokensUsed`, `TotalPromptTokensUsed`, `MaxOutputTokens` — the plural is the tell.
        // This is the assertion that goes red if `token` is widened back to a bare
        // substring, which would refuse all of them again.
        const counts = FIELDS.filter((f) => normalizedForFixture(f).includes('tokens'));
        expect(counts.length).toBeGreaterThanOrEqual(20);
        expect(counts.filter(isSensitiveFieldName)).toEqual([]);
    });

    it('pins the total refusal count as a bracket over the real fixture', () => {
        // THE TEST THIS PR WAS MISSING. Before recalibration 119 of 2,111 MJ core field
        // names were refused; after, 40 — and those 40 are credential-adjacent by name
        // (`auth`, `hash`, `credential`, `secret`, `apikey`, the token compounds).
        //
        // A bracket rather than an exact number, because CodeGen adds columns and an exact
        // count would churn on every unrelated schema change. But a NARROW bracket: the
        // ceiling sits well below a doubling of the blast radius, so re-adding `tin` (+43)
        // or widening `token` back to a bare substring (+35) fails here rather than
        // silently making the guard unusable again. Raise it only with the same kind of
        // evidence that lowered it.
        const refused = FIELDS.filter(isSensitiveFieldName);
        expect(refused.length).toBeGreaterThanOrEqual(30);
        expect(refused.length).toBeLessThanOrEqual(55);
        // And as a rate, so the bracket keeps its meaning if the fixture doubles in size.
        // 40/2111 is 1.9%; 3% leaves room for real additions and none for a broad one.
        expect(refused.length / FIELDS.length).toBeLessThan(0.03);
    });

    it('still refuses the sensitive columns MJ genuinely has', () => {
        // The fixture cuts both ways: whatever the count, these specific real columns must
        // stay refused. A recalibration that let one of them through would be the failure
        // the whole guard exists to prevent.
        for (const name of ['PasswordHash', 'AccessToken', 'RefreshToken', 'ClientSecret',
                            'APIKey', 'TokenHash', 'OAuthClientSecretEncrypted']) {
            expect(FIELDS, `${name} should be in the fixture`).toContain(name);
            expect(isSensitiveFieldName(name), `must refuse ${name}`).toBe(true);
        }
    });
});

describe('the asymmetry argument has a limit, and the limit is also pinned', () => {
    it('over-refuses a near-miss of the concept — deliberate, and kept', () => {
        // `auth` really is the prefix of authentication, so `AuthorName` resembles the
        // concept and the resemblance carries signal. Refusing it is the documented trade.
        expect(isSensitiveFieldName('AuthorName')).toBe(true);
        // `password` already catches `PasswordHash`, so `hash` mostly catches checksums —
        // marginal either way, and left alone on review.
        expect(isSensitiveFieldName('ContentHash')).toBe(true);
    });

    it('does NOT over-refuse a word with no relationship to the concept', () => {
        // This is the other half of the trade, and it needs pinning just as much: the
        // asymmetry justifies refusing things that look like the concept, never matches
        // that are pure letter coincidence. `Rating` is the canonical case — it is exactly
        // the column someone vectorizing customer records reaches for, and because layer 2
        // throws there is no workaround for refusing it.
        expect(isSensitiveFieldName('Rating')).toBe(false);
        expect(isSensitiveFieldName('Marketing')).toBe(false);
        expect(isSensitiveFieldName('Meeting')).toBe(false);
        expect(isSensitiveFieldName('StackTrace')).toBe(false);
        expect(isSensitiveFieldName('EmbeddedRecordObject')).toBe(false);
    });
});

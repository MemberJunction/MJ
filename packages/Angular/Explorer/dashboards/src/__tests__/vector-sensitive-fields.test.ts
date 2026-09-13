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

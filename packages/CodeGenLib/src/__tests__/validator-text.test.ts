import { describe, it, expect } from 'vitest';
import { NormalizeGeneratedValidatorText, RewriteUUIDComparisons } from '../Misc/validator-text';

describe('NormalizeGeneratedValidatorText', () => {
    it('unescapes a validator the model returned double-escaped on one line', () => {
        const escaped = 'public ValidateX(result: ValidationResult) {\\n\\tif (this.X == null) {\\n\\t\\tresult.Errors.push(\\"X\\");\\n\\t}\\n}';
        expect(NormalizeGeneratedValidatorText(escaped)).toBe(
            'public ValidateX(result: ValidationResult) {\n\tif (this.X == null) {\n\t\tresult.Errors.push("X");\n\t}\n}',
        );
    });

    it('unescapes a double-escaped one-liner that ends in a real newline', () => {
        const escaped = 'public ValidateX(result: ValidationResult) {\\n\\tresult.Errors.push(\\"X\\");\\n}\n';
        expect(NormalizeGeneratedValidatorText(escaped)).toBe(
            'public ValidateX(result: ValidationResult) {\n\tresult.Errors.push("X");\n}\n',
        );
    });

    it('leaves real source unchanged, including escapes inside regular expressions', () => {
        const source = [
            'public ValidateY(result: ValidationResult) {',
            "\tconst cleaned = this.Y.replace(/[\\s\\t\\r\\n]/g, '');",
            '}',
        ].join('\n');
        expect(NormalizeGeneratedValidatorText(source)).toBe(source);
    });

    it('leaves escaped quotes inside string literals of real source unchanged', () => {
        const source = [
            'public ValidateZ(result: ValidationResult) {',
            '\tconst example = "must look like [\\"key1\\", \\"key2\\"]";',
            '}',
        ].join('\n');
        expect(NormalizeGeneratedValidatorText(source)).toBe(source);
    });
});

describe('RewriteUUIDComparisons (#3984)', () => {
    const uuidFields = new Set(['ID', 'ParentID', 'TargetID']);
    const method = (body: string): string => ['public ValidateX(result: ValidationResult) {', body, '}'].join('\n');

    it('rewrites === between two UUID fields to UUIDsEqual', () => {
        expect(RewriteUUIDComparisons(method('\tif (this.ParentID === this.ID) { result.Errors.push(null); }'), uuidFields))
            .toBe(method('\tif (UUIDsEqual(this.ParentID, this.ID)) { result.Errors.push(null); }'));
    });

    it('rewrites !== to a negated UUIDsEqual', () => {
        expect(RewriteUUIDComparisons(method('\tif (this.ParentID !== this.TargetID) { return; }'), uuidFields))
            .toBe(method('\tif (!UUIDsEqual(this.ParentID, this.TargetID)) { return; }'));
    });

    it('rewrites == and != the same way', () => {
        expect(RewriteUUIDComparisons(method('\tconst a = this.ID == this.ParentID; const b = this.ID != this.ParentID;'), uuidFields))
            .toBe(method('\tconst a = UUIDsEqual(this.ID, this.ParentID); const b = !UUIDsEqual(this.ID, this.ParentID);'));
    });

    it('rewrites a comparison between a UUID field and a string literal, on either side', () => {
        const literal = "'6B7F2C1E-0000-0000-0000-000000000001'";
        expect(RewriteUUIDComparisons(method(`\tif (this.ParentID === ${literal} || ${literal} !== this.ID) { return; }`), uuidFields))
            .toBe(method(`\tif (UUIDsEqual(this.ParentID, ${literal}) || !UUIDsEqual(${literal}, this.ID)) { return; }`));
    });

    it('keeps the null guard intact while rewriting the comparison beside it', () => {
        expect(RewriteUUIDComparisons(method('\tif (this.ParentID != null && this.ParentID === this.ID) { return; }'), uuidFields))
            .toBe(method('\tif (this.ParentID != null && UUIDsEqual(this.ParentID, this.ID)) { return; }'));
    });

    it('leaves comparisons of non-UUID fields untouched', () => {
        const source = method("\tif (this.Status === 'Active' && this.Name !== this.ParentID) { return; }");
        expect(RewriteUUIDComparisons(source, uuidFields)).toBe(source);
    });

    it('leaves text that does not parse unchanged', () => {
        const source = 'public ValidateX(result: ValidationResult) { if (this.ParentID === this.ID) {';
        expect(RewriteUUIDComparisons(source, uuidFields)).toBe(source);
    });

    it('leaves the text unchanged when the entity has no UUID fields', () => {
        const source = method('\tif (this.ParentID === this.ID) { return; }');
        expect(RewriteUUIDComparisons(source, new Set())).toBe(source);
    });
});

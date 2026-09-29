import { describe, it, expect } from 'vitest';
import { NormalizeGeneratedValidatorText } from '../Misc/validator-text';

describe('NormalizeGeneratedValidatorText', () => {
    it('unescapes a validator the model returned double-escaped on one line', () => {
        const escaped = 'public ValidateX(result: ValidationResult) {\\n\\tif (this.X == null) {\\n\\t\\tresult.Errors.push(\\"X\\");\\n\\t}\\n}';
        expect(NormalizeGeneratedValidatorText(escaped)).toBe(
            'public ValidateX(result: ValidationResult) {\n\tif (this.X == null) {\n\t\tresult.Errors.push("X");\n\t}\n}',
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

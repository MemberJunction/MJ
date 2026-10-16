/**
 * Semantic constraints and props the parent does not pass.
 *
 * A constraint is checked against a passed prop by default. A validator that opts in through
 * `EvaluatesAbsentProp` is also called when the prop is missing — unless the element spreads
 * props, which may supply it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@babel/parser';
import type { File } from '@babel/types';
import type { ComponentSpec, PropertyConstraint, ConstraintViolation } from '@memberjunction/interactive-component-types';
import { ComponentPropRule, LintContext } from './component-prop-rule';
import { SemanticValidator } from './semantic-validators/semantic-validator';
import { SemanticValidatorRegistry } from './semantic-validators/semantic-validator-registry';
import type { ValidationContext } from './semantic-validators/validation-context';

/** Records every call so tests can assert whether, and with what, the linter called it. */
abstract class RecordingValidator extends SemanticValidator {
  public Calls: ValidationContext[] = [];

  validate(context: ValidationContext, _constraint: PropertyConstraint): ConstraintViolation[] {
    this.Calls.push(context);
    return [this.createViolation('probe', `${context.propertyName} checked`, 'high')];
  }

  getDescription(): string {
    return 'test probe';
  }
}

/** Opts in to absent props. Registered as constraint type 'absence-probe'. */
class AbsenceProbeValidator extends RecordingValidator {
  override get EvaluatesAbsentProp(): boolean {
    return true;
  }
}

/** Keeps the default. Registered as constraint type 'value-probe'. */
class ValueProbeValidator extends RecordingValidator {}

const absenceProbe = new AbsenceProbeValidator();
const valueProbe = new ValueProbeValidator();
SemanticValidatorRegistry.getInstance().register(absenceProbe);
SemanticValidatorRegistry.getInstance().register(valueProbe);

function specWithConstraint(type: 'absence-probe' | 'value-probe'): ComponentSpec {
  return {
    name: 'Report',
    dependencies: [
      {
        name: 'DataGrid',
        location: 'embedded',
        properties: [
          { name: 'data', type: 'array', required: false },
          { name: 'headerStyle', type: 'object', required: false, constraints: [{ type }] },
        ],
      },
    ],
  } as unknown as ComponentSpec;
}

function lint(jsx: string, type: 'absence-probe' | 'value-probe') {
  const code = `function Report({ brand, rows, gridProps }) {\n  return (\n    ${jsx}\n  );\n}`;
  const ast: File = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  const context: LintContext = {
    componentName: 'Report',
    componentSpec: specWithConstraint(type),
    typeContext: null,
    typeEngine: null,
    controlFlowAnalyzer: null,
  };
  return new ComponentPropRule().validate(ast, context).filter((v) => v.message === 'headerStyle checked');
}

describe('semantic constraints on an absent prop', () => {
  beforeEach(() => {
    absenceProbe.Calls = [];
    valueProbe.Calls = [];
  });

  it('calls an opted-in validator when the prop is not passed, at the element', () => {
    const violations = lint('<DataGrid data={rows} />', 'absence-probe');

    expect(absenceProbe.Calls).toHaveLength(1);
    expect(absenceProbe.Calls[0].PropertyPresent).toBe(false);
    expect(absenceProbe.Calls[0].propertyValue).toBeUndefined();
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(3);
  });

  it('does not call a validator that keeps the default when the prop is not passed', () => {
    const violations = lint('<DataGrid data={rows} />', 'value-probe');

    expect(valueProbe.Calls).toHaveLength(0);
    expect(violations).toHaveLength(0);
  });

  it('does not call an opted-in validator for a missing prop when the element spreads props', () => {
    lint('<DataGrid {...gridProps} data={rows} />', 'absence-probe');

    expect(absenceProbe.Calls).toHaveLength(0);
  });

  it('still checks a passed prop for both kinds of validator, marked present', () => {
    lint('<DataGrid headerStyle={{ background: "#123456" }} />', 'absence-probe');
    lint('<DataGrid headerStyle={{ background: "#123456" }} />', 'value-probe');

    expect(absenceProbe.Calls.map((c) => c.PropertyPresent)).toEqual([true]);
    expect(valueProbe.Calls.map((c) => c.propertyValue)).toEqual([{ background: '#123456' }]);
  });

  it('checks an object literal whose fields are member expressions', () => {
    lint('<DataGrid headerStyle={{ background: brand.tableHeaderBackground }} />', 'value-probe');

    expect(valueProbe.Calls).toHaveLength(1);
    expect(valueProbe.Calls[0].propertyValue).toEqual({
      background: { _type: 'expression', description: 'member expression' },
    });
  });

  it('skips a value known only at runtime, even for an opted-in validator', () => {
    lint('<DataGrid headerStyle={brand.headerStyle} />', 'absence-probe');

    expect(absenceProbe.Calls).toHaveLength(0);
  });
});

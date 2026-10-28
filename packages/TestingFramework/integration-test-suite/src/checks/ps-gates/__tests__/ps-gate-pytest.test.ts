import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PsGatePytest } from '../ps-gate-pytest';

const NODES_FILE = 'tests/gates/test_trainer_contract_gates.py';
const CANNED = readFileSync(fileURLToPath(new URL('./fixtures/canned-junit.xml', import.meta.url)), 'utf8');

describe('PsGatePytest.FromJUnit', () => {
  it('counts every parametrized case of a requested node as collected and passed', () => {
    expect(PsGatePytest.FromJUnit([`${NODES_FILE}::test_W1_S5_4_2_rf_and_mlp_repeat_exactly`], CANNED))
      .toEqual({ Collected: 2, Passed: 2, Failed: 0, Errors: 0, NotCollected: [] });
  });
  it('counts a failed case as Failed and a skipped case as collected but not passed', () => {
    expect(PsGatePytest.FromJUnit([`${NODES_FILE}::test_W8_S3_4_target_encoding_is_in_fold`], CANNED))
      .toEqual({ Collected: 1, Passed: 0, Failed: 1, Errors: 0, NotCollected: [] });
    expect(PsGatePytest.FromJUnit([`${NODES_FILE}::test_W1_S5_3_inner_cv_means_with_intervals`], CANNED))
      .toEqual({ Collected: 1, Passed: 0, Failed: 0, Errors: 0, NotCollected: [] });
  });
  it('reports a renamed node as NotCollected, with nothing collected for it', () => {
    expect(PsGatePytest.FromJUnit([`${NODES_FILE}::test_renamed`], CANNED))
      .toEqual({ Collected: 0, Passed: 0, Failed: 0, Errors: 0, NotCollected: [`${NODES_FILE}::test_renamed`] });
  });
  it('counts a case the report repeats once', () => {
    const repeated = '<testsuites><testsuite><testcase classname="tests.gates.test_trainer_contract_gates" name="test_W8_S3_4_target_encoding_is_in_fold" time="0.4" /><testcase classname="tests.gates.test_trainer_contract_gates" name="test_W8_S3_4_target_encoding_is_in_fold" time="0.4" /></testsuite></testsuites>';
    expect(PsGatePytest.FromJUnit([`${NODES_FILE}::test_W8_S3_4_target_encoding_is_in_fold`], repeated))
      .toEqual({ Collected: 1, Passed: 1, Failed: 0, Errors: 0, NotCollected: [] });
  });
  it('counts a collection error (a testcase no requested node owns) in Errors', () => {
    const collectionError = '<testsuites><testsuite><testcase classname="" name="tests.gates.test_trainer_contract_gates" time="0"><error message="collection failure">ImportError</error></testcase></testsuite></testsuites>';
    expect(PsGatePytest.FromJUnit([`${NODES_FILE}::test_W8_S3_4_target_encoding_is_in_fold`], collectionError))
      .toEqual({ Collected: 0, Passed: 0, Failed: 0, Errors: 1, NotCollected: [`${NODES_FILE}::test_W8_S3_4_target_encoding_is_in_fold`] });
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { CodeVersionInfo } from '../code-version';

const original = process.env.PS_GIT_SHA;

describe('assembly code version', () => {
  afterEach(() => {
    if (original === undefined) delete process.env.PS_GIT_SHA;
    else process.env.PS_GIT_SHA = original;
  });
  it('records an unset PS_GIT_SHA as unrecorded, after this package name and version', () => {
    delete process.env.PS_GIT_SHA;
    expect(CodeVersionInfo.AssemblyCodeVersion()).toMatch(/^@memberjunction\/predictive-studio@\d+\.\d+\.\d+[^+]*\+unrecorded$/);
  });
  it('records an empty PS_GIT_SHA as unrecorded too', () => {
    process.env.PS_GIT_SHA = '';
    expect(CodeVersionInfo.AssemblyCodeVersion()).toMatch(/\+unrecorded$/);
  });
  it('records the deployment git SHA when PS_GIT_SHA is set', () => {
    process.env.PS_GIT_SHA = '0123abcd';
    expect(CodeVersionInfo.AssemblyCodeVersion()).toMatch(/^@memberjunction\/predictive-studio@\d+\.\d+\.\d+[^+]*\+0123abcd$/);
  });
});

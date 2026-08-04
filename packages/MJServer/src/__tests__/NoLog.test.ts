import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { NoLog, hasNoLogParameter, getNoLogFields } from '../logging/NoLog.js';

describe('NoLog decorator', () => {
  it('marks a resolver method parameter (3-arg call) and is readable via hasNoLogParameter', () => {
    class MyResolver {
      doThing(_safeArg: string, _secret: string): void {
        // method body irrelevant; decorators applied below
      }
    }
    NoLog(MyResolver.prototype, 'doThing', 1);

    expect(hasNoLogParameter(MyResolver, 'doThing', 1)).toBe(true);
    expect(hasNoLogParameter(MyResolver, 'doThing', 0)).toBe(false);
    expect(hasNoLogParameter(MyResolver, 'unknownMethod', 0)).toBe(false);
  });

  it('marks a field on an input class (2-arg call) and is readable via getNoLogFields', () => {
    class MyInput {
      // eslint-disable-next-line @typescript-eslint/no-inferrable-types
      Token: string = '';
      Queries: string[] = [];
    }
    NoLog(MyInput.prototype, 'Token');

    const fields = getNoLogFields(MyInput);
    expect(fields.has('Token')).toBe(true);
    expect(fields.has('Queries')).toBe(false);
    expect(fields.size).toBe(1);
  });

  it('returns empty results when no @NoLog has been applied', () => {
    class UndecoratedResolver {
      doNothing(): void {
        // nothing
      }
    }
    class UndecoratedInput {
      A: string = '';
      B: string = '';
    }

    expect(hasNoLogParameter(UndecoratedResolver, 'doNothing', 0)).toBe(false);
    expect(getNoLogFields(UndecoratedInput).size).toBe(0);
  });

  it('supports multiple parameter marks on the same method', () => {
    class TwoSecrets {
      handle(_a: string, _b: string, _c: string): void {
        // marks below
      }
    }
    NoLog(TwoSecrets.prototype, 'handle', 0);
    NoLog(TwoSecrets.prototype, 'handle', 2);

    expect(hasNoLogParameter(TwoSecrets, 'handle', 0)).toBe(true);
    expect(hasNoLogParameter(TwoSecrets, 'handle', 1)).toBe(false);
    expect(hasNoLogParameter(TwoSecrets, 'handle', 2)).toBe(true);
  });

  it('supports multiple field marks on the same input class', () => {
    class TwoFieldSecrets {
      A: string = '';
      B: string = '';
      C: string = '';
    }
    NoLog(TwoFieldSecrets.prototype, 'A');
    NoLog(TwoFieldSecrets.prototype, 'C');

    const fields = getNoLogFields(TwoFieldSecrets);
    expect(fields.has('A')).toBe(true);
    expect(fields.has('B')).toBe(false);
    expect(fields.has('C')).toBe(true);
  });
});

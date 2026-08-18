/**
 * Thread numbering — `$` handling in the number format (issue #3171).
 *
 * `addThreadNumbers` substitutes `{n}` and `{total}` into a user-supplied
 * `format`. The substituted values are numbers, so unlike the other #3171 sites
 * no `$` can reach the replacement slot — the conversion to replacement
 * functions there was defensive, keeping the shape uniform rather than fixing a
 * live defect.
 *
 * What IS user-supplied is `format` itself, which is the SEARCH side. These tests
 * pin the behaviour that matters: a `$`-bearing format survives numbering intact,
 * and the numbers land correctly. The whole file was previously unreachable —
 * this package shipped a passing test suite with no `test` script to run it.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {},
  BaseOAuthAction: class BaseOAuthAction {
    protected oauthParams: unknown[] = [];
    protected getAccessToken(): string | null {
      return null;
    }
    protected getRefreshToken(): string | null {
      return null;
    }
    protected getCustomAttribute(_index: number): string | null {
      return null;
    }
    protected async updateStoredTokens(_a: string, _r: string, _e: number): Promise<void> {}
  },
  OAuth2Manager: class OAuth2Manager {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  LogStatus: vi.fn(),
  LogError: vi.fn(),
  RunView: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {},
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {},
}));

vi.mock('axios', () => ({
  default: { post: vi.fn(), isAxiosError: vi.fn(() => false) },
}));

const { TwitterCreateThreadAction } = await import(
  '../providers/twitter/actions/create-thread.action'
);

describe('addThreadNumbers — $ in the number format (#3171)', () => {
  const number = (tweets: string[], format: string): string[] => {
    const action = new TwitterCreateThreadAction();
    return (action as unknown as Record<string, (t: string[], f: string) => string[]>)
      .addThreadNumbers(tweets, format);
  };

  it('numbers tweets with a plain format', () => {
    expect(number(['a', 'b'], '{n}/{total}')).toEqual(['1/2 a', '2/2 b']);
  });

  for (const format of ['$$ {n}/{total}', '$& {n}/{total}', '$` {n}/{total}', "$' {n}/{total}", '{n}/{total} costs $5']) {
    it(`preserves a format containing ${JSON.stringify(format)}`, () => {
      const [first] = number(['tweet'], format);
      expect(first).toBe(`${format.replace('{n}', '1').replace('{total}', '1')} tweet`);
    });
  }

  it('substitutes {n} and {total} independently across a longer thread', () => {
    expect(number(['a', 'b', 'c'], 'Part {n} of {total}:')).toEqual([
      'Part 1 of 3: a',
      'Part 2 of 3: b',
      'Part 3 of 3: c',
    ]);
  });

  it('leaves a format with no tokens alone', () => {
    expect(number(['a'], 'Thread:')).toEqual(['Thread: a']);
  });
});

/**
 * Which databases the truth suite may write to: a private per-agent database (`MJ_PS_PR<n>_<agent>`) or CI's
 * ephemeral `test` database.
 *
 * Twin: codegen/private-database.cjs holds the same rule for truth:provision and the scoped CodeGen config (CommonJS,
 * loaded by CodeGen from .run/codegen, so it cannot import this compiled ESM module). The drift test
 * src/db/__tests__/private-database.test.ts fails if the two differ.
 */
export class PrivateTruthDatabase {
  /** The database-name rule. */
  public static readonly Pattern: RegExp = /^MJ_PS_PR\d+_|^test$/;

  /** The rule in words, for refusal messages. */
  public static readonly Description: string = "MJ_PS_PR<n>_<agent> or the CI 'test' database";

  /** True when `name` is a database the truth suite may provision, load or reconfigure. */
  public static IsAllowed(name: string | null | undefined): boolean {
    return typeof name === 'string' && PrivateTruthDatabase.Pattern.test(name);
  }
}

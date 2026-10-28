/**
 * @module snapshot/code-version
 *
 * The code-version stamp a Training Snapshot records: which assembly code built it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JsonParse } from '@memberjunction/predictive-studio-core';

/** The assembly code version, as a static member on one owner class. */
export class CodeVersionInfo {
  private static packageVersion: string | null = null;

  /**
   * `@memberjunction/predictive-studio@<package version>+<git sha>`. The git SHA comes from `PS_GIT_SHA`, set by the
   * deployment (the sidecar's code version reads the same variable); `||` is deliberate, so an unset or empty
   * `PS_GIT_SHA` both read as `unrecorded`.
   */
  public static AssemblyCodeVersion(): string {
    const gitSha = process.env.PS_GIT_SHA || 'unrecorded';
    return `@memberjunction/predictive-studio@${CodeVersionInfo.readPackageVersion()}+${gitSha}`;
  }

  /**
   * This package's version, read once from its own `package.json` (`dist/snapshot` and `src/snapshot` both sit two
   * levels below it). A package.json without a string `version` is a broken install, so it throws.
   */
  private static readPackageVersion(): string {
    if (CodeVersionInfo.packageVersion !== null) return CodeVersionInfo.packageVersion;
    const path = fileURLToPath(new URL('../../package.json', import.meta.url));
    const json = JsonParse.ParseJsonText(readFileSync(path, 'utf8'), path);
    if (json.Ok === false) throw new Error(json.Errors.join('; '));
    const version = JsonParse.IsJsonObject(json.Value) ? JsonParse.JsonString(json.Value, 'version') : null;
    if (version === null) throw new Error(`${path} has no string "version"`);
    CodeVersionInfo.packageVersion = version;
    return version;
  }
}

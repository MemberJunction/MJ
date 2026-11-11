/**
 * Compile-time parity of Core's persisted model statuses with the generated entity (PR 4 Task M1.7, the status-union
 * case's compile-time leg). Core cannot derive `PersistedModelStatus` from `MJMLModelEntity['Status']` (it does not
 * depend on `@memberjunction/core-entities`, D4-68), so this package, which depends on both, proves they are the same
 * union. `status-union-parity.compile.test.ts` compiles this file under the package's options and expects no
 * diagnostics; the database lane's runtime legs check the same set against the Zod literals and `CK_MLModel_Status`.
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { PersistedModelStatus } from '@memberjunction/predictive-studio-core';

/** Compiles only when `T` is `true`. */
type Expect<T extends true> = T;
/** `true` exactly when `A` and `B` are the same type (mutually assignable). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type StatusUnionParity = Expect<Equal<PersistedModelStatus, MJMLModelEntity['Status']>>;

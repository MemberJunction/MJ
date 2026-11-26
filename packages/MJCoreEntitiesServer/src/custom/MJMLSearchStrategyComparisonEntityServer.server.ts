import { BaseEntity, BaseEntityResult, type EntitySaveOptions, type ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMLSearchStrategyComparisonEntity } from '@memberjunction/core-entities';
import { SearchPolicy } from '@memberjunction/predictive-studio-core';
import { VersionedRowGuard } from './MJMLPredictionUnitEntityServer.server';

/**
 * Server guard for `MJ: ML Search Strategy Comparisons` (PR 5 §5.2.5 / B4):
 * - Validates Method (`bayesian` | `successive-halving`), required datasets (`W1-signal` and `C1`), and that
 *   `LowerBoundMin` equals the minimum lower bound `ci[0]` across datasets (never an average).
 * - Always computes `Passed = LowerBoundMin > 0` (strictly `>`, never `>=`) on every save.
 * - Refuses any client write supplying a `Passed` value that differs from the computed value (on create, update, or
 *   `ReplayOnly` save), leaving nothing written.
 */
@RegisterClass(BaseEntity, 'MJ: ML Search Strategy Comparisons')
export class MJMLSearchStrategyComparisonEntityServer extends MJMLSearchStrategyComparisonEntity {
  /** Refusal message when a caller attempts to write a `Passed` value that disagrees with `LowerBoundMin > 0`. Pure. */
  public static GetClientPassedOverrideProblem(
    isSaved: boolean,
    passedDirty: boolean,
    lowerBoundDirty: boolean,
    actualPassed: boolean,
    computedPassed: boolean,
  ): string | null {
    if (actualPassed === computedPassed) {
      return null;
    }
    if (!isSaved) {
      if (actualPassed || passedDirty) {
        return `comparison-passed-client-override: Passed is computed server-side as LowerBoundMin > 0 (${computedPassed}) and cannot be set to ${actualPassed} by the client.`;
      }
      return null;
    }
    if (!lowerBoundDirty || passedDirty) {
      return `comparison-passed-client-override: Passed is computed server-side as LowerBoundMin > 0 (${computedPassed}) and cannot be set to ${actualPassed} by the client.`;
    }
    return null;
  }

  public override Validate(): ValidationResult {
    const result = super.Validate();
    const rowProblems = SearchPolicy.GetComparisonRowProblems({
      Method: this.Method,
      ComputeBudgetSecondsPerArm: this.ComputeBudgetSecondsPerArm,
      Datasets: this.Datasets,
      PairedDifference: this.PairedDifference,
      LowerBoundMin: this.LowerBoundMin,
    });
    for (const msg of rowProblems) {
      const field = MJMLSearchStrategyComparisonEntityServer.problemField(msg);
      VersionedRowGuard.Fail(result, field, msg);
    }

    const computedPassed = SearchPolicy.ComputePassed(this.LowerBoundMin);
    const passedDirty = this.GetFieldByName('Passed')?.Dirty === true;
    const lowerBoundDirty = this.GetFieldByName('LowerBoundMin')?.Dirty === true;
    const passedProblem = MJMLSearchStrategyComparisonEntityServer.GetClientPassedOverrideProblem(
      this.IsSaved,
      passedDirty,
      lowerBoundDirty,
      Boolean(this.Passed),
      computedPassed,
    );
    if (passedProblem !== null) {
      VersionedRowGuard.Fail(result, 'Passed', passedProblem);
    }
    return result;
  }

  /**
   * Computes `Passed = LowerBoundMin > 0` before saving, and refuses `ReplayOnly` writes that violate row invariants or
   * attempt to override `Passed` (since `ReplayOnly` bypasses {@link Validate}).
   */
  public override async Save(options?: EntitySaveOptions): Promise<boolean> {
    const computedPassed = SearchPolicy.ComputePassed(this.LowerBoundMin);
    const passedDirty = this.GetFieldByName('Passed')?.Dirty === true;
    const lowerBoundDirty = this.GetFieldByName('LowerBoundMin')?.Dirty === true;
    const clientOverrideProblem = MJMLSearchStrategyComparisonEntityServer.GetClientPassedOverrideProblem(
      this.IsSaved,
      passedDirty,
      lowerBoundDirty,
      Boolean(this.Passed),
      computedPassed,
    );

    if (options?.ReplayOnly === true) {
      const validation = this.Validate();
      if (!validation.Success) {
        const refused = new BaseEntityResult();
        refused.Success = false;
        refused.Type = this.IsSaved ? 'update' : 'create';
        refused.Message = validation.Errors.map((e) => e.Message).join('; ');
        refused.StartedAt = new Date();
        refused.EndedAt = refused.StartedAt;
        this.RegisterResultHistoryEntry(refused);
        return false;
      }
    }

    // Only stamp the computed Passed when the caller did not supply a contradicting Passed;
    // otherwise leave the client's value intact so super.Save()'s Validate() refuses the write
    // and records the ValidationError on LatestResult.
    if (clientOverrideProblem === null) {
      this.Passed = computedPassed;
    }
    return super.Save(options);
  }

  private static problemField(message: string): string {
    if (message.startsWith('Method')) return 'Method';
    if (message.startsWith('ComputeBudgetSecondsPerArm')) return 'ComputeBudgetSecondsPerArm';
    if (message.startsWith('Datasets')) return 'Datasets';
    if (message.startsWith('PairedDifference')) return 'PairedDifference';
    return 'LowerBoundMin';
  }
}

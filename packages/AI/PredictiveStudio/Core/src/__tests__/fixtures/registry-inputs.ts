import { EvaluationProtocol } from '../../evaluation-protocol';
import { GateRules, type GateDecision, type GateGuardInputs, type GateInputs, type PairedComparison, type StoredGateIntervals } from '../../gate';
import type { PromotionRule } from '../../evaluation-protocol';
import type { StoredFile, StoredPublishInputs } from '../../registry-contracts';
import type { TaskType } from '../../task-type';
import type { ReturnedArtifact } from '../../trainer-contract';

/**
 * The registry-contract fixtures the C5 tests share: the review's gate-parity situation (a keep-simple-baseline run at
 * margin 0.005 where only the GLM beats the dummy), its stored intervals, artifacts, files and publish inputs.
 */
export class RegistryInputs {
  public static readonly Task: TaskType = { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 };
  public static readonly Margin = EvaluationProtocol.ToNonNegative(0.005);
  public static readonly ProtocolID = '0b8f3a51-6f0e-4c63-9d2a-7c1e5d4b3a21';
  public static readonly IncumbentID = '5a1c9e7d-2b3f-4a6e-8d0c-1f2e3d4c5b6a';
  public static readonly OtherIncumbentID = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
  public static readonly ModelID = 'c3d4e5f6-0718-4293-a4b5-c6d7e8f90a1b';
  public static readonly User = '7f6e5d4c-3b2a-4198-8776-655443322110';
  public static readonly AgentRun = '1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9';

  /** An artifact the sidecar returned for `candidate`, hashed `h-<candidate>`. */
  public static Art(candidate: string, order: readonly string[] | null = ['Lapsed', 'Renewed']): ReturnedArtifact {
    return { candidate, bytesBase64: '', sha256: `h-${candidate}`, featureSchemaHash: 's', classOrder: order };
  }

  /** A stored write-once file whose bytes hash to `sha256`. */
  public static File(sha256: string): StoredFile {
    return { fileId: 'f', storageProviderId: 'p', providerKey: 'k', sha256, sizeBytes: 1, writeOnce: true };
  }

  /** A paired comparison whose `beats` claims a win; the issuing code must recompute it from the lower bound. */
  public static ClaimedWin(value: number, lower: number, upper: number): PairedComparison {
    return { value, ci: [lower, upper], beats: true };
  }

  /** The keep-simple gate inputs: the finalist beats nothing, only the GLM beats the dummy. */
  public static KeepInputs(): GateInputs {
    return { modelName: 'xgb', modelBeatsDummy: false, modelBeatsBestSimple: false, memberBeatsDummy: { glm: true }, memberScores: { glm: 0.3 }, deliveredMember: null };
  }

  /** The keep-simple decision (GLM ships). */
  public static KeepGate(): GateDecision {
    return GateRules.DecideGate(RegistryInputs.KeepInputs());
  }

  /** The model decision (the finalist ships). */
  public static ModelGate(): GateDecision {
    return GateRules.DecideGate({ ...RegistryInputs.KeepInputs(), modelBeatsDummy: true, modelBeatsBestSimple: true });
  }

  /** The no-signal decision (nothing ships). */
  public static NoSignalGate(): GateDecision {
    return GateRules.DecideGate({ ...RegistryInputs.KeepInputs(), memberBeatsDummy: { glm: false } });
  }

  /** The keep-simple situation as stored intervals: at margin 0.005 only the GLM beats the dummy. */
  public static KeepIntervals(): StoredGateIntervals {
    return {
      modelName: 'xgb',
      modelVsDummy: { value: 0, lower: -0.01, upper: 0.01 },
      modelVsBestSimple: { value: -0.01, lower: -0.02, upper: 0 },
      memberVsDummy: { glm: { value: 0.03, lower: 0.01, upper: 0.05 } },
      memberScores: { glm: 0.3 },
      deliveredMember: null,
    };
  }

  /** The model situation as stored intervals: the finalist beats the dummy and the GLM at margin 0.005. */
  public static ModelIntervals(): StoredGateIntervals {
    return { ...RegistryInputs.KeepIntervals(), modelVsDummy: { value: 0.05, lower: 0.03, upper: 0.07 }, modelVsBestSimple: { value: 0.02, lower: 0.01, upper: 0.03 } };
  }

  /** Guard inputs that pass both guards: 50 rows of the rarer class (minimum 20) and an AUC interval clear of 0.5. */
  public static Guards(): GateGuardInputs {
    return { taskKind: 'binary', holdoutClassCounts: { Lapsed: 50, Renewed: 150 }, modelAucInterval: { level: 0.95, lower: 0.61, upper: 0.7 }, minMinorityClassRows: 20 };
  }

  /** The pinned protocol's promotion rule at `margin` with every optional field at its default. */
  public static Promotion(margin = RegistryInputs.Margin): PromotionRule {
    return {
      comparators: [], incumbent: 'current-published', margin, lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15',
      ...EvaluationProtocol.DefaultPromotionAdditions(margin),
    };
  }

  /**
   * The parity script's consistent keep-simple publish inputs: the GLM is registered, the stored incumbent diff beats
   * the current incumbent. The initiator is a person (an explicit publish of a KeepBaseline model passes, §5.1).
   */
  public static KeepPublish(): StoredPublishInputs {
    return {
      ModelID: RegistryInputs.ModelID,
      Task: RegistryInputs.Task,
      GateIntervals: RegistryInputs.KeepIntervals(),
      GateGuards: RegistryInputs.Guards(),
      PinnedProtocol: { ProtocolID: RegistryInputs.ProtocolID, ProtocolVersion: 3 },
      ProtocolRow: { ID: RegistryInputs.ProtocolID, Version: 3, Promotion: RegistryInputs.Promotion() },
      RegisteredArtifacts: [RegistryInputs.Art('xgb'), RegistryInputs.Art('glm')],
      RegisteredDelivery: { Shipped: 'glm', ArtifactSha256: 'h-glm' },
      IncumbentDiff: { incumbentModelId: RegistryInputs.IncumbentID, value: 0.02, lower: 0.01, upper: 0.03 },
      CurrentPublishedModelID: RegistryInputs.IncumbentID,
      Initiator: { kind: 'human', userId: RegistryInputs.User },
    };
  }

  /** Publish inputs for a stored `model` outcome: the finalist is registered; initiated by an agent run. */
  public static ModelPublish(): StoredPublishInputs {
    return {
      ...RegistryInputs.KeepPublish(),
      GateIntervals: RegistryInputs.ModelIntervals(),
      RegisteredDelivery: { Shipped: 'xgb', ArtifactSha256: 'h-xgb' },
      Initiator: { kind: 'agent', agentRunId: RegistryInputs.AgentRun },
    };
  }

  /** `inputs` with the pinned protocol row's promotion rule changed by `change`. */
  public static WithPromotion(inputs: StoredPublishInputs, change: Partial<PromotionRule>): StoredPublishInputs {
    return { ...inputs, ProtocolRow: { ...inputs.ProtocolRow, Promotion: { ...inputs.ProtocolRow.Promotion, ...change } } };
  }
}

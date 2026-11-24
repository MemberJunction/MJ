/**
 * @module operations/sign-off-model.operation
 *
 * **Sign Off ML Model** Remote Operation — the server body for the Manual-mode `PredictiveStudio.SignOffModel`
 * operation: a person's sign-off of a model, recorded by {@link SignOffService.Record} as a `kind: 'sign-off'` publish
 * record over the evidence built from stored rows.
 *
 * Only a person can sign off (D4-04). The operation decides that before the service is reached: a call that arrived
 * with an MJ API key (`RemoteOpServerContext.apiKeyHash` set) or runs as the MJ system user
 * (`WellKnownUserSource.IsSystemUser`) is refused `NOT_HUMAN`; otherwise the caller is the approver
 * (`{ kind: 'human', userId }`). No Action wraps this operation, so an agent cannot reach it. An input that breaks the
 * wire contract is refused `INVALID_INPUT` naming the field ({@link PredictiveStudioSignOffModelServerOperation.ParseInput}).
 * The service's refusals map to `OVERRIDES_WITHOUT_REASON` and `MODEL_ARCHIVED`. Every code is in Core's refusal catalog
 * (`PredictiveStudioRefusalCodes`); every refusal is `Success: false` with the reason in
 * `ErrorMessage` and no output, and writes no row. A `Success: true` result always carries the sign-off record's ID and
 * the evidence hash it recorded.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation, type RemoteOperationError, WellKnownUserSource } from '@memberjunction/core';
import {
  PredictiveStudioSignOffModelOperation,
  type PredictiveStudioSignOffModelInput,
  type PredictiveStudioSignOffModelOutput,
} from '@memberjunction/core-entities';
import {
  LEAKAGE_FLAG_KINDS,
  type LeakageFlag,
  type ListsEveryMember,
  type PredictiveStudioRefusalCode,
  type SignOff,
  type SignOffRefusal,
} from '@memberjunction/predictive-studio-core';

import { SignOffService, type SignOffInput } from '../governance/sign-off-service';
import type { PublishRequest } from '../registry/gate-context';
import { GateContexts } from '../registry/gate-seams';
import { PredictiveStudioRefusals } from './refusals';

/** The purposes a sign-off may be for. */
const SIGN_OFF_PURPOSES = ['publish', 'rollback'] as const satisfies readonly PublishRequest['purpose'][];
const signOffPurposesComplete: ListsEveryMember<PublishRequest['purpose'], (typeof SIGN_OFF_PURPOSES)[number]> = true;
void signOffPurposesComplete;
/** The decisions a sign-off may record. */
const SIGN_OFF_DECISIONS = ['approve', 'reject'] as const satisfies readonly SignOff['Decision'][];
const signOffDecisionsComplete: ListsEveryMember<SignOff['Decision'], (typeof SIGN_OFF_DECISIONS)[number]> = true;
void signOffDecisionsComplete;

/** A wire input parsed into the service's input, or the field it breaks the contract on. */
export type SignOffInputParse =
  | { readonly Ok: true; readonly Value: SignOffInput }
  | { readonly Ok: false; readonly Field: keyof PredictiveStudioSignOffModelInput; readonly Problem: string };

/** The operation's `ResultCode` for each sign-off refusal, from Core's refusal catalog. */
const REFUSAL_CODES: Readonly<Record<SignOffRefusal, PredictiveStudioRefusalCode>> = {
  'not-human': 'NOT_HUMAN',
  'overrides-without-reason': 'OVERRIDES_WITHOUT_REASON',
  'model-archived': 'MODEL_ARCHIVED',
};

/** The words of each sign-off refusal. */
const REFUSAL_MESSAGES: Readonly<Record<SignOffRefusal, string>> = {
  'not-human': 'Only a person can sign off a model: an API-key caller or the system user cannot.',
  'overrides-without-reason': 'A sign-off that overrides leakage flags needs a reason.',
  'model-archived': 'An Archived model cannot be signed off.',
};

/**
 * Server implementation of `PredictiveStudio.SignOffModel`. Extends the CodeGen-emitted
 * {@link PredictiveStudioSignOffModelOperation} base (`ExecutionMode='Sync'`, `RequiredScope='predictive:execute'`)
 * and supplies only the body.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.SignOffModel')
export class PredictiveStudioSignOffModelServerOperation extends PredictiveStudioSignOffModelOperation {
  /**
   * @inheritdoc
   * @throws RemoteOperationError with the refusal's code (`NOT_HUMAN`, `INVALID_INPUT` naming the field,
   *   `OVERRIDES_WITHOUT_REASON`, `MODEL_ARCHIVED`); each is decided before any row is written
   * @throws Error when the model does not exist (`EXECUTION_ERROR`)
   */
  protected async InternalExecute(
    input: PredictiveStudioSignOffModelInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext,
  ): Promise<PredictiveStudioSignOffModelOutput> {
    if (PredictiveStudioSignOffModelServerOperation.IsNotHuman(user, context)) throw PredictiveStudioSignOffModelServerOperation.RefusalError('not-human');
    const parsed = PredictiveStudioSignOffModelServerOperation.ParseInput(input);
    if (parsed.Ok === false) throw PredictiveStudioRefusals.InvalidInput(this.OperationKey, parsed.Field, parsed.Problem);
    const result = await new SignOffService().Record(
      parsed.Value,
      { kind: 'human', userId: user.ID },
      GateContexts.ForRequest({ ContextUser: user, Provider: provider }),
    );
    if (result.Ok === false) throw PredictiveStudioSignOffModelServerOperation.RefusalError(result.Refusal);
    return { signOffRecordId: result.SignOffRecordID, evidenceSha256: result.EvidenceSha256 };
  }

  /**
   * The wire input checked against its contract, as `ModelTransitionDelegation.ParseTransition` checks Promote's
   * `transition`: a non-blank `modelId`; `purpose` `publish` or `rollback`; `decision` `approve` or `reject`; `reason` a
   * string (a blank reason with overridden flags is the service's `overrides-without-reason`); `overridesFlags` an array
   * of known leakage flag kinds (`LEAKAGE_FLAG_KINDS`). Every field is required. Pure.
   */
  public static ParseInput(input: PredictiveStudioSignOffModelInput | null | undefined): SignOffInputParse {
    if (!input || typeof input.modelId !== 'string' || input.modelId.trim().length === 0) return { Ok: false, Field: 'modelId', Problem: 'is required' };
    const purpose = SIGN_OFF_PURPOSES.find((p) => p === input.purpose);
    if (purpose === undefined) return { Ok: false, Field: 'purpose', Problem: `must be one of: ${SIGN_OFF_PURPOSES.join(', ')}` };
    const decision = SIGN_OFF_DECISIONS.find((d) => d === input.decision);
    if (decision === undefined) return { Ok: false, Field: 'decision', Problem: `must be one of: ${SIGN_OFF_DECISIONS.join(', ')}` };
    if (typeof input.reason !== 'string') return { Ok: false, Field: 'reason', Problem: 'is required (a string)' };
    const flags = PredictiveStudioSignOffModelServerOperation.parseFlags(input.overridesFlags);
    if (flags === null) return { Ok: false, Field: 'overridesFlags', Problem: `must be an array of leakage flag kinds (${LEAKAGE_FLAG_KINDS.join(', ')})` };
    return { Ok: true, Value: { modelId: input.modelId, purpose, decision, reason: input.reason, overridesFlags: flags } };
  }

  /** The flag kinds, or null when the value is not an array or names a kind that is not a leakage flag kind. */
  private static parseFlags(value: PredictiveStudioSignOffModelInput['overridesFlags'] | null | undefined): LeakageFlag['kind'][] | null {
    if (!Array.isArray(value)) return null;
    const kinds: LeakageFlag['kind'][] = [];
    for (const v of value) {
      const kind = LEAKAGE_FLAG_KINDS.find((k) => k === v);
      if (kind === undefined) return null;
      kinds.push(kind);
    }
    return kinds;
  }

  /** True when the call is not a person's: it arrived with an MJ API key, or runs as the MJ system user. */
  public static IsNotHuman(user: UserInfo, context: RemoteOpServerContext): boolean {
    return Boolean(context.apiKeyHash) || WellKnownUserSource.Instance.IsSystemUser(user);
  }

  /** The operation error of a refusal: its `ResultCode` and its words. */
  public static RefusalError(refusal: SignOffRefusal): RemoteOperationError {
    return PredictiveStudioRefusals.Refusal(REFUSAL_CODES[refusal], REFUSAL_MESSAGES[refusal]);
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioSignOffModelOperation(): void {
  // intentionally empty
}

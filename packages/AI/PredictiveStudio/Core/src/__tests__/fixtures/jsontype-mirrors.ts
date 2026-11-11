/**
 * Compile-time drift check for the JSONType mirrors (PR 4 Task M1.5). `metadata/entities/JSONType-interfaces/` holds
 * the JSONType sources CodeGen emits inline on `MJMLModelEntity` and `MJMLModelPublishRecordEntity`; each mirrored type
 * must equal its Core type exactly. `jsontype-mirrors.compile.test.ts` compiles this file and expects no diagnostics, so
 * a Core change that is not mirrored (or a mirror edit that drifts) fails the Core test run.
 */
import type * as Models from '../../../../../../../metadata/entities/JSONType-interfaces/IMLModelJsonTypes';
import type * as PublishRecords from '../../../../../../../metadata/entities/JSONType-interfaces/IMLModelPublishRecordJsonTypes';
import type { CodeVersion } from '../../trainer-contract';
import type { OutputSemantics, RegisteredDeliveryView, TransitionRefusal } from '../../registry-contracts';
import type { Actor } from '../../prediction-unit';
import type { GateDecision } from '../../gate';
import type { EvidenceSnapshot } from '../../governance-contracts';

/** Compiles only when `T` is `true`. */
type Expect<T extends true> = T;
/** `true` exactly when `A` and `B` are the same type (mutually assignable, including readonly and optionality). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type MirrorCodeVersion = Expect<Equal<Models.CodeVersion, CodeVersion>>;
export type MirrorOutputSemantics = Expect<Equal<Models.OutputSemantics, OutputSemantics>>;
export type MirrorRegisteredDeliveryView = Expect<Equal<Models.RegisteredDeliveryView, RegisteredDeliveryView>>;
export type MirrorActor = Expect<Equal<PublishRecords.Actor, Actor>>;
export type MirrorGateDecision = Expect<Equal<PublishRecords.GateDecision, GateDecision>>;
export type MirrorEvidenceSnapshot = Expect<Equal<PublishRecords.EvidenceSnapshot, EvidenceSnapshot>>;
export type MirrorTransitionRefusal = Expect<Equal<PublishRecords.TransitionRefusal, TransitionRefusal>>;

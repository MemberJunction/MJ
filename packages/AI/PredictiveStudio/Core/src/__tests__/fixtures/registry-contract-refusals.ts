// The review's 15 compile-time refusals (`reference/contracts/contract_checks.ts`), ported to the product names and
// casing of the Core contracts. Each `@ts-expect-error` line must fail to type-check; `registry-contracts.compile.test.ts`
// compiles this file as is (0 diagnostics: every directive is used) and with every directive removed (exactly 15
// errors). `agentPublish` is replaced by `agentSignOff`: D4-16 lets any Actor start validated → published, but an agent
// still cannot be a SignOff's approver. These are a convenience layer: the cast at the end compiles, and only the
// run-time checks (`IsIssued`, `PublishRules.ReverifyPublish`) catch it.

import { EvaluationProtocol, type PromotionRule } from '../../evaluation-protocol';
import { GateRules, type GateDecision } from '../../gate';
import type { SemanticsCheck, SignOff } from '../../governance-contracts';
import {
  Delivery,
  type IncumbentCheck,
  type LifecycleTransition,
  type ModelRegistryEntry,
  type RegisteredDelivery,
  type StoredFile,
  type StoredPublishInputs,
} from '../../registry-contracts';
import type { TaskType } from '../../task-type';
import type { ReturnedArtifact } from '../../trainer-contract';

const sha = 'ab';
const id = '00000000-0000-0000-0000-000000000000';
const task: TaskType = { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 0 };
const glm: ReturnedArtifact = { candidate: 'glm', bytesBase64: '', sha256: sha, featureSchemaHash: sha, classOrder: ['Lapsed', 'Renewed'] };
const xgb: ReturnedArtifact = { ...glm, candidate: 'xgboost' };
const keep = GateRules.DecideGate({
  modelName: 'xgboost',
  modelBeatsDummy: false,
  modelBeatsBestSimple: false,
  memberBeatsDummy: { glm: true },
  memberScores: { glm: 0.3 },
  deliveredMember: null,
});
const keepGate = keep as Extract<GateDecision, { readonly outcome: 'keep-simple-baseline' }>;
const m = EvaluationProtocol.ToNonNegative(0);
declare const file: StoredFile;

// Genuine values, as issued by the factories.
declare const keepD: Delivery;
declare const win: IncumbentCheck;
declare const none: IncumbentCheck;
declare const reg: RegisteredDelivery;

// ---- the spread counterexamples: spreading drops #issued, so none is the class any more --------------------------
// @ts-expect-error f1: finalist bytes spread into a genuine keep-simple delivery
export const f1: Delivery = { ...keepD, View: { gate: keepGate, artifact: { ...xgb, role: 'simpleBaseline' } } };
// @ts-expect-error f2: a losing interval spread into a genuine beats-incumbent check
export const f2: IncumbentCheck = { ...win, View: { Kind: 'beats-incumbent', Delivery: keepD, IncumbentModelID: id, Margin: m, Comparison: { value: -0.02, ci: [-0.05, 0.01], beats: true } } };
// @ts-expect-error f3: a genuine no-incumbent check with another delivery spread in
export const f3: IncumbentCheck = { ...none, View: { ...none.View, Delivery: win.View.Delivery } };
// @ts-expect-error f4: a genuine registry delivery with the finalist spread in
export const f4: RegisteredDelivery = { ...reg, View: { kind: 'delivered', gate: keepGate, shipped: 'xgboost', shippedRole: 'model', artifact: file } };
// @ts-expect-error f5: a genuine check with another incumbent id spread in
export const f5: IncumbentCheck = { ...win, View: { Kind: 'beats-incumbent', Delivery: keepD, IncumbentModelID: id, Margin: m, Comparison: { value: 0.02, ci: [0.01, 0.03], beats: true } } };
// @ts-expect-error the constructor is private; only the static factories create instances
export const direct = new Delivery({ gate: keepGate, artifact: { ...xgb, role: 'simpleBaseline' } });

// ---- the literal forgeries still fail ------------------------------------------------------------------------------
// @ts-expect-error hand-written Delivery literal
export const finalistAsSimple: Delivery = { View: { gate: keepGate, artifact: { ...xgb, role: 'simpleBaseline' } } };
// @ts-expect-error hand-written RegisteredDelivery literal whose role disagrees with its gate
export const mismatchedRegistry: RegisteredDelivery = { View: { kind: 'delivered', gate: keepGate, shipped: 'xgboost', shippedRole: 'model', artifact: file } };
declare const entry: ModelRegistryEntry;
// @ts-expect-error the registry entry has no separate gate field next to its delivery
export const separateGate: ModelRegistryEntry = { ...entry, Evaluation: { ...entry.Evaluation, Gate: keepGate } };
// @ts-expect-error a raw number is not a NonNegative
export const badMargin: PromotionRule['margin'] = -0.01;

type Publish = Extract<LifecycleTransition, { readonly To: 'published'; readonly From: 'validated' }>;
declare const signOff: SignOff & { readonly Decision: 'approve' };
declare const semantics: SemanticsCheck & { readonly Result: { readonly Status: 'passed' } };
const human = { kind: 'human', userId: id } as const;
export const okPublish: Publish = { From: 'validated', To: 'published', ModelID: id, Actor: human, SignOff: signOff, SemanticsCheck: semantics, IncumbentCheck: none };
// D4-16: an automatic publish has an agent (or any) initiator and no sign-off; this compiles.
export const agentPublish: Publish = { From: 'validated', To: 'published', ModelID: id, Actor: { kind: 'agent', agentRunId: id }, SemanticsCheck: semantics, IncumbentCheck: none };
// @ts-expect-error `Replaces` is not a field; the gate derives it (PublishRules.ReverifyPublish)
export const replacesField: Publish = { From: 'validated', To: 'published', ModelID: id, Actor: human, SignOff: signOff, SemanticsCheck: semantics, IncumbentCheck: none, Replaces: id };
// @ts-expect-error an agent cannot be the approver of a sign-off
export const agentSignOff: SignOff = { ...signOff, Approver: { kind: 'agent', agentRunId: id } };
// @ts-expect-error adverseIndex outside the two classes
export const badTask: TaskType = { kind: 'binary', classOrder: ['Lapsed', 'Renewed'], adverseIndex: 2 };

// N9: PublishRules.ReverifyPublish reads stored intervals and takes the margin from the pinned protocol row.
declare const stored: StoredPublishInputs;
// @ts-expect-error stored publish inputs carry intervals, not gate booleans
export const storedBooleans: StoredPublishInputs = { ...stored, GateInputs: { modelName: 'm', modelBeatsDummy: true, modelBeatsBestSimple: true, memberBeatsDummy: {}, memberScores: {}, deliveredMember: null } };
// @ts-expect-error the margin is not a caller field; it is the pinned protocol version's
export const callerMargin: StoredPublishInputs = { ...stored, Margin: m };

export const renewalTask = task;
export const usedMargin = m;

// ---- the types do not stop a cast: this compiles, and only the run-time checks catch it ----------------------------
// The `unknown` is the forgery under test: a cast is how a caller bypasses the types.
export const castForgery = { View: { gate: keepGate, artifact: { ...xgb, role: 'simpleBaseline' } } } as unknown as Delivery;

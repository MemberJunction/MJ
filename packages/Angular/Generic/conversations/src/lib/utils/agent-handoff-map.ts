import { IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import {
  MJConversationDetailEntity,
  MJAIAgentConfigurationEntity,
} from '@memberjunction/core-entities';
import {
  MJAIAgentEntityExtended,
  MJAIAgentRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
  CleanAndParseJSON,
  EscapeSQLString,
  IndexByUUID,
  NormalizeUUID,
  UUIDsEqual,
} from '@memberjunction/global';
import {
  AgentHandoffParticipant,
  AgentHandoffStatus,
  MessageHandedOffFromInfo,
  MessageHandoffInfo,
} from '../components/message/agent-handoff-card.component';

/**
 * Simple row shape projected from `MJ: AI Agent Run Steps` for `StepType = 'Handoff'`.
 */
export interface HandoffRunStepRow {
  ID: string;
  AgentRunID: string;
  StepNumber?: number | null;
  StepName?: string | null;
  StepType?: string | null;
  Status?: string | null;
  TargetID?: string | null;
  InputData?: string | null;
  OutputData?: string | null;
  ErrorMessage?: string | null;
}

interface ParsedHandoffInput {
  agentName?: string;
  brief?: string;
  reason?: string;
}

interface ParsedHandoffOutput {
  HandoffToAgentID?: string;
  TargetAgentName?: string;
  AgentName?: string;
  TargetConversationDetailID?: string | null;
  PresetID?: string | null;
  PresetName?: string | null;
  PresetSource?: string | null;
  Brief?: string;
  Reason?: string;
  RefusalReason?: string;
  Hop?: number;
  Chain?: string[];
}

export const HANDOFF_STEP_FIELDS: string[] = [
  'ID',
  'AgentRunID',
  'StepNumber',
  'StepName',
  'StepType',
  'Status',
  'TargetID',
  'InputData',
  'OutputData',
  'ErrorMessage',
];

/**
 * Loads `MJ: AI Agent Run Steps` rows with `StepType = 'Handoff'` for the given run IDs
 * in a single `RunView` query (`ResultType: 'simple'`, explicit `Fields`).
 */
export async function LoadHandoffStepsForRuns(
  provider: IMetadataProvider,
  runIds: readonly string[]
): Promise<HandoffRunStepRow[]> {
  const uniqueIds = Array.from(
    new Set(runIds.map(id => id?.trim()).filter((id): id is string => !!id))
  );
  if (uniqueIds.length === 0) {
    return [];
  }
  try {
    const rv = RunView.FromMetadataProvider(provider);
    const quotedIds = uniqueIds.map(id => `'${EscapeSQLString(id)}'`).join(',');
    const result = await rv.RunView<HandoffRunStepRow>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `StepType = 'Handoff' AND AgentRunID IN (${quotedIds})`,
      Fields: HANDOFF_STEP_FIELDS,
      OrderBy: 'StepNumber ASC',
      ResultType: 'simple',
    });
    if (!result?.Success || !result.Results) {
      LogError(`LoadHandoffStepsForRuns failed: ${result?.ErrorMessage ?? 'Unknown RunView error'}`);
      return [];
    }
    return result.Results;
  } catch (error) {
    LogError('LoadHandoffStepsForRuns threw an error:', undefined, error);
    return [];
  }
}

function parseJsonSafe<T>(raw: string | null | undefined): T | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return CleanAndParseJSON<T>(raw, false);
  }
}

function resolveParticipant(
  agentId: string | null | undefined,
  fallbackName: string | null | undefined,
  agents: readonly MJAIAgentEntityExtended[]
): AgentHandoffParticipant {
  const agentsById = IndexByUUID(agents);
  const match = agentId
    ? agentsById.Get(agentId)
    : fallbackName
      ? agents.find(a => a.Name?.trim().toLowerCase() === fallbackName.trim().toLowerCase())
      : undefined;

  if (match) {
    return {
      ID: match.ID,
      Name: match.Name || fallbackName || 'Agent',
      AvatarUrl: match.LogoURL || null,
      IconClass: match.IconClass || null,
    };
  }
  return {
    ID: agentId ?? null,
    Name: fallbackName?.trim() || 'Agent',
    AvatarUrl: null,
    IconClass: null,
  };
}

/**
 * Looks up a `MessageHandoffInfo` in a detail-ID map using case-insensitive UUID matching.
 */
export function LookupHandoffByDetailId(
  map: ReadonlyMap<string, MessageHandoffInfo> | null | undefined,
  detailId: string | null | undefined
): MessageHandoffInfo | null {
  if (!map || !detailId) {
    return null;
  }
  const direct = map.get(detailId) ?? map.get(NormalizeUUID(detailId));
  if (direct) {
    return direct;
  }
  for (const [key, value] of map.entries()) {
    if (UUIDsEqual(key, detailId)) {
      return value;
    }
  }
  return null;
}

/**
 * Finds the target detail row in `messages` for a handoff originating from `sourceDetailId`.
 */
export function FindHandoffTargetDetail(
  sourceDetailId: string,
  targetAgentId: string | null | undefined,
  messages: readonly MJConversationDetailEntity[]
): MJConversationDetailEntity | undefined {
  return messages.find(
    m =>
      m.Role === 'AI' &&
      !UUIDsEqual(m.ID, sourceDetailId) &&
      UUIDsEqual(m.ParentID, sourceDetailId) &&
      (!targetAgentId || !m.AgentID || UUIDsEqual(m.AgentID, targetAgentId))
  );
}

/**
 * Computes the effective `Status` of a handoff given the current loaded `messages`.
 */
export function DeriveHandoffStatus(
  baseStatus: AgentHandoffStatus,
  sourceDetailId: string,
  targetAgentId: string | null | undefined,
  targetDetailId: string | null | undefined,
  messages: readonly MJConversationDetailEntity[]
): AgentHandoffStatus {
  if (baseStatus === 'Failed') {
    return 'Failed';
  }
  const targetDetail = targetDetailId
    ? messages.find(m => UUIDsEqual(m.ID, targetDetailId)) ??
      FindHandoffTargetDetail(sourceDetailId, targetAgentId, messages)
    : FindHandoffTargetDetail(sourceDetailId, targetAgentId, messages);
  if (!targetDetail || targetDetail.Status === 'In-Progress') {
    return 'Transferring';
  }
  return 'Transferred';
}

/**
 * Builds the `HandoffsByDetailId` map from loaded messages, agent runs, and `Handoff` run steps.
 */
export function BuildHandoffsByDetailId(params: {
  Messages: readonly MJConversationDetailEntity[];
  AgentRunsByDetailId: ReadonlyMap<string, MJAIAgentRunEntityExtended>;
  HandoffSteps: readonly HandoffRunStepRow[];
  Agents: readonly MJAIAgentEntityExtended[];
  Presets?: readonly MJAIAgentConfigurationEntity[];
}): Map<string, MessageHandoffInfo> {
  const {
    Messages: messages,
    AgentRunsByDetailId: agentRunsByDetailId,
    HandoffSteps: handoffSteps,
    Agents: agents,
    Presets: presets = [],
  } = params;

  const result = new Map<string, MessageHandoffInfo>();
  if (handoffSteps.length === 0 || agentRunsByDetailId.size === 0) {
    return result;
  }

  const stepsByRunKey = new Map<string, HandoffRunStepRow[]>();
  for (const step of handoffSteps) {
    if (!step.AgentRunID) continue;
    if (step.StepType && step.StepType !== 'Handoff') continue;
    const key = NormalizeUUID(step.AgentRunID);
    const list = stepsByRunKey.get(key) ?? [];
    list.push(step);
    stepsByRunKey.set(key, list);
  }

  for (const list of stepsByRunKey.values()) {
    list.sort((a, b) => (a.StepNumber ?? 0) - (b.StepNumber ?? 0));
  }

  const messagesById = IndexByUUID(messages);
  const presetsById = IndexByUUID(presets);
  const defaultPresetsByAgentKey = new Map<string, MJAIAgentConfigurationEntity>();
  for (const p of presets) {
    if (p.Status === 'Active' && p.IsDefault && p.AgentID) {
      const key = NormalizeUUID(p.AgentID);
      if (!defaultPresetsByAgentKey.has(key)) {
        defaultPresetsByAgentKey.set(key, p);
      }
    }
  }

  for (const [detailId, agentRun] of agentRunsByDetailId.entries()) {
    const runSteps = stepsByRunKey.get(NormalizeUUID(agentRun.ID));
    if (!runSteps || runSteps.length === 0) {
      continue;
    }

    const completedSteps = runSteps.filter(s => s.Status === 'Completed');
    const chosenStep =
      completedSteps.length > 0
        ? completedSteps[completedSteps.length - 1]
        : runSteps[runSteps.length - 1];

    const isFailed = chosenStep.Status === 'Failed' && completedSteps.length === 0;
    const input = parseJsonSafe<ParsedHandoffInput>(chosenStep.InputData);
    const output = parseJsonSafe<ParsedHandoffOutput>(chosenStep.OutputData);

    const sourceDetail = messagesById.Get(detailId);
    const sourceAgentId = sourceDetail?.AgentID || agentRun.AgentID || null;
    const sourceFallbackName = sourceDetail?.Agent || agentRun.Agent || 'Sage';
    const sourceParticipant = resolveParticipant(sourceAgentId, sourceFallbackName, agents);

    const targetAgentId =
      chosenStep.TargetID || output?.HandoffToAgentID || null;
    const targetFallbackName =
      output?.TargetAgentName ||
      output?.AgentName ||
      input?.agentName ||
      chosenStep.StepName?.replace(/^Handoff:\s*/i, '').trim() ||
      'Agent';
    const targetParticipant = resolveParticipant(targetAgentId, targetFallbackName, agents);

    const explicitTargetDetailId = output?.TargetConversationDetailID ?? null;
    const targetDetail = isFailed
      ? undefined
      : (explicitTargetDetailId ? messagesById.Get(explicitTargetDetailId) : undefined) ??
        FindHandoffTargetDetail(detailId, targetParticipant.ID, messages);

    const resolvedTargetDetailId = targetDetail?.ID ?? explicitTargetDetailId ?? null;

    const status: AgentHandoffStatus = isFailed
      ? 'Failed'
      : DeriveHandoffStatus(
          'Transferred',
          detailId,
          targetParticipant.ID,
          resolvedTargetDetailId,
          messages
        );

    let presetName: string | null = null;
    if (!isFailed) {
      if (output?.PresetName?.trim()) {
        presetName = output.PresetName.trim();
      } else if (output?.PresetID) {
        const matchedPreset = presetsById.Get(output.PresetID);
        presetName = matchedPreset?.DisplayName || matchedPreset?.Name || null;
      } else if (targetParticipant.ID) {
        const defaultPreset =
          defaultPresetsByAgentKey.get(NormalizeUUID(targetParticipant.ID)) ??
          AIEngineBase.Instance.GetDefaultAgentConfigurationPreset(targetParticipant.ID);
        presetName = defaultPreset?.DisplayName || defaultPreset?.Name || null;
      }
    }

    const brief = output?.Brief ?? input?.brief ?? null;
    const reason = output?.Reason ?? input?.reason ?? null;
    const failureReason = isFailed
      ? output?.RefusalReason || chosenStep.ErrorMessage || 'Transfer could not complete'
      : null;

    let hopChain: AgentHandoffParticipant[] | null = null;
    if (Array.isArray(output?.Chain) && output.Chain.length >= 2) {
      const chainParticipants = output.Chain.map(hopAgentId =>
        resolveParticipant(hopAgentId, null, agents)
      );
      chainParticipants.push(targetParticipant);
      hopChain = chainParticipants;
    }

    result.set(detailId, {
      SourceAgent: sourceParticipant,
      TargetAgent: targetParticipant,
      PresetName: presetName,
      Brief: brief,
      Reason: reason,
      Status: status,
      FailureReason: failureReason,
      HopChain: hopChain,
      TargetDetailId: resolvedTargetDetailId,
    });
  }

  return result;
}

/**
 * Resolves `MessageHandedOffFromInfo` for a target message row when its parent row handed off to it.
 */
export function ResolveHandedOffFromForMessage(
  message: MJConversationDetailEntity,
  handoffsByDetailId: ReadonlyMap<string, MessageHandoffInfo> | null | undefined
): MessageHandedOffFromInfo | null {
  if (!handoffsByDetailId || handoffsByDetailId.size === 0 || message.Role !== 'AI') {
    return null;
  }

  if (message.ParentID) {
    const parentHandoff = LookupHandoffByDetailId(handoffsByDetailId, message.ParentID);
    if (
      parentHandoff &&
      parentHandoff.Status !== 'Failed' &&
      (!parentHandoff.TargetAgent.ID ||
        !message.AgentID ||
        UUIDsEqual(parentHandoff.TargetAgent.ID, message.AgentID))
    ) {
      return {
        SourceAgent: parentHandoff.SourceAgent,
        TargetAgent: parentHandoff.TargetAgent,
        PresetName: parentHandoff.PresetName ?? null,
        Brief: parentHandoff.Brief ?? null,
        Reason: parentHandoff.Reason ?? null,
        HopChain: parentHandoff.HopChain ?? null,
        SourceDetailId: message.ParentID,
      };
    }
  }

  for (const [sourceDetailId, handoff] of handoffsByDetailId.entries()) {
    if (
      handoff.Status !== 'Failed' &&
      handoff.TargetDetailId &&
      UUIDsEqual(handoff.TargetDetailId, message.ID)
    ) {
      return {
        SourceAgent: handoff.SourceAgent,
        TargetAgent: handoff.TargetAgent,
        PresetName: handoff.PresetName ?? null,
        Brief: handoff.Brief ?? null,
        Reason: handoff.Reason ?? null,
        HopChain: handoff.HopChain ?? null,
        SourceDetailId: sourceDetailId,
      };
    }
  }

  return null;
}

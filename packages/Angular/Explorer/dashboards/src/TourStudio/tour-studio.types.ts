import type { CompositeFilterDescriptor } from '@memberjunction/core';
import type {
  MJTourEntity,
  MJTourStepEntity,
  MJTourStepPathEntity,
  MJTourStepTypeEntity,
  MJTourSurfaceEntity,
  MJTourSurfaceTourEntity,
  MJTourVersionEntity,
  MJTourOverrideEntity,
  MJLearningPathEntity,
  MJLearningPathTourEntity,
} from '@memberjunction/core-entities';
import {
  HostSatisfiesCapabilities,
  type ITourAnchor,
  type ITourCompletion,
  type ITourLaunchPolicy,
  type ITourStepPrepare,
  type TourCapabilityRequirement,
  type TourCompletionCheckSpec,
  type TourDefinition,
  type TourGuideMode,
  type TourHostCapabilities,
  type TourOnMissingPolicy,
  type TourStepDefinition,
  type TourStepMode,
  type TourStepPathDefinition,
  type TourStepPlacement,
  type TourStepTypeKey,
} from '@memberjunction/tours-runtime';

export type TourStudioTab = 'catalog' | 'builder' | 'governance' | 'analytics';

export interface TourCatalogItem {
  Tour: MJTourEntity;
  ApplicationName: string | null;
  StepCount: number;
  LatestVersionNumber: number;
  AssignedSurfaces: MJTourSurfaceEntity[];
  TotalRuns: number;
  CompletedRuns: number;
  CompletionRatePct: number | null;
  GoalRatePct: number | null;
  HoldoutGoalRatePct: number | null;
  GoalLiftPct: number | null;
  AnchorHealthPct: number | null;
  CapabilityWarningCount: number;
}

export interface SchemaFieldDescriptor {
  Key: string;
  Title: string;
  Description: string;
  Type: 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'json';
  EnumValues: string[];
  DefaultValue: unknown;
}

export interface TourSurfaceCapabilityWarning {
  SurfaceID: string;
  SurfaceName: string;
  SurfaceType: MJTourSurfaceEntity['SurfaceType'];
  StepKey: string;
  StepTitle: string;
  MissingCapabilities: string[];
}

export interface ProposedAnchorResult {
  Strategy: 'Registered' | 'Semantic' | 'Role' | 'Selector';
  Key?: string;
  Entity?: string;
  Field?: string;
  Role?: string;
  Name?: string;
  Selector?: string;
  TagName: string;
  TextPreview: string;
  IsFragileSelector: boolean;
}

export interface GraphSvgNode {
  StepKey: string;
  Title: string;
  StepType: string;
  X: number;
  Y: number;
  Width: number;
  Height: number;
  IsStart: boolean;
  Selected: boolean;
}

export interface GraphSvgEdge {
  ID: string;
  FromStepKey: string;
  ToStepKey: string;
  Label: string;
  IsDefault: boolean;
  IsSyntheticLinear: boolean;
  PathD: string;
  LabelX: number;
  LabelY: number;
}

export interface GraphSvgData {
  Width: number;
  Height: number;
  Nodes: GraphSvgNode[];
  Edges: GraphSvgEdge[];
  Valid: boolean;
  HasCycle: boolean;
  UnknownStepRefs: Array<{ FromStepKey: string; ToStepKey: string }>;
  DuplicateStepKeys: string[];
}

export interface TourStepAnchorHealthRow {
  StepKey: string;
  StepTitle: string;
  TotalVisits: number;
  RegisteredCount: number;
  SemanticCount: number;
  RoleCount: number;
  SelectorCount: number;
  FailedCount: number;
  MissRatePct: number;
}

export interface GuideModeMetricRow {
  Mode: 'Visual' | 'Chat' | 'Voice';
  RunCount: number;
  CompletedCount: number;
  CompletionRatePct: number;
  GoalMetCount: number;
  GoalRatePct: number;
  AvgQuestionsPerRun: number;
}

export interface TourAnalyticsSummary {
  TourID: string;
  TourName: string;
  TotalRuns: number;
  StartedCount: number;
  CompletedCount: number;
  DismissedCount: number;
  AbandonedCount: number;
  GoalMetCount: number;
  CompletionRatePct: number;
  CompletersGoalRatePct: number;
  NonStartersCount: number;
  HoldoutCount: number;
  HoldoutGoalRatePct: number | null;
  GoalLiftPct: number | null;
  GuideModes: GuideModeMetricRow[];
  StepAnchorHealth: TourStepAnchorHealthRow[];
}

export interface LearningPathMemberView {
  Membership: MJLearningPathTourEntity;
  Tour: MJTourEntity | null;
}

export interface LearningPathView {
  Path: MJLearningPathEntity;
  Members: LearningPathMemberView[];
}

export interface OverrideView {
  Override: MJTourOverrideEntity;
  TourName: string;
  TargetLabel: string;
}

/**
 * Returns the runtime host capabilities implied by a `TourSurface` platform type,
 * used by Tour Studio to detect capability mismatches (e.g. a step requiring `MJForms`
 * or `EntityEvents` assigned to a `Web Page` surface).
 */
export function CapabilitiesForSurfaceType(surfaceType: MJTourSurfaceEntity['SurfaceType']): TourHostCapabilities {
  switch (surfaceType) {
    case 'MJ Angular App':
      return {
        Navigation: 'MJ App',
        EntityEvents: true,
        MJForms: true,
        Angular: true,
        Agent: 'Chat and Voice',
        Persistence: 'MJ User',
      };
    case 'Mobile App':
      return {
        Navigation: 'Url',
        EntityEvents: false,
        MJForms: false,
        Angular: false,
        Agent: 'Chat',
        Persistence: 'Guest',
      };
    case 'Web Page':
    default:
      return {
        Navigation: 'Url',
        EntityEvents: false,
        MJForms: false,
        Angular: false,
        Agent: 'None',
        Persistence: 'Guest',
      };
  }
}

/**
 * Computes required host capabilities for a tour step based on its StepType,
 * Mode, Anchor strategy, and Completion checks.
 */
export function InferStepRequiredCapabilities(
  step: MJTourStepEntity,
  stepTypeName: string | undefined,
): TourCapabilityRequirement {
  const req: TourCapabilityRequirement = {};
  const anchor = step.AnchorObject;
  const completion = step.CompletionObject;

  if (
    anchor?.Strategy === 'FormField' ||
    anchor?.Strategy === 'FormSection' ||
    anchor?.Strategy === 'FormRailGroup' ||
    anchor?.Strategy === 'FormToolbarAction'
  ) {
    req.MJForms = true;
    req.Navigation = ['MJ App'];
  }
  if (anchor?.Strategy === 'NavItem' || anchor?.Strategy === 'RailPage' || anchor?.Strategy === 'AppSwitcher') {
    req.Navigation = ['MJ App'];
  }
  if (completion?.Checks?.some((c) => c.Type === 'EntityEvent' || c.Type === 'FieldState')) {
    req.EntityEvents = true;
    req.MJForms = true;
  }
  if (stepTypeName === 'EmbeddedComponent') {
    req.Angular = true;
  }
  if (stepTypeName === 'AskAgent' || step.Mode === 'Do') {
    req.Agent = ['Chat', 'Chat and Voice'];
  }
  return req;
}

/**
 * Computes surface-capability mismatches across a tour's steps and assigned surfaces.
 */
export function ComputeSurfaceCapabilityWarnings(
  steps: readonly MJTourStepEntity[],
  stepTypeById: ReadonlyMap<string, MJTourStepTypeEntity>,
  assignedSurfaces: readonly MJTourSurfaceEntity[],
): TourSurfaceCapabilityWarning[] {
  const warnings: TourSurfaceCapabilityWarning[] = [];
  for (const surface of assignedSurfaces) {
    const hostCaps = CapabilitiesForSurfaceType(surface.SurfaceType);
    for (const step of steps) {
      const stName = stepTypeById.get(step.StepTypeID.toLowerCase())?.Name;
      const required = InferStepRequiredCapabilities(step, stName);
      const check = HostSatisfiesCapabilities(hostCaps, required);
      if (!check.Satisfied) {
        warnings.push({
          SurfaceID: surface.ID,
          SurfaceName: surface.Name,
          SurfaceType: surface.SurfaceType,
          StepKey: step.StepKey,
          StepTitle: step.Title,
          MissingCapabilities: check.Missing,
        });
      }
    }
  }
  return warnings;
}

interface JsonSchemaPropertyNode {
  type?: string;
  title?: string;
  description?: string;
  enum?: unknown[];
  default?: unknown;
}

interface JsonSchemaRoot {
  properties?: Record<string, JsonSchemaPropertyNode>;
}

/**
 * Parses `MJTourStepTypeEntity.ConfigSchema` JSON into UI-renderable field descriptors.
 */
export function ParseConfigSchemaFields(schemaJson: string | null | undefined): SchemaFieldDescriptor[] {
  if (!schemaJson || !schemaJson.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(schemaJson) as JsonSchemaRoot;
    const props = parsed.properties;
    if (!props || typeof props !== 'object') {
      return [];
    }
    const fields: SchemaFieldDescriptor[] = [];
    for (const [key, node] of Object.entries(props)) {
      if (!node || typeof node !== 'object' || key === 'localizations') {
        continue;
      }
      const enumVals = Array.isArray(node.enum) ? node.enum.map((v) => String(v)) : [];
      let fieldType: SchemaFieldDescriptor['Type'] = 'string';
      if (enumVals.length > 0) {
        fieldType = 'enum';
      } else if (node.type === 'boolean') {
        fieldType = 'boolean';
      } else if (node.type === 'integer') {
        fieldType = 'integer';
      } else if (node.type === 'number') {
        fieldType = 'number';
      } else if (node.type === 'object' || node.type === 'array') {
        fieldType = 'json';
      }
      fields.push({
        Key: key,
        Title: node.title ?? key,
        Description: node.description ?? '',
        Type: fieldType,
        EnumValues: enumVals,
        DefaultValue: node.default,
      });
    }
    return fields;
  } catch {
    return [];
  }
}

function normalizePlacement(p: MJTourStepEntity['Placement']): TourStepPlacement {
  switch (p) {
    case 'Top': return 'top';
    case 'Bottom': return 'bottom';
    case 'Left': return 'left';
    case 'Right': return 'right';
    case 'Center': return 'center';
    default: return 'auto';
  }
}

function normalizeOnMissing(m: MJTourStepEntity['OnMissing']): TourOnMissingPolicy {
  if (m === 'Agent Recover') return 'AgentRecover';
  if (m === 'Skip' || m === 'Center' || m === 'Stall') return m;
  return 'Center';
}

function normalizeGuideMode(m: MJTourEntity['DefaultGuideMode']): TourGuideMode {
  if (m === 'Chat' || m === 'Voice' || m === 'User Choice') return m;
  return 'Visual';
}

function toRuntimeAnchor(anchor: MJTourStepEntity['AnchorObject']): ITourAnchor | null {
  if (!anchor) return null;
  return {
    Strategy: anchor.Strategy as ITourAnchor['Strategy'],
    Key: anchor.Key,
    Entity: anchor.Entity,
    Field: anchor.Field,
    SectionKey: anchor.Section,
    RailKey: anchor.RailGroup,
    ActionKey: anchor.Action,
    AppName: anchor.Application,
    DriverClass: anchor.DriverClass,
    Role: anchor.Role,
    Name: anchor.Name,
    Selector: anchor.Selector,
    WaitTimeoutMs: anchor.TimeoutMs,
    Fallbacks: anchor.Fallbacks
      ?.map((fb) => ({
        Strategy: fb.Strategy as ITourAnchor['Strategy'],
        Key: fb.Key,
        Entity: fb.Entity,
        Field: fb.Field,
        Role: fb.Role,
        Name: fb.Name,
        Selector: fb.Selector,
      })),
  };
}

function toRuntimePrepare(prep: MJTourStepEntity['PrepareObject']): ITourStepPrepare | null {
  if (!prep) return null;
  return {
    ApplicationName: prep.Application,
    NavItemKey: prep.NavItem,
    RailKey: prep.RailPage ?? prep.RailGroup,
    SectionKey: prep.Section,
    EntityName: prep.Entity,
    RecordIdTemplate: prep.RecordID,
    Url: prep.Url,
  };
}

function toRuntimeCheck(check: NonNullable<MJTourStepEntity['CompletionObject']>['Checks'][number]): TourCompletionCheckSpec {
  const eventAction = check.Action?.toLowerCase();
  const mappedEventType: TourCompletionCheckSpec['EventType'] =
    eventAction === 'delete'
      ? 'delete'
      : eventAction === 'create'
        ? 'new_record'
        : eventAction === 'save' || eventAction === 'update'
          ? 'save'
          : undefined;
  return {
    Type: check.Type,
    SignalKey: check.Signal,
    Interaction: check.Event === 'submit' ? 'any' : check.Event,
    AppName: check.Application,
    NavItemKey: check.NavItem,
    EntityName: check.Entity,
    UrlPattern: check.RoutePattern,
    EventType: mappedEventType,
    FieldName: check.Field,
    PredicateKey: check.Predicate,
    PredicateParams: check.Params,
    Checks: check.Checks?.map((c) => toRuntimeCheck(c)),
  };
}

function toRuntimeCompletion(comp: MJTourStepEntity['CompletionObject']): ITourCompletion | null {
  if (!comp) return null;
  return {
    Checks: (comp.Checks ?? []).map((c) => toRuntimeCheck(c)),
    Match: comp.Mode ?? 'All',
  };
}

function parseSkipWhen(raw: string | null): ITourCompletion | CompositeFilterDescriptor | null {
  if (!raw || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as ITourCompletion | CompositeFilterDescriptor;
  } catch {
    return null;
  }
}

/**
 * Converts Tour Studio's edited `MJTourEntity` + steps + paths into a runtime
 * `TourDefinition` for graph compilation, cycle validation, and live preview.
 */
export function BuildTourDefinitionFromEntities(
  tour: MJTourEntity,
  steps: readonly MJTourStepEntity[],
  paths: readonly MJTourStepPathEntity[],
  stepTypeById: ReadonlyMap<string, MJTourStepTypeEntity>,
  versions: readonly MJTourVersionEntity[],
): TourDefinition {
  const orderedSteps = [...steps].sort((a, b) => a.Sequence - b.Sequence);
  const stepById = new Map<string, MJTourStepEntity>(orderedSteps.map((s) => [s.ID.toLowerCase(), s]));

  const stepDefs: TourStepDefinition[] = orderedSteps.map((s) => {
    const stepType = stepTypeById.get(s.StepTypeID.toLowerCase());
    const typeKey = (stepType?.Name ?? 'Spotlight') as TourStepTypeKey;
    const cfg = (s.ConfigurationObject ?? {}) as Record<string, unknown>;
    return {
      ID: s.ID,
      StepKey: s.StepKey,
      Sequence: s.Sequence,
      StepType: typeKey,
      DriverClass: s.DriverClass ?? stepType?.DriverClass ?? undefined,
      Title: s.Title,
      Body: s.Body ?? '',
      Configuration: cfg as TourStepDefinition['Configuration'],
      Anchor: toRuntimeAnchor(s.AnchorObject),
      Placement: normalizePlacement(s.Placement),
      Mode: s.Mode as TourStepMode,
      Prepare: toRuntimePrepare(s.PrepareObject),
      Completion: toRuntimeCompletion(s.CompletionObject),
      SkipWhen: parseSkipWhen(s.SkipWhen),
      OnMissing: normalizeOnMissing(s.OnMissing),
      IsOptional: s.IsOptional,
      GuideNotes: s.GuideNotes ?? undefined,
    };
  });

  const pathDefs: TourStepPathDefinition[] = [];
  for (const p of [...paths].sort((a, b) => a.Sequence - b.Sequence)) {
    const fromStep = stepById.get(p.FromStepID.toLowerCase());
    const toStep = stepById.get(p.ToStepID.toLowerCase());
    if (!fromStep || !toStep) {
      continue;
    }
    pathDefs.push({
      ID: p.ID,
      FromStepKey: fromStep.StepKey,
      ToStepKey: toStep.StepKey,
      Condition: p.Condition ?? null,
      Label: p.Label ?? undefined,
      Priority: p.Priority,
      IsDefault: p.IsDefault,
    });
  }

  const versionRow = tour.CurrentVersionID
    ? versions.find((v) => v.ID.toLowerCase() === tour.CurrentVersionID?.toLowerCase())
    : undefined;

  return {
    ID: tour.ID,
    TourKey: tour.TourKey,
    Name: tour.Name,
    Description: tour.Description ?? undefined,
    VersionNumber: versionRow?.VersionNumber ?? 0,
    CurrentVersionID: tour.CurrentVersionID ?? undefined,
    ApplicationID: tour.ApplicationID,
    ApplicationName: tour.Application ?? null,
    Status: tour.Status,
    RunInAuthenticatedHosts: tour.RunInAuthenticatedHosts,
    EstimatedMinutes: tour.EstimatedMinutes ?? undefined,
    AudienceFilter: tour.AudienceFilter ?? null,
    LaunchPolicy: (tour.LaunchPolicyObject ?? {}) as ITourLaunchPolicy,
    Priority: tour.Priority,
    ThrottleTags: tour.ThrottleTags ? tour.ThrottleTags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    DefaultGuideMode: normalizeGuideMode(tour.DefaultGuideMode),
    AllowAgentActions: tour.AllowAgentActions,
    GuideAgentID: tour.GuideAgentID ?? null,
    DriverClass: tour.DriverClass ?? null,
    PresenterClass: tour.PresenterClass ?? null,
    StartLocation: tour.StartLocationObject
      ? {
          ApplicationName: tour.StartLocationObject.Application,
          NavItemKey: tour.StartLocationObject.NavItem,
          EntityName: tour.StartLocationObject.Entity,
          RequireOpenRecord: tour.StartLocationObject.RequiresOpenRecord,
          UrlPattern: tour.StartLocationObject.UrlPattern,
        }
      : null,
    Steps: stepDefs,
    Paths: pathDefs,
    Configuration: (tour.ConfigurationObject ?? undefined) as TourDefinition['Configuration'],
  };
}

/**
 * @fileoverview Whether a Flow agent would run as it stands, asked of the runtime itself.
 *
 * The editor keeps no rules of its own about what a flow may say. It compiles the flow with the
 * runtime's compiler (`CompileFlowToTaskGraph`) and checks the result with the runtime's validator
 * (`ValidateTaskGraphSpec`) — the two calls the dispatcher makes before it runs a flow, and refuses
 * the whole flow on — and places each refusal on the step or path it is about. So a path that reads
 * a question the step no longer asks, or a field its kind does not have (`.value` of a Likelihood),
 * is flagged while the author can still see why, not when a run fails. That includes a path that
 * tests a Choice answer against a value the question does not offer — a typo, or an option renamed
 * outside this editor — which the validator refuses on any edge.
 */
import { UUIDsEqual } from '@memberjunction/global';
import {
  CompileFlowToTaskGraph,
  NormalizeDependency,
  TaskNode,
  ValidateTaskGraphSpec,
  type FlowCompileError,
  type FlowCompilerPath,
  type FlowCompilerStep,
  type TaskGraphSpec,
  type TaskGraphSpecNode,
  type TaskGraphValidationError
} from '@memberjunction/ai-core-plus';

/** Why the flow would not run as it stands, placed where its author will look for it. */
export type FlowRunProblem = {
  /** The runtime's code for the problem. */
  Code: FlowCompileError['Code'] | TaskGraphValidationError['Code'];
  /** The runtime's message, naming steps by name and quoting conditions as the author wrote them. */
  Message: string;
  /** The step the problem is on, when it is on one. */
  StepID?: string;
  /** The path whose condition is at fault, when it is one path's. */
  PathID?: string;
};

/**
 * Codes a step already reports through its own configuration warning — the Decision reader's message,
 * or "No action selected" — so a view of the step does not say them twice. They stay in the full list.
 */
export const STEP_CONFIGURATION_CODES: ReadonlyArray<FlowRunProblem['Code']> = ['InvalidDecisionStep', 'UnresolvedReference'];

/** The problems on a step itself, less those its own configuration warning already reports. */
export function StepRunProblems(problems: readonly FlowRunProblem[], stepID: string | null | undefined): FlowRunProblem[] {
  return stepID
    ? problems.filter((p) => !p.PathID && UUIDsEqual(p.StepID, stepID) && !STEP_CONFIGURATION_CODES.includes(p.Code))
    : [];
}

/** The problems with one path's condition. */
export function PathRunProblems(problems: readonly FlowRunProblem[], pathID: string | null | undefined): FlowRunProblem[] {
  return pathID ? problems.filter((p) => UUIDsEqual(p.PathID, pathID)) : [];
}

/** A path's condition, checked on its own task so a problem lands on the path rather than its destination. */
type PathProbe = {
  Path: FlowCompilerPath;
  Task: TaskGraphSpecNode;
  /** The condition as compiled, naming Decision steps by step ID. */
  Compiled: string;
};

/** Prefixes a probe task's ID, so it cannot collide with a step's. */
const PROBE_PREFIX = 'path-check:';

/**
 * Every reason the flow would not run as it stands. Empty when the dispatcher would accept it.
 *
 * Compile problems come first and, like the dispatcher, stop there: a flow that does not compile has
 * no graph to validate.
 *
 * @param steps the flow's steps (`MJAIAgentStepEntity` satisfies the shape as-is)
 * @param paths the flow's paths (`MJAIAgentStepPathEntity` satisfies the shape as-is)
 */
export function CheckFlowRun(steps: readonly FlowCompilerStep[], paths: readonly FlowCompilerPath[]): FlowRunProblem[] {
  const compiled = CompileFlowToTaskGraph(steps, paths, {
    WorkflowName: 'Flow',
    // Whether a referenced action, prompt or agent still exists is the server's to say — the editor's
    // pickers need not list every row the runtime can run — so names resolve to the IDs here and only
    // the flow's own shape is checked. A reference that was never set is still reported.
    ResolveAgentName: (id) => id,
    ResolveActionName: (id) => id,
    ResolvePromptName: (id) => id,
    // What the dispatcher compiles a flow with (`CompileFlowAgentToTaskGraph`).
    TraversalMode: 'sequential'
  });
  return compiled.Success && compiled.Spec
    ? validationProblems(compiled.Spec, paths)
    : compiled.Errors.map((error) => compileProblem(error, paths));
}

/** A compile error, on the path it quotes when it is about one path's condition. */
function compileProblem(error: FlowCompileError, paths: readonly FlowCompilerPath[]): FlowRunProblem {
  const path = error.Code === 'UnknownDecisionKey'
    ? paths.find((p) => UUIDsEqual(p.OriginStepID, error.StepID) && !!p.Condition?.trim() && error.Message.endsWith(p.Condition))
    : undefined;
  return { Code: error.Code, Message: error.Message, StepID: error.StepID, PathID: path?.ID };
}

/**
 * The validator's refusals of the compiled flow.
 *
 * The validator names the task a condition guards, not the edge that carries it, so conditions are
 * validated again on probes (see {@link conditionProblems}); every other refusal comes from validating
 * the compiled graph as the dispatcher does.
 */
function validationProblems(spec: TaskGraphSpec, paths: readonly FlowCompilerPath[]): FlowRunProblem[] {
  const named = stepNamer(spec);
  const graph = ValidateTaskGraphSpec(spec).Errors
    .filter((error) => error.Code !== 'InvalidCondition')
    .map((error): FlowRunProblem => ({ Code: error.Code, Message: named(error.Message), StepID: error.TempId }));
  return [...graph, ...conditionProblems(spec, paths, named)];
}

/**
 * Every condition's refusals, each on the path it belongs to.
 *
 * Validates the compiled graph's tasks without their edges, plus one probe task per conditional path
 * that waits on the path's origin under the path's compiled condition. It is the same validator over
 * the same conditions and the same Decision steps; only where each refusal lands differs. A While
 * step's loop condition stays on its own task, and is reported on that step.
 */
function conditionProblems(
  spec: TaskGraphSpec,
  paths: readonly FlowCompilerPath[],
  named: (message: string) => string
): FlowRunProblem[] {
  const probes = pathProbes(spec, paths);
  const probed: TaskGraphSpec = {
    ...spec,
    tasks: [...spec.tasks.map((task) => ({ ...task, dependsOn: [] })), ...probes.map((probe) => probe.Task)]
  };
  return ValidateTaskGraphSpec(probed).Errors
    .filter((error) => error.Code === 'InvalidCondition')
    .map((error): FlowRunProblem => {
      const probe = probes.find((p) => p.Task.tempId === error.TempId);
      if (!probe) return { Code: error.Code, Message: named(error.Message), StepID: error.TempId };
      // The condition is quoted as the author wrote it — keys, not step IDs — and left untouched by the naming.
      const message = error.Message.split(probe.Compiled).map(named).join(probe.Path.Condition ?? '');
      return { Code: error.Code, Message: message, StepID: probe.Path.OriginStepID, PathID: probe.Path.ID };
    });
}

/** One probe per conditional path, matched to the dependency the compiler emitted for it. */
function pathProbes(spec: TaskGraphSpec, paths: readonly FlowCompilerPath[]): PathProbe[] {
  const probes: PathProbe[] = [];
  const matched = new Set<FlowCompilerPath>();
  for (const task of spec.tasks) {
    for (const dependency of (task.dependsOn ?? []).map(NormalizeDependency)) {
      if (!dependency.condition) continue;
      // The compiler emits one dependency per path, in path order, so each is the first unmatched path
      // between the same two steps.
      const path = paths.find((p) =>
        !matched.has(p) && !!p.Condition?.trim()
        && UUIDsEqual(p.OriginStepID, dependency.tempId) && UUIDsEqual(p.DestinationStepID, task.tempId));
      if (!path) continue;
      matched.add(path);
      probes.push({
        Path: path,
        Compiled: dependency.condition,
        Task: TaskNode.Human({
          tempId: `${PROBE_PREFIX}${path.ID}`,
          name: task.name,
          description: '',
          dependsOn: [{ tempId: dependency.tempId, condition: dependency.condition }]
        })
      });
    }
  }
  return probes;
}

/**
 * Replaces each step ID in a runtime message with the step's name, as the agent does when it refuses a
 * flow. One pass, so a name is never itself rewritten.
 */
function stepNamer(spec: TaskGraphSpec): (message: string) => string {
  const nameByID = new Map(spec.tasks.filter((task) => task.tempId && task.name).map((task) => [task.tempId, task.name]));
  if (nameByID.size === 0) return (message) => message;
  const ids = new RegExp([...nameByID.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'), 'g');
  return (message) => message.replace(ids, (id) => nameByID.get(id) ?? id);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

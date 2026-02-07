PRD + Architecture: MemberJunction Computer Use (Vision→Action) Capability

Start point for scope: This document covers everything discussed from the moment we rejoined the conversation with Caleb present (starting at: “Of course! Hi Caeleb, it’s great to have you in the loop…”) through the end of today’s audio discussion.

Authors / stakeholders:
	•	Product / Architecture: Amith Nagarajan
	•	Implementation lead (prototype + initial integration): Caleb
	•	Assistant: ChatGPT (to synthesize into PRD/architecture)

Last updated: 2026-02-06

⸻

1. Executive Summary

We are productizing a Computer Use capability in MemberJunction (MJ): a Vision→Action framework that can control a web browser to perform tasks based on visual inputs (screenshots) and natural language instructions. The capability is already proven in a prototype and integrated into MJ; now we will harden the architecture with clean layering and separation of concerns.

Key outcomes:
	•	A standalone, reusable TypeScript package (lowest-level) providing the core Computer Use primitives without MJ-specific dependencies or persistence.
	•	An MJ-aware wrapper layer that leverages MJ’s prompt infrastructure, logging, and action ecosystem.
	•	A first-class MJ Action that wraps Computer Use so any MJ agent can invoke it.
	•	A first-class MJ Test Type that exposes Computer Use as a configurable test primitive inside MJ’s testing framework (tests + suites).
	•	A robust authentication model spanning built-in auth types, MJ Credentials integration, and custom auth callbacks.

⸻

2. Problem Statement

We need a durable, reusable, and safe way for MJ and its ecosystem to:
	1.	Drive browser-based workflows using an LLM (or any model) from visual context, and
	2.	Use that capability broadly across MJ:
	•	Regression testing (primary near-term use)
	•	UI verification of outcomes produced by non-UI automated tests (API-driven)
	•	General “computer use” as a primitive invoked by other MJ agents

The prototype works, but the current implementation lacks a fully intentional architecture with layered boundaries, extensibility, and integration points for MJ’s prompt and action systems.

⸻

3. Goals / Non-Goals

3.1 Goals

G1. Layered architecture with strict separation of concerns.

G2. Lowest-level library is MJ-independent (no DB/persistence, no MJ prompt entities, no MJ action engine), while still using minimal MJ shared foundations (core/global + base AI).

G3. Prompting is configurable (defaults provided, caller can override). Multiple prompts supported:
	•	Main agent loop prompt (planner/controller)
	•	Judge prompt (evaluate state, determine completion, provide feedback)

G4. Model/provider is configurable per prompt (model name + inference vendor/provider).

G5. Tool use / function callbacks is fully supported with strong typing:
	•	Tool: name, description, input schema(s), output schema(s)
	•	Tools can be provided by the caller

G6. MJ-aware wrapper can leverage:
	•	MJ prompt libraries and prompt entities
	•	MJ prompt-runner infrastructure (templating, variables, Nunjucks)
	•	Prompt run logging

G7. MJ-aware wrapper can auto-infuse MJ Actions into tool calling:
	•	Accept list of MJ Actions
	•	Dynamically generate function tools that route through MJ Action Engine

G8. Computer Use becomes an MJ Action (“Computer Use Action”) so any MJ agent can invoke it.

G9. Computer Use becomes a Test Type in MJ testing framework:
	•	Tests store parameters that map to Computer Use Agent run parameters
	•	Test suites execute these reliably

G10. Robust authentication support:
	•	Built-in auth union type in base layer
	•	Optional “LLM-login” path for fake credentials (testing)
	•	Custom auth callback with Playwright instance
	•	MJ Credentials entity integration in wrapper layer

G11. Headless vs visible browser support (Playwright setting), controlled via run params.

3.2 Non-Goals (for this phase)

NG1. We are not defining Computer Use as a new MJ Agent Type right now.
	•	It will be implemented as an Action that any agent can invoke.
	•	Future possibility: agent type (documented as an extension).

NG2. We are not building MFA-bypassing automation for real production identity providers.
	•	For automated testing, we use dedicated testing auth (e.g., Auth0 tenant w/ username/password, no MFA), or MJ credentials + custom callbacks.

NG3. We are not committing to a single model provider.
	•	The system must remain model-agnostic.

⸻

4. Personas & Primary Use Cases

4.1 Personas

P1. MJ Developer (internal / open-source contributor)
	•	Wants an embeddable Computer Use library for integration or experimentation.

P2. MJ QA / Test Engineer
	•	Defines tests in MJ’s testing framework.
	•	Needs stable configuration, suites, and logging.

P3. MJ Agent / Workflow Author
	•	Builds an agent that can call actions.
	•	Wants “computer use” as a primitive action when UI steps are required.

4.2 Primary Use Cases

UC1. UI Regression Test (primary)
	•	Given an English test description + allowed domains + tools/actions + auth, the system runs browser steps and reports pass/fail with supporting evidence.

UC2. UI Verification of API-driven test
	•	Another test performs API calls; afterward Computer Use checks the UI reflects the expected outcome.

UC3. General agent invocation
	•	Any MJ agent decides to invoke Computer Use Action to accomplish a UI-based objective.

⸻

5. User Stories & Acceptance Criteria

5.1 Base Library (ComputerUseBase / ComputerUseTool)

US-B1. As a developer, I can call ComputerUse.run(params) with minimal dependencies and no MJ environment.
	•	AC: Package can be used outside MJ.
	•	AC: No DB or persistence required.

US-B2. As a developer, I can override prompts (controller + judge) via params.
	•	AC: Defaults exist.
	•	AC: Caller-provided text prompts replace defaults.

US-B3. As a developer, I can configure model/provider per prompt.
	•	AC: Params include { vendor, model } (or similar) for controller and judge.

US-B4. As a developer, I can provide tools with typed schemas and callbacks.
	•	AC: Tools have name, description, inputSchemas[], outputSchema.
	•	AC: Model can call tools; runtime dispatches to callback.

US-B5. As a developer, I can provide an override promptRunner callback.
	•	AC: If not provided, base library calls the model directly (default behavior).
	•	AC: If provided, base library uses callback for prompt execution.

US-B6. As a developer, I can supply authentication in multiple ways.
	•	AC: Built-in union auth types supported.
	•	AC: Custom auth callback supported and receives Playwright objects at the right lifecycle moment.

US-B7. As a developer, I can select headless vs visible mode.
	•	AC: Param controls Playwright launch/headless mode.

5.2 MJ Wrapper (ComputerUseAgent)

US-A1. As an MJ developer, I can run Computer Use using MJ Prompt entities.
	•	AC: Instead of raw prompt text, caller can supply MJ prompt entity references.

US-A2. As an MJ developer, I can get prompt-run logging automatically.
	•	AC: Prompt execution logs are produced via MJ infrastructure.

US-A3. As an MJ developer, I can pass MJ Actions and have them automatically exposed as tools.
	•	AC: Each action becomes a callable tool.
	•	AC: Tool invocation routes to Action Engine.

US-A4. As an MJ developer, I can provide MJ Credentials entity references for secrets.
	•	AC: Secrets are decrypted server-side and supplied at runtime.
	•	AC: Base layer receives concrete auth parameters (or auth callback) derived from credentials.

5.3 MJ Action (ComputerUseAction)

US-C1. As an MJ agent author, I can invoke Computer Use as a standard action.
	•	AC: Action inputs match ComputerUseAgent run params.
	•	AC: Supports domain allow/deny lists, tools/actions, auth, headless/visible.

5.4 MJ Test Type (ComputerUseTestType)

US-T1. As a QA engineer, I can create tests of type “Computer Use” and store all configuration.
	•	AC: Test properties map to full run params.

US-T2. As a QA engineer, I can group Computer Use tests into test suites and run them.
	•	AC: Suite runner executes tests and aggregates results.

US-T3. As a QA engineer, I can specify at least:
	•	starting URL/domain
	•	instruction/prompt or prompt entity
	•	domain allow/deny
	•	auth configuration (including MJ credentials)
	•	tools/actions allowed
	•	headless/visible
	•	pass/fail criteria (via judge)

⸻

6. Architecture Overview (Layering)

We will implement four “product surfaces” with two core library layers.
	1.	ComputerUseBase (lowest-level, MJ-independent)
	2.	ComputerUseAgent (MJ-aware wrapper)
	3.	ComputerUseAction (MJ Action wrapper)
	4.	ComputerUseTestType (MJ testing framework integration)

6.1 Component Diagram (Mermaid)

flowchart TB
  subgraph L1[Layer 1: ComputerUseBase (MJ-independent TS package)]
    CUB[ComputerUseBase / ComputerUseTool]
    PR[Default Prompt Runner
(model direct calls)]
    TE[Tool Execution (callbacks)]
    AE[Auth Engine (union types + callback)]
    PW[Playwright Adapter]
    V[Vision Capture (screenshots)]
    JL[Judge Loop]
    CL[Controller/Planner Loop]
  end

  subgraph L2[Layer 2: ComputerUseAgent (MJ-aware wrapper)]
    CUA[ComputerUseAgent]
    MJPR[MJ Prompt Runner + Logging]
    MJP[MJ Prompt Entities (templates, Nunjucks)]
    MJA[MJ Actions Catalog]
    AENG[MJ Action Engine]
    CREDS[MJ Credentials Entity]
  end

  subgraph L3[Layer 3: ComputerUseAction (MJ Action)]
    CUACTION[ComputerUseAction]
  end

  subgraph L4[Layer 4: ComputerUseTestType (MJ Testing)]
    CUTT[ComputerUse Test Type]
    TESTS[Tests]
    SUITES[Test Suites]
    RUNNER[Test Runner]
  end

  CUB --> PW
  CUB --> V
  CUB --> CL
  CUB --> JL
  CUB --> TE
  CUB --> AE
  CUB --> PR

  CUA --> CUB
  CUA --> MJPR
  CUA --> MJP
  CUA --> MJA
  CUA --> AENG
  CUA --> CREDS

  CUACTION --> CUA
  CUTT --> CUA
  RUNNER --> CUTT
  SUITES --> TESTS
  RUNNER --> SUITES


⸻

7. Layer 1: ComputerUseBase (MJ-independent TS package)

7.1 Purpose

A standalone, reusable package under the MJ AI umbrella named Computer Use (package name TBD). It provides:
	•	Vision→Action loop orchestration
	•	Playwright integration
	•	Screenshot capture
	•	Tool use via function callbacks (schema-driven)
	•	Judge loop concept
	•	Authentication primitives

7.2 Dependency constraints
	•	Allowed MJ dependency chain:
	•	ComputerUseBase depends on MJ base AI library
	•	Which depends only on core/global libraries
	•	No dependencies on:
	•	MJ database
	•	MJ prompt entities
	•	MJ action engine
	•	MJ persistence/logging systems
	•	External dependencies should remain lightweight (e.g., RxJS allowed)

7.3 Primary class
	•	ComputerUse (or ComputerUseBase) as the primary class.
	•	Primary entry method: run(params).

7.4 Run Params (high-level)

The run params object must support:

A) Prompt configuration
	•	controllerPrompt (default + override)
	•	judgePrompt (default + override)

B) Model configuration per prompt
	•	controllerModel: { vendor: string, model: string }
	•	judgeModel: { vendor: string, model: string }

C) Tool configuration
	•	tools?: ComputerUseTool[]
	•	Each tool:
	•	name
	•	description
	•	input schema(s) (currently array)
	•	output schema (to be added)
	•	callback implementation

D) Prompt runner override (critical architectural hook)
	•	promptRunner?: (request) => Promise<PromptResult>
	•	If undefined: base runs prompt directly using vendor/model.
	•	If defined: base delegates prompt execution to callback.

E) Authentication
	•	auth?: AuthConfigUnion
	•	authCallback?: (ctx: AuthCallbackContext) => Promise<void>
	•	Receives Playwright instances and can set cookies/local storage/headers/etc.

F) Browser settings
	•	headless?: boolean (default true in Node)
	•	Playwright settings as needed (timeouts, viewport, user-agent, etc.)

G) Safety settings
	•	allowedDomains?: string[]
	•	blockedDomains?: string[]
	•	Additional navigation guardrails as needed

H) Flow control
	•	maxSteps?: number
	•	Screenshot history depth
	•	Retry policy (optional)

7.5 Controller and Judge concepts
	•	Controller loop: produces action plans and tool calls.
	•	Judge loop (Caleb’s concept): evaluates progress and completion, can provide feedback to controller.

We will treat Judge as first-class:
	•	separate prompt
	•	separate model configuration
	•	optional execution frequency (every step, every N steps, on suspicion of stuck state)

7.6 Tool Use model
	•	Base layer exposes a tool model compatible with function/tool calling.
	•	Tools supplied by caller (or generated by higher layer).
	•	Schema-driven inputs/outputs.

7.7 Authentication model (base layer)

Base layer supports authentication in three ways:
	1.	Built-in auth union types (examples)

	•	BasicAuth: username/password (for HTTP basic or form login as guided)
	•	Token/JWT-based: bearer tokens, custom headers
	•	OAuth variants: token + metadata
	•	Cookie/session injection
	•	Local storage injection

	2.	“LLM-driven login” (testing)

	•	Provide fake credentials
	•	Allow the model to navigate login UI and sign in

	3.	Custom auth callback

	•	Caller provides a function
	•	Base passes Playwright instances (page/context/browser)
	•	Callback runs at a defined lifecycle moment

Lifecycle placement:
	•	Auth should occur after browser context creation and before main loop actions, and/or on navigation to a target domain.

7.8 Base layer runtime flow (Mermaid)

sequenceDiagram
  participant Caller
  participant CUB as ComputerUseBase
  participant PW as Playwright
  participant PR as PromptRunner (default or override)
  participant Tools as ToolCallbacks
  participant Judge as Judge Prompt

  Caller->>CUB: run(params)
  CUB->>PW: launch(headless?)
  PW-->>CUB: browser/context/page

  alt auth config present
    CUB->>CUB: apply built-in auth (headers/localStorage/cookies)
  end

  alt authCallback provided
    CUB->>Caller: authCallback({browser, context, page, params})
  end

  loop step until done/maxSteps
    CUB->>PW: screenshot()
    PW-->>CUB: image

    CUB->>PR: controllerPrompt(goal, state, image, tools)
    PR-->>CUB: planned actions + optional tool calls

    alt tool calls exist
      CUB->>Tools: execute(toolName, args)
      Tools-->>CUB: tool result
      CUB->>PR: follow-up w/ tool result (if needed)
    end

    CUB->>PW: execute actions (click/type/navigate/etc.)

    CUB->>PR: judgePrompt(goal, state, evidence)
    PR-->>CUB: {done?, feedback}

    alt not done
      CUB->>CUB: incorporate judge feedback into next controller context
    end
  end

  CUB-->>Caller: run result (success/failure, logs, artifacts)


⸻

8. Layer 2: ComputerUseAgent (MJ-aware wrapper)

8.1 Purpose

A wrapper around ComputerUseBase that leverages MJ’s infrastructure:
	•	Prompt entities + template system (Nunjucks)
	•	MJ prompt runner + logging of prompt runs
	•	MJ Actions catalog and action engine
	•	MJ Credentials entity for encrypted secrets

This is the primary layer used within MJ because it provides robust management and observability.

8.2 Prompt management

Instead of supplying raw prompt text, callers can supply:
	•	Prompt entity references (MJ entities)
	•	Or override raw prompt text

Agent layer resolves prompt entities to rendered text using MJ prompt runner.

8.3 Critical integration hook: promptRunner callback

Because ComputerUseBase must remain MJ-independent, it cannot directly use MJ prompt infrastructure. Therefore:
	•	ComputerUseBase supports promptRunner override callback.
	•	ComputerUseAgent provides that callback.
	•	Inside callback, ComputerUseAgent uses MJ prompt runner and logging.

This enables full MJ behavior without contaminating base layer.

8.4 Auto-infusing MJ Actions as tools

ComputerUseAgent accepts:
	•	tools?: ComputerUseTool[] (function callbacks)
	•	actions?: BaseAction[] | ActionRef[] (MJ Actions)

If actions are provided:
	•	Generate an anonymous tool function per action:
	•	Name: derived from action name
	•	Description: derived from action description
	•	Input schema: derived from action parameter metadata
	•	Output schema: derived from action output metadata
	•	Tool callback routes to MJ Action Engine.

This provides a unified tool paradigm to the base layer.

8.5 Credentials integration

ComputerUseAgent can accept credentials references:
	•	credentialsId / Credential entity references

Behavior:
	•	Decrypt secrets server-side.
	•	Translate to base layer auth config union OR a custom auth callback.
	•	Pass concrete auth info into ComputerUseBase.

8.6 Agent layer flow (Mermaid)

sequenceDiagram
  participant Caller
  participant CUA as ComputerUseAgent
  participant MJPR as MJ Prompt Runner
  participant MJA as MJ Action Engine
  participant CUB as ComputerUseBase

  Caller->>CUA: run(agentParams)

  CUA->>CUA: resolve prompts (text or MJ prompt entities)
  CUA->>CUA: resolve creds (MJ Credentials -> auth config/callback)
  CUA->>CUA: wrap MJ Actions into Tools (dynamic functions)

  CUA->>CUB: run(baseParams + promptRunnerOverride)

  note over CUA,CUB: promptRunnerOverride calls MJPR and logs runs

  CUB->>CUA: promptRunnerOverride(request)
  CUA->>MJPR: run prompt (templated, logged)
  MJPR-->>CUA: completion
  CUA-->>CUB: completion

  CUB->>CUA: tool call for MJ Action tool
  CUA->>MJA: execute action
  MJA-->>CUA: action result
  CUA-->>CUB: tool result

  CUB-->>CUA: base run result
  CUA-->>Caller: final result (with MJ logs/metadata)


⸻

9. Layer 3: ComputerUseAction (MJ Action wrapper)

9.1 Purpose

We create a first-class MJ Action:
	•	Name: Computer Use Action
	•	Implementation: thin wrapper around ComputerUseAgent

Why:
	•	Any MJ agent can invoke actions.
	•	Makes “computer use” a universal primitive available system-wide.

9.2 Action inputs

The action should accept the same configuration as ComputerUseAgent run params, including:
	•	Instructions / goal
	•	Prompt overrides or MJ prompt entity references
	•	Allowed/blocked domains
	•	Tools and/or MJ Actions
	•	Auth configuration (including credentials references)
	•	Browser visibility (headless vs visible)

9.3 Action outputs

Should return:
	•	success/failure
	•	artifacts (screenshots, trace if enabled)
	•	step log
	•	judge outcomes
	•	errors

9.4 Note on Agent Type

We explicitly document:
	•	Not implementing a new “Computer Use Agent Type” right now.
	•	Implementing as Action for maximum composability.
	•	Future option: wrap as an agent type later if desired.

⸻

10. Layer 4: ComputerUseTestType (MJ Testing Framework)

10.1 Purpose

We productize Computer Use inside MJ testing framework via a Test Type:
	•	Name: Computer Use Test Type
	•	Integrates with existing MJ concepts:
	•	Test
	•	Test Suites
	•	Test Runner

Caleb already built a basic version (starting domain + prompt). We will expand to support the full parameter surface.

10.2 Test configuration surface

Computer Use Test instances must store attributes mapping to ComputerUseAgent run params, including at minimum:
	•	start URL / starting domain
	•	instruction / goal
	•	prompt overrides or prompt entity references:
	•	controller prompt
	•	judge prompt
	•	allowedDomains / blockedDomains
	•	tools:
	•	custom function tools (if applicable)
	•	MJ Actions allowed
	•	auth:
	•	base auth union config
	•	credentials entity references
	•	custom auth callback identifier/selection (implementation-dependent)
	•	headless/visible
	•	max steps / timeouts
	•	judge policy / pass-fail thresholds

10.3 Execution

The Test Runner executes each test:
	•	resolves stored config
	•	calls ComputerUseAgent
	•	captures outputs
	•	stores results in MJ test results format

⸻

11. Functional Requirements (Detailed)

11.1 ComputerUseBase requirements

FR-B1. Provide a primary class ComputerUse (or ComputerUseBase) with run(params).

FR-B2. Provide default prompts:
	•	default controller prompt
	•	default judge prompt

FR-B3. Allow overriding prompts via params.

FR-B4. Allow specifying {vendor, model} for controller and judge prompts.

FR-B5. Provide tool calling:
	•	tools array is optional
	•	tool has name, description, input schemas array, output schema
	•	tool invocation calls callback and returns typed output

FR-B6. Provide promptRunner override callback.
	•	When provided, ALL prompt execution routes through it.
	•	When absent, base layer uses MJ AI base library provider inference directly.

FR-B7. Provide Playwright integration:
	•	start browser
	•	navigate
	•	capture screenshots
	•	execute actions
	•	optionally run in headless or visible mode

FR-B8. Support screenshot history (stack of recent screenshots) to provide context.

FR-B9. Provide safety constraints:
	•	allowedDomains allowlist
	•	blockedDomains denylist
	•	navigation guard should enforce policy

FR-B10. Provide authentication as:
	•	built-in union config types
	•	custom auth callback

FR-B11. Provide lifecycle points for auth:
	•	before starting main loop
	•	optionally on domain change

FR-B12. Provide output result structure with:
	•	final status
	•	step log
	•	screenshot artifact references
	•	judge decisions
	•	tool call transcript
	•	error details

11.2 ComputerUseAgent requirements

FR-A1. Wrap ComputerUseBase.

FR-A2. Accept MJ prompt entities as overrides.

FR-A3. Provide promptRunner override callback that:
	•	runs prompts via MJ prompt runner
	•	ensures prompt-run logging

FR-A4. Accept MJ Actions list and auto-wrap them as tool functions.

FR-A5. Support MJ Credentials entity for secrets.
	•	decrypt secrets server-side
	•	map to base auth union config or auth callback

FR-A6. Ensure all configuration is passed through to base layer consistently.

11.3 ComputerUseAction requirements

FR-C1. Implement as an MJ Action.

FR-C2. Inputs mirror ComputerUseAgent run params.

FR-C3. Outputs provide enough detail for agents and debugging.

11.4 ComputerUseTestType requirements

FR-T1. Expose Computer Use as a test type.

FR-T2. Test attributes map to full ComputerUseAgent params.

FR-T3. Integrates with suites and runner.

FR-T4. Persist and display results.

⸻

12. Non-Functional Requirements

NFR1. Separation of concerns enforced by module boundaries.

NFR2. Extensibility: tools/actions/auth/prompt runner are pluggable.

NFR3. Observability:
	•	At MJ layer, prompt runs are logged.
	•	Run results include step-by-step evidence.

NFR4. Safety:
	•	Domain allow/deny enforced.
	•	Credential handling is secure via MJ Credentials (when available).

NFR5. Portability:
	•	Base layer usable outside MJ.

NFR6. Determinism and control:
	•	Max steps / timeouts.
	•	Structured outputs only.

⸻

13. Data Contracts (Proposed)

Note: Names are illustrative; implementers may adjust to MJ conventions.

13.1 Base Run Params (sketch)
	•	goal: string
	•	startUrl?: string
	•	headless?: boolean
	•	allowedDomains?: string[]
	•	blockedDomains?: string[]
	•	maxSteps?: number
	•	screenshotHistoryDepth?: number
	•	controllerPrompt?: string
	•	judgePrompt?: string
	•	controllerModel?: { vendor: string; model: string }
	•	judgeModel?: { vendor: string; model: string }
	•	tools?: ToolDef[]
	•	promptRunner?: (req: PromptRunRequest) => Promise
	•	auth?: AuthConfig
	•	authCallback?: (ctx: AuthCallbackContext) => Promise

13.2 ToolDef (sketch)
	•	name: string
	•	description: string
	•	inputSchemas: JsonSchema[]
	•	outputSchema?: JsonSchema
	•	handler: (args: any) => Promise

13.3 AuthConfig union (sketch)
	•	type: “basic” | “bearer” | “oauth” | “cookie” | “localStorage” | “custom”
	•	fields vary by subtype

13.4 Agent Layer additions (sketch)
	•	controllerPromptRef?: PromptEntityRef
	•	judgePromptRef?: PromptEntityRef
	•	actions?: ActionRef[]
	•	credentials?: CredentialRef[]

⸻

14. Navigation + Domain Policy

We will support both:
	•	Allowlist: only specified domains allowed
	•	Denylist: specified domains blocked

Policy precedence recommendation:
	•	If allowlist is defined: deny all not in allowlist.
	•	Denylist always blocks even if in allowlist (or choose opposite; must be explicit).

⸻

15. Judge Concept (Detailed)

The Judge is a separate reasoning step that:
	•	decides whether the goal is satisfied
	•	provides feedback to continue if not

It should be configurable:
	•	prompt and model
	•	when it runs (every step vs periodic)
	•	how it signals completion

Example judge outputs (structured):
	•	done: boolean
	•	confidence: number
	•	feedback: string
	•	reason: string
	•	suggestedNext: optional hint

⸻

16. Productionization Plan (Phased)

Phase 0 (done)
	•	Prototype implemented and integrated into MJ.

Phase 1 (this PRD)
	•	Refactor into layered architecture:
	•	Extract ComputerUseBase package
	•	Implement ComputerUseAgent wrapper
	•	Introduce promptRunner override
	•	Formalize tool schemas (add output schema)
	•	Formalize auth union + auth callback

Phase 2
	•	Implement ComputerUseAction as MJ Action.

Phase 3
	•	Expand ComputerUseTestType configuration surface to full params.

Phase 4 (optional)
	•	Consider Computer Use as an MJ Agent Type (not planned now).

⸻

17. Risks & Mitigations

R1. Tight coupling between base and MJ infrastructure.
	•	Mitigation: promptRunner callback boundary; keep base clean.

R2. Authentication complexity across sites.
	•	Mitigation: union types + auth callback + MJ credentials integration.

R3. Safety (agent browsing arbitrary domains).
	•	Mitigation: allowlist/denylist enforcement; defaults conservative.

R4. Flaky UI actions.
	•	Mitigation: consistent policies (timeouts, waits), optional traces, judge feedback loop.

⸻

18. Open Questions (To decide during implementation)

OQ1. Exact naming:
	•	“ComputerUseBase” vs “ComputerUseTool” vs “ComputerUse”

OQ2. Domain policy precedence:
	•	allowlist vs denylist conflict resolution

OQ3. Where to store large artifacts:
	•	screenshots/traces storage mechanism in MJ context

OQ4. How to represent “custom auth callback” in test configuration:
	•	code hook vs registered named callback

OQ5. Tool schema format:
	•	single schema vs multiple alternative schemas (current array)

⸻

19. Appendix: Why Action (not Agent Type)

We are deliberately implementing Computer Use as an Action in MJ’s agent system because:
	•	It is a primitive capability that many agents may want to use as one step.
	•	It maximizes reuse and composability.
	•	If an agent is “only computer use,” it can be implemented as an agent that just invokes the action.

Future:
	•	If we find strong reasons to have a dedicated agent type (special lifecycle, scheduling, resources, UI streaming), we can add it later without breaking the action.

⸻

20. Appendix: Layer-by-layer Summary (No new info)
	•	Layer 1 (ComputerUseBase): universal browser vision-action primitive, no MJ persistence.
	•	Layer 2 (ComputerUseAgent): MJ prompts/logging, MJ actions, MJ credentials.
	•	Layer 3 (ComputerUseAction): callable by any MJ agent.
	•	Layer 4 (ComputerUseTestType): configurable tests + suites.
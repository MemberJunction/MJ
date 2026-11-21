# MJ Comms V2 — Phase 5: Templated Rendering & Delivery Wrapper (Layer 2)

**Phase:** 5 of 6 (`packages/Communication/entity-comm-server`, `engine`, `MJServer`)  
**Depends On:** **Phase 2** (`EvaluateEligibility()` $\rightarrow$ `Send()` deliverability primitive)  
**Optional Scale Enhancement:** **Phase 6** (WorkQueue rate limiting / `ScheduledAt` if deferred blasts use WorkQueue)

---

## 1. Architectural Role (Layer 2 Over Layer 1)

Phase 5 implements the **Template-Based API** (`ITemplatedCommunicationService`) as a clean **Layer 2 wrapper** above Phase 2's template-free **Layer 1 Deliverability Primitive**:
* **Layer 1 (Phase 2)** never touches `TemplateEngineServer`, Nunjucks, or entity-relation `RunView`s.
* **Layer 2 (Phase 5)** owns template validation, entity-relation data hydration (`GetRelatedData`), Nunjucks rendering, and WorkQueue-scaled rendering (`comms.render`), handing final rendered strings to Layer 1's `Send()`.

---

## 2. Step-by-Step Implementation Plan

### Step 1: `TemplatedCommunicationService` (`packages/Communication/entity-comm-server`)
Implements `ITemplatedCommunicationService.RenderAndSend(params: RenderAndSendParams, contextUser: UserInfo)`:

1. **Pre-Flight Compliance (`EvaluateEligibility`):**
   * Resolves `Audience` (`AudienceSource` / `RunViewParams`) or explicit `Recipients` and calls Phase 2's `CommunicationEngine.EvaluateEligibility()`.
   * **Filters out `Blocked` recipients before any template-param `RunView`s or rendering run.**
   * Captures `SenderTemplateContext` (`Sender.*`), `PrincipalAttributes` (`Recipient.*`), and body-level `ComplianceObligations` (`RequireSenderPostalAddress`, `RequireFooterUnsubscribe`, `SenderPostalAddress`) per `SendableRecipient`.
2. **Template Param Alignment & Context Assembly:**
   * Reuses [`ValidateTemplateContextParamAlignment()`](../../packages/Communication/entity-comm-server/src/entity-communications.ts#L249) across `SubjectTemplateID`, `BodyTemplateID`, and `HTMLBodyTemplateID`.
   * Merges context per recipient:
     `{ ...Templates.SharedContextData, ...Recipient.ContextData, Sender: SenderTemplateContext, Recipient: PrincipalAttributes, Comms: { Obligations } }` + entity-relation data from `GetRelatedData()` (scoped strictly to `Sendable` PKs).
3. **WorkQueue Rendering Pipeline (`comms.render` $\rightarrow$ `comms.send` — Standard Mechanism):**
   * `RenderAndSend()` creates a `CommunicationRun`, batches the `Sendable` recipients + resolved endpoints into configurable chunks (e.g., 500–1,000 recipients per batch), and publishes them to the **`comms.render`** WorkQueue topic.
   * **`comms.render` Listener / Worker:** Pulls each batch, validates param alignment, runs `GetRelatedData()` once for that batch's `Sendable` PKs, renders `Subject`, `Body`, and `HTMLBody` via `TemplateEngineServer` (optionally auto-appending a compliance footer if `AutoAppendComplianceFooter: true`), and passes the rendered batch to Phase 2's **`comms.send`** pipeline (via `CommunicationEngine.Send()`).
   * *Legacy Sync Exception:* Only runs inline when `PreviewOnly = true` or a legacy V1 caller explicitly requests `IncludeProcessedMessages = true`.

---

### Step 2: Migrating V1 Template Callers (`EntityCommunicationsEngine`, `SendMessages`, `MJServer`)

1. **`EntityCommunicationsEngine.RunEntityCommunication()` ([`entity-communications.ts`](../../packages/Communication/entity-comm-server/src/entity-communications.ts#L21)):**
   * Maps `EntityCommunicationParams` $\rightarrow$ `RenderAndSendParams` (defaulting to `IsDefault = 1` sender and `Operational` class when not specified) and delegates to `TemplatedCommunicationService.RenderAndSend()`, preserving V1's `EntityCommunicationResult` return shape.
2. **`EntityCommunicationsResolver` ([`EntityCommunicationsResolver.ts`](../../packages/MJServer/src/resolvers/EntityCommunicationsResolver.ts#L172)):**
   * Keeps the existing GraphQL `RunEntityCommunicationByViewID` query working seamlessly via `EntityCommunicationsEngine` (and optionally exposes V2 sender/preference args).
3. **`CommunicationEngine.SendMessages()` / `SendSingleMessage()` ([`Engine.ts`](../../packages/Communication/engine/src/Engine.ts#L101-L205)):**
   * Preserves synchronous V1 signatures for `SendSingleMessageAction` and `NotificationEngine` (`NotificationEngine` tagged `Transactional` for system alerts), routing through `EvaluateEligibility()` $\rightarrow$ `ProcessedMessageServer.Process()` $\rightarrow$ `Send()` inline.

---

### Step 3: Unit & Integration Tests (Vitest)
* **Zero-Waste Pre-Flight Tests:** Verify `EvaluateEligibility()` runs before `GetRelatedData()` so `Blocked` recipients trigger zero related-entity `RunView`s or template renders.
* **Context & Obligation Tests:** Verify `Sender.*`, `Recipient.*`, and `Comms.Obligations` populate template context, and `AutoAppendComplianceFooter` vs. send-time rejection behave as configured.
* **`comms.render` Fan-Out & V1 Compatibility Tests:** Verify chunked `comms.render` $\rightarrow$ `Send()` flow and backward compatibility for `EntityCommunicationsEngine.RunEntityCommunication()` and V1 `SendMessages()`.

# Audio Sage PoC - Autonomous Implementation Orchestrator

You are an **autonomous orchestrator agent** responsible for implementing the Audio Sage Proof of Concept from start to finish. You will manage sub-agents, track progress, and verify work through memory compactions.

## Your Mission

Implement the complete Audio Sage PoC by coordinating specialized sub-agents to execute the implementation plan documented in `/Users/jordanfanapour/Documents/GitHub/MJ/plans/audio-sage-poc-implementation.md`.

## Core Responsibilities

1. **Task Coordination**: Launch sub-agents for each implementation phase
2. **Progress Tracking**: Maintain task list in the PoC document's "Success Criteria" section
3. **Work Verification**: Review each sub-agent's deliverables before proceeding
4. **Memory Management**: Update task status before/after memory compactions
5. **Autonomous Execution**: Complete all work without user input

## Required Documents (READ THESE FIRST)

**Primary Implementation Plan:**
- `/Users/jordanfanapour/Documents/GitHub/MJ/plans/audio-sage-poc-implementation.md`

**Supporting Context (reference as needed):**
- `/Users/jordanfanapour/Documents/GitHub/MJ/CLAUDE.md` - MemberJunction development guidelines
- `/Users/jordanfanapour/Documents/GitHub/CLAUDE.md` - Workspace-level guidelines
- `/Users/jordanfanapour/Documents/GitHub/MJ/packages/AI/Agents/src/base-agent.ts` - BaseAgent implementation
- `/Users/jordanfanapour/Documents/GitHub/MJ/packages/MJServer/src/resolvers/RunAIAgentResolver.ts` - GraphQL resolver patterns
- `/Users/jordanfanapour/Documents/GitHub/MJ/packages/AI/Engine/src/services/ConversationAttachmentService.ts` - Attachment handling

**Key Sections in Implementation Plan:**
- "Architecture Approach (PoC-First Approach)" - High-level strategy
- "Component 1-8" - Detailed implementations for each piece
- "Implementation Findings & Recommendations" - Critical patterns and warnings
- "Orchestration Plan" - Phase-by-phase execution guide
- "Success Criteria" - Checkboxes to track (THIS IS YOUR TASK LIST)

## Execution Workflow

### Phase 0: Initialization

1. **Read the complete implementation plan** (`audio-sage-poc-implementation.md`)
2. **Read CLAUDE.md files** for MJ development rules
3. **Verify git branch**: Ensure on feature branch, not `next` or `main`
4. **Create initial task list** in the PoC document's "Success Criteria" section

### Phase 1: Package Setup (Sequential)

**Launch:** `general-purpose` sub-agent

**Task:** "Create AudioSage package structure"

**Provide to sub-agent:**
- Section: "NPM Dependencies to Add" from implementation plan
- Section: "Component 3: AudioSageAgent Driver Class" (for package structure reference)
- Instruction: Create `packages/AI/Agents/AudioSage/` with `package.json`, `tsconfig.json`, `src/index.ts`

**Verification:**
- [ ] Package directory exists
- [ ] `npm install` completes without errors
- [ ] TypeScript compiles

**Update:** Mark "Package created with proper structure" checkbox in PoC document

---

### Phase 2: Core Implementation (3 Parallel Sub-Agents)

#### Sub-Agent 2A: ElevenLabsAdapter

**Launch:** `general-purpose` sub-agent

**Task:** "Implement Eleven Labs tool call adapter"

**Provide to sub-agent:**
- Complete "Component 2: ElevenLabsAdapter" section
- Excerpt from "Implementation Findings & Recommendations" on error handling
- File path: `packages/AI/Agents/AudioSage/src/eleven-labs-adapter.ts`

**Verification:**
- [ ] `ElevenLabsAdapter.ConvertToolCallsToActions()` implemented
- [ ] `ElevenLabsAdapter.ExtractAudioBuffer()` implemented
- [ ] TypeScript compiles without errors
- [ ] Interfaces exported from `src/index.ts`

**Update:** Mark "ElevenLabsAdapter converts tool calls" checkbox

---

#### Sub-Agent 2B: AudioSageAgent Driver Class

**Launch:** `general-purpose` sub-agent

**Task:** "Implement AudioSageAgent custom driver class extending BaseAgent"

**Provide to sub-agent:**
- Complete "Component 3: AudioSageAgent Driver Class" section
- "Implementation Findings & Recommendations" sections #4 (BaseAgent step creation) and #5 (AIEngine usage)
- Context: "This agent bypasses AIPromptRunner and uses TemplateEngineServer directly"
- File path: `packages/AI/Agents/AudioSage/src/audio-sage-agent.ts`

**Verification:**
- [ ] Class extends `BaseAgent` with `@RegisterClass(BaseAgent, 'AudioSageAgent')` decorator
- [ ] `executeAgentInternal()` overridden
- [ ] Uses `createStepEntity()` and `finalizeStepEntity()` (NOT manual step creation)
- [ ] Uses `AIEngine` for template lookups
- [ ] TypeScript compiles without errors
- [ ] Exported from `src/index.ts`

**Update:** Mark "AudioSageAgent class extends BaseAgent" checkbox

---

#### Sub-Agent 2C: Angular VoiceMessageComponent

**Launch:** `general-purpose` sub-agent

**Task:** "Implement Angular voice recording component with Web Audio API"

**Provide to sub-agent:**
- Complete "Component 5: Angular Voice UI" section
- MJ Angular guidelines: `/Users/jordanfanapour/Documents/GitHub/MJ/packages/Angular/CLAUDE.md`
- Critical rule: "NO standalone components - must be part of NgModule"
- File paths:
  - `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/voice-message.component.ts`
  - `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/voice-message.component.html`
  - `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/voice-message.component.scss`

**Verification:**
- [ ] Component NOT standalone (no `standalone: true` in decorator)
- [ ] Uses Web Audio API for recording
- [ ] Recording duration tracked
- [ ] Audio playback implemented
- [ ] Visual feedback (pulsing red dot) during recording
- [ ] TypeScript compiles without errors

**Update:** Mark "VoiceMessageComponent implements Web Audio API" checkbox

---

### Phase 3: Integration Layer (2 Parallel Sub-Agents, After Phase 2)

**Wait for:** Phase 2 sub-agents to complete and verify

#### Sub-Agent 3A: Angular GraphQL Service

**Launch:** `general-purpose` sub-agent

**Task:** "Implement Angular GraphQL service using ConversationAttachmentService pattern"

**Provide to sub-agent:**
- Complete "Component 7: Angular GraphQL Service" section
- "Implementation Findings & Recommendations" section #3a (Audio Attachment Infrastructure)
- Context: "Creates ConversationDetail, saves audio as attachment, then calls ProcessVoiceMessage mutation"
- File path: `packages/Angular/Explorer/explorer-core/src/lib/chat/services/audio-sage-graphql.service.ts`

**Verification:**
- [ ] Uses 3-step process: CreateConversationDetail → CreateAttachment → ProcessVoiceMessage
- [ ] Passes `conversationDetailId` to mutation (NOT base64 audio)
- [ ] Returns `audioResponseUrl` for playback
- [ ] TypeScript compiles without errors

**Update:** Mark "AudioSageGraphQLService calls MJAPI mutation" checkbox

---

#### Sub-Agent 3B: MJAPI GraphQL Resolver

**Launch:** `general-purpose` sub-agent

**Task:** "Implement MJAPI GraphQL resolver using ConversationAttachmentService"

**Provide to sub-agent:**
- Complete "Component 6: MJAPI GraphQL Resolver" section
- "Implementation Findings & Recommendations" section #1 (GraphQL Resolver Pattern) and #3a (Audio Attachment Infrastructure)
- Reference: `/Users/jordanfanapour/Documents/GitHub/MJ/packages/MJServer/src/resolvers/RunAIAgentResolver.ts` (pattern to follow)
- File path: `packages/MJServer/src/resolvers/AudioSageResolver.ts`
- Registration: Add to `packages/MJServer/src/schema.ts` resolvers array

**Verification:**
- [ ] Uses `getAttachmentService()` to load audio
- [ ] Uses `AIEngine.Instance.Agents.find()` for agent lookup
- [ ] Uses `AgentRunner.RunAgentInConversation()`
- [ ] Creates attachment for agent's audio response
- [ ] Returns `audioResponseUrl` (NOT base64)
- [ ] Registered in schema.ts
- [ ] TypeScript compiles without errors

**Update:** Mark "MJAPI GraphQL resolver invokes AudioSageAgent" checkbox

---

### Phase 4: Metadata & Configuration (Sequential, After Phase 3)

**Wait for:** Phase 3 sub-agents to complete and verify

#### Sub-Agent 4A: Metadata Files

**Launch:** `general-purpose` sub-agent

**Task:** "Create Audio Sage agent metadata files"

**Provide to sub-agent:**
- "Component 4: Metadata Setup" section
- "Implementation Findings & Recommendations" section #6 (Prompt Template Examples) and #7 (Metadata Structure)
- Reference prompt: `/Users/jordanfanapour/Documents/GitHub/MJ/metadata/prompts/templates/sage/sage.template.md`
- Files to create:
  - `/Users/jordanfanapour/Documents/GitHub/MJ/metadata/agents/.audio-sage-agent.json`
  - `/Users/jordanfanapour/Documents/GitHub/MJ/metadata/prompts/.audio-sage-system-prompt.json`
  - `/Users/jordanfanapour/Documents/GitHub/MJ/metadata/prompts/templates/audio-sage/audio-sage.template.md`

**Verification:**
- [ ] Agent JSON has `DriverClass: "AudioSageAgent"`
- [ ] Agent linked to Audio modality (Input + Output)
- [ ] Prompt template voice-optimized (concise, conversational)
- [ ] Uses `@lookup:` syntax for foreign keys
- [ ] Files valid JSON (run `npx mj-sync validate --dir=./metadata`)

**Update:** Mark "Audio Sage agent metadata synced" checkbox

---

#### Sub-Agent 4B: Module Integration

**Launch:** `general-purpose` sub-agent

**Task:** "Integrate VoiceMessageComponent into Angular chat module"

**Provide to sub-agent:**
- "Component 8: Integration & Configuration" section
- MJ Angular guidelines (NO standalone components rule)
- File to modify: `packages/Angular/Explorer/explorer-core/src/lib/chat/chat.module.ts`

**Verification:**
- [ ] VoiceMessageComponent in `declarations`
- [ ] VoiceMessageComponent in `exports`
- [ ] AudioSageGraphQLService in `providers`
- [ ] Required imports added
- [ ] TypeScript compiles without errors

**Update:** Mark "Module integration completed" checkbox

---

### Phase 5: Metadata Sync (Sequential, After Phase 4)

**Launch:** `general-purpose` sub-agent

**Task:** "Sync metadata to database"

**Provide to sub-agent:**
- Command: `cd /Users/jordanfanapour/Documents/GitHub/MJ && npx mj-sync push`
- Context: "This creates the Audio Sage agent in the database"

**Verification:**
- [ ] Metadata sync completes without errors
- [ ] Query database: `SELECT Name, DriverClass FROM [__mj].AIAgent WHERE Name='Audio Sage'`
- [ ] Verify `DriverClass='AudioSageAgent'`

**Update:** Mark "Audio Sage agent metadata synced to database" checkbox

---

### Phase 6: Build & Compilation (Sequential, After Phase 5)

**Launch:** `general-purpose` sub-agent

**Task:** "Build all affected packages"

**Provide to sub-agent:**
- Build commands from PoC document
- Packages to build:
  1. `packages/AI/Agents/AudioSage`
  2. `packages/MJServer`
  3. `packages/Angular/Explorer/explorer-core`

**Verification:**
- [ ] All packages build without TypeScript errors
- [ ] No linting errors
- [ ] Run: `npm run build` from repo root

**Update:** Mark "All packages built successfully" checkbox

---

## Progress Tracking (CRITICAL)

**Before ANY sub-agent completes:**
1. Verify their deliverable thoroughly
2. Update the corresponding checkbox in "Success Criteria" section
3. Commit changes to the PoC document: `git add plans/audio-sage-poc-implementation.md && git commit -m "Update: [task completed]"`

**Before memory compaction:**
1. Update ALL checkboxes in "Success Criteria" to reflect current state
2. Commit the PoC document
3. Write a summary of remaining work in the document

**After memory compaction:**
1. Read the PoC document
2. Find last unchecked checkbox in "Success Criteria"
3. Resume from that point

## Verification Standards

**For every deliverable, check:**
- [ ] TypeScript compiles without errors
- [ ] Follows MJ patterns from "Implementation Findings & Recommendations"
- [ ] No `any` types used (critical MJ rule)
- [ ] No standalone Angular components (critical MJ rule)
- [ ] Uses AIEngine for lookups (not direct DB queries)
- [ ] Uses BaseAgent's `createStepEntity()` (not manual creation)
- [ ] Uses ConversationAttachmentService (not base64 in GraphQL)

## Success Criteria (Your Task List)

The "Success Criteria" section in the PoC document contains checkboxes. **This is your authoritative task list.** Update it as you progress.

Example:
```markdown
- [x] `packages/AI/Agents/AudioSage/` package created with proper structure
- [x] `AudioSageAgent` class extends `BaseAgent` with `@RegisterClass` decorator
- [x] `ElevenLabsAdapter` converts tool calls to MJ action format
- [ ] Angular `VoiceMessageComponent` implements Web Audio API recording/playback  ← NEXT TASK
- [ ] Angular `AudioSageGraphQLService` calls MJAPI mutation
```

## Sub-Agent Prompt Template

When launching sub-agents, use this template:

```
You are a specialized implementation agent working on the Audio Sage PoC for MemberJunction.

TASK: [specific task from phase]

CONTEXT:
- You are implementing [component name]
- This is part of a larger PoC to add voice interaction to MJ using Eleven Labs
- Follow MemberJunction patterns strictly (no `any` types, no standalone components)

REQUIRED READING:
[Include relevant sections from implementation plan]

CRITICAL RULES (from /MJ/CLAUDE.md):
- Never use `any` types
- Angular components must be in NgModules (no standalone)
- Use AIEngine for all metadata lookups
- Use BaseAgent's createStepEntity() for step tracking
- Use ConversationAttachmentService for audio handling

DELIVERABLE:
[Specific files to create with exact paths]

VERIFICATION:
- TypeScript must compile without errors
- Must follow patterns from implementation plan
- Must adhere to MJ coding standards

When done, report:
1. Files created/modified
2. Any issues encountered
3. Verification results (compilation, linting)
```

## Common Pitfalls (AVOID THESE)

❌ **Don't:**
- Create standalone Angular components
- Use `any` types in TypeScript
- Pass base64 audio through GraphQL mutations
- Manually create agent run steps (use BaseAgent methods)
- Make direct database queries (use AIEngine)
- Implement before verifying previous phase

✅ **Do:**
- Use NgModule declarations
- Use proper TypeScript types
- Use ConversationAttachmentService for audio
- Use BaseAgent's createStepEntity()/finalizeStepEntity()
- Use AIEngine.Instance for cached lookups
- Verify each sub-agent's work before proceeding

## When Implementation Completes

1. **Update all checkboxes** in "Success Criteria" to checked
2. **Commit the final state** of the PoC document
3. **Create a summary report** listing:
   - All files created
   - All files modified
   - Build status
   - Remaining manual steps (Eleven Labs agent creation, environment variables)

## Emergency Recovery

If you encounter a memory compaction:
1. Read `/Users/jordanfanapour/Documents/GitHub/MJ/plans/audio-sage-poc-implementation.md`
2. Check "Success Criteria" section for last unchecked item
3. Review git log: `git log --oneline -10`
4. Resume from last incomplete task

---

**You are now ready to begin. Start with Phase 0: Read the implementation plan and create your initial task list.**

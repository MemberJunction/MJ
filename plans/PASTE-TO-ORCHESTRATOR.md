# Audio Sage PoC - Autonomous Implementation

You are an **autonomous orchestrator agent** responsible for implementing the Audio Sage Proof of Concept from start to finish without user input.

## Your Mission

Implement the complete Audio Sage PoC by:
1. Reading the implementation plan
2. Launching specialized sub-agents for each phase
3. Tracking progress via the task list in the plan document
4. Verifying all work before proceeding
5. Committing progress to survive memory compactions

## Start Here

**Read these files NOW (in order):**
1. `/Users/jordanfanapour/Documents/GitHub/MJ/plans/ORCHESTRATOR-MESSAGE.md` - Your complete instructions
2. `/Users/jordanfanapour/Documents/GitHub/MJ/plans/audio-sage-poc-implementation.md` - The implementation plan
3. `/Users/jordanfanapour/Documents/GitHub/MJ/CLAUDE.md` - MJ development rules

## Your Task Tracker

The **"Success Criteria" section** in `audio-sage-poc-implementation.md` contains checkboxes. This is your authoritative task list. Update it as you complete each phase.

## Execution Model

**Phase-by-Phase:**
1. **Phase 0**: Setup package structure (1 sub-agent)
2. **Phase 1**: Core implementation (3 parallel sub-agents)
3. **Phase 2**: Integration layer (2 parallel sub-agents)
4. **Phase 3**: Metadata & configuration (2 sequential sub-agents)
5. **Phase 4**: Metadata sync (1 sub-agent)
6. **Phase 5**: Build & verify (1 sub-agent)

**For each phase:**
- Launch sub-agents with specific sections from the implementation plan
- Verify their deliverables (TypeScript compiles, follows MJ patterns)
- Update checkboxes in "Success Criteria"
- Commit: `git add plans/audio-sage-poc-implementation.md && git commit -m "Phase X: [task] completed"`

## Critical Rules (from MJ codebase)

❌ **Never:**
- Use `any` types in TypeScript
- Create standalone Angular components
- Pass audio as base64 in GraphQL mutations
- Manually create agent run steps
- Make direct database queries

✅ **Always:**
- Use NgModule declarations for Angular components
- Use `ConversationAttachmentService` for audio
- Use `BaseAgent.createStepEntity()` for step tracking
- Use `AIEngine.Instance` for cached lookups
- Follow patterns from "Implementation Findings & Recommendations"

## Memory Compaction Recovery

If you hit a memory compaction:
1. Read `/Users/jordanfanapour/Documents/GitHub/MJ/plans/audio-sage-poc-implementation.md`
2. Find last unchecked item in "Success Criteria" section
3. Check git log: `git log --oneline -10`
4. Resume from last incomplete phase

## Verification Standards

Before marking any task complete:
- [ ] TypeScript compiles without errors
- [ ] No `any` types used
- [ ] Follows MJ patterns from implementation plan
- [ ] Checkbox updated in "Success Criteria"
- [ ] Changes committed to git

## Your First Action

Execute this EXACT sequence:

1. Read ORCHESTRATOR-MESSAGE.md (full instructions)
2. Read audio-sage-poc-implementation.md (implementation details)
3. Verify git branch (should be feature branch, not `next` or `main`)
4. Create Phase 0 sub-agent to set up package structure

## Success Condition

When ALL checkboxes in "Success Criteria" are marked `[x]`, the PoC is complete. Report final summary with:
- All files created/modified
- Build status
- Remaining manual steps (Eleven Labs agent creation, env vars)

---

**BEGIN AUTONOMOUS EXECUTION NOW.**

First, read `/Users/jordanfanapour/Documents/GitHub/MJ/plans/ORCHESTRATOR-MESSAGE.md` for complete instructions.

# Audio Sage Real-Time - Autonomous Implementation

You are an **autonomous orchestrator agent** responsible for implementing the Audio Sage Real-Time system from start to finish without user input.

## Your Mission

Implement the complete Audio Sage Real-Time system by:
1. Reading the implementation plan
2. Launching specialized sub-agents for each phase (Phases 2-5)
3. Tracking progress via task lists in the plan document
4. Verifying all work before proceeding
5. Committing progress to survive memory compactions

## Start Here

**Read these files NOW (in order):**
1. `/Users/jordanfanapour/Documents/GitHub/MJ/plans/ORCHESTRATOR-MESSAGE-REALTIME.md` - Your complete instructions
2. `/Users/jordanfanapour/Documents/GitHub/MJ/plans/audio-sage-realtime-implementation-plan.md` - The implementation plan
3. `/Users/jordanfanapour/Documents/GitHub/MJ/CLAUDE.md` - MJ development rules

## Your Task Tracker

The **"Success Criteria" sections** in each phase of `audio-sage-realtime-implementation-plan.md` contain checkboxes. These are your authoritative task lists. Update them as you complete each phase.

## Execution Model

**Phase-by-Phase:**
1. **Phase 0**: Verify prerequisites (PoC complete, git branch, API key)
2. **Phase 2**: WebSocket infrastructure (2 parallel sub-agents)
3. **Phase 3**: Eleven Labs Conversation integration (2 parallel sub-agents)
4. **Phase 4**: Streaming audio UI (2 parallel sub-agents)
5. **Phase 5**: Production readiness (3 parallel sub-agents)
6. **Phase 6**: Testing & deployment (3 sub-agents)

**For each phase:**
- Launch sub-agents with specific sections from the implementation plan
- Verify their deliverables (TypeScript compiles, follows MJ patterns)
- Update checkboxes in "Success Criteria"
- Commit: `git add plans/audio-sage-realtime-implementation-plan.md && git commit -m "Phase X: [task] completed"`

## Critical Rules (from MJ codebase)

❌ **Never:**
- Use `any` types in TypeScript
- Create standalone Angular components
- Persist sessions to database (they're in-memory only)
- Use HTTP for WebSocket (must use WS/WSS)
- Block on synchronous operations

✅ **Always:**
- Use NgModule declarations for Angular components
- Event-driven architecture for WebSocket communication
- In-memory session management only
- Proper error handling and reconnection logic
- Follow patterns from implementation plan

## Memory Compaction Recovery

If you hit a memory compaction:
1. Read `/Users/jordanfanapour/Documents/GitHub/MJ/plans/audio-sage-realtime-implementation-plan.md`
2. Find last unchecked item in any "Success Criteria" section
3. Check git log: `git log --oneline -20`
4. Resume from last incomplete phase

## Verification Standards

Before marking any task complete:
- [ ] TypeScript compiles without errors
- [ ] No `any` types used
- [ ] WebSocket patterns correct
- [ ] Event-driven architecture implemented
- [ ] Follows MJ patterns from implementation plan
- [ ] Checkbox updated in "Success Criteria"
- [ ] Changes committed to git

## Your First Action

Execute this EXACT sequence:

1. Read ORCHESTRATOR-MESSAGE-REALTIME.md (full instructions)
2. Read audio-sage-realtime-implementation-plan.md (implementation details)
3. Verify git branch (should be feature branch, not `next` or `main`)
4. Verify Phase 1 PoC is complete (AudioSageAgent with STT+TTS working)
5. Create Phase 2A sub-agent to implement WebSocket handler

## Success Condition

When ALL checkboxes in ALL "Success Criteria" sections are marked `[x]`, the implementation is complete. Report final summary with:
- All files created/modified
- Build status
- Load testing results
- Security audit results
- Remaining manual steps (Eleven Labs agent configuration, environment variables)

---

**BEGIN AUTONOMOUS EXECUTION NOW.**

First, read `/Users/jordanfanapour/Documents/GitHub/MJ/plans/ORCHESTRATOR-MESSAGE-REALTIME.md` for complete instructions.

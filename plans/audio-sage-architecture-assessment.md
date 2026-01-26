# Audio Sage Architecture Assessment

**Date:** 2026-01-25
**Status:** Architecture Review Complete

## Critical Finding: No New Schema Required

After reviewing the existing MemberJunction architecture, **we do NOT need any new database tables** for the Audio Sage PoC. The existing metadata-driven architecture already provides everything we need.

## Existing MJ Entities That Support Audio Sage

### 1. **Conversation & ConversationDetail** (Already Exists)
- `Conversation` table with `ExternalID` field - **perfect for storing Eleven Labs conversation ID**
- `ConversationDetail` table with:
  - `AgentID` - links to AI Agent
  - `Role` - supports system/user/assistant messages
  - `Message` - stores text transcripts
  - `ExternalID` - can store Eleven Labs message IDs
  - Full support for ratings, feedback, artifacts
- **No changes needed** - these tables support audio conversations out of the box

### 2. **AI Agents** (Already Exists)
- Fully extensible agent system with:
  - `Name`, `Description`, `Status`
  - `DriverClass` - for custom agent implementations
  - `TypeID` - links to AI Agent Types
  - Parent/child hierarchy support
  - Execution modes (Sequential/Parallel)
- **We just create a new AI Agent record** for Audio Sage

### 3. **AI Vendor: Eleven Labs** (Already Exists!)
- Eleven Labs is **already registered** as an AI Vendor in the database
- Existing credential binding system via `AICredentialBinding`
- **No vendor setup needed** - infrastructure already in place

### 4. **Action Execution Logs** (Already Exists)
- Full tracking of action executions
- Links to conversations via context
- **No new tool execution table needed**

## What We Actually Need to Build

### Option A: Minimal PoC Approach (Recommended)
Store Eleven Labs agent configuration in existing fields:

1. **AI Agent record** for "Audio Sage"
   - Use standard `AIAgent` table
   - Store Eleven Labs agent ID in a JSON `Configuration` field (if exists) or use existing metadata fields
   - Link to existing Sage prompt template

2. **Conversation records** as usual
   - `ExternalID` = Eleven Labs conversation ID
   - Standard `ConversationDetail` records for transcript

3. **No migration file needed** - use existing schema

### Option B: Add Single Optional Field (If Needed)
If `AIAgent` table doesn't have a `Configuration` field for JSON:

```sql
-- Only if needed - check schema first
ALTER TABLE __mj.AIAgent
ADD Configuration NVARCHAR(MAX) NULL;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON configuration for vendor-specific settings (e.g., Eleven Labs agent ID, voice settings)',
    @level0type = N'SCHEMA', @level0name = '__mj',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'Configuration';
```

This is **metadata-driven** - it's a generic configuration field, not Audio Sage-specific.

## Revised Implementation Components

### Component 1: Angular Voice UI
- **No changes** - still need UI component for recording/playback
- Location: `packages/Angular/Explorer/explorer-core/src/lib/chat/voice-message/`

### Component 2: Eleven Labs Provider Extension
- **No changes** - still need conversational AI support
- Location: `packages/AI/Providers/ElevenLabs/src/ConversationalAgent.ts`
- This is extending existing provider, not creating new abstraction

### Component 3: Audio Sage Service (MJAPI)
- **Simplified** - uses existing `Conversation` and `ConversationDetail` entities
- Creates/loads AI Agent record for Audio Sage
- Stores Eleven Labs conversation ID in `Conversation.ExternalID`
- No custom tables needed

### Component 4: GraphQL Resolver
- **Simplified** - returns standard Conversation/ConversationDetail entities
- No custom types needed

### Component 5: Database Migration
- **OPTION A: Skip entirely** if `AIAgent` already has a configuration field
- **OPTION B: Single ALTER TABLE** if we need to add `Configuration` column
- **NO custom Audio Sage tables** - violates MJ philosophy

## Why This Approach Aligns with MJ Philosophy

1. **Metadata-Driven**: Uses existing entity system, not custom schema
2. **Extensible**: `ExternalID` fields designed for exactly this use case
3. **Reusable**: Other conversational AI vendors can follow same pattern
4. **Simple**: No CodeGen changes, no custom entities, no views/sprocs
5. **Audit Trail**: Built-in `__mj_CreatedAt`/`UpdatedAt` timestamps
6. **Relationships**: Leverages existing FK relationships to Users, Agents, Actions

## Next Steps

1. **Verify** if `AIAgent.Configuration` field exists in current schema
2. **If yes**: Proceed with Option A (no migration)
3. **If no**: Create minimal migration for Option B (single column add)
4. **Resume Phase 1** with corrected implementation plan

## Summary

**The original implementation plan violated MJ's core principle**: metadata-driven design over custom schema. The existing Conversation/Agent architecture already supports audio conversations through the `ExternalID` pattern. We were about to create unnecessary tables that duplicate existing functionality.

This is a perfect example of MJ's power - the metadata system is so comprehensive that new modalities (audio) require zero schema changes.

## Summary

Built on top of #1748 

This PR implements comprehensive multi-modal output support for MemberJunction agents, enabling agents to generate images (and eventually audio/video) and have those outputs flow through to the conversation UI.

### Key Features

- **Image Generation Infrastructure**: Support for multiple providers (OpenAI, Google/Gemini Nano Banana Pro, Black Forest Labs FLUX)
- **Multi-Modal Output Types**: `MediaOutput` interface supporting Image, Audio, and Video modalities
- **Explicit Media Promotion**: Agents explicitly decide which generated media to surface via `promoteMediaOutputs()`
- **Conversation Integration**: Generated media automatically flows to ConversationDetailAttachment for UI display
- **Token-Efficient Placeholder Pattern**: Large binary content (base64 images ~700K tokens) replaced with `${media:xxx}` placeholders (~30 tokens) to preserve LLM context
- **Sage Image Generation**: Conversational agents like Sage can generate and display images via attachments
- **Uploaded Image Handling**: Sage can analyze uploaded images and generate new images based on uploaded visual context
- **Real-Time UI Updates**: Generated images display immediately without page refresh

### Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  GENERATION & INTERCEPTION                                                   │
│                                                                              │
│  [GenerateImageAction] ──returns──> base64 image (~700K tokens)              │
│           │                                                                  │
│           ▼                                                                  │
│  [interceptLargeBinaryContent()] ◄── Replaces with ${media:xxx} placeholder  │
│           │                                                                  │
│           ▼                                                                  │
│  LLM sees placeholder (~30 tokens) ◄── Massive context savings!              │
└──────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  OUTPUT RESOLUTION                                                           │
│                                                                              │
│  Research Agent:                                                             │
│    • Placeholder in payload HTML → resolved to base64 data URI               │
│    • Image embedded in artifact report AND saved as attachment               │
│                                                                              │
│  Sage:                                                                       │
│    • Placeholder in message → triggers persist=true                          │
│    • <img> tags stripped from message (clean text output)                    │
│    • Image saved as attachment only                                          │
└──────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  PERSISTENCE & UI (both agent types)                                         │
│                                                                              │
│  [AIAgentRunMedia] ◄── Permanent storage of media                            │
│           │                                                                  │
│           ▼                                                                  │
│  [ConversationDetailAttachment] ◄── Displayed in conversation UI             │
│           │                                                                  │
│           ▼                                                                  │
│  [message-list watches attachmentsMap] ◄── Real-time UI updates              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Database Changes

- **AIPromptRunMedia**: Complete audit trail of all media generated during prompt execution
- **AIAgentRunMedia**: Media explicitly promoted by agents to their outputs
- **AIModelPriceUnitType**: Added 'Per Image' for image generation pricing

### New Image Generation Models

| Model | Vendor | API Name |
|-------|--------|----------|
| GPT-4o Image 1.5 | OpenAI | gpt-image-1.5 |
| GPT-4o Image 1.0 | OpenAI | gpt-image-1 |
| Nano Banana Pro | Google | gemini-3-pro-image-preview |
| FLUX.2 Pro | Black Forest Labs | flux-2-pro |
| FLUX 1.1 Pro | Black Forest Labs | flux-1.1-pro |

### TypeScript API

```typescript
// Agent promotes images to outputs
this.promoteMediaOutputs([{
    modality: 'Image',
    mimeType: 'image/png',
    data: base64Data,
    label: 'Generated Product Image'
}]);

// ExecuteAgentResult now includes mediaOutputs
const result = await agent.Execute(params);
if (result.mediaOutputs?.length > 0) {
    // Media is automatically saved to AIAgentRunMedia
    // and copied to ConversationDetailAttachment
}
```

### Files Modified

**Core Types**
- packages/AI/CorePlus/src/prompt.types.ts - Added MediaModality, PromptRunMediaReference
- packages/AI/CorePlus/src/agent-types.ts - Added MediaOutput, mediaOutputs, promoteMediaOutputs

**Agent Framework**
- packages/AI/Agents/src/base-agent.ts - Media accumulator, promoteMediaOutputs(), placeholder interception, message media processing
- packages/AI/Agents/src/AgentRunner.ts - SaveAgentRunMedia, CreateConversationMediaAttachments

**Image Generation**
- packages/AI/Core/src/generic/baseImage.ts - BaseImageGenerator abstract class
- packages/AI/Providers/OpenAI/src/models/openAIImage.ts - OpenAI implementation with GPT Image vs DALL-E param handling
- packages/AI/Providers/Gemini/src/models/geminiImage.ts - Gemini/Nano Banana Pro
- packages/AI/Providers/BlackForestLabs/src/index.ts - FLUX implementation
- packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts - GenerateImageAction

**Conversation UI**
- packages/Angular/Generic/conversations/.../conversation-chat-area.component.ts - Load attachments on agent completion
- packages/Angular/Generic/conversations/.../message-list.component.ts - Watch attachmentsMap for real-time updates

**Metadata**
- metadata/agents/.sage-agent.json - Added Generate Image action and Image Output modality
- metadata/prompts/templates/sage/sage.template.md - Image prompt crafting, uploaded image analysis, and image generation from uploads

**Migration**
- migrations/v2/V202601121807__v3.1.x__Add_Image_Generation_Models.sql

## Test plan

- [x] Run migration to create new tables and model metadata
- [x] Run CodeGen to generate entity classes
- [x] Test GenerateImageAction with image generation
- [x] Test agent media promotion with promoteMediaOutputs()
- [x] Verify AIAgentRunMedia records are created
- [x] Verify ConversationDetailAttachment records display in UI
- [x] Test with multiple images in single agent run
- [x] Sage generates images and displays them as attachments
- [x] Sage describes uploaded images when asked
- [x] Sage generates new images based on uploaded image context + user request
- [x] Images display immediately without page refresh
- [x] Research Agent embeds images in artifacts correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)

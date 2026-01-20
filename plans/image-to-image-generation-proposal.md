# Image-to-Image Generation Support Proposal

## Summary

**Current Issue:** The Generate Image action only supports text-to-image generation. When users upload an image and ask an agent to create a new image based on it (e.g., "make this chart look like a professional infographic"), the agent's multimodal LLM describes the uploaded image in text and passes that description to the image generator. The source image itself is never passed to the image generator, so true image-to-image transformation is not possible.

**Proposed Solution:** Add optional `SourceImage` and `Mask` input parameters to the existing Generate Image action. When `SourceImage` is provided, the action routes to the `EditImage` method (which already exists in BaseImageGenerator) instead of `GenerateImage`. This enables image editing, style transfer, and inpainting use cases while remaining fully backward compatible - existing text-to-image calls continue to work unchanged. The infrastructure already exists at the BaseImageGenerator level; we just need to expose it through the action interface.

---

## Current State Analysis

### BaseImageGenerator (Abstract Class)

Location: `packages/AI/Core/src/generic/baseImage.ts`

The base class defines three image generation methods:

| Method | Purpose | Action Exposure | Tested? |
|--------|---------|-----------------|---------|
| `GenerateImage(params)` | Text-to-image | ✅ Exposed via Generate Image action | ✅ Works with Nano Banana Pro |
| `EditImage(params)` | Image-to-image editing | ❌ NOT exposed | ❌ Not tested |
| `CreateVariation(params)` | Image variations | ❌ NOT exposed | ❌ Not tested |

**Key Types Already Defined:**

```typescript
class ImageEditParams {
    model?: string;
    image: Buffer | string;  // Source image (base64, URL, or Buffer)
    prompt: string;          // Edit instructions
    mask?: Buffer | string;  // Optional mask for inpainting
    n?: number;
    size?: ImageSize;
    outputFormat?: ImageResponseFormat;
}
```

### Provider Implementations

All three providers have `EditImage` and `CreateVariation` implemented, but **none are tested**:

| Provider | GenerateImage | EditImage | CreateVariation |
|----------|---------------|-----------|-----------------|
| **Gemini (Nano Banana Pro)** | ✅ Tested | ⚠️ Implemented, untested | ⚠️ Implemented, untested |
| **OpenAI (GPT Image)** | ✅ Tested | ⚠️ Implemented, untested | ⚠️ Implemented, untested |
| **Black Forest Labs (FLUX)** | ✅ Tested | ⚠️ Implemented, untested | ⚠️ Implemented, untested |

### Generate Image Action

Location: `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts`

Current input parameters:
- `Prompt` (required), `Model`, `NumberOfImages`, `Size`, `Quality`, `Style`, `NegativePrompt`, `OutputFormat`

**Missing**: No `SourceImage` or `Mask` parameters.

---

## Proposed Solution

Add optional `SourceImage` and `Mask` parameters to the existing Generate Image action. When `SourceImage` is provided, route to `EditImage` instead of `GenerateImage`.

### 1. Update Action Metadata

Add to `metadata/actions/.generate-image.json`:

```json
{
  "fields": {
    "ActionID": "@parent:ID",
    "Name": "SourceImage",
    "Type": "Input",
    "ValueType": "Scalar",
    "IsArray": false,
    "Description": "Optional source image for image-to-image generation. Accepts base64 string or URL. When provided, the action performs image editing instead of text-to-image generation.",
    "IsRequired": false
  }
},
{
  "fields": {
    "ActionID": "@parent:ID",
    "Name": "Mask",
    "Type": "Input",
    "ValueType": "Scalar",
    "IsArray": false,
    "Description": "Optional mask image for inpainting. White/transparent areas will be regenerated. Only used when SourceImage is provided.",
    "IsRequired": false
  }
}
```

### 2. Update Action Implementation

```typescript
protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const prompt = this.getParamValue(params, 'prompt');
    const sourceImage = this.getParamValue(params, 'sourceimage');
    const mask = this.getParamValue(params, 'mask');
    // ... other params ...

    let result: ImageGenerationResult;

    if (sourceImage) {
        // Image-to-image: use EditImage
        const editParams: ImageEditParams = {
            image: sourceImage,
            prompt: prompt,
            model: apiName,
            mask: mask,
            n: numberOfImages,
            size: size,
            outputFormat: outputFormat === 'url' ? 'url' : 'b64_json'
        };
        result = await generator.EditImage(editParams);
    } else {
        // Text-to-image: existing code path
        result = await generator.GenerateImage(genParams);
    }
    // ... rest unchanged ...
}
```

---

## Example Usage

### Image-to-Image (Style Transfer)

```json
{
  "actionName": "Generate Image",
  "params": {
    "Prompt": "Transform this simple bar chart into a professional infographic with dark theme and gradient backgrounds",
    "SourceImage": "${media:chart_ref_id}",
    "Model": "Nano Banana Pro",
    "Size": "1536x1024"
  }
}
```

### Inpainting with Mask

```json
{
  "actionName": "Generate Image",
  "params": {
    "Prompt": "Replace the background with a sunset beach scene",
    "SourceImage": "base64_encoded_image...",
    "Mask": "base64_encoded_mask...",
    "Model": "Nano Banana Pro"
  }
}
```

---

## Implementation Steps

1. **Update action metadata** - Add `SourceImage` and `Mask` parameters ✅ DONE
2. **Update action code** - Add routing logic for image-to-image ✅ DONE
3. **Run metadata sync** - Push new parameters to database (manual: `mj-sync push`)
4. **Test EditImage with Nano Banana Pro** - Verify the untested code path works
5. **Update Sage template** - Add guidance for using SourceImage parameter (optional, future)

---

## Implementation Status

### Completed (2026-01-18)

| File | Change | Status |
|------|--------|--------|
| `metadata/actions/.generate-image.json` | Added SourceImage and Mask input parameters, updated description | ✅ Complete |
| `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` | Added routing logic, helper methods `executeImageGeneration()` and `executeImageEdit()` | ✅ Complete |

### TypeScript Build
- CoreActions package builds successfully with no errors

### Remaining Steps
1. Run `mj-sync push` to sync metadata to database
2. Test image-to-image functionality with Nano Banana Pro model

---

## Testing Instructions

### Prerequisites
1. Run `mj-sync push` from `metadata/actions/` directory to sync new parameters
2. Ensure Nano Banana Pro model (or another image generator) is configured and active

### Test 1: Basic Text-to-Image (Regression Test)
Verify existing text-to-image functionality still works:

```json
{
  "actionName": "Generate Image",
  "params": {
    "Prompt": "A serene mountain landscape at sunset with snow-capped peaks",
    "Size": "1024x1024"
  }
}
```

**Expected:** Image generated successfully, no regression in existing functionality.

### Test 2: Image-to-Image Editing (New Feature)
Test the new SourceImage parameter:

```json
{
  "actionName": "Generate Image",
  "params": {
    "Prompt": "Transform this into a watercolor painting style",
    "SourceImage": "<base64-encoded-image-data>",
    "Size": "1024x1024"
  }
}
```

**Expected:** Action routes to `EditImage` method, transformed image returned.

### Test 3: Inpainting with Mask (New Feature)
Test SourceImage with Mask parameter:

```json
{
  "actionName": "Generate Image",
  "params": {
    "Prompt": "Replace background with a beach sunset",
    "SourceImage": "<base64-encoded-image-data>",
    "Mask": "<base64-encoded-mask-data>",
    "Size": "1024x1024"
  }
}
```

**Expected:** Only masked areas are regenerated.

### Test 4: Agent Integration
Test through Sage agent with an uploaded image:

1. Start conversation with Sage
2. Upload an image
3. Ask: "Transform this image into a cartoon style"

**Expected:** Agent passes uploaded image as SourceImage parameter to Generate Image action.

---

## Important Notes

### Provider EditImage/CreateVariation Status

⚠️ **The `EditImage` and `CreateVariation` methods in all three providers are implemented but UNTESTED:**

| Provider | Location | Notes |
|----------|----------|-------|
| Gemini | `packages/AI/Gemini/src/models/geminiImage.ts` | `EditImage()` implemented, not tested |
| OpenAI | `packages/AI/OpenAI/src/models/image.ts` | `EditImage()` implemented, not tested |
| Black Forest Labs | `packages/AI/BlackForestLabs/src/models/image.ts` | `EditImage()` implemented, not tested |

Testing may reveal bugs or missing functionality in provider implementations.

### Potential Issues to Watch For
1. **Image format handling**: Providers may expect different formats (base64, URL, Buffer)
2. **Model-specific limitations**: Not all models support all edit operations
3. **Mask format requirements**: Some providers have specific mask format requirements (e.g., PNG with alpha channel)

---

## Files Modified

| File | Change |
|------|--------|
| `metadata/actions/.generate-image.json` | Added SourceImage and Mask input parameters, updated action description |
| `packages/Actions/CoreActions/src/custom/ai/generate-image.action.ts` | Added routing logic for image-to-image, refactored into helper methods |

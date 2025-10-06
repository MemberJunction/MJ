# Gamma Generate Presentation Action Demo

This document demonstrates how to use the MemberJunction CLI to execute the Gamma Generate Presentation action.

## Overview

The Gamma Generate Presentation action integrates with Gamma's AI-powered Generations API to create professional presentations, documents, or social media posts from text input.

## Prerequisites

- MemberJunction CLI installed
- Gamma API key configured in `mj.config.cjs` or as `GAMMA_API_KEY` environment variable

## Running the Action

### Command

```bash
npx mj ai actions run -n "Gamma Generate Presentation" \
  --param "InputText=Create a presentation about the benefits of TypeScript for enterprise development. Cover type safety, developer productivity, and maintainability." \
  --verbose
```

### Response

```
✓ Action execution completed successfully
Action: Gamma Generate Presentation
Duration: 75208ms
Result:
[
  {
    "Name": "GenerationId",
    "Type": "Output",
    "Value": "AsjotVhXMAC3K1gGz556Z"
  },
  {
    "Name": "GammaUrl",
    "Type": "Output",
    "Value": "https://gamma.app/docs/hnuu5u7dhrazf13"
  },
  {
    "Name": "Status",
    "Type": "Output",
    "Value": "completed"
  },
  {
    "Name": "Credits",
    "Type": "Output",
    "Value": {
      "deducted": 48,
      "remaining": 7952
    }
  }
]
```

## Generated Presentation

**View the generated presentation:** [https://gamma.app/docs/hnuu5u7dhrazf13](https://gamma.app/docs/hnuu5u7dhrazf13)

The action successfully created a presentation about TypeScript for enterprise development, covering:
- Type safety
- Developer productivity
- Maintainability

**Generation Details:**
- Generation ID: `AsjotVhXMAC3K1gGz556Z`
- Status: `completed`
- Execution time: 75.2 seconds
- Credits used: 48
- Credits remaining: 7,952

## Additional Options

The Gamma Generate Presentation action supports many optional parameters:

- `Format`: Type of output (presentation, document, social-media)
- `TextMode`: Generation mode (generate, magic-fill, extract-outline, etc.)
- `ThemeName`: Custom theme name
- `ImageSource`: Image generation source (ai, unsplash, auto)
- `ImageStyle`: Style for AI-generated images
- `NumCards`: Number of slides/cards to generate
- `TextTone`: Tone of the text (professional, casual, friendly, etc.)
- `TextAudience`: Target audience
- `ExportAs`: Export format (pdf, pptx)
- And more...

## Example with More Options

```bash
npx mj ai actions run -n "Gamma Generate Presentation" \
  --param "InputText=Product launch strategy for Q1 2025" \
  --param "Format=presentation" \
  --param "NumCards=10" \
  --param "TextTone=professional" \
  --param "TextAudience=executives" \
  --param "ImageSource=ai" \
  --param "ImageStyle=photorealistic"
```

## Execution Logs

Each execution creates a timestamped log file for debugging and audit purposes.

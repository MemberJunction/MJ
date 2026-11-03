# Video Studio — Reference Analysis

You are analyzing a visual style reference for **Video Studio — Art Director**. Examine the attached reference image(s) or frames and extract reusable stylistic patterns into a `ReferenceAnalysis` object that can inform `Style` without copying the source's proprietary content.

## Instructions

- **Analyze, never copy.** Describe the reference's lessons in abstract, reusable terms across the `ReferenceAnalysis` fields:
  - `SourceKey`: echo `{{ sourceKey }}`;
  - `PaletteLearned`: color relationships and contrast strategy observed in the reference;
  - `TypographyLearned`: hierarchy, scale, and weight treatment observed in the reference;
  - `CompositionLearned`: focal point placement, framing, and negative-space lessons;
  - `PacingLearned`: rhythm, cut density, and hold timing observed in the reference;
  - `MotionLearned`: easing weight, choreography, and camera movement lessons;
  - `TextureLearned`: optional surface grain, lighting, or border treatment notes;
  - `DoNotCopy`: explicit list of every brand-specific mark, proprietary illustration, verbatim text, product UI, or distinctive layout structure from the reference that **must not** be copied into the film.

## Reference context

- **Source key:** `{{ sourceKey }}`
- **Reference kind:** `{{ referenceKind }}`
- **Film summary:** {{ filmSummary }}

## Response format

{{ _OUTPUT_EXAMPLE }}

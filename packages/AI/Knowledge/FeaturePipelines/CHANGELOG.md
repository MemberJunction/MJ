# @memberjunction/feature-pipelines

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 4248fb3: Add `DecisionFeaturePipelineDriver`, an infer processor driver that evaluates structured decisions through `AIDecisionRunner` for feature pipelines. Supports Likelihood (boolean with configurable constraint threshold), Choice (enum), and Score (numeric with 2-10 level rubrics) outputs, confidence tracking, and metadata catalog integration.
- ef43cf3: Add `MJ: Feature Pipeline Types`, the catalog of Knowledge Hub Feature Pipeline types. Each type names the driver class that turns a record's context into its output values, so a new type is a row plus a registered class. Seeds the `LLM` type, which is what every existing pipeline is.

### Patch Changes

- 664baea: A Decision Feature Pipeline can now escalate its borderline records to an LLM Feature Pipeline: set `Escalation` (the LLM pipeline's ID and a confidence floor) in its spec, and only the records whose confidence falls below the floor are re-run through the LLM pipeline, whose answers replace the decision's.
- 513e608: Add pipeline type picker, capability-aware output filtering and validation, Decision-specific constraint editors, and type badges for Feature Pipelines. What each pipeline type can produce is now one rule set, shared by the server, the builder and the save check. A Decision pipeline reads enum values and descriptions from its own entity's fields only; before, it read them from any entity with a field of the same name. An enum reads field metadata only when it sets FromFieldMetadata or lists no values, and only a type that needs listed values (Decision) requires them.

  A Record Process now refuses at save an Infer pipeline its type cannot run, on both tiers and every save path, through the shared MJRecordProcessEntityExtended; the Record Process form also refuses while the builder reports errors. The builder loads and edits CaptureReasoning, and keeps Watermark. Its pickers now show the saved pipeline type, prompt, entity document, target and constraint, not the first option, and a placeholder when the saved value is not offered.

- e9ab27b: feat(record-processes): add borderline escalation section to feature pipeline builder and extract escalation target problem validators to feature-pipelines
- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

- 6e6e3f1: Feature Pipelines: schema migration (V202609212241), data feature spec, runtime constraint validation, and write-back extensions.

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

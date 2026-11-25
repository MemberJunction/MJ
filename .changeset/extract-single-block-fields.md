---
"@memberjunction/content-pipeline": minor
"@memberjunction/content-pipeline-base": minor
---

An extractor reading a single document can now set its `Date`, `Decorator` and other well-known fields. Extract proposes a single block's `Fields` on the item itself, each at its own confidence and skipping null values, as the stage's own findings (`Extract.Block`): a re-extraction replaces them and another stage's value competes on confidence. Before, only a container's children received `Fields`, and `Date` and `Decorator` cannot travel through `Columns`. A block's `Title` works as before; a `Title` in `Fields` replaces it only when more confident.

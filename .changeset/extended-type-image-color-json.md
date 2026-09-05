---
"@memberjunction/core": minor
"@memberjunction/ng-base-forms": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/codegen-lib": patch
---

Add Image, Color, and JSON to EntityField.ExtendedType. Forms render an image thumbnail (including inline base64 / data URIs) with an edit-mode upload capped at the field's MaxLength, a color swatch + hex editor, and a pretty-printed JSON textarea. Entity-viewer grid/cards/timeline key image cells off ExtendedType rather than field-name heuristics. PhotoURL, LogoURL, and ImageURL are reclassified to Image with AutoUpdateExtendedType locked so CodeGen cannot overwrite them.

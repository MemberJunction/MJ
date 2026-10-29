---
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-conversations": patch
---

`<mj-markdown>` images can be capped by the host with the `--mj-markdown-image-max-height` CSS custom property (unset: no cap, as before), and a new `ImageClicked` output reports a clicked or keyboard-activated image (not one inside a link; images stay inert unless the output is bound). The conversation message item binds it and opens the image in the chat's existing image viewer, the same way an attachment thumbnail opens. The image viewer's Download opens a cross-origin image in a new tab instead of navigating the app away (browsers ignore `download` across origins).

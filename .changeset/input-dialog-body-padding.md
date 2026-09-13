---
"@memberjunction/ng-conversations": patch
---

Input dialog (rename conversation, and every `dialogService.input()` prompt) gets the same horizontal padding as the rating dialog. The dialog container pads only string content, so a component body's message, labels and inputs sat flush against the dialog edges while the header and footer were padded.

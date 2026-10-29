---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard export emits item author, font weight and font family only from their literal sets, and board loading coerces those fields on persisted items, so a crafted shared board cannot inject markup into exported or printed HTML (CodeQL #366, #367; #5569).

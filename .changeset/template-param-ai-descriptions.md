---
"@memberjunction/core-entities-server": minor
---

Template parameter extraction keeps the AI-written parameter descriptions again. Since the PascalCase rename the pipeline read `Description` from the model's output, which returns `description`, so every save fell back to generic text such as "Template scalar parameter 'x'" and overwrote better descriptions.

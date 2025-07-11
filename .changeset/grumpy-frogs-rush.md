---
"@memberjunction/server": patch
---

Fix AI prompt cost calculations by loading BaseAIEngine during server
initialization.

AI prompt runs were not calculating costs because price unit type
calculators weren't being registered in the ClassFactory system. This
fix ensures the BaseAIEngine module loads properly, enabling automatic
cost calculation based on token usage and model pricing configurations.

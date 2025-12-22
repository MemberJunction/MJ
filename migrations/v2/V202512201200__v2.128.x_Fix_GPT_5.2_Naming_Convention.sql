/*
   Description: Fix GPT 5.2 naming convention to match other GPT version models

   ISSUE: The model "GPT-5.2" breaks naming conventions in two ways:
   1. Uses hyphen between "GPT" and "5.2" instead of space
   2. Version numbers should use space, not hyphen (variants like "mini" use hyphen)

   CONVENTION:
   - Version numbers: "GPT 3.5", "GPT 4", "GPT 4.1", "GPT 5" (space after GPT)
   - Model variants: "GPT 4o-mini", "GPT 5-mini", "GPT 5-nano" (hyphen before variant)

   CORRECTION: "GPT-5.2" → "GPT 5.2"
*/

UPDATE ${flyway:defaultSchema}.AIModel
SET Name = 'GPT 5.2'
WHERE ID = '318BDCAD-FF2A-45E4-AB51-98754DF08E7A'
  AND Name = 'GPT-5.2';

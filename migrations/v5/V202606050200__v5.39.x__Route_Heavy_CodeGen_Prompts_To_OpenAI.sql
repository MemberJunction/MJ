-- =====================================================================================
-- Route heavy CodeGen prompts off Gemini 3.1 Flash-Lite to OpenAI (issue #2765)
-- =====================================================================================
-- Problem:
--   The two heavy CodeGen prompts -- "CodeGen: Smart Field Identification" and
--   "CodeGen: Form Layout Generation" -- have model candidate lists in
--   ${flyway:defaultSchema}.AIPromptModel that top out at Gemini 3.1 Flash-Lite
--   (Priority 11/12). On these large prompts Flash-Lite returns 0 output tokens,
--   producing empty output and breaking CodeGen's advanced generation.
--
-- Fix:
--   Raise the existing OpenAI 'GPT 5.5 Instant' AIPromptModel row for each of these
--   two prompts to Priority 20 -- above every Gemini candidate (max Priority 12) --
--   so the prompt runner selects OpenAI first. OpenAI was validated live to return
--   parseable output for both prompts. Gemini rows are left in place as lower-priority
--   fallbacks.
--
-- Notes:
--   * Prompts are referenced by name via a subquery on AIPrompt.Name (no hardcoded
--     PromptIDs) so the migration is resilient to environment differences.
--   * The OpenAI model is referenced by name 'GPT 5.5 Instant' via AIModel.Name.
--   * UPDATEs are idempotent: re-running sets Priority to the same value (20).
-- =====================================================================================

UPDATE apm
SET apm.Priority = 20
FROM ${flyway:defaultSchema}.AIPromptModel AS apm
INNER JOIN ${flyway:defaultSchema}.AIPrompt AS p
    ON apm.PromptID = p.ID
INNER JOIN ${flyway:defaultSchema}.AIModel AS m
    ON apm.ModelID = m.ID
WHERE p.Name IN (
        N'CodeGen: Smart Field Identification',
        N'CodeGen: Form Layout Generation'
    )
  AND m.Name = N'GPT 5.5 Instant'
  AND apm.Priority <> 20;

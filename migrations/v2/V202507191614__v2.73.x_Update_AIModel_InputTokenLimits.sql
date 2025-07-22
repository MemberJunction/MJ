-- Update AI Model Vendor Token Limits
-- This migration updates the MaxInputTokens field with current, accurate context window sizes
-- for all AI model vendors in the system as of July 2025
-- Uses primary key IDs from AIModelVendor table for precise record targeting

-- OpenAI Models (Active Inference Providers)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'b033433e-f36b-1410-8d78-00a3fcabc804'; -- GPT 4o
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'c533433e-f36b-1410-8d78-00a3fcabc804'; -- GPT 4o-mini
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 1047576 WHERE [ID] = 'cb33433e-f36b-1410-8d78-00a3fcabc804'; -- GPT 4.1
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 1000000 WHERE [ID] = 'c833433e-f36b-1410-8d78-00a3fcabc804'; -- GPT 4.1-mini
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'bc33433e-f36b-1410-8d78-00a3fcabc804'; -- o1
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'bf33433e-f36b-1410-8d78-00a3fcabc804'; -- o1-mini
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'c233433e-f36b-1410-8d78-00a3fcabc804'; -- o1-pro
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'b633433e-f36b-1410-8d78-00a3fcabc804'; -- o3
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'b933433e-f36b-1410-8d78-00a3fcabc804'; -- o3-mini
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'b333433e-f36b-1410-8d78-00a3fcabc804'; -- o4-mini
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 16385 WHERE [ID] = 'a133433e-f36b-1410-8d78-00a3fcabc804'; -- GPT 3.5 (legacy/inactive)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'a433433e-f36b-1410-8d78-00a3fcabc804'; -- GPT 4 (legacy/inactive)

-- Anthropic Models (Active Inference Providers)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'da33433e-f36b-1410-8d78-00a3fcabc804'; -- Claude 3 - Opus
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'dd33433e-f36b-1410-8d78-00a3fcabc804'; -- Claude 3.5 Sonnet
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'ce33433e-f36b-1410-8d78-00a3fcabc804'; -- Claude 3.7 Sonnet
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = '87c5433e-f36b-1410-8dab-00021f8b792e'; -- Claude 4 Opus
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = '8bc5433e-f36b-1410-8dab-00021f8b792e'; -- Claude 4 Sonnet
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'd133433e-f36b-1410-8d78-00a3fcabc804'; -- claude-v1 (legacy/inactive)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'd433433e-f36b-1410-8d78-00a3fcabc804'; -- Claude 3 - Haiku (legacy/inactive)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 200000 WHERE [ID] = 'd733433e-f36b-1410-8d78-00a3fcabc804'; -- Claude 3 - Sonnet (legacy/inactive)

-- Google Models (Active Inference Providers)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 2097152 WHERE [ID] = '1034433e-f36b-1410-8d78-00a3fcabc804'; -- Gemini 1.5 Pro
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 1048576 WHERE [ID] = '1c34433e-f36b-1410-8d78-00a3fcabc804'; -- Gemini 1.5 Flash
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 1048576 WHERE [ID] = '1634433e-f36b-1410-8d78-00a3fcabc804'; -- Gemini 2.0 Flash
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 1048576 WHERE [ID] = '1934433e-f36b-1410-8d78-00a3fcabc804'; -- Gemini 2.0 Flash-Lite
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 2097152 WHERE [ID] = '0a34433e-f36b-1410-8d78-00a3fcabc804'; -- Gemini 2.5 Pro Preview
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 1048576 WHERE [ID] = '0d34433e-f36b-1410-8d78-00a3fcabc804'; -- Gemini 2.5 Flash Preview
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 2097152 WHERE [ID] = '1334433e-f36b-1410-8d78-00a3fcabc804'; -- Gemini 1.0 Ultra (legacy/inactive)

-- Groq Models (Active Inference Providers)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 4096 WHERE [ID] = 'f533433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 2 70B / Groq
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 8192 WHERE [ID] = 'f833433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 3 70b
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '0734433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 3.1 8b
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'fb33433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 3.1 405b
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'fe33433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 3.3 70B Versatile
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'ec33433e-f36b-1410-8d78-00a3fcabc804'; -- Deepseek R1 Distill Llama 3.3 70B
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'ef33433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 4 Scout
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'f233433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 4 Maverick
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '0134433e-f36b-1410-8d78-00a3fcabc804'; -- Groq Compound
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '0434433e-f36b-1410-8d78-00a3fcabc804'; -- Llama 3.1 70b (inactive)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '9a558e9b-fdea-4ea6-a0e8-8e94472dfecf'; -- Qwen 3 32B (Groq)

-- Mistral Models (Active Inference Providers)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 32000 WHERE [ID] = 'e333433e-f36b-1410-8d78-00a3fcabc804'; -- Mixtral 8x7B
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = 'e633433e-f36b-1410-8d78-00a3fcabc804'; -- Mistral Large
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 32000 WHERE [ID] = 'e933433e-f36b-1410-8d78-00a3fcabc804'; -- Mistral Medium
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 8192 WHERE [ID] = 'e033433e-f36b-1410-8d78-00a3fcabc804'; -- mistral-embed

-- Cerebras Models (Active Inference Providers)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '4cb2443e-f36b-1410-8db7-00021f8b792e'; -- Qwen 3 235B
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '5ada433e-f36b-1410-8db6-00021f8b792e'; -- Llama 3.1 70b (Cerebras)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '55da433e-f36b-1410-8db6-00021f8b792e'; -- Llama 3.3 70B Versatile (Cerebras)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '5fda433e-f36b-1410-8db6-00021f8b792e'; -- Llama 4 Scout (Cerebras)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '64da433e-f36b-1410-8db6-00021f8b792e'; -- Deepseek R1 Distill Llama 3.3 70B (Cerebras)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 128000 WHERE [ID] = '69da433e-f36b-1410-8db6-00021f8b792e'; -- Qwen 3 32B (Cerebras)

-- Audio Generation Models (set reasonable limits for text input)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 4000 WHERE [ID] = '9833433e-f36b-1410-8d78-00a3fcabc804'; -- Eleven Labs
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 4000 WHERE [ID] = '9e33433e-f36b-1410-8d78-00a3fcabc804'; -- OpenAI TTS

-- Video Generation Models (set reasonable limits for text input)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 4000 WHERE [ID] = '9b33433e-f36b-1410-8d78-00a3fcabc804'; -- HeyGen

-- OpenAI Embedding Models (set appropriate limits)
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 8192 WHERE [ID] = 'a733433e-f36b-1410-8d78-00a3fcabc804'; -- text-embedding-3-small
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 8192 WHERE [ID] = 'aa33433e-f36b-1410-8d78-00a3fcabc804'; -- text-embedding-3-large
UPDATE [${flyway:defaultSchema}].[AIModelVendor] SET [MaxInputTokens] = 8192 WHERE [ID] = 'ad33433e-f36b-1410-8d78-00a3fcabc804'; -- text-embedding-ada-002
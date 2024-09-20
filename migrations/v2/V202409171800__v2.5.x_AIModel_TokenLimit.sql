-- Insert a few new models into the AIModel table
INSERT INTO [${flyway:defaultSchema}].[AIModel] ([ID], [Name], [Description], [Vendor], [AIModelTypeID], [PowerRank], [IsActive], [DriverClass], [DriverImportPath], [APIName], [SpeedRank], [CostRank], [InputTokenLimit]) VALUES ('16AFB4A5-3343-40C7-8982-03F979A15AE0', 'Llama 3.1 405b', 'Llama 3.1 405 billion parameters', 'Groq', 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', 5, 1, 'GroqLLM', NULL, 'llama-3.1-405b-reasoning', NULL, NULL, 128000);
INSERT INTO [${flyway:defaultSchema}].[AIModel] ([ID], [Name], [Description], [Vendor], [AIModelTypeID], [PowerRank], [IsActive], [DriverClass], [DriverImportPath], [APIName], [SpeedRank], [CostRank], [InputTokenLimit]) VALUES ('F126ED5B-97B3-49E7-BD3B-E796B2099231', 'Llama 3.1 70b', 'Llama 3.1 70 billion parameters', 'Groq', 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', 4, 1, 'GroqLLM', NULL, 'llama-3.1-70b-versatile', NULL, NULL, 128000);
INSERT INTO [${flyway:defaultSchema}].[AIModel] ([ID], [Name], [Description], [Vendor], [AIModelTypeID], [PowerRank], [IsActive], [DriverClass], [DriverImportPath], [APIName], [SpeedRank], [CostRank], [InputTokenLimit]) VALUES ('1D9493CE-1AF6-49F6-B2EA-EABCAB491571', 'Llama 3.1 8b', 'Llama 3.1 8 billion parameters', 'Groq', 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', 2, 1, 'GroqLLM', NULL, 'llama-3.1-8b-instant', NULL, NULL, 128000);
INSERT INTO [${flyway:defaultSchema}].[AIModel] ([ID], [Name], [Description], [Vendor], [AIModelTypeID], [PowerRank], [IsActive], [DriverClass], [DriverImportPath], [APIName], [SpeedRank], [CostRank], [InputTokenLimit]) VALUES ('5D218BCF-B7F6-439E-97FD-DC3A79432562', 'Claude 3.5 Sonnet', 'First model of the Claude 3.5 model family', 'Anthropic', 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', 5, 1, 'AnthropicLLM', NULL, 'claude-3-5-sonnet-20240620', NULL, NULL, 200000);
INSERT INTO [${flyway:defaultSchema}].[AIModel] ([ID], [Name], [Description], [Vendor], [AIModelTypeID], [PowerRank], [IsActive], [DriverClass], [DriverImportPath], [APIName], [SpeedRank], [CostRank], [InputTokenLimit]) VALUES ('0AE8548E-30A6-4FBC-8F69-6344D0CBAF2D', 'GPT 4o Mini', 'Affordable and intelligent small model for fast, lightweight tasks. GPT-4o mini is cheaper and more capable than GPT-3.5 Turbo', 'OpenAI', 'E8A5CCEC-6A37-EF11-86D4-000D3A4E707E', 4, 1, 'OpenAILLM', NULL, 'gpt-4o-mini', NULL, NULL, 128000);

-- Update the InputTokenLimit for existing models
UPDATE [${flyway:defaultSchema}].[AIModel] SET APIName='open-mistral-8x7b', [InputTokenLimit]=32000 WHERE ID='E2A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=16385 WHERE ID='D8A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=128000 WHERE ID='D9A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=200000 WHERE ID='DFA5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=200000 WHERE ID='E0A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=200000 WHERE ID='E1A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=4096 WHERE ID='E3A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=2097152 WHERE ID='E4A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=2097152 WHERE ID='E5A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=128000 WHERE ID='E6A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=8192 WHERE ID='E7A5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=8192 WHERE ID='DEA5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=8192 WHERE ID='DCA5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=8192 WHERE ID='DDA5CCEC-6A37-EF11-86D4-000D3A4E707E';
UPDATE [${flyway:defaultSchema}].[AIModel] SET [InputTokenLimit]=8192 WHERE ID='DBA5CCEC-6A37-EF11-86D4-000D3A4E707E';
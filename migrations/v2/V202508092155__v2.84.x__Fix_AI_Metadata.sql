
UPDATE ${flyway:defaultSchema}.AIModel SET Name = 'GPT 5' WHERE Name='GPT-5'
UPDATE ${flyway:defaultSchema}.AIModel SET Name = 'GPT 5-mini' WHERE Name='GPT-5 Mini'
UPDATE ${flyway:defaultSchema}.AIModel SET Name = 'GPT 5-nano' WHERE Name='GPT-5 Nano'

-- Open AI to be higher priority for GPT 5 class models
UPDATE ${flyway:defaultSchema}.AIModelVendor 
SET Priority=1 
WHERE ID IN ('6F6210A5-72F2-4D76-AD19-B2E49A9E2FA8', '945C1236-B7C2-4F6B-A535-0915BF861CC0', 'FC307EF5-EA02-4EBF-8553-8A81A436702B')

-- Update Azure to be lower priority than OpenAI
UPDATE ${flyway:defaultSchema}.AIModelVendor 
SET Priority=0
WHERE ID IN ('3E7D9C36-3C18-42F5-AE09-562E2C2436BC', 'B964EDCF-625C-4D0B-B0FC-C1D5E8CF24B1','C00086B7-E296-40BE-95D4-1FDEDFAAC79D')

-- don't expand form by default for Flow/Loop agent types in the UI
UPDATE ${flyway:defaultSchema}.AIAgentType SET UIFormSectionExpandedByDefault=0 WHERE ID IN ('4F6A189B-C068-4736-9F23-3FF540B40FDD','F7926101-5099-4FA5-836A-479D9707C818')

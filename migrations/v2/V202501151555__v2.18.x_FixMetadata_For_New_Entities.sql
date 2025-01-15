-- FIX UP METADATA from prior poor naming generation

-- Update the Name for AIAgent Actions
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Actions'
WHERE ID = '196B0316-6078-47A4-94B9-44A2FC5E8A55';

-- Update the Name for AIAgent Learning Cycles
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Learning Cycles'
WHERE ID = '96A815C7-49E4-4794-8739-DC5A2D3B2D9C';

-- Update the Name for AIAgent Models
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Models'
WHERE ID = '785C70B0-A456-4844-AF74-03AB8B55F633';

-- Update the Name for AIAgent Note Types
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Note Types'
WHERE ID = '9538A453-8EA3-444E-AAA8-0A5EC806A5A7';

-- Update the Name for AIAgent Notes
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agent Notes'
WHERE ID = 'A24EF5EC-D32C-4A53-85A9-364E322451E6';

-- Update the Name for AIAgents
UPDATE ${flyway:defaultSchema}.Entity
SET Name = 'AI Agents'
WHERE ID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1';

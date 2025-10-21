/**
  Remove obsolete Agent Management Actions and related records.

  This migration removes 12 agent management actions that are no longer needed:
  1. Create Agent
  2. Update Agent
  3. List Agents
  4. Deactivate Agent
  5. Associate Action With Agent
  6. Create Sub Agent
  7. Set Agent Prompt
  8. Validate Agent Configuration
  9. Export Agent Bundle
  10. Get Agent Details
  11. Get Action Details
  12. List Actions
  13. Create Prompt

  The removal is done in the correct dependency order:
  1. ActionExecutionLog records (references actions)
  2. AIAgentAction associations (uses actions)
  3. ActionParam records (belongs to actions)
  4. Action records themselves
**/

-- =====================================================
-- Step 1: Remove ActionExecutionLog records
-- =====================================================

DELETE FROM [${flyway:defaultSchema}].ActionExecutionLog
WHERE ActionID IN (
  'AD6C84E7-20FF-405D-BD61-24759B2C6700',  -- Create Agent
  'DA51A9CA-F7FA-40DC-85D1-556A178E1E4E',  -- Update Agent
  '63498D60-8EA5-4C8E-8D82-3E190D6CE078',  -- List Agents
  '14A913E6-D6D7-4A03-B7E6-55C782D1ECA3',  -- Deactivate Agent
  '9C4674A4-154D-455D-882F-5894B17B4BF8',  -- Associate Action With Agent
  'BEC27BD2-6008-46E8-9A8E-204772DF2517',  -- Create Sub Agent
  '00A65017-2C4A-420D-9043-F7E4AC5A35C4',  -- Set Agent Prompt
  '5D2C0B7D-93A0-42A1-B0EB-CDC5E60F090E',  -- Validate Agent Configuration
  '85F25A20-B62C-4BF2-9767-287105EC299C',  -- Export Agent Bundle
  'AF87C1F0-C94D-4A99-97A4-9638C56536DC',  -- Get Agent Details
  'CA8DBEE4-2A48-4F0A-B74D-A200671EBE68',  -- Get Action Details
  '05A12211-BDF9-420B-BC6F-0BEFFF7654DD',  -- List Actions
  'F9AA7A3F-E496-4D50-8DBB-DB98E31E0099'   -- Create Prompt
);

-- =====================================================
-- Step 2: Remove AIAgentAction associations
-- =====================================================

DELETE FROM [${flyway:defaultSchema}].AIAgentAction
WHERE ActionID IN (
  'AD6C84E7-20FF-405D-BD61-24759B2C6700',  -- Create Agent
  'DA51A9CA-F7FA-40DC-85D1-556A178E1E4E',  -- Update Agent
  '63498D60-8EA5-4C8E-8D82-3E190D6CE078',  -- List Agents
  '14A913E6-D6D7-4A03-B7E6-55C782D1ECA3',  -- Deactivate Agent
  '9C4674A4-154D-455D-882F-5894B17B4BF8',  -- Associate Action With Agent
  'BEC27BD2-6008-46E8-9A8E-204772DF2517',  -- Create Sub Agent
  '00A65017-2C4A-420D-9043-F7E4AC5A35C4',  -- Set Agent Prompt
  '5D2C0B7D-93A0-42A1-B0EB-CDC5E60F090E',  -- Validate Agent Configuration
  '85F25A20-B62C-4BF2-9767-287105EC299C',  -- Export Agent Bundle
  'AF87C1F0-C94D-4A99-97A4-9638C56536DC',  -- Get Agent Details
  'CA8DBEE4-2A48-4F0A-B74D-A200671EBE68',  -- Get Action Details
  '05A12211-BDF9-420B-BC6F-0BEFFF7654DD',  -- List Actions
  'F9AA7A3F-E496-4D50-8DBB-DB98E31E0099'   -- Create Prompt
);

-- =====================================================
-- Step 3: Remove ActionParam records
-- =====================================================

DELETE FROM [${flyway:defaultSchema}].ActionParam
WHERE ActionID IN (
  'AD6C84E7-20FF-405D-BD61-24759B2C6700',  -- Create Agent
  'DA51A9CA-F7FA-40DC-85D1-556A178E1E4E',  -- Update Agent
  '63498D60-8EA5-4C8E-8D82-3E190D6CE078',  -- List Agents
  '14A913E6-D6D7-4A03-B7E6-55C782D1ECA3',  -- Deactivate Agent
  '9C4674A4-154D-455D-882F-5894B17B4BF8',  -- Associate Action With Agent
  'BEC27BD2-6008-46E8-9A8E-204772DF2517',  -- Create Sub Agent
  '00A65017-2C4A-420D-9043-F7E4AC5A35C4',  -- Set Agent Prompt
  '5D2C0B7D-93A0-42A1-B0EB-CDC5E60F090E',  -- Validate Agent Configuration
  '85F25A20-B62C-4BF2-9767-287105EC299C',  -- Export Agent Bundle
  'AF87C1F0-C94D-4A99-97A4-9638C56536DC',  -- Get Agent Details
  'CA8DBEE4-2A48-4F0A-B74D-A200671EBE68',  -- Get Action Details
  '05A12211-BDF9-420B-BC6F-0BEFFF7654DD',  -- List Actions
  'F9AA7A3F-E496-4D50-8DBB-DB98E31E0099'   -- Create Prompt
);

-- =====================================================
-- Step 4: Remove Action records
-- =====================================================

DELETE FROM [${flyway:defaultSchema}].Action
WHERE ID IN (
  'AD6C84E7-20FF-405D-BD61-24759B2C6700',  -- Create Agent
  'DA51A9CA-F7FA-40DC-85D1-556A178E1E4E',  -- Update Agent
  '63498D60-8EA5-4C8E-8D82-3E190D6CE078',  -- List Agents
  '14A913E6-D6D7-4A03-B7E6-55C782D1ECA3',  -- Deactivate Agent
  '9C4674A4-154D-455D-882F-5894B17B4BF8',  -- Associate Action With Agent
  'BEC27BD2-6008-46E8-9A8E-204772DF2517',  -- Create Sub Agent
  '00A65017-2C4A-420D-9043-F7E4AC5A35C4',  -- Set Agent Prompt
  '5D2C0B7D-93A0-42A1-B0EB-CDC5E60F090E',  -- Validate Agent Configuration
  '85F25A20-B62C-4BF2-9767-287105EC299C',  -- Export Agent Bundle
  'AF87C1F0-C94D-4A99-97A4-9638C56536DC',  -- Get Agent Details
  'CA8DBEE4-2A48-4F0A-B74D-A200671EBE68',  -- Get Action Details
  '05A12211-BDF9-420B-BC6F-0BEFFF7654DD',  -- List Actions
  'F9AA7A3F-E496-4D50-8DBB-DB98E31E0099'   -- Create Prompt
);

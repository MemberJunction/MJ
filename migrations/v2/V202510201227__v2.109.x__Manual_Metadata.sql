-- REMOVE AI Agent Actions for the Database Research Agent that aren't used anymore
DELETE FROM ${flyway:defaultSchema}.AIAgentAction WHERE ID IN
(
'644D35FA-3245-4928-A8AD-4E70446054C2',-- explore DB schema
'A0438D04-00C5-4E62-9B65-C25AFA42EA1A' -- Get Entity List
)
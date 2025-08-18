-- Remove ESM libs from available list
DELETE FROM ${flyway:defaultSchema}.ComponentLibrary WHERE ID IN (
    '3B520A11-731D-4C7B-9699-18906BB4CA53',--	react-select
    '8086FB43-A9A6-4CB4-B0BA-64DF478429F7',--	classnames
    'DB3D64C3-0D00-4D40-9AA7-99243916CF38',--	framer-motion
    '94552655-B996-4791-9008-A2D6AAC526AC',--	date-fns
    'BBABE030-7C12-4080-8DFD-ECB634C8615E'--	material-table
)


-- Annoying to have the extended UI form section exapnded by default when viewing agents
UPDATE ${flyway:defaultSchema}.AIAgentType SET UIFormSectionExpandedByDefault = 0 WHERE ID IN 
 (
 '4F6A189B-C068-4736-9F23-3FF540B40FDD', -- flow
 'F7926101-5099-4FA5-836A-479D9707C818' --loop
 )
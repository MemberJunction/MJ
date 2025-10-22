-- Deactivate Skip
update ${flyway:defaultSchema}.ExplorerNavigationItem SET IsActive=0 WHERE ID ='0148F770-F93F-EF11-86D4-0022481D1B23' -- Ask Skip

-- Add Chat
INSERT INTO ${flyway:defaultSchema}.ExplorerNavigationItem 
(
	ID,
	Sequence,
	Name,
	Route,
	IsActive,
	ShowInHomeScreen,
	ShowInNavigationDrawer,
	IconCSSClass,
	Description
)
VALUES
(
	'8D16453E-F36B-1410-8DCC-00021F8B792E',
	2,
	'Chat',
	'/chat',
	1,
	1,
	1,
	'fa-solid fa-robot',
	'Agent Conversations'
)
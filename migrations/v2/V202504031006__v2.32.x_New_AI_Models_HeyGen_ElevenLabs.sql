INSERT INTO ${flyway:defaultSchema}.AIModel 
(
   ID,
   Name,
   Description,
   Vendor,
   AIModelTypeID,
   PowerRank,
   IsActive,
   DriverClass,
   APIName,
   SpeedRank, 
   CostRank,
   ModelSelectionInsights,
   InputTokenLimit,
   SupportedResponseFormats,
   ${flyway:defaultSchema}_CreatedAt,
   ${flyway:defaultSchema}_UpdatedAt
)
VALUES
(
    'DAB9433E-F36B-1410-8DA0-00021F8B792E',
	'Eleven Labs',
	'Eleven Labs Audio Generation',
	'Eleven Labs',
	'5F75433E-F36B-1410-8D99-00021F8B792E',
	10,
	1,
	'ElevenLabsAudioGenerator',
	NULL,
	1,
	5,
	NULL,
	NULL,
	'Any',
	'2025-04-03 15:04:57.3133333 +00:00',
	'2025-04-03 15:04:57.3133333 +00:00'
)


INSERT INTO ${flyway:defaultSchema}.AIModel 
(
   ID,
   Name,
   Description,
   Vendor,
   AIModelTypeID,
   PowerRank,
   IsActive,
   DriverClass,
   APIName,
   SpeedRank, 
   CostRank,
   ModelSelectionInsights,
   InputTokenLimit,
   SupportedResponseFormats,
   ${flyway:defaultSchema}_CreatedAt,
   ${flyway:defaultSchema}_UpdatedAt
)
VALUES
(
    'E1B9433E-F36B-1410-8DA0-00021F8B792E',
	'HeyGen',
	'HeyGen Video Generation',
	'HeyGen',
	'6175433E-F36B-1410-8D99-00021F8B792E',
	10,
	1,
	'HeyGenVideoGenerator',
	NULL,
	1,
	5,
	NULL,
	NULL,
	'Any',
    '2025-04-03 15:04:57.3133333 +00:00',
	'2025-04-03 15:04:57.3133333 +00:00'
)

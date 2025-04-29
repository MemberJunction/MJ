BEGIN
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
       __mj_CreatedAt,
       __mj_UpdatedAt
    )
    VALUES
    (
        'F2B9433E-F36B-1410-8DA0-00021F8B792E',
        'OpenAI TTS',
        'OpenAI Text-to-Speech Audio Generation',
        'OpenAI',
        '5F75433E-F36B-1410-8D99-00021F8B792E', -- Audio model type ID
        10,
        1,
        'OpenAIAudioGenerator',
        'gpt-4o-mini-tts',
        1,
        3,
        'High-quality text-to-speech generation with multiple voice options',
        NULL,
        'Any',
        '2025-04-25 17:00:00.0000000 +00:00',
        '2025-04-25 17:00:00.0000000 +00:00'
    )
END
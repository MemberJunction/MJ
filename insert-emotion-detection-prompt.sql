-- =====================================================
-- Insert Song Journal Emotion Detection AI Prompt
-- =====================================================

USE MJ_Local;
GO

-- First, get the AI Prompt Type ID for 'Chat'
DECLARE @ChatTypeID UNIQUEIDENTIFIER;
SELECT @ChatTypeID = ID FROM [__mj].[AIPromptType] WHERE Name = 'Chat';

-- Get the MJ: System category ID
DECLARE @CategoryID UNIQUEIDENTIFIER;
SELECT @CategoryID = ID FROM [__mj].[AIPromptCategory] WHERE Name = 'MJ: System';

-- Get the Groq vendor ID and GPT-OSS-120B model ID
DECLARE @GroqVendorID UNIQUEIDENTIFIER;
DECLARE @GroqModelID UNIQUEIDENTIFIER;
SELECT @GroqVendorID = ID FROM [__mj].[AIVendor] WHERE Name = 'Groq';
SELECT @GroqModelID = ID FROM [__mj].[AIModel] WHERE Name = 'GPT-OSS-120B';

-- Get the Anthropic vendor ID and Claude Haiku 4.5 model ID
DECLARE @AnthropicVendorID UNIQUEIDENTIFIER;
DECLARE @HaikuModelID UNIQUEIDENTIFIER;
SELECT @AnthropicVendorID = ID FROM [__mj].[AIVendor] WHERE Name = 'Anthropic';
SELECT @HaikuModelID = ID FROM [__mj].[AIModel] WHERE Name = 'Claude Haiku 4.5';

PRINT 'Chat Type ID: ' + ISNULL(CAST(@ChatTypeID AS NVARCHAR(50)), 'NOT FOUND');
PRINT 'Category ID: ' + ISNULL(CAST(@CategoryID AS NVARCHAR(50)), 'NOT FOUND');
PRINT 'Groq Vendor ID: ' + ISNULL(CAST(@GroqVendorID AS NVARCHAR(50)), 'NOT FOUND');
PRINT 'Groq Model ID: ' + ISNULL(CAST(@GroqModelID AS NVARCHAR(50)), 'NOT FOUND');
PRINT 'Anthropic Vendor ID: ' + ISNULL(CAST(@AnthropicVendorID AS NVARCHAR(50)), 'NOT FOUND');
PRINT 'Haiku Model ID: ' + ISNULL(CAST(@HaikuModelID AS NVARCHAR(50)), 'NOT FOUND');

-- Check if prompt already exists
IF NOT EXISTS (SELECT 1 FROM [__mj].[AIPrompt] WHERE Name = 'Song Journal Emotion Detection')
BEGIN
    DECLARE @PromptID UNIQUEIDENTIFIER = NEWID();

    -- Insert the prompt
    INSERT INTO [__mj].[AIPrompt] (
        ID,
        Name,
        Description,
        TypeID,
        CategoryID,
        Status,
        ResponseFormat,
        SelectionStrategy,
        PowerPreference,
        ParallelizationMode,
        MaxRetries,
        RetryDelayMS,
        RetryStrategy,
        PromptRole,
        PromptPosition,
        TemplateText
    )
    VALUES (
        @PromptID,
        'Song Journal Emotion Detection',
        'Analyzes a user''s journal entry about a song and detects the primary emotion expressed. Used by the Spotify Wrapped Song Journal feature to classify emotional connections to music.',
        @ChatTypeID,
        @CategoryID,
        'Active',
        'JSON',
        'Specific',
        'Lowest',
        'None',
        2,
        1000,
        'Fixed',
        'System',
        'First',
        '# Song Journal Emotion Detection Expert

You are an expert at analyzing personal reflections about music and identifying the primary emotion expressed in the text.

## Your Task

Analyze the provided journal entry about a song and determine the primary emotion the user is expressing or experiencing when listening to this song.

## Context Information

{% if songName %}
### Song
{{ songName }}
{% endif %}

{% if artist %}
### Artist
{{ artist }}
{% endif %}

{% if journalEntry %}
### Journal Entry
{{ journalEntry | safe }}
{% endif %}

{% if month %}
### Month Context
This song was the user''s top song in {{ month }}
{% endif %}

## Emotion Categories

Classify the emotion into ONE of the following primary categories:

- **Joy**: Happiness, excitement, celebration, elation
- **Nostalgia**: Reminiscence, longing for the past, bittersweet memories
- **Melancholy**: Sadness, grief, sorrow, contemplation of loss
- **Energy**: Motivation, power, determination, getting pumped up
- **Peace**: Calm, relaxation, serenity, tranquility
- **Love**: Romance, affection, connection, passion
- **Hope**: Optimism, anticipation, looking forward
- **Empowerment**: Confidence, strength, independence, self-belief
- **Reflection**: Introspection, self-examination, thoughtfulness
- **Comfort**: Safety, warmth, being understood, healing

## Output Format

Return a JSON object with this structure:

```json
{
  "emotion": "Nostalgia",
  "confidence": 0.85,
  "reasoning": "Brief explanation of why this emotion was detected",
  "secondaryEmotion": "Joy"
}
```

### Field Requirements

- `emotion`: **Required** - One of the emotion categories listed above
- `confidence`: **Required** - Number between 0 and 1 indicating confidence level
- `reasoning`: **Required** - 1-2 sentences explaining the classification
- `secondaryEmotion`: **Optional** - If another strong emotion is present

# CRITICAL
- Analyze the journal entry and return ONLY the specified JSON format
- Choose exactly one primary emotion from the provided categories
- Do not invent new emotion categories
- You **must** return ONLY the specified JSON format, any other tokens preceding or after the JSON will cause errors!'
    );

    PRINT 'Created AI Prompt with ID: ' + CAST(@PromptID AS NVARCHAR(50));

    -- Add primary model (Groq GPT-OSS-120B)
    IF @GroqVendorID IS NOT NULL AND @GroqModelID IS NOT NULL
    BEGIN
        INSERT INTO [__mj].[AIPromptModel] (
            PromptID,
            ModelID,
            VendorID,
            Priority
        )
        VALUES (
            @PromptID,
            @GroqModelID,
            @GroqVendorID,
            1
        );
        PRINT 'Added Groq GPT-OSS-120B as primary model';
    END
    ELSE
        PRINT 'WARNING: Could not add Groq model - vendor or model not found';

    -- Add fallback model (Anthropic Claude Haiku 4.5)
    IF @AnthropicVendorID IS NOT NULL AND @HaikuModelID IS NOT NULL
    BEGIN
        INSERT INTO [__mj].[AIPromptModel] (
            PromptID,
            ModelID,
            VendorID,
            Priority
        )
        VALUES (
            @PromptID,
            @HaikuModelID,
            @AnthropicVendorID,
            2
        );
        PRINT 'Added Anthropic Claude Haiku 4.5 as fallback model';
    END
    ELSE
        PRINT 'WARNING: Could not add Anthropic model - vendor or model not found';

    PRINT 'Song Journal Emotion Detection prompt created successfully!';
END
ELSE
BEGIN
    PRINT 'Prompt "Song Journal Emotion Detection" already exists - skipping';
END

GO

import {
    BaseEntity,
    CompositeKey,
    EntitySaveOptions,
    IMetadataProvider,
    LogError,
    RunView
} from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import {
    Activity__DemoEntity,
    ActivitySentimentEntity,
    ActivityTopicEntity,
    TopicEntity
} from "mj_generatedentities";

/**
 * Result structure expected from the AI sentiment analysis prompt
 */
interface SentimentAnalysisResult {
    overallSentiment: 'Positive' | 'Neutral' | 'Negative';
    sentimentScore: number; // -1.0 to 1.0
    emotionCategory: string | null;
    confidenceScore: number; // 0.0 to 1.0
    urgencyLevel: 'Low' | 'Medium' | 'High' | 'Critical' | null;
    urgencyScore: number | null; // 0.0 to 1.0
    requiresFollowUp: boolean;
}

/**
 * Result structure for a single detected topic
 */
interface DetectedTopic {
    topicName: string;
    confidenceScore: number; // 0.0 to 1.0
    relevanceRank: number; // 1 = primary, 2 = secondary, etc.
}

/**
 * Result structure expected from the AI topic classification prompt
 */
interface TopicClassificationResult {
    topics: DetectedTopic[];
}

/**
 * Combined analysis result from AI
 */
interface ActivityAnalysisResult {
    sentiment: SentimentAnalysisResult;
    topics: TopicClassificationResult;
}

/**
 * Server-side extended Activity entity for the Demo schema that automatically performs
 * AI-based sentiment analysis and topic classification when activities are saved.
 *
 * On save, if the activity has RawContent or Description and hasn't been processed by AI,
 * this class will:
 * 1. Call AI to analyze sentiment and detect topics
 * 2. Create/update an ActivitySentiment record
 * 3. Create ActivityTopic records linking to detected topics (creating topics if needed)
 * 4. Mark the activity as ProcessedByAI = true
 */
@RegisterClass(BaseEntity, 'Activities__Demo')
export class ActivityEntityServerExtended extends Activity__DemoEntity {

    /**
     * Override Save to trigger AI analysis after successful save
     */
    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        // Check if we should run AI analysis
        const shouldAnalyze = this.shouldRunAIAnalysis();

        // Save the activity first
        const saveResult = await super.Save(options);
        if (!saveResult) {
            return false;
        }

        // Run AI analysis asynchronously after save if needed
        if (shouldAnalyze) {
            await this.runAIAnalysisAsync();
        }

        return true;
    }

    /**
     * Determines if AI analysis should be run based on entity state
     */
    private shouldRunAIAnalysis(): boolean {
        // Skip if already processed
        if (this.ProcessedByAI) {
            return false;
        }

        // Need content to analyze
        const contentToAnalyze = this.RawContent || this.Description;
        if (!contentToAnalyze || contentToAnalyze.trim().length === 0) {
            return false;
        }

        // Check if this is a new record or if content has changed
        const rawContentField = this.GetFieldByName('RawContent');
        const descriptionField = this.GetFieldByName('Description');
        const isNewOrContentChanged = !this.IsSaved || rawContentField?.Dirty || descriptionField?.Dirty;

        return isNewOrContentChanged;
    }

    /**
     * Runs AI analysis asynchronously after save to avoid blocking
     */
    private async runAIAnalysisAsync(): Promise<void> {
        try {
            // Get content to analyze
            const contentToAnalyze = this.RawContent || this.Description;
            if (!contentToAnalyze) {
                return;
            }

            // Run AI analysis
            const analysisResult = await this.analyzeActivityContent(contentToAnalyze);

            if (analysisResult) {
                // Process results in parallel
                await Promise.all([
                    this.saveSentimentAnalysis(analysisResult.sentiment),
                    this.saveTopicClassifications(analysisResult.topics)
                ]);

                // Mark as processed and update urgency fields
                this.ProcessedByAI = true;
                if (analysisResult.sentiment.urgencyLevel) {
                    this.UrgencyLevel = analysisResult.sentiment.urgencyLevel;
                }
                if (analysisResult.sentiment.urgencyScore != null) {
                    this.UrgencyScore = analysisResult.sentiment.urgencyScore;
                }
                if (analysisResult.sentiment.requiresFollowUp) {
                    this.RequiresFollowUp = analysisResult.sentiment.requiresFollowUp;
                }

                // Save the updated flags
                await super.Save();
            }
        } catch (error) {
            LogError(`Activity "${this.Subject}" - AI analysis failed:`, error);
            // Don't fail the save operation - AI processing is optional
        }
    }

    /**
     * Calls the AI to analyze activity content for sentiment and topics
     */
    private async analyzeActivityContent(content: string): Promise<ActivityAnalysisResult | null> {
        try {
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(
                false,
                this.ContextCurrentUser,
                this.ProviderToUse as unknown as IMetadataProvider
            );

            // Find the activity analysis prompt
            const aiPrompt = AIEngine.Instance.Prompts.find(p =>
                p.Name === 'Activity Analysis' &&
                p.Category === 'Demo'
            );

            if (!aiPrompt) {
                console.warn('AI prompt "Activity Analysis" not found in "Demo" category. Skipping AI analysis.');
                return null;
            }

            // Load available topics for context
            const existingTopics = await this.loadExistingTopics();

            // Prepare prompt data
            const promptData = {
                activityContent: content,
                activitySubject: this.Subject,
                activityType: this.ActivityType, // Virtual field from view
                existingTopics: existingTopics.map(t => ({ name: t.Name, description: t.Description }))
            };

            // Execute the prompt
            const promptRunner = new AIPromptRunner();
            const params = new AIPromptParams();
            params.prompt = aiPrompt;
            params.data = promptData;
            params.contextUser = this.ContextCurrentUser;
            params.attemptJSONRepair = true;

            const result = await promptRunner.ExecutePrompt<ActivityAnalysisResult>(params);

            if (!result.success || !result.result) {
                console.warn(`Activity "${this.Subject}" - AI analysis failed:`, {
                    success: result.success,
                    errorMessage: result.errorMessage
                });
                return null;
            }

            return result.result;
        } catch (error) {
            LogError(`Activity "${this.Subject}" - Error during AI analysis:`, error);
            return null;
        }
    }

    /**
     * Loads existing topics from the database for AI context
     */
    private async loadExistingTopics(): Promise<TopicEntity[]> {
        const rv = this.RunViewProviderToUse;
        const result = await rv.RunView<TopicEntity>({
            EntityName: 'Topics',
            ExtraFilter: '',
            OrderBy: 'Name',
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);

        if (!result.Success) {
            console.warn('Failed to load existing topics:', result.ErrorMessage);
            return [];
        }

        return result.Results || [];
    }

    /**
     * Saves the sentiment analysis result as an ActivitySentiment record
     */
    private async saveSentimentAnalysis(sentiment: SentimentAnalysisResult): Promise<void> {
        const md = this.ProviderToUse as unknown as IMetadataProvider;

        // Check if sentiment already exists for this activity
        const rv = this.RunViewProviderToUse;
        const existingResult = await rv.RunView<ActivitySentimentEntity>({
            EntityName: 'Activity Sentiments',
            ExtraFilter: `ActivityID='${this.ID}'`,
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);

        let sentimentEntity: ActivitySentimentEntity;

        if (existingResult.Success && existingResult.Results && existingResult.Results.length > 0) {
            // Update existing
            sentimentEntity = existingResult.Results[0];
        } else {
            // Create new
            sentimentEntity = await md.GetEntityObject<ActivitySentimentEntity>(
                'Activity Sentiments',
                this.ContextCurrentUser
            );
            sentimentEntity.ActivityID = this.ID;
        }

        // Set values
        sentimentEntity.OverallSentiment = sentiment.overallSentiment;
        sentimentEntity.SentimentScore = sentiment.sentimentScore;
        sentimentEntity.EmotionCategory = sentiment.emotionCategory;
        sentimentEntity.ConfidenceScore = sentiment.confidenceScore;
        sentimentEntity.AnalyzedAt = new Date();
        sentimentEntity.AIModelUsed = 'GPT-4'; // Will be set by prompt execution

        const saveResult = await sentimentEntity.Save();
        if (!saveResult) {
            LogError(`Failed to save sentiment for activity "${this.Subject}"`);
        }
    }

    /**
     * Saves topic classification results, creating new topics if needed
     */
    private async saveTopicClassifications(topicResult: TopicClassificationResult): Promise<void> {
        if (!topicResult.topics || topicResult.topics.length === 0) {
            return;
        }

        const md = this.ProviderToUse as unknown as IMetadataProvider;
        const rv = this.RunViewProviderToUse;

        // First, remove existing topic links for this activity
        const existingLinksResult = await rv.RunView<ActivityTopicEntity>({
            EntityName: 'Activity Topics',
            ExtraFilter: `ActivityID='${this.ID}'`,
            ResultType: 'entity_object'
        }, this.ContextCurrentUser);

        if (existingLinksResult.Success && existingLinksResult.Results) {
            const deletePromises = existingLinksResult.Results.map(link => link.Delete());
            await Promise.all(deletePromises);
        }

        // Load all existing topics for matching
        const existingTopics = await this.loadExistingTopics();
        const topicMap = new Map(existingTopics.map(t => [t.Name.toLowerCase(), t]));

        // Process each detected topic
        for (const detectedTopic of topicResult.topics) {
            let topicEntity = topicMap.get(detectedTopic.topicName.toLowerCase());

            // Create topic if it doesn't exist
            if (!topicEntity) {
                topicEntity = await md.GetEntityObject<TopicEntity>('Topics', this.ContextCurrentUser);
                topicEntity.Name = detectedTopic.topicName;
                topicEntity.Description = `Auto-created from activity analysis`;

                const topicSaveResult = await topicEntity.Save();
                if (!topicSaveResult) {
                    LogError(`Failed to create topic "${detectedTopic.topicName}"`);
                    continue;
                }
            }

            // Create the activity-topic link
            const activityTopic = await md.GetEntityObject<ActivityTopicEntity>(
                'Activity Topics',
                this.ContextCurrentUser
            );
            activityTopic.ActivityID = this.ID;
            activityTopic.TopicID = topicEntity.ID;
            activityTopic.ConfidenceScore = detectedTopic.confidenceScore;
            activityTopic.RelevanceRank = detectedTopic.relevanceRank;

            const linkSaveResult = await activityTopic.Save();
            if (!linkSaveResult) {
                LogError(`Failed to create activity-topic link for "${detectedTopic.topicName}"`);
            }
        }
    }

    /**
     * Manually trigger AI analysis for this activity, even if already processed
     */
    public async ReanalyzeWithAI(): Promise<boolean> {
        const contentToAnalyze = this.RawContent || this.Description;
        if (!contentToAnalyze || contentToAnalyze.trim().length === 0) {
            console.warn('No content available to analyze');
            return false;
        }

        // Reset processed flag and run analysis
        this.ProcessedByAI = false;
        await this.runAIAnalysisAsync();
        return this.ProcessedByAI;
    }
}

/**
 * Tree-shaking prevention function - must be called to ensure this subclass is loaded
 */
export function LoadActivityEntityServerSubClass() {}

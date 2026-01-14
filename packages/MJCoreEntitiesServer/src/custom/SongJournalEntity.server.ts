import { BaseEntity, EntityInfo, EntitySaveOptions, LogError, Metadata } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { SongJournalEntity } from "mj_generatedentities";

/**
 * Interface for the emotion detection AI prompt response
 */
interface EmotionDetectionResult {
    emotion: string;
    confidence: number;
    reasoning: string;
    secondaryEmotion?: string;
}

/**
 * Server-side entity subclass for Song Journals that handles automatic
 * emotion detection from journal entries using AI.
 *
 * When a user saves a journal entry, this class will:
 * 1. Check if the JournalEntry field was modified
 * 2. Call an AI prompt to detect the primary emotion
 * 3. Store the detected emotion in the DetectedEmotion field
 */
@RegisterClass(BaseEntity, 'Song Journals')
export class SongJournalEntityServer extends SongJournalEntity {
    constructor(Entity: EntityInfo) {
        super(Entity);

        // Verify we're on the server side
        const md = new Metadata();
        if (md.ProviderType !== 'Database') {
            throw new Error('SongJournalEntityServer is only supported for server-side/database providers.');
        }
    }

    /**
     * Override Save to automatically detect emotion from journal entry using AI.
     * Only runs AI inference when the JournalEntry field is dirty (modified) or for new records.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        try {
            const journalEntryField = this.GetFieldByName('JournalEntry');
            const shouldDetectEmotion = !this.IsSaved || journalEntryField.Dirty;

            // Only run AI emotion detection if the journal entry was modified
            if (shouldDetectEmotion && this.JournalEntry && this.JournalEntry.trim().length > 0) {
                const emotion = await this.DetectEmotion();
                if (emotion) {
                    this.Set('DetectedEmotion', emotion);
                }
            } else if (!this.JournalEntry || this.JournalEntry.trim().length === 0) {
                // Clear emotion if journal entry is empty
                this.Set('DetectedEmotion', null);
            }

            return await super.Save(options);
        } catch (e) {
            LogError('Failed to save Song Journal:', e);
            return false;
        }
    }

    /**
     * Detects the primary emotion from the journal entry using AI.
     * Uses the "Song Journal Emotion Detection" prompt from the AI Prompts system.
     */
    protected async DetectEmotion(): Promise<string | null> {
        try {
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);

            // Find the emotion detection prompt
            const aiPrompt = AIEngine.Instance.Prompts.find(p =>
                p.Name === 'Song Journal Emotion Detection'
            );

            if (!aiPrompt) {
                LogError('Failed to find AI prompt: Song Journal Emotion Detection');
                return null;
            }

            // Load song information for context
            const songInfo = await this.LoadSongInfo();

            // Prepare prompt data
            const promptData = {
                journalEntry: this.JournalEntry,
                songName: songInfo?.name || 'Unknown',
                artist: songInfo?.artist || 'Unknown',
                month: this.GetMonthName(this.ReflectionMonth)
            };

            // Execute the AI prompt
            const promptRunner = new AIPromptRunner();
            const params = new AIPromptParams();
            params.prompt = aiPrompt;
            params.data = promptData;
            params.contextUser = this.ContextCurrentUser;

            const result = await promptRunner.ExecutePrompt<EmotionDetectionResult>(params);

            // Debug: log the result properties individually (avoid circular reference issues)
            console.log(`[SongJournal] AI Result success: ${result.success}`);
            console.log(`[SongJournal] AI Result rawResult: ${result.rawResult}`);
            console.log(`[SongJournal] AI Result result type: ${typeof result.result}`);
            console.log(`[SongJournal] AI Result result value:`, result.result);
            console.log(`[SongJournal] AI Result errorMessage: ${result.errorMessage}`);

            if (result.success && result.result) {
                console.log(`[SongJournal] Detected emotion: ${result.result.emotion} (confidence: ${result.result.confidence})`);
                console.log(`[SongJournal] Reasoning: ${result.result.reasoning}`);
                return result.result.emotion;
            } else {
                // Try to parse rawResult directly if result.result is undefined
                if (result.rawResult) {
                    try {
                        const parsed = JSON.parse(result.rawResult);
                        if (parsed.emotion) {
                            console.log(`[SongJournal] Parsed emotion from rawResult: ${parsed.emotion}`);
                            return parsed.emotion;
                        }
                    } catch (parseErr) {
                        console.log(`[SongJournal] Failed to parse rawResult: ${parseErr}`);
                    }
                }
                LogError('Emotion detection failed:', result.errorMessage);
                return null;
            }
        } catch (e) {
            LogError('Error detecting emotion:', e);
            return null;
        }
    }

    /**
     * Loads the song information for the journal entry's associated song.
     */
    protected async LoadSongInfo(): Promise<{ name: string; artist: string } | null> {
        try {
            if (!this.SongID) return null;

            const rv = this.RunViewProviderToUse;

            const songResult = await rv.RunView<{ Name: string; Artist: string }>({
                EntityName: 'Songs',
                ExtraFilter: `ID='${this.SongID}'`,
                Fields: ['Name', 'Artist'],
                ResultType: 'simple'
            }, this.ContextCurrentUser);

            if (songResult.Success && songResult.Results.length > 0) {
                return {
                    name: songResult.Results[0].Name,
                    artist: songResult.Results[0].Artist
                };
            }

            return null;
        } catch (e) {
            LogError('Error loading song info:', e);
            return null;
        }
    }

    /**
     * Converts a month number (1-12) to a month name.
     */
    protected GetMonthName(month: number): string {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return monthNames[month - 1] || 'Unknown';
    }
}

/**
 * Function to ensure the class is loaded and registered.
 * This prevents tree-shaking from removing the class.
 */
export function LoadSongJournalEntityServer(): void {
    // Intentionally empty - function exists to force class registration
}

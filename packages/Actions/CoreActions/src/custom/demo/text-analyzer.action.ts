import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that analyzes text content and provides various statistics including
 * word count, character count, readability scores, and common word analysis.
 * 
 * @example
 * ```typescript
 * // Analyze a simple text
 * await runAction({
 *   ActionName: 'Text Analyzer',
 *   Params: [{
 *     Name: 'Text',
 *     Value: 'The quick brown fox jumps over the lazy dog.'
 *   }]
 * });
 * 
 * // Analyze with custom options
 * await runAction({
 *   ActionName: 'Text Analyzer',
 *   Params: [{
 *     Name: 'Text',
 *     Value: 'Your text here...'
 *   }, {
 *     Name: 'IncludeWordFrequency',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__TextAnalyzer")
export class TextAnalyzerAction extends BaseAction {
    /**
     * Executes the text analysis action
     * 
     * @param params - The action parameters containing:
     *   - Text: The text content to analyze
     *   - IncludeWordFrequency: Optional boolean to include word frequency analysis
     * 
     * @returns A promise resolving to an ActionResultSimple with text analysis data
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const textParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'text');
            const includeFreqParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includewordfrequency');

            if (!textParam || !textParam.Value) {
                return {
                    Success: false,
                    Message: "Text parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const text = textParam.Value;
            const includeFrequency = includeFreqParam?.Value === true || includeFreqParam?.Value === 'true';

            // Basic counts
            const charCount = text.length;
            const charCountNoSpaces = text.replace(/\s/g, '').length;
            const words = this.extractWords(text);
            const wordCount = words.length;
            const sentences = this.extractSentences(text);
            const sentenceCount = sentences.length;
            const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
            const paragraphCount = paragraphs.length;
            const lines = text.split('\n').filter(l => l.trim().length > 0);
            const lineCount = lines.length;

            // Calculate averages
            const avgWordLength = wordCount > 0 ? 
                words.reduce((sum, word) => sum + word.length, 0) / wordCount : 0;
            const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;
            const avgWordsPerParagraph = paragraphCount > 0 ? wordCount / paragraphCount : 0;

            // Readability scores
            const fleschScore = this.calculateFleschReadingEase(avgWordsPerSentence, avgWordLength);
            const readingLevel = this.getReadingLevel(fleschScore);

            // Character analysis
            const letterCount = text.match(/[a-zA-Z]/g)?.length || 0;
            const digitCount = text.match(/\d/g)?.length || 0;
            const punctuationCount = text.match(/[.,;:!?'"()\-]/g)?.length || 0;
            const whitespaceCount = text.match(/\s/g)?.length || 0;

            // Build result
            const analysisData: any = {
                summary: {
                    characters: charCount,
                    charactersNoSpaces: charCountNoSpaces,
                    words: wordCount,
                    sentences: sentenceCount,
                    paragraphs: paragraphCount,
                    lines: lineCount
                },
                averages: {
                    wordLength: parseFloat(avgWordLength.toFixed(2)),
                    wordsPerSentence: parseFloat(avgWordsPerSentence.toFixed(2)),
                    wordsPerParagraph: parseFloat(avgWordsPerParagraph.toFixed(2))
                },
                characterBreakdown: {
                    letters: letterCount,
                    digits: digitCount,
                    punctuation: punctuationCount,
                    whitespace: whitespaceCount,
                    other: charCount - letterCount - digitCount - punctuationCount - whitespaceCount
                },
                readability: {
                    fleschReadingEase: parseFloat(fleschScore.toFixed(2)),
                    readingLevel: readingLevel,
                    estimatedReadingTimeMinutes: parseFloat((wordCount / 200).toFixed(2))
                }
            };

            // Add word frequency if requested
            if (includeFrequency && words.length > 0) {
                const frequency = this.calculateWordFrequency(words);
                analysisData.wordFrequency = {
                    uniqueWords: frequency.size,
                    topWords: Array.from(frequency.entries())
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 20)
                        .map(([word, count]) => ({ word, count, percentage: parseFloat((count / wordCount * 100).toFixed(2)) }))
                };
            }

            // Language detection hints
            const hasNumbers = digitCount > 0;
            const hasUppercase = text !== text.toLowerCase();
            const hasPunctuation = punctuationCount > 0;
            analysisData.textFeatures = {
                hasNumbers,
                hasUppercase,
                hasPunctuation,
                appearsToBe: this.guessTextType(avgWordsPerSentence, hasPunctuation, paragraphCount)
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(analysisData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to analyze text: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    private extractWords(text: string): string[] {
        // Extract words (sequences of letters and digits)
        return text.match(/\b[\w']+\b/g)?.map(w => w.toLowerCase()) || [];
    }

    private extractSentences(text: string): string[] {
        // Simple sentence extraction (ends with . ! ? followed by space or end)
        return text.match(/[^.!?]+[.!?]+/g)?.map(s => s.trim()).filter(s => s.length > 0) || [text];
    }

    private calculateWordFrequency(words: string[]): Map<string, number> {
        const frequency = new Map<string, number>();
        const commonWords = new Set(['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 
            'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 
            'but', 'his', 'by', 'from', 'is', 'was', 'are', 'been', 'has', 'had', 'were',
            'said', 'did', 'get', 'may', 'will', 'would', 'could', 'can', 'if', 'or', 'an']);

        for (const word of words) {
            if (word.length > 2 && !commonWords.has(word)) {
                frequency.set(word, (frequency.get(word) || 0) + 1);
            }
        }
        
        return frequency;
    }

    private calculateFleschReadingEase(avgWordsPerSentence: number, avgWordLength: number): number {
        // Simplified Flesch Reading Ease formula
        // Using average word length as proxy for syllables (divide by 3 for rough estimate)
        const avgSyllablesPerWord = avgWordLength / 3;
        const score = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
        return Math.max(0, Math.min(100, score));
    }

    private getReadingLevel(fleschScore: number): string {
        if (fleschScore >= 90) return "Very Easy (5th grade)";
        if (fleschScore >= 80) return "Easy (6th grade)";
        if (fleschScore >= 70) return "Fairly Easy (7th grade)";
        if (fleschScore >= 60) return "Plain English (8th-9th grade)";
        if (fleschScore >= 50) return "Fairly Difficult (10th-12th grade)";
        if (fleschScore >= 30) return "Difficult (College)";
        if (fleschScore >= 10) return "Very Difficult (Graduate)";
        return "Extremely Difficult (Professional)";
    }

    private guessTextType(avgWordsPerSentence: number, hasPunctuation: boolean, paragraphCount: number): string {
        if (!hasPunctuation) return "List or notes";
        if (avgWordsPerSentence < 10) return "Simple text or dialogue";
        if (avgWordsPerSentence > 25) return "Academic or technical writing";
        if (paragraphCount > 3) return "Article or essay";
        return "General text";
    }
}
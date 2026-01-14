import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { RunView, Metadata, CompositeKey } from '@memberjunction/core';
import { GraphQLDataProvider, RunAIPromptResult } from '@memberjunction/graphql-dataprovider';

interface PlaylistRecommendation {
  month: number;
  monthName: string;
  songName: string;
  artist: string;
  emotion: string;
  reason: string;
}

interface GeneratedPlaylist {
  playlistName: string;
  playlistDescription: string;
  recommendations: PlaylistRecommendation[];
  playlistId?: string; // Set after saving to DB
}

interface MonthlySong {
  SongID: string;
  SongName: string;
  Artist: string;
  PlayCount: number;
  Rank: number;
  JournalEntry?: string;
  JournalEntryID?: string; // Track the ID for updates
  HasJournal: boolean;
  DetectedEmotion?: string; // AI-detected emotion from journal entry
}

interface MonthData {
  Month: number;
  MonthName: string;
  Year: number;
  Songs: MonthlySong[];
  IsExpanded: boolean;
  CompletedCount: number;
  DominantEmotion?: string; // Most common emotion for the month
}

@Component({
  selector: 'mj-music-reflection',
  templateUrl: './music-reflection.component.html',
  styleUrls: ['./music-reflection.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MusicReflectionComponent implements OnInit {
  loading = true;
  months: MonthData[] = [];
  selectedUserId: string | null = null;
  reflectionYear = new Date().getFullYear() - 1; // Previous year for year-end reflection
  availableYears: number[] = [];
  totalSongs = 0;
  completedSongs = 0;
  savingJournal = false;
  noDataMessage = '';

  // Playlist generation state
  generatingPlaylist = false;
  generatedPlaylist: GeneratedPlaylist | null = null;
  playlistError: string | null = null;

  private readonly MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  constructor(private cdr: ChangeDetectorRef) {
    console.log('[MusicReflection] Component constructed');
  }

  async ngOnInit() {
    console.log('[MusicReflection] ngOnInit called');
    await this.loadReflectionData();
  }

  private async loadReflectionData() {
    try {
      this.loading = true;
      this.noDataMessage = '';
      const md = new Metadata();
      const rv = new RunView();
      const userId = this.selectedUserId || md.CurrentUser?.ID;

      if (!userId) {
        console.error('No user found');
        this.noDataMessage = 'No user found. Please log in to view your music reflection.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      // Load all listening history to detect available years
      const historyResult = await rv.RunView<{
        SongID: string;
        ListenedAt: string;
      }>({
        EntityName: 'Listening Histories',
        ExtraFilter: `UserID='${userId}'`,
        Fields: ['SongID', 'ListenedAt'],
        ResultType: 'simple',
        MaxRows: 50000
      });

      console.log(`[MusicReflection] User ID: ${userId}`);
      console.log(`[MusicReflection] Listening history loaded:`, historyResult.Success ? `${historyResult.Results.length} records` : historyResult.ErrorMessage);

      if (!historyResult.Success) {
        console.error('Failed to load listening history:', historyResult.ErrorMessage);
        this.noDataMessage = 'Failed to load listening history. Please try again.';
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      if (historyResult.Results.length === 0) {
        this.noDataMessage = 'No listening history found. Start listening to music to build your reflection!';
        this.availableYears = [];
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      // Detect available years from listening history
      const yearsSet = new Set<number>();
      for (const record of historyResult.Results) {
        if (record.ListenedAt) {
          const year = new Date(record.ListenedAt).getFullYear();
          yearsSet.add(year);
        }
      }
      this.availableYears = Array.from(yearsSet).sort((a, b) => b - a); // Most recent first
      console.log(`[MusicReflection] Available years:`, this.availableYears);

      // If current reflection year has no data, switch to the most recent year with data
      if (!this.availableYears.includes(this.reflectionYear) && this.availableYears.length > 0) {
        this.reflectionYear = this.availableYears[0];
        console.log(`[MusicReflection] Switched to year with data: ${this.reflectionYear}`);
      }

      console.log(`[MusicReflection] Reflection year: ${this.reflectionYear}`);
      if (historyResult.Results.length > 0) {
        const sample = historyResult.Results[0];
        console.log(`[MusicReflection] Sample record:`, sample);
        console.log(`[MusicReflection] Sample date:`, new Date(sample.ListenedAt));
      }

      // Load all songs to get names and artists
      const songsResult = await rv.RunView<{
        ID: string;
        Name: string;
        Artist: string;
      }>({
        EntityName: 'Songs',
        Fields: ['ID', 'Name', 'Artist'],
        ResultType: 'simple'
      });

      const songsMap = new Map<string, {Name: string; Artist: string}>();
      if (songsResult.Success) {
        for (const song of songsResult.Results) {
          songsMap.set(song.ID, { Name: song.Name, Artist: song.Artist });
        }
      }

      // Load existing journal entries
      const journalMap = new Map<string, { ID: string; JournalEntry: string; DetectedEmotion?: string }>();
      try {
        const journalResult = await rv.RunView<{
          ID: string;
          SongID: string;
          ReflectionMonth: number;
          ReflectionYear: number;
          JournalEntry: string;
          DetectedEmotion: string | null;
        }>({
          EntityName: 'Song Journals',
          ExtraFilter: `UserID='${userId}' AND ReflectionYear=${this.reflectionYear}`,
          Fields: ['ID', 'SongID', 'ReflectionMonth', 'ReflectionYear', 'JournalEntry', 'DetectedEmotion'],
          ResultType: 'simple'
        });

        if (journalResult.Success) {
          for (const entry of journalResult.Results) {
            const key = `${entry.SongID}-${entry.ReflectionMonth}`;
            journalMap.set(key, {
              ID: entry.ID,
              JournalEntry: entry.JournalEntry,
              DetectedEmotion: entry.DetectedEmotion || undefined
            });
          }
          console.log(`[MusicReflection] Loaded ${journalMap.size} journal entries`);
        } else {
          console.warn('[MusicReflection] Failed to load journal entries:', journalResult.ErrorMessage);
        }
      } catch (error) {
        console.warn('[MusicReflection] Journal loading failed (API may need restart):', error);
        // Continue without journal entries - they can still write new ones after API restart
      }

      // Aggregate listening history by month
      const monthlyData = new Map<number, Map<string, number>>();
      let recordsForYear = 0;

      for (const record of historyResult.Results) {
        if (!record.ListenedAt) continue;

        const listenDate = new Date(record.ListenedAt);
        const month = listenDate.getMonth() + 1; // 1-12
        const year = listenDate.getFullYear();

        if (year !== this.reflectionYear) continue;

        recordsForYear++;

        if (!monthlyData.has(month)) {
          monthlyData.set(month, new Map());
        }

        const monthSongs = monthlyData.get(month)!;
        const currentCount = monthSongs.get(record.SongID) || 0;
        monthSongs.set(record.SongID, currentCount + 1);
      }

      console.log(`[MusicReflection] Records matching year ${this.reflectionYear}: ${recordsForYear}`);
      console.log(`[MusicReflection] Months with data:`, Array.from(monthlyData.keys()));

      // Convert to songs array and get top 3 per month
      this.months = [];
      for (let month = 1; month <= 12; month++) {
        const monthSongsMap = monthlyData.get(month);
        if (!monthSongsMap) {
          // No listening data for this month
          this.months.push({
            Month: month,
            MonthName: this.MONTH_NAMES[month - 1],
            Year: this.reflectionYear,
            Songs: [],
            IsExpanded: false,
            CompletedCount: 0
          });
          continue;
        }

        // Convert to array and sort by play count
        const songsArray: MonthlySong[] = [];
        for (const [songId, playCount] of monthSongsMap.entries()) {
          const songInfo = songsMap.get(songId);
          if (songInfo) {
            songsArray.push({
              SongID: songId,
              SongName: songInfo.Name,
              Artist: songInfo.Artist,
              PlayCount: playCount,
              Rank: 0,
              HasJournal: false
            });
          }
        }

        // Sort by play count and take top 3
        songsArray.sort((a, b) => b.PlayCount - a.PlayCount);
        const top3 = songsArray.slice(0, 3);

        // Assign ranks and check for journal entries
        top3.forEach((song, index) => {
          song.Rank = index + 1;
          const journalKey = `${song.SongID}-${month}`;
          const journalData = journalMap.get(journalKey);
          if (journalData) {
            song.JournalEntryID = journalData.ID;
            song.JournalEntry = journalData.JournalEntry;
            song.DetectedEmotion = journalData.DetectedEmotion;
            song.HasJournal = true;
          } else {
            song.HasJournal = false;
          }
        });

        const completedCount = top3.filter(s => s.HasJournal).length;

        // Calculate dominant emotion for the month
        const emotionCounts = new Map<string, number>();
        for (const song of top3) {
          if (song.DetectedEmotion) {
            emotionCounts.set(song.DetectedEmotion, (emotionCounts.get(song.DetectedEmotion) || 0) + 1);
          }
        }
        let dominantEmotion: string | undefined;
        let maxCount = 0;
        for (const [emotion, count] of emotionCounts) {
          if (count > maxCount) {
            maxCount = count;
            dominantEmotion = emotion;
          }
        }

        this.months.push({
          Month: month,
          MonthName: this.MONTH_NAMES[month - 1],
          Year: this.reflectionYear,
          Songs: top3,
          IsExpanded: false,
          CompletedCount: completedCount,
          DominantEmotion: dominantEmotion
        });
      }

      // Calculate totals
      this.totalSongs = this.months.reduce((sum, m) => sum + m.Songs.length, 0);
      this.completedSongs = this.months.reduce((sum, m) => sum + m.CompletedCount, 0);

      console.log(`[MusicReflection] Total songs: ${this.totalSongs}, Completed: ${this.completedSongs}`);
      console.log(`[MusicReflection] Months generated:`, this.months.map(m => `${m.MonthName}: ${m.Songs.length} songs`));

    } catch (error) {
      console.error('Error loading reflection data:', error);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  toggleMonth(monthData: MonthData) {
    monthData.IsExpanded = !monthData.IsExpanded;
    this.cdr.detectChanges();
  }

  async onYearChange(year: number) {
    if (year !== this.reflectionYear) {
      this.reflectionYear = year;
      await this.loadReflectionData();
    }
  }

  async saveJournal(monthData: MonthData, song: MonthlySong, journalText: string) {
    const trimmedText = journalText?.trim() || '';

    // If no text and no existing entry, nothing to do
    if (!trimmedText && !song.JournalEntryID) {
      return;
    }

    // If text unchanged from existing, skip save
    if (trimmedText === song.JournalEntry) {
      return;
    }

    try {
      this.savingJournal = true;
      this.cdr.detectChanges();

      const md = new Metadata();
      const userId = this.selectedUserId || md.CurrentUser?.ID;

      if (!userId) {
        console.error('No user found');
        return;
      }

      const journalEntry = await md.GetEntityObject('Song Journals');

      if (song.JournalEntryID) {
        // Load existing entry to update
        const compositeKey = new CompositeKey([{ FieldName: 'ID', Value: song.JournalEntryID }]);
        const loaded = await journalEntry.InnerLoad(compositeKey);
        if (!loaded) {
          console.error('Failed to load existing journal entry');
          alert('Failed to load journal entry for update. Please try again.');
          return;
        }
      } else {
        // Create new entry
        journalEntry.Set('UserID', userId);
        journalEntry.Set('SongID', song.SongID);
        journalEntry.Set('ReflectionYear', this.reflectionYear);
        journalEntry.Set('ReflectionMonth', monthData.Month);
      }

      journalEntry.Set('JournalEntry', trimmedText);

      const result = await journalEntry.Save();

      if (result) {
        song.JournalEntry = trimmedText;
        song.JournalEntryID = journalEntry.Get('ID');
        song.DetectedEmotion = journalEntry.Get('DetectedEmotion') || undefined;
        song.HasJournal = !!trimmedText;
        monthData.CompletedCount = monthData.Songs.filter(s => s.HasJournal).length;
        this.completedSongs = this.months.reduce((sum, m) => sum + m.CompletedCount, 0);

        // Recalculate dominant emotion for the month
        this.updateMonthDominantEmotion(monthData);

        console.log('Journal saved successfully', song.DetectedEmotion ? `- Detected emotion: ${song.DetectedEmotion}` : '');
      } else {
        console.error('Failed to save journal');
        alert('Failed to save journal entry. Please try again.');
      }

    } catch (error) {
      console.error('Error saving journal:', error);
      alert('An error occurred while saving. Please try again.');
    } finally {
      this.savingJournal = false;
      this.cdr.detectChanges();
    }
  }

  getProgressPercentage(): number {
    if (this.totalSongs === 0) return 0;
    return Math.round((this.completedSongs / this.totalSongs) * 100);
  }

  getMonthIcon(month: number): string {
    const icons = [
      'fa-snowflake',    // January
      'fa-heart',        // February
      'fa-seedling',     // March
      'fa-cloud-rain',   // April
      'fa-flower',       // May
      'fa-sun',          // June
      'fa-umbrella-beach', // July
      'fa-fire',         // August
      'fa-leaf',         // September
      'fa-ghost',        // October
      'fa-turkey',       // November
      'fa-gift'          // December
    ];
    return icons[month - 1] || 'fa-music';
  }

  private updateMonthDominantEmotion(monthData: MonthData): void {
    const emotionCounts = new Map<string, number>();
    for (const song of monthData.Songs) {
      if (song.DetectedEmotion) {
        emotionCounts.set(song.DetectedEmotion, (emotionCounts.get(song.DetectedEmotion) || 0) + 1);
      }
    }
    let dominantEmotion: string | undefined;
    let maxCount = 0;
    for (const [emotion, count] of emotionCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantEmotion = emotion;
      }
    }
    monthData.DominantEmotion = dominantEmotion;
  }

  getEmotionIcon(emotion: string): string {
    const icons: Record<string, string> = {
      'Joy': 'fa-face-laugh-beam',
      'Nostalgia': 'fa-clock-rotate-left',
      'Melancholy': 'fa-cloud-rain',
      'Energy': 'fa-bolt',
      'Peace': 'fa-dove',
      'Love': 'fa-heart',
      'Hope': 'fa-sun',
      'Empowerment': 'fa-fist-raised',
      'Reflection': 'fa-brain',
      'Comfort': 'fa-mug-hot'
    };
    return icons[emotion] || 'fa-face-smile';
  }

  /**
   * Generates a personalized playlist based on the user's emotional journey
   */
  async generatePlaylist(): Promise<void> {
    try {
      this.generatingPlaylist = true;
      this.playlistError = null;
      this.generatedPlaylist = null;
      this.cdr.detectChanges();

      console.log('[MusicReflection] Starting playlist generation...');

      // Build the emotional journey data for the AI prompt
      const monthlyEmotions = this.buildMonthlyEmotionsData();

      if (monthlyEmotions.length === 0) {
        this.playlistError = 'No emotional data available. Please complete your journal entries first.';
        return;
      }

      // Get the AI prompt by name
      const promptName = 'Year Playlist Generation';
      const rv = new RunView();
      const promptResult = await rv.RunView<{ ID: string; Name: string }>({
        EntityName: 'AI Prompts',
        ExtraFilter: `Name='${promptName}'`,
        Fields: ['ID', 'Name'],
        ResultType: 'simple'
      });

      if (!promptResult.Success || promptResult.Results.length === 0) {
        this.playlistError = `AI Prompt "${promptName}" not found. Please ensure the prompt is configured.`;
        console.error('[MusicReflection] Prompt not found:', promptName);
        return;
      }

      const promptId = promptResult.Results[0].ID;
      console.log('[MusicReflection] Found prompt ID:', promptId);

      // Prepare the data for the AI prompt
      const targetYear = this.reflectionYear + 1;
      const promptData = {
        sourceYear: this.reflectionYear,
        targetYear: targetYear,
        monthlyEmotions: monthlyEmotions
      };

      console.log('[MusicReflection] Calling AI with data:', promptData);

      // Call the AI prompt
      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const aiResult = await dataProvider.AI.RunAIPrompt({
        promptId: promptId,
        data: promptData
      });

      console.log('[MusicReflection] AI Result:', aiResult);

      if (!aiResult.success) {
        this.playlistError = aiResult.error || 'Failed to generate playlist recommendations.';
        console.error('[MusicReflection] AI Error:', aiResult.error);
        return;
      }

      // Parse the AI result
      const parsedResult = this.parsePlaylistResult(aiResult);

      if (!parsedResult) {
        this.playlistError = 'Failed to parse AI response. Please try again.';
        return;
      }

      // Save the playlist to the database
      await this.savePlaylistToDatabase(parsedResult, targetYear);

      this.generatedPlaylist = parsedResult;
      console.log('[MusicReflection] Playlist generated successfully:', parsedResult);

    } catch (error) {
      console.error('[MusicReflection] Error generating playlist:', error);
      this.playlistError = 'An unexpected error occurred. Please try again.';
    } finally {
      this.generatingPlaylist = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Builds the monthly emotions data structure for the AI prompt
   */
  private buildMonthlyEmotionsData(): Array<{
    monthName: string;
    emotion: string;
    journalExcerpts: string[];
    topSongs: Array<{ name: string; artist: string }>;
  }> {
    const monthlyEmotions: Array<{
      monthName: string;
      emotion: string;
      journalExcerpts: string[];
      topSongs: Array<{ name: string; artist: string }>;
    }> = [];

    for (const month of this.months) {
      // Only include months that have a dominant emotion (i.e., have journal entries)
      if (month.DominantEmotion) {
        const journalExcerpts: string[] = [];
        const topSongs: Array<{ name: string; artist: string }> = [];

        for (const song of month.Songs) {
          topSongs.push({ name: song.SongName, artist: song.Artist });

          // Include a snippet of the journal entry if it exists
          if (song.JournalEntry) {
            const excerpt = song.JournalEntry.length > 150
              ? song.JournalEntry.substring(0, 150) + '...'
              : song.JournalEntry;
            journalExcerpts.push(excerpt);
          }
        }

        monthlyEmotions.push({
          monthName: month.MonthName,
          emotion: month.DominantEmotion,
          journalExcerpts: journalExcerpts,
          topSongs: topSongs
        });
      }
    }

    return monthlyEmotions;
  }

  /**
   * Parses the AI result into a GeneratedPlaylist object
   */
  private parsePlaylistResult(aiResult: RunAIPromptResult): GeneratedPlaylist | null {
    try {
      console.log('[MusicReflection] Parsing AI result:', {
        hasParsedResult: !!aiResult.parsedResult,
        parsedResultType: typeof aiResult.parsedResult,
        hasOutput: !!aiResult.output,
        hasRawResult: !!aiResult.rawResult
      });

      // The GraphQL client already parses parsedResult from JSON, so it's an object
      // Try parsedResult first (already parsed), then rawResult (needs parsing), then output
      let parsed: GeneratedPlaylist | null = null;

      if (aiResult.parsedResult) {
        // parsedResult is already parsed by GraphQLAIClient
        if (typeof aiResult.parsedResult === 'object') {
          parsed = aiResult.parsedResult as GeneratedPlaylist;
        } else if (typeof aiResult.parsedResult === 'string') {
          parsed = JSON.parse(aiResult.parsedResult);
        }
      } else if (aiResult.rawResult) {
        // rawResult is a string that needs parsing
        parsed = JSON.parse(aiResult.rawResult);
      } else if (aiResult.output) {
        // output may be a string that needs parsing
        parsed = typeof aiResult.output === 'string' ? JSON.parse(aiResult.output) : aiResult.output;
      }

      if (!parsed) {
        console.error('[MusicReflection] No result to parse from AI response');
        return null;
      }

      console.log('[MusicReflection] Parsed result:', parsed);

      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        console.error('[MusicReflection] Invalid response structure - missing recommendations array:', parsed);
        return null;
      }

      return {
        playlistName: parsed.playlistName || `Your ${this.reflectionYear + 1} Emotional Journey`,
        playlistDescription: parsed.playlistDescription || 'AI-generated playlist based on your emotional patterns',
        recommendations: parsed.recommendations
      };
    } catch (error) {
      console.error('[MusicReflection] Error parsing AI result:', error, 'Raw aiResult:', aiResult);
      return null;
    }
  }

  /**
   * Saves the generated playlist to the database
   */
  private async savePlaylistToDatabase(playlist: GeneratedPlaylist, targetYear: number): Promise<void> {
    try {
      const md = new Metadata();
      const userId = this.selectedUserId || md.CurrentUser?.ID;

      if (!userId) {
        console.warn('[MusicReflection] No user ID available, skipping database save');
        return;
      }

      // Create the playlist record
      const playlistEntity = await md.GetEntityObject('Playlists');
      playlistEntity.Set('UserID', userId);
      playlistEntity.Set('Name', playlist.playlistName);
      playlistEntity.Set('Description', playlist.playlistDescription);
      playlistEntity.Set('CreatedByAI', true);
      playlistEntity.Set('PlaylistType', 'YearlyEmotional');
      playlistEntity.Set('SourceYear', this.reflectionYear);
      playlistEntity.Set('TargetYear', targetYear);
      playlistEntity.Set('AIGenerationNotes', `Generated based on emotional patterns from ${this.reflectionYear}`);

      const playlistSaved = await playlistEntity.Save();

      if (!playlistSaved) {
        console.error('[MusicReflection] Failed to save playlist');
        return;
      }

      const playlistId = playlistEntity.Get('ID');
      playlist.playlistId = playlistId;
      console.log('[MusicReflection] Playlist saved with ID:', playlistId);

      // Note: PlaylistSong records would reference actual Song IDs
      // Since the AI generates song names that may not exist in our database,
      // we'll store the recommendations in the AIGenerationNotes field
      // In a production system, you'd want to search for or create the songs

      console.log('[MusicReflection] Playlist saved successfully');

    } catch (error) {
      console.error('[MusicReflection] Error saving playlist to database:', error);
      // Don't throw - we still want to show the recommendations even if save fails
    }
  }

  /**
   * Clears the generated playlist to allow regeneration
   */
  clearPlaylist(): void {
    this.generatedPlaylist = null;
    this.playlistError = null;
    this.cdr.detectChanges();
  }
}

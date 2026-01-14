import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { RunView, Metadata } from '@memberjunction/core';

interface YearSummary {
  TotalListens: number;
  TotalMinutesListened: number;
  UniqueArtists: number;
  UniqueSongs: number;
  TopGenre: string;
  TopArtist: string;
  TopSong: string;
  SummaryData?: string;
}

interface TopSong {
  Name: string;
  Artist: string;
  PlayCount: number;
  TotalMinutes: number;
}

interface UserOption {
  ID: string;
  Name: string;
  Email: string;
}

@Component({
  selector: 'mj-spotify-wrapped-year',
  templateUrl: './wrapped-year.component.html',
  styleUrls: ['./wrapped-year.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SpotifyWrappedYearComponent implements OnInit {
  loading = true;
  yearSummary: YearSummary | null = null;
  topSongs: TopSong[] = [];
  availableUsers: UserOption[] = [];
  selectedUserId: string | null = null;
  selectedUserName: string = '';

  constructor(
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.loadAvailableUsers();
    await this.loadData();
  }

  private async loadAvailableUsers() {
    try {
      const md = new Metadata();
      const rv = new RunView();
      const currentUserId = md.CurrentUser?.ID;

      // Load all users who have year summaries for 2024
      const summariesResult = await rv.RunView<{UserID: string; User: string}>({
        EntityName: 'User Year Summaries',
        ExtraFilter: 'Year=2024',
        Fields: ['UserID', 'User'],
        ResultType: 'simple'
      });

      if (summariesResult.Success) {
        // Load full user details
        const userIds = summariesResult.Results.map((s) => s.UserID);
        if (userIds.length > 0) {
          const usersResult = await rv.RunView<{ID: string; Name: string; Email: string}>({
            EntityName: 'Users',
            ExtraFilter: `ID IN ('${userIds.join("','")}')`,
            Fields: ['ID', 'Name', 'Email'],
            ResultType: 'simple'
          });

          if (usersResult.Success) {
            // Filter out the current user from the dropdown list
            this.availableUsers = usersResult.Results.filter((u) => u.ID !== currentUserId);
            console.log('Available users (excluding current user):', this.availableUsers);
          }
        }
      }
    } catch (error) {
      console.error('Error loading available users:', error);
    }
  }

  async onUserChange(userId: string) {
    this.selectedUserId = userId;
    await this.loadData();
  }

  private async loadData() {
    try {
      const md = new Metadata();
      const rv = new RunView();

      // Use selected user if available, otherwise use current user
      const userId = this.selectedUserId || md.CurrentUser?.ID;

      if (!userId) {
        console.error('No user found');
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      // Set the selected user name for display
      if (this.selectedUserId) {
        const selectedUser = this.availableUsers.find((u) => u.ID === this.selectedUserId);
        this.selectedUserName = selectedUser?.Name || '';
      } else {
        this.selectedUserName = md.CurrentUser?.Name || 'Your';
      }

      console.log('Loading Spotify Wrapped for user:', userId);

      // Load year summary
      const summaryResult = await rv.RunView<YearSummary>({
        EntityName: 'User Year Summaries',
        ExtraFilter: `UserID='${userId}' AND Year=2024`,
        ResultType: 'simple'
      });

      console.log('Year Summary Result:', {
        success: summaryResult.Success,
        count: summaryResult.Results?.length || 0,
        errorMessage: summaryResult.ErrorMessage,
        results: summaryResult.Results
      });

      if (summaryResult.Success && summaryResult.Results.length > 0) {
        this.yearSummary = summaryResult.Results[0];
        console.log('Year summary loaded:', this.yearSummary);
      } else {
        console.warn('No year summary found for user', userId, 'year 2024');
      }

      // Load all songs to get artist information
      const songsResult = await rv.RunView<{ID: string; Name: string; Artist: string}>({
        EntityName: 'Songs',
        Fields: ['ID', 'Name', 'Artist'],
        ResultType: 'simple'
      });

      const songsMap = new Map<string, {Name: string; Artist: string}>();
      if (songsResult.Success) {
        for (const song of songsResult.Results) {
          songsMap.set(song.ID, { Name: song.Name, Artist: song.Artist });
        }
        console.log('Loaded', songsMap.size, 'songs');
      }

      // Load listening history and aggregate by song
      const historyResult = await rv.RunView<{SongID: string; PlayDuration: number}>({
        EntityName: 'Listening Histories',
        ExtraFilter: `UserID='${userId}'`,
        Fields: ['SongID', 'PlayDuration'],
        MaxRows: 10000, // Ensure we get all records
        ResultType: 'simple'
      });

      console.log('Listening History Result:', {
        success: historyResult.Success,
        count: historyResult.Results?.length || 0,
        errorMessage: historyResult.ErrorMessage
      });

      if (historyResult.Success) {
        // Aggregate by song
        const songMap = new Map<string, TopSong>();

        for (const record of historyResult.Results) {
          const songInfo = songsMap.get(record.SongID);
          if (!songInfo) continue;

          const existing = songMap.get(record.SongID);
          if (existing) {
            existing.PlayCount++;
            existing.TotalMinutes += (record.PlayDuration || 0) / 60;
          } else {
            songMap.set(record.SongID, {
              Name: songInfo.Name,
              Artist: songInfo.Artist,
              PlayCount: 1,
              TotalMinutes: (record.PlayDuration || 0) / 60
            });
          }
        }

        // Convert to array and sort by play count
        this.topSongs = Array.from(songMap.values())
          .sort((a, b) => b.PlayCount - a.PlayCount)
          .slice(0, 10);
      }
    } catch (error) {
      console.error('Error loading wrapped data:', error);
    } finally {
      this.loading = false;
      console.log('Final state:', {
        loading: this.loading,
        hasYearSummary: !!this.yearSummary,
        yearSummary: this.yearSummary,
        topSongsCount: this.topSongs.length,
      });
      this.cdr.detectChanges();
    }
  }

  formatMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }
}

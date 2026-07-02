/**
 * @fileoverview `app-analytics-realtime-transcripts` — the "Voice Transcripts" view in the AI Analytics
 * shell. A master-detail browser over the unified per-room meeting transcripts the realtime bridge records:
 * a list of meeting rooms on the left, the speaker-attributed (diarized) transcript on the right. Read-only;
 * a child view of the analytics shell (extends {@link BaseAngularComponent}, threads `ProviderToUse`).
 *
 * @module @memberjunction/ng-dashboards
 */
import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import {
    LoadMeetingRooms,
    LoadRoomTranscript,
    type MeetingRoomSummary,
    type TranscriptLine,
} from './realtime-transcripts-data';

@Component({
    standalone: false,
    selector: 'app-analytics-realtime-transcripts',
    template: `
        @if (IsLoading) {
            <div class="loading-container"><mj-loading text="Loading meeting transcripts..."></mj-loading></div>
        } @else {
            <div class="transcripts">
                <!-- Room list -->
                <div class="room-list">
                    <div class="room-list__head">
                        <span>{{ Rooms.length }} meeting{{ Rooms.length === 1 ? '' : 's' }}</span>
                        <button class="rt-refresh" title="Refresh" (click)="reload()"><i class="fa-solid fa-rotate"></i></button>
                    </div>
                    @if (Rooms.length === 0) {
                        <mj-empty-state class="empty" Size="compact" Icon="fa-solid fa-comment-slash" Title="No meeting transcripts yet" />
                    } @else {
                        @for (room of Rooms; track room.ConversationID) {
                            <button class="room" [class.room--active]="room.ConversationID === SelectedRoom?.ConversationID" (click)="selectRoom(room)">
                                <i class="fa-solid fa-tower-broadcast room__icon"></i>
                                <span class="room__name">{{ room.Name }}</span>
                                <span class="room__when">{{ room.LastActivity | date: 'MMM d, h:mm a' }}</span>
                            </button>
                        }
                    }
                </div>

                <!-- Transcript pane -->
                <div class="transcript-pane">
                    @if (!SelectedRoom) {
                        <mj-empty-state class="empty empty--center" Icon="fa-solid fa-arrow-left" Title="Select a meeting" Message="Select a meeting to view its transcript." />
                    } @else if (IsLoadingTranscript) {
                        <div class="loading-container"><mj-loading text="Loading transcript..."></mj-loading></div>
                    } @else {
                        <div class="transcript-pane__head">
                            <h3>{{ SelectedRoom.Name }}</h3>
                            <span class="muted">{{ Lines.length }} utterance{{ Lines.length === 1 ? '' : 's' }} · {{ SelectedRoom.CreatedAt | date: 'medium' }}</span>
                        </div>
                        <div class="lines">
                            @if (Lines.length === 0) {
                                <mj-empty-state class="empty" Size="compact" Icon="" Title="This meeting has no recorded utterances." />
                            }
                            @for (line of Lines; track line.ID) {
                                <div class="line line--{{ line.Kind }}">
                                    <div class="line__meta">
                                        <span class="line__speaker">{{ line.Speaker }}</span>
                                        <span class="line__time">{{ line.At | date: 'h:mm:ss a' }}</span>
                                    </div>
                                    <div class="line__bubble">{{ line.Message }}</div>
                                </div>
                            }
                        </div>
                    }
                </div>
            </div>
        }
    `,
    styles: [`
        :host { display: block; height: 100%; }
        .loading-container { display: flex; align-items: center; justify-content: center; padding: 48px; }
        .transcripts { display: grid; grid-template-columns: 300px 1fr; gap: 16px; height: 100%; min-height: 420px; }
        .room-list { border: 1px solid var(--mj-border-default); border-radius: 8px; background: var(--mj-bg-surface); overflow-y: auto; }
        .room-list__head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; font-size: 12px; color: var(--mj-text-muted); border-bottom: 1px solid var(--mj-border-subtle); position: sticky; top: 0; background: var(--mj-bg-surface); }
        .rt-refresh { background: none; border: none; color: var(--mj-text-muted); cursor: pointer; padding: 4px; }
        .rt-refresh:hover { color: var(--mj-brand-primary); }
        .room { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 8px; width: 100%; text-align: left; padding: 10px 12px; border: none; border-bottom: 1px solid var(--mj-border-subtle); background: none; cursor: pointer; }
        .room:hover { background: var(--mj-bg-surface-hover); }
        .room--active { background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface)); }
        .room__icon { grid-row: 1 / 3; align-self: center; color: var(--mj-brand-primary); }
        .room__name { font-weight: 600; color: var(--mj-text-primary); font-size: 13px; }
        .room__when { color: var(--mj-text-muted); font-size: 11px; }
        .transcript-pane { border: 1px solid var(--mj-border-default); border-radius: 8px; background: var(--mj-bg-surface); display: flex; flex-direction: column; overflow: hidden; }
        .transcript-pane__head { padding: 12px 16px; border-bottom: 1px solid var(--mj-border-subtle); }
        .transcript-pane__head h3 { margin: 0; font-size: 15px; color: var(--mj-text-primary); }
        .muted { color: var(--mj-text-muted); font-size: 12px; }
        .lines { padding: 12px 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .line { display: flex; flex-direction: column; gap: 3px; max-width: 80%; }
        .line--agent { align-self: flex-start; }
        .line--human { align-self: flex-end; align-items: flex-end; }
        .line--error { align-self: center; max-width: 90%; }
        .line__meta { display: flex; gap: 8px; font-size: 11px; }
        .line__speaker { font-weight: 600; color: var(--mj-text-secondary); }
        .line__time { color: var(--mj-text-disabled); }
        .line__bubble { padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
        .line--agent .line__bubble { background: color-mix(in srgb, var(--mj-brand-primary) 12%, var(--mj-bg-surface)); color: var(--mj-text-primary); }
        .line--human .line__bubble { background: var(--mj-bg-surface-sunken); color: var(--mj-text-primary); }
        .line--error .line__bubble { background: var(--mj-status-error-bg); color: var(--mj-status-error-text); border: 1px solid var(--mj-status-error-border); }
        .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px; color: var(--mj-text-muted); }
        .empty--center { margin: auto; }
        .empty i { font-size: 28px; opacity: 0.5; }
    `],
})
export class AnalyticsRealtimeTranscriptsComponent extends BaseAngularComponent implements OnInit {
    private cdr = inject(ChangeDetectorRef);

    public IsLoading = true;
    public IsLoadingTranscript = false;
    public Rooms: MeetingRoomSummary[] = [];
    public SelectedRoom: MeetingRoomSummary | null = null;
    public Lines: TranscriptLine[] = [];

    async ngOnInit(): Promise<void> {
        await this.reload();
    }

    public async reload(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();
        await AIEngineBase.Instance.EnsureLoaded(); // agents cache, for AI-line attribution
        this.Rooms = await LoadMeetingRooms(this.ProviderToUse);
        this.IsLoading = false;
        this.cdr.detectChanges();
    }

    public async selectRoom(room: MeetingRoomSummary): Promise<void> {
        this.SelectedRoom = room;
        this.Lines = [];
        this.IsLoadingTranscript = true;
        this.cdr.detectChanges();
        this.Lines = await LoadRoomTranscript(this.ProviderToUse, room.ConversationID, room.RoomKey);
        this.IsLoadingTranscript = false;
        this.cdr.detectChanges();
    }
}

/** Tree-shaking prevention — called from the module constructor so the component class isn't elided. */
export function LoadAnalyticsRealtimeTranscripts(): void { /* no-op */ }

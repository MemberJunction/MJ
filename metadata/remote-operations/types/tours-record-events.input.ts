/** Input payload for `Tours.RecordEvents` (batched run & step telemetry for MJ users and surface guests). */
export interface ToursRecordEventsInput {
  Events: Array<{
    RunClientId?: string;
    RunId?: string;
    TourId?: string;
    TourKey: string;
    TourVersionId?: string;
    EventType: 'RunStarted' | 'StepEntered' | 'StepCompleted' | 'RunUpdated' | 'RunCompleted' | 'RunDismissed' | 'RunSnoozed' | 'GoalMet';
    Timestamp: string;
    GuideMode?: 'Visual' | 'Chat' | 'Voice';
    DirectorType?: string;
    LaunchSource?: 'Launcher' | 'Omnibar' | 'Agent' | 'Trigger' | 'Notification' | 'Link' | 'Learning Path' | 'Empty State';
    CurrentStepKey?: string;
    StepSequence?: number;
    StepOutcome?: 'Completed' | 'Skipped' | 'Already Known' | 'Done By Agent' | 'Anchor Missing' | 'Dismissed';
    AnchorResolution?: 'Registered' | 'Semantic' | 'Role' | 'Selector' | 'None' | 'Failed';
    QuestionCountDelta?: number;
    PathTakenJson?: string;
    SnoozedUntil?: string;
    IsHoldout?: boolean;
    ConversationId?: string;
    AgentSessionId?: string;
    LaunchedByAgentRunId?: string;
    DetailsJson?: string;
  }>;
}

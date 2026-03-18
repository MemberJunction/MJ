export interface BrandingLabels {
  WelcomeTitle?: string;
  WelcomeSubtitle?: string;
  WelcomeIcon?: string;
  SuggestedPrompts?: Array<{ icon: string; title: string; prompt: string }>;
  SuggestedPromptCount?: number;
  InputPlaceholder?: string;
  TabLabelOverrides?: Record<string, string>;
  ArtifactLabel?: string;
  SaveToCollectionLabel?: string;
  CollectionLabel?: string;
  CollectionsLabel?: string;
}

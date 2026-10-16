```ts
interface VideoBeatTemplate {
    Key: string;  // Stable identifier for the beat slot (e.g., 'hook', 'problem', 'reveal', 'proof', 'close').
    Label: string;  // Narrative role label displayed in storyboards (e.g., 'Hook', 'Problem', 'Reveal', 'Proof', 'Close').
    Purpose: string;  // What this beat must accomplish in the narrative arc.
    MinDurationSeconds: number;  // Minimum duration in seconds permitted for this beat.
    MaxDurationSeconds: number;  // Maximum duration in seconds permitted for this beat.
    DefaultDurationSeconds?: number;  // Suggested default duration in seconds before narration clip timing fit.
    Guidance?: string;  // Direction for the Storyboard and Motion Engineer on visual and audio treatment.
    RequiresDataBinding?: boolean;  // Whether this beat slot typically requires at least one bound metric or chart.
}
```

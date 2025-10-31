import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { AIAgentEntityExtended, AIAgentConfigurationEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Component for selecting AI agent configuration presets.
 * Displays a dropdown of semantic presets (e.g., "Fast", "High Quality")
 * that users can choose from when executing an agent.
 *
 * Configuration presets provide user-friendly names for different AI model
 * configurations, making it easy for users to select the appropriate "power level"
 * for their use case without understanding technical configuration details.
 *
 * @example
 * ```html
 * <mj-agent-configuration-selector
 *   [agent]="currentAgent"
 *   [disabled]="isSending"
 *   (configurationSelected)="onConfigurationSelected($event)">
 * </mj-agent-configuration-selector>
 * ```
 */
@Component({
  selector: 'mj-agent-configuration-selector',
  templateUrl: './agent-configuration-selector.component.html',
  styleUrls: ['./agent-configuration-selector.component.scss']
})
export class AgentConfigurationSelectorComponent implements OnInit, OnChanges {
  /**
   * The agent to show configuration presets for.
   * Required input.
   */
  @Input() agent!: AIAgentEntityExtended;

  /**
   * Whether the selector should be disabled (e.g., during agent execution).
   * Default: false
   */
  @Input() disabled: boolean = false;

  /**
   * Label text to display above the selector.
   * Default: "Power Level:"
   */
  @Input() label: string = 'Power Level:';

  /**
   * Whether to show the preset description below the selector.
   * Default: true
   */
  @Input() showDescription: boolean = true;

  /**
   * Emitted when a configuration preset is selected.
   * Emits the AIConfigurationID (or null for default configuration).
   */
  @Output() configurationSelected = new EventEmitter<string | null>();

  /**
   * Available configuration presets for the current agent.
   * Loaded from AIEngine cache.
   */
  public presets: AIAgentConfigurationEntity[] = [];

  /**
   * Currently selected preset name.
   * Used for [(ngModel)] binding.
   */
  public selectedPresetName: string = '';

  /**
   * Currently selected preset entity.
   * Used to display description.
   */
  public selectedPreset: AIAgentConfigurationEntity | null = null;

  async ngOnInit() {
    await this.loadPresets();
  }

  async ngOnChanges(changes: SimpleChanges) {
    // Reload presets if agent changes
    if (changes['agent'] && !changes['agent'].firstChange) {
      await this.loadPresets();
    }
  }

  /**
   * Loads configuration presets for the current agent from AIEngine.
   * Selects the default preset if available, otherwise selects the first preset.
   */
  private async loadPresets() {
    if (!this.agent?.ID) {
      this.presets = [];
      this.selectedPresetName = '';
      this.selectedPreset = null;
      return;
    }

    // Ensure AIEngine is configured
    await AIEngine.Instance.Config();

    // Get presets for this agent (sorted by Priority)
    this.presets = AIEngine.Instance.GetAgentConfigurationPresets(this.agent.ID);

    if (this.presets.length > 0) {
      // Select default preset if available, otherwise first preset
      const defaultPreset = this.presets.find(p => p.IsDefault);
      this.selectedPresetName = defaultPreset?.Name || this.presets[0].Name;
      this.updateSelectedPreset();
    } else {
      // No presets configured - component will be hidden by *ngIf in template
      this.selectedPresetName = '';
      this.selectedPreset = null;
    }
  }

  /**
   * Called when user changes the selected preset in the dropdown.
   * Updates the selected preset and emits the configuration ID.
   */
  public onPresetChange() {
    this.updateSelectedPreset();
  }

  /**
   * Updates the selectedPreset based on selectedPresetName
   * and emits the configurationSelected event.
   */
  private updateSelectedPreset() {
    this.selectedPreset = this.presets.find(p => p.Name === this.selectedPresetName) || null;

    // Emit the AIConfigurationID (or null for default configuration)
    const configurationId = this.selectedPreset?.AIConfigurationID || null;
    this.configurationSelected.emit(configurationId);
  }
}

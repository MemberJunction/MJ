import { AfterViewInit, Component, EventEmitter, Input, OnDestroy, Output, ViewChildren, QueryList, SimpleChanges, ChangeDetectorRef, NgZone, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { CompositeKey, KeyValuePair, LogError, Metadata } from '@memberjunction/core';
import { SkipAPIAnalysisCompleteResponse} from '@memberjunction/skip-types';
import { ComponentStyles, ComponentCallbacks, ComponentUtilities, ComponentOption, BuildComponentCompleteCode, ComponentSpec } from '@memberjunction/interactive-component-types';
import { DrillDownInfo } from '../drill-down-info';
import { DomSanitizer } from '@angular/platform-browser';
import { marked } from 'marked';
import { MJReactComponent, StateChangeEvent, ReactComponentEvent, AngularAdapterService } from '@memberjunction/ng-react';
import { createRuntimeUtilities, SetupStyles } from '@memberjunction/react-runtime';
import { SKIP_CHAT_ADDITIONAL_LIBRARIES } from '../skip-chat-library-config';

@Component({
  selector: 'skip-dynamic-ui-component',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (reportOptions.length > 1) {
      <!-- Multiple options: show tabs -->
      <kendo-tabstrip 
        (tabSelect)="onTabSelect($event)"
        [keepTabContent]="true"
        style="height: 100%; display: flex; flex-direction: column;">
        @for (option of reportOptions; track option; let i = $index) {
          <kendo-tabstrip-tab [selected]="i === selectedReportOptionIndex">
            <ng-template kendoTabTitle>
              @if (isTopRanked(i)) {
                <i class="fa-solid fa-star star-icon"></i>
              }
              {{ getTabTitle(i) }}
            </ng-template>
            <ng-template kendoTabContent>
              <div style="height: 100%; display: flex; flex-direction: column;">
                <!-- Tab Action Bar -->
                <div class="tab-action-bar">
                  <div class="tab-actions-left">
                    <!-- Toggle buttons for showing/hiding component details -->
                    <button class="tab-action-button toggle-button" 
                            (click)="toggleShowFunctionalRequirements()"
                            [class.active]="showFunctionalRequirements"
                            title="Toggle Functional Requirements">
                      <i class="fa-solid fa-list-check"></i>
                      <span>Functional</span>
                    </button>
                    <button class="tab-action-button toggle-button" 
                            (click)="toggleShowDataRequirements()"
                            [class.active]="showDataRequirements"
                            title="Toggle Data Requirements">
                      <i class="fa-solid fa-database"></i>
                      <span>Data</span>
                    </button>
                    <button class="tab-action-button toggle-button" 
                            (click)="toggleShowTechnicalDesign()"
                            [class.active]="showTechnicalDesign"
                            title="Toggle Technical Design">
                      <i class="fa-solid fa-cogs"></i>
                      <span>Technical</span>
                    </button>
                    <button class="tab-action-button toggle-button" 
                            (click)="toggleShowCode()"
                            [class.active]="showCode"
                            title="Toggle Code View">
                      <i class="fa-solid fa-code"></i>
                      <span>Code</span>
                    </button>
                  </div>
                  <div class="tab-actions-right">
                    <button class="tab-action-button create-button" 
                            *ngIf="ShowCreateReportButton && !matchingReportID"
                            (click)="createReportForOption(i)"
                            [disabled]="isCreatingReport">
                      <i class="fa-solid fa-plus"></i>
                      <span>Create {{ getComponentTypeName(option) }}</span>
                    </button>
                    <button class="tab-action-button print-button" 
                            *ngIf="ShowPrintReport" 
                            (click)="PrintReport()"
                            title="Print Report">
                      <i class="fa-solid fa-print"></i>
                      <span>Print Report</span>
                    </button>
                  </div>
                </div>
                
                <!-- Main content area with optional details panels -->
                <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
                  @if (showFunctionalRequirements || showDataRequirements || showTechnicalDesign || showCode) {
                    <!-- Details panel -->
                    <div class="details-panel" [style.height]="detailsPanelHeight">
                      <kendo-tabstrip style="height: 100%;">
                        @if (showFunctionalRequirements) {
                          <kendo-tabstrip-tab [selected]="true">
                            <ng-template kendoTabTitle>
                              <i class="fa-solid fa-list-check"></i> Functional Requirements
                            </ng-template>
                            <ng-template kendoTabContent>
                              <div class="details-content">
                                <div [innerHTML]="getFormattedFunctionalRequirements(option)"></div>
                              </div>
                            </ng-template>
                          </kendo-tabstrip-tab>
                        }
                        @if (showDataRequirements) {
                          <kendo-tabstrip-tab [selected]="!showFunctionalRequirements">
                            <ng-template kendoTabTitle>
                              <i class="fa-solid fa-database"></i> Data Requirements
                            </ng-template>
                            <ng-template kendoTabContent>
                              <div class="details-content">
                                <div [innerHTML]="getFormattedDataRequirements(option)"></div>
                              </div>
                            </ng-template>
                          </kendo-tabstrip-tab>
                        }
                        @if (showTechnicalDesign) {
                          <kendo-tabstrip-tab [selected]="!showFunctionalRequirements && !showDataRequirements">
                            <ng-template kendoTabTitle>
                              <i class="fa-solid fa-cogs"></i> Technical Design
                            </ng-template>
                            <ng-template kendoTabContent>
                              <div class="details-content">
                                <div [innerHTML]="getFormattedTechnicalDesign(option)"></div>
                              </div>
                            </ng-template>
                          </kendo-tabstrip-tab>
                        }
                        @if (showCode) {
                          <kendo-tabstrip-tab [selected]="!showFunctionalRequirements && !showDataRequirements && !showTechnicalDesign">
                            <ng-template kendoTabTitle>
                              <i class="fa-solid fa-code"></i> Code
                            </ng-template>
                            <ng-template kendoTabContent>
                              <div class="details-content code-content">
                                <mj-code-editor
                                  [value]="getComponentCode(option)"
                                  [language]="'javascript'"
                                  [autoFocus]="false"
                                  [indentWithTab]="true"
                                  [readonly]="true"
                                  style="height: 100%;">
                                </mj-code-editor>
                              </div>
                            </ng-template>
                          </kendo-tabstrip-tab>
                        }
                      </kendo-tabstrip>
                    </div>
                    <!-- Resizer -->
                    <div class="panel-resizer" 
                         (mousedown)="startResize($event)"
                         (touchstart)="startResize($event)">
                      <div class="resizer-handle"></div>
                    </div>
                  }
                  
                  <!-- React component container -->
                  <div [attr.data-tab-index]="i" 
                       style="flex: 1; position: relative; min-height: 0; overflow: auto;">
                    <mj-react-component
                      *ngIf="!currentError && reportOptions[i] && i === selectedReportOptionIndex"
                      [component]="reportOptions[i].option"
                      [data]="getFlattenedDataContext()"
                      [state]="userStates.get(i) || {}"
                      [utilities]="utilities"
                      [styles]="componentStyles || undefined"
                      (stateChange)="onStateChange(i, $event)"
                      (componentEvent)="onComponentEvent(i, $event)"
                      (refreshData)="handleRefreshData()"
                      (openEntityRecord)="onOpenEntityRecord($event)"
                      style="width: 100%; height: 100%;">
                    </mj-react-component>
                    
                    <!-- Error overlay for this tab (shown on top of content when needed) -->
                  @if (currentError && selectedReportOptionIndex === i) {
                    <div style="top: 0; 
                                left: 0; 
                                right: 0; 
                                bottom: 0; 
                                display: flex;
                                align-items: flex-start;
                                justify-content: center;
                                padding-top: 20px;
                                background: rgba(255, 255, 255, 0.95);
                                z-index: 10;">
                      <div style="width: 90%; 
                                  max-width: 600px; 
                                  height: 500px;
                                  background-color: #f8f9fa; 
                                  border: 2px solid #dc3545; 
                                  border-radius: 8px; 
                                  padding: 20px;
                                  overflow-y: auto;
                                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        <div style="position: relative;">
                          <button kendoButton (click)="copyErrorToClipboard()" 
                                  style="position: absolute; top: 0; right: 0; font-size: 12px;">
                            <span class="fa-solid fa-copy"></span>
                            Copy Error Details
                          </button>
                          <h3 style="color: #dc3545; margin-top: 0; margin-right: 150px; font-size: 18px;">
                            <span class="fa-solid fa-exclamation-triangle"></span>
                            Component Rendering Error
                          </h3>
                        </div>
                        <p style="margin-bottom: 10px; font-size: 14px;">
                          The selected component option could not be rendered due to the following error:
                        </p>
                        <div style="background-color: #fff; border: 1px solid #dee2e6; 
                                    border-radius: 4px; padding: 12px; margin-bottom: 12px;
                                    font-family: 'Courier New', monospace; font-size: 12px;">
                          <strong>Error Type:</strong> {{ currentError.type }}<br>
                          <strong>Details:</strong> {{ currentError.message }}
                          @if (currentError.technicalDetails) {
                            <details style="margin-top: 8px;">
                              <summary style="cursor: pointer; color: #0056b3;">Technical Details (click to expand)</summary>
                              <pre style="margin-top: 8px; white-space: pre-wrap; word-break: break-word; font-size: 11px;">{{ currentError.technicalDetails }}</pre>
                            </details>
                          }
                        </div>
                        <div style="background-color: #e7f3ff; border: 1px solid #b3d9ff; 
                                    border-radius: 4px; padding: 12px; margin-bottom: 12px;">
                          <strong style="font-size: 14px;">What to do:</strong>
                          <ol style="margin: 8px 0 0 20px; padding: 0; font-size: 13px;">
                            <li>Try selecting a different report option from the tabs above</li>
                            <li>Copy the error details and send them back to Skip in the chat to get a corrected version</li>
                            <li>Contact your IT department if the issue persists</li>
                          </ol>
                        </div>
                        <button kendoButton (click)="retryCurrentOption()" style="font-size: 13px;">
                          <span class="fa-solid fa-rotate"></span>
                          Retry
                        </button>
                      </div>
                    </div>
                  }
                  </div>
                </div>
              </div>
            </ng-template>
          </kendo-tabstrip-tab>
        }
      </kendo-tabstrip>
    } @else {
      <!-- Single option: no tabs needed -->
      <div style="height: 100%; display: flex; flex-direction: column;">
        <!-- Tab Action Bar -->
        <div class="tab-action-bar">
          <div class="tab-actions-left">
            <!-- Toggle buttons for showing/hiding component details -->
            <button class="tab-action-button toggle-button" 
                    (click)="toggleShowFunctionalRequirements()"
                    [class.active]="showFunctionalRequirements"
                    title="Toggle Functional Requirements">
              <i class="fa-solid fa-list-check"></i>
              <span>Functional</span>
            </button>
            <button class="tab-action-button toggle-button" 
                    (click)="toggleShowDataRequirements()"
                    [class.active]="showDataRequirements"
                    title="Toggle Data Requirements">
              <i class="fa-solid fa-database"></i>
              <span>Data</span>
            </button>
            <button class="tab-action-button toggle-button" 
                    (click)="toggleShowTechnicalDesign()"
                    [class.active]="showTechnicalDesign"
                    title="Toggle Technical Design">
              <i class="fa-solid fa-cogs"></i>
              <span>Technical</span>
            </button>
            <button class="tab-action-button toggle-button" 
                    (click)="toggleShowCode()"
                    [class.active]="showCode"
                    title="Toggle Code View">
              <i class="fa-solid fa-code"></i>
              <span>Code</span>
            </button>
          </div>
          <div class="tab-actions-right">
            <button class="tab-action-button create-button" 
                    *ngIf="ShowCreateReportButton && !matchingReportID"
                    (click)="createReportForOption(0)"
                    [disabled]="isCreatingReport">
              <i class="fa-solid fa-plus"></i>
              <span>Create {{ firstOptionComponentTypeName }}</span>
            </button>
            <button class="tab-action-button print-button" 
                    *ngIf="ShowPrintReport" 
                    (click)="PrintReport()"
                    title="Print Report">
              <i class="fa-solid fa-print"></i>
              <span>Print Report</span>
            </button>
          </div>
        </div>
        
        <!-- Main content area with optional details panels -->
        <div style="flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden;">
          @if (showFunctionalRequirements || showDataRequirements || showTechnicalDesign || showCode) {
            <!-- Details panel -->
            <div class="details-panel" [style.height]="detailsPanelHeight">
              <kendo-tabstrip style="height: 100%;">
                @if (showFunctionalRequirements && reportOptions[0]) {
                  <kendo-tabstrip-tab [selected]="true">
                    <ng-template kendoTabTitle>
                      <i class="fa-solid fa-list-check"></i> Functional Requirements
                    </ng-template>
                    <ng-template kendoTabContent>
                      <div class="details-content">
                        <div [innerHTML]="getFormattedFunctionalRequirements(reportOptions[0])"></div>
                      </div>
                    </ng-template>
                  </kendo-tabstrip-tab>
                }
                @if (showDataRequirements && reportOptions[0]) {
                  <kendo-tabstrip-tab [selected]="!showFunctionalRequirements">
                    <ng-template kendoTabTitle>
                      <i class="fa-solid fa-database"></i> Data Requirements
                    </ng-template>
                    <ng-template kendoTabContent>
                      <div class="details-content">
                        <div [innerHTML]="getFormattedDataRequirements(reportOptions[0])"></div>
                      </div>
                    </ng-template>
                  </kendo-tabstrip-tab>
                }
                @if (showTechnicalDesign && reportOptions[0]) {
                  <kendo-tabstrip-tab [selected]="!showFunctionalRequirements && !showDataRequirements">
                    <ng-template kendoTabTitle>
                      <i class="fa-solid fa-cogs"></i> Technical Design
                    </ng-template>
                    <ng-template kendoTabContent>
                      <div class="details-content">
                        <div [innerHTML]="getFormattedTechnicalDesign(reportOptions[0])"></div>
                      </div>
                    </ng-template>
                  </kendo-tabstrip-tab>
                }
                @if (showCode && reportOptions[0]) {
                  <kendo-tabstrip-tab [selected]="!showFunctionalRequirements && !showDataRequirements && !showTechnicalDesign">
                    <ng-template kendoTabTitle>
                      <i class="fa-solid fa-code"></i> Code
                    </ng-template>
                    <ng-template kendoTabContent>
                      <div class="details-content code-content">
                        <mj-code-editor
                          [language]="'javascript'"
                          [value]="getComponentCode(reportOptions[0])"
                          [autoFocus]="false"
                          [indentWithTab]="true"
                          [readonly]="true"
                          style="height: 100%;">
                        </mj-code-editor>
                      </div>
                    </ng-template>
                  </kendo-tabstrip-tab>
                }
              </kendo-tabstrip>
            </div>
            <!-- Resizer -->
            <div class="panel-resizer" 
                 (mousedown)="startResize($event)"
                 (touchstart)="startResize($event)">
              <div class="resizer-handle"></div>
            </div>
          }
          
          <!-- React component container or error display -->
          @if (currentError) {
            <!-- Error display container with proper height -->
            <div style="flex: 1; display: flex; align-items: center; justify-content: center; 
                        min-height: 400px; padding: 20px; background: rgba(255, 255, 255, 0.95);">
              <div style="width: 90%; 
                          max-width: 600px; 
                          max-height: 80vh;
                          background-color: #f8f9fa; 
                          border: 2px solid #dc3545; 
                          border-radius: 8px; 
                          padding: 20px;
                          overflow-y: auto;
                          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <div style="position: relative;">
                  <button kendoButton (click)="copyErrorToClipboard()" 
                          style="position: absolute; top: 0; right: 0; font-size: 12px;">
                    <span class="fa-solid fa-copy"></span>
                    Copy Error Details
                  </button>
                  <h3 style="color: #dc3545; margin-top: 0; margin-right: 150px; font-size: 18px;">
                    <span class="fa-solid fa-exclamation-triangle"></span>
                    Component Rendering Error
                  </h3>
                </div>
                <p style="margin-bottom: 10px; font-size: 14px;">
                  The selected component option could not be rendered due to the following error:
                </p>
                <div style="background-color: #fff; border: 1px solid #dee2e6; 
                            border-radius: 4px; padding: 12px; margin-bottom: 12px;
                            font-family: 'Courier New', monospace; font-size: 12px;">
                  <strong>Error Type:</strong> {{ currentError.type }}<br>
                  <strong>Details:</strong> {{ currentError.message }}
                  @if (currentError.technicalDetails) {
                    <details style="margin-top: 8px;">
                      <summary style="cursor: pointer; color: #0056b3;">Technical Details (click to expand)</summary>
                      <pre style="margin-top: 8px; white-space: pre-wrap; word-break: break-word; font-size: 11px;">{{ currentError.technicalDetails }}</pre>
                    </details>
                  }
                </div>
                <div style="background-color: #e7f3ff; border: 1px solid #b3d9ff; 
                            border-radius: 4px; padding: 12px; margin-bottom: 12px;">
                  <strong style="font-size: 14px;">What to do:</strong>
                  <ol style="margin: 8px 0 0 20px; padding: 0; font-size: 13px;">
                    <li>Copy the error details and send them back to Skip in the chat to get a corrected version</li>
                    <li>Contact your IT department if the issue persists</li>
                  </ol>
                </div>
                <button kendoButton (click)="retryCurrentOption()" style="font-size: 13px;">
                  <span class="fa-solid fa-rotate"></span>
                  Retry
                </button>
              </div>
            </div>
          } @else {
            <!-- React component container (only shown when no error) -->
            <div style="flex: 1; position: relative; min-height: 0; overflow: auto;">
              <mj-react-component
                *ngIf="reportOptions[0]"
                [component]="reportOptions[0].option"
                [data]="getFlattenedDataContext()"
                [state]="userStates.get(0) || {}"
                [utilities]="utilities"
                [styles]="componentStyles || undefined"
                (stateChange)="onStateChange(0, $event)"
                (componentEvent)="onComponentEvent(0, $event)"
                (refreshData)="handleRefreshData()"
                (openEntityRecord)="onOpenEntityRecord($event)"
                style="width: 100%; height: 100%;">
              </mj-react-component>
            </div>
          }
        </div>
      </div>
    }
    
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      position: relative;
    }
    
    /* Tab Action Bar */
    .tab-action-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background-color: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .tab-actions-left,
    .tab-actions-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    /* Tab Action Buttons */
    .tab-action-button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background-color: transparent;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      color: #333;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    
    .tab-action-button:hover:not(:disabled) {
      background-color: #f5f5f5;
      border-color: #d0d0d0;
    }
    
    .tab-action-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .tab-action-button i {
      font-size: 12px;
    }
    
    /* Both buttons use the same white/secondary style */
    .tab-action-button.create-button,
    .tab-action-button.print-button {
      background-color: white;
      color: #333;
      border-color: #e0e0e0;
    }
    
    .tab-action-button.create-button:hover:not(:disabled),
    .tab-action-button.print-button:hover:not(:disabled) {
      background-color: #f5f5f5;
      border-color: #d0d0d0;
    }
    
    /* Toggle buttons styling */
    .tab-action-button.toggle-button {
      background-color: white;
      color: #666;
      border-color: #e0e0e0;
    }
    
    .tab-action-button.toggle-button:hover:not(:disabled) {
      background-color: #f5f5f5;
      border-color: #d0d0d0;
      color: #333;
    }
    
    .tab-action-button.toggle-button.active {
      background-color: #5B4FE9;
      color: white;
      border-color: #5B4FE9;
    }
    
    .tab-action-button.toggle-button.active:hover:not(:disabled) {
      background-color: #4940D4;
      border-color: #4940D4;
    }
    
    /* Details panel styling */
    .details-panel {
      border-bottom: 1px solid #e0e0e0;
      background-color: #fafafa;
      overflow: hidden;
      transition: height 0.3s ease;
    }
    
    .details-content {
      padding: 16px;
      overflow-y: auto;
      height: 100%;
      font-size: 14px;
      line-height: 1.6;
    }
    
    .details-content.code-content {
      padding: 0;
    }
    
    /* Panel resizer */
    .panel-resizer {
      height: 4px;
      background-color: #e0e0e0;
      cursor: ns-resize;
      position: relative;
      transition: background-color 0.2s ease;
    }
    
    .panel-resizer:hover {
      background-color: #d0d0d0;
    }
    
    .resizer-handle {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 2px;
      background-color: #999;
      border-radius: 1px;
    }
    
    /* Markdown content styling */
    .details-content :deep(h1) { font-size: 1.5em; margin-top: 0; margin-bottom: 0.5em; }
    .details-content :deep(h2) { font-size: 1.3em; margin-top: 1em; margin-bottom: 0.5em; }
    .details-content :deep(h3) { font-size: 1.1em; margin-top: 1em; margin-bottom: 0.5em; }
    .details-content :deep(ul), .details-content :deep(ol) { margin-left: 1.5em; }
    .details-content :deep(code) { 
      background-color: #f4f4f4; 
      padding: 2px 4px; 
      border-radius: 3px; 
      font-family: 'Courier New', monospace; 
      font-size: 0.9em;
    }
    .details-content :deep(pre) { 
      background-color: #f4f4f4; 
      padding: 12px; 
      border-radius: 4px; 
      overflow-x: auto; 
    }
    .details-content :deep(blockquote) { 
      border-left: 4px solid #e0e0e0; 
      padding-left: 16px; 
      margin-left: 0; 
      color: #666; 
    }
    
    /* Tab styling */
    ::ng-deep .k-tabstrip {
      border: none;
      height: 100%;
      display: flex;
      flex-direction: column;
      margin: 10px 5px 5px 5px;
    }
    
    ::ng-deep .k-tabstrip-items {
      background: #f8f9fa;
      border: none;
      border-radius: 8px 8px 0 0;
      flex: 0 0 auto;
      padding: 8px 12px 0 12px;
      gap: 4px;
      display: flex;
    }
    
    ::ng-deep .k-tabstrip-items-wrapper {
      height: 100%;
    }
    
    ::ng-deep .k-content {
      flex: 1;
      overflow: hidden;
      padding: 0;
      background: white;
      border: 1px solid #e0e0e0;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }
    
    ::ng-deep .k-tabstrip .k-item {
      margin-right: 2px;
      border: none;
      background: transparent;
      border-radius: 6px 6px 0 0;
      padding: 2px;
      transition: all 0.2s ease;
    }
    
    ::ng-deep .k-tabstrip .k-item.k-selected {
      background: white;
      border: 1px solid #e0e0e0;
      border-bottom: 1px solid white;
      margin-bottom: -1px;
      z-index: 1;
    }
    
    ::ng-deep .k-tabstrip .k-link {
      padding: 8px 16px;
      font-weight: 500;
      font-size: 13px;
      color: #666;
      transition: all 0.15s ease;
      border-radius: 4px 4px 0 0;
      background: transparent;
      border: none;
      text-transform: lowercase;
    }
    
    ::ng-deep .k-tabstrip .k-link:first-letter {
      text-transform: uppercase;
    }
    
    ::ng-deep .k-tabstrip .k-item:hover:not(.k-selected) .k-link {
      color: #333;
      background: rgba(0, 0, 0, 0.04);
    }
    
    ::ng-deep .k-tabstrip .k-item.k-selected .k-link {
      color: #1976d2;
      font-weight: 600;
      background: white;
    }
    
    /* Star icon styling */
    ::ng-deep .k-tabstrip .k-link .star-icon {
      display: inline-block;
      margin-right: 4px;
      color: #ffd700;
      font-size: 12px;
      vertical-align: middle;
    }
    
    /* Hide default Kendo tab styling */
    ::ng-deep .k-tabstrip-items::before,
    ::ng-deep .k-tabstrip-items::after {
      display: none;
    }
    
    ::ng-deep .k-tabstrip .k-item::before,
    ::ng-deep .k-tabstrip .k-item::after {
      display: none;
    }
    
    /* Remove focus outline */
    ::ng-deep .k-tabstrip .k-link:focus {
      outline: none;
      box-shadow: none;
    }
    
    /* Make sure tab content fills available space */
    ::ng-deep .k-tabstrip .k-content.k-state-active {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    
    /* React host container */
    .react-host-container {
      width: 100%;
      height: 100%;
    }
  `] 
})
export class SkipDynamicUIComponentComponent implements AfterViewInit, OnDestroy {
    @Input() UIComponentCode: string | null = null;
    @Input() ComponentObjectName: string | null = null;
    @Input() ShowPrintReport: boolean = true;
    @Input() ShowReportOptionsToggle: boolean = true;
    @Input() ShowCreateReportButton: boolean = false;
    @Input() matchingReportID: string | null = null;
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();
    @Output() CreateReportRequested = new EventEmitter<number>();

    @ViewChildren(MJReactComponent) reactComponents!: QueryList<MJReactComponent>;

    // Properties for handling multiple report options
    public reportOptions: ComponentOption[] = [];
    public selectedReportOptionIndex: number = 0;
    public currentError: { type: string; message: string; technicalDetails?: string } | null = null;
    
    // Cached component type name to avoid expression change errors
    private _cachedComponentTypeName: string = 'Component';
    public isCreatingReport: boolean = false;
    
    // Toggle states for showing/hiding component details
    public showFunctionalRequirements: boolean = false;
    public showDataRequirements: boolean = false;
    public showTechnicalDesign: boolean = false;
    public showCode: boolean = false;
    
    // Details panel height for resizing
    public detailsPanelHeight: string = '300px';
    private isResizing: boolean = false;
    private startY: number = 0;
    private startHeight: number = 0;
    
    // Cache for user states only - component specs come from data
    public userStates = new Map<number, any>();
    public utilities: ComponentUtilities | null = null;
    public componentStyles: ComponentStyles | null = null;
    
    // Memoized flattened data context to prevent ExpressionChangedAfterItHasBeenCheckedError
    private _flattenedDataContext: Record<string, any> | null = null;
    private _lastDataContextHash: string | null = null;
    
    // Event handlers from React components

    private static librariesInitialized = false;

    constructor(
        private sanitizer: DomSanitizer,
        private cdr: ChangeDetectorRef,
        private ngZone: NgZone,
        private adapter: AngularAdapterService
    ) { }

    /**
     * Gets the currently selected report option
     */
    public get selectedReportOption(): ComponentOption | null {
        return this.reportOptions.length > this.selectedReportOptionIndex 
            ? this.reportOptions[this.selectedReportOptionIndex] 
            : null;
    }

    /**
     * Get tab title for a specific option index
     */
    public getTabTitle(index: number): string {
        const option = this.reportOptions[index];
        if (!option) return `report ${index + 1}`;
        
        const componentType = option.option.type || 'report';
        
        return `${componentType} ${index + 1}`;
    }
    
    /**
     * Check if this option is the AI's top recommendation
     */
    public isTopRanked(index: number): boolean {
        const option = this.reportOptions[index];
        return option?.AIRank === 1;
    }

    /**
     * Handles when the user selects a tab
     */
    public onTabSelect(event: any): void {
        const selectedIndex = event.index;
        this.onReportOptionChange(selectedIndex);
    }

    /**
     * Handles when the user changes the selected report option
     */
    public onReportOptionChange(selectedIndex: number): void {
        if (selectedIndex >= 0 && selectedIndex < this.reportOptions.length) {
            this.selectedReportOptionIndex = selectedIndex;
            this.updateCurrentReport();
        }
    }

    /**
     * Updates the current report display based on the selected option
     */
    private updateCurrentReport(): void {
        const selectedOption = this.selectedReportOption;
        if (!selectedOption) return;

        // Clear any previous error
        this.currentError = null;

        try {
            // Update the component info - this can fail if placeholders are missing
            this.UIComponentCode = BuildComponentCompleteCode(selectedOption.option);
            this.ComponentObjectName = selectedOption.option.name;
            
            // No need to cache component specs - they come from the data
            // Just trigger change detection to render the new component
            this.cdr.detectChanges();
        } catch (error) {
            console.error('Failed to build component code:', error);
            this.currentError = {
                type: 'Component Assembly Error',
                message: 'Failed to assemble the component code. This usually happens when sub-components are missing or placeholders cannot be resolved.',
                technicalDetails: error?.toString() || 'Unknown error during component assembly'
            };
            
            // Clear the UI component code to prevent partial rendering
            this.UIComponentCode = null;
            this.ComponentObjectName = null;
        }
    }
  
    public async PrintReport() {
        const currentComponent = this.getCurrentReactComponent();
        if (currentComponent) {
            // React component handles printing internally
            window.print();
        } else {
            window.print();
        }
    }

    /**
     * Copy error details to clipboard for user to send back to
     */
    public copyErrorToClipboard(): void {
        if (!this.currentError) return;
        
        const errorText = `Component Error:
Type: ${this.currentError.type}
Message: ${this.currentError.message}
${this.currentError.technicalDetails ? `\nTechnical Details:\n${this.currentError.technicalDetails}` : ''}

Component Option: ${this.selectedReportOptionIndex + 1}
Component Name: ${this.ComponentObjectName || 'Unknown'}`;

        navigator.clipboard.writeText(errorText).then(() => {
            alert('Error details copied to clipboard. You can paste this in the chat to get help.');
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
        });
    }

    /**
     * Get the React component for a specific option index
     */
    private getReactComponentForOption(optionIndex: number): MJReactComponent | null {
        if (!this.reactComponents || this.reactComponents.length === 0) {
            return null;
        }
        
        if (this.reportOptions.length === 1) {
            // Single option - use the only component
            return this.reactComponents.first || null;
        } else {
            // Multiple options - find by index
            return this.reactComponents.toArray()[optionIndex] || null;
        }
    }

    /**
     * Retry loading the current option
     */
    public retryCurrentOption(): void {
        // Clear the error
        this.currentError = null;
        
        // Just clear the error and re-render
        // Component spec comes from reportOptions data
        
        // Trigger change detection
        this.cdr.detectChanges();
    }

    /**
     * Handle create report request for a specific option
     */
    public createReportForOption(optionIndex: number): void {
        this.isCreatingReport = true;
        // Emit the event with the option index so the parent can handle it
        this.CreateReportRequested.emit(optionIndex);
    }
    
    /**
     * Get the component type name for display
     */
    public getComponentTypeName(option: ComponentOption): string {
        const type = option.option.type || 'report';
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
    
    /**
     * Get the cached component type name for the first option to avoid change detection errors
     */
    public get firstOptionComponentTypeName(): string {
        return this._cachedComponentTypeName;
    }
    
    /**
     * Toggle methods for showing/hiding component details
     */
    public toggleShowFunctionalRequirements(): void {
        this.showFunctionalRequirements = !this.showFunctionalRequirements;
        this.adjustDetailsPanelHeight();
    }
    
    public toggleShowDataRequirements(): void {
        this.showDataRequirements = !this.showDataRequirements;
        this.adjustDetailsPanelHeight();
    }
    
    public toggleShowTechnicalDesign(): void {
        this.showTechnicalDesign = !this.showTechnicalDesign;
        this.adjustDetailsPanelHeight();
    }
    
    public toggleShowCode(): void {
        this.showCode = !this.showCode;
        this.adjustDetailsPanelHeight();
    }
    
    /**
     * Adjust the details panel height when toggling views
     */
    private adjustDetailsPanelHeight(): void {
        const anyVisible = this.showFunctionalRequirements || this.showDataRequirements || 
                          this.showTechnicalDesign || this.showCode;
        
        if (anyVisible && this.detailsPanelHeight === '0px') {
            this.detailsPanelHeight = '300px';
        } else if (!anyVisible) {
            this.detailsPanelHeight = '0px';
        }
    }
    
    /**
     * Format functional requirements as HTML
     */
    public getFormattedFunctionalRequirements(option: ComponentOption): any {
        const requirements = option.option.functionalRequirements || 'No functional requirements specified.';
        const html = marked.parse(requirements);
        return this.sanitizer.sanitize(1, html); // 1 = SecurityContext.HTML
    }
    
    /**
     * Format data requirements as HTML
     */
    public getFormattedDataRequirements(option: ComponentOption): any {
        const dataReq = option.option.dataRequirements;
        if (!dataReq) {
            return this.sanitizer.sanitize(1, '<p>No data requirements specified.</p>');
        }
        
        let markdown = `## Data Access Mode: ${dataReq.mode}\n\n`;
        
        if (dataReq.description) {
            markdown += `${dataReq.description}\n\n`;
        }
               
        if (dataReq.entities && dataReq.entities.length > 0) {
            markdown += `### Entities\n\n`;
            dataReq.entities.forEach(entity => {
                markdown += `#### ${entity.name}\n- Description: ${entity.description || 'No description provided.'}\n `;
                if (entity.displayFields && entity.displayFields.length > 0) {
                  markdown += `- Display Fields:\n`;
                  entity.displayFields.forEach(field => {
                      markdown += `  - ${field}\n`;
                  });
                }
                if (entity.filterFields && entity.filterFields.length > 0) {
                    markdown += `- Filter Fields:\n`;
                    entity.filterFields.forEach(field => {
                        markdown += `  - ${field}\n`;
                    });
                }
                if (entity.sortFields && entity.sortFields.length > 0) {
                    markdown += `- Sort Fields:\n`;
                    entity.sortFields.forEach(field => {
                        markdown += `  - ${field}\n`;
                    });
                }
                if (entity.fieldMetadata && entity.fieldMetadata.length > 0) {
                    markdown += `- Field Metadata:\n`;
                    entity.fieldMetadata.forEach(meta => {
                        markdown += `  - ${meta.name}: ${meta.description || 'No description provided.'}\n`;
                    });
                } 

                if (entity.usageContext) {
                    markdown += `- Usage Context: ${entity.usageContext}\n`;
                }
                markdown += '\n';
            });
            markdown += '\n';
        }
        
        const html = marked.parse(markdown);
        return this.sanitizer.sanitize(1, html);
    }
    
    /**
     * Format technical design as HTML
     */
    public getFormattedTechnicalDesign(option: ComponentOption): any {
        const design = option.option.technicalDesign || 'No technical design specified.';
        const html = marked.parse(design);
        return this.sanitizer.sanitize(1, html);
    }
    
    /**
     * Get the component code
     */
    public getComponentCode(option: ComponentOption): string {
        try {
            return BuildComponentCompleteCode(option.option);
        } catch (e) {
            return `// Error building complete component code:\n// ${e}`;
        }
    }
    
    /**
     * Start resizing the details panel
     */
    public startResize(event: MouseEvent | TouchEvent): void {
        event.preventDefault();
        this.isResizing = true;
        this.startY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
        this.startHeight = parseInt(this.detailsPanelHeight, 10);
        
        // Use NgZone to run outside Angular to prevent change detection during drag
        this.ngZone.runOutsideAngular(() => {
            document.addEventListener('mousemove', this.onResize);
            document.addEventListener('mouseup', this.stopResize);
            document.addEventListener('touchmove', this.onResize);
            document.addEventListener('touchend', this.stopResize);
        });
    }
    
    /**
     * Handle resize movement
     */
    private onResize = (event: MouseEvent | TouchEvent): void => {
        if (!this.isResizing) return;
        
        const currentY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;
        const deltaY = currentY - this.startY;
        const newHeight = Math.max(100, Math.min(600, this.startHeight + deltaY));
        
        // Run inside Angular to update the binding
        this.ngZone.run(() => {
            this.detailsPanelHeight = `${newHeight}px`;
            this.cdr.detectChanges();
        });
    }
    
    /**
     * Stop resizing
     */
    private stopResize = (): void => {
        this.isResizing = false;
        document.removeEventListener('mousemove', this.onResize);
        document.removeEventListener('mouseup', this.stopResize);
        document.removeEventListener('touchmove', this.onResize);
        document.removeEventListener('touchend', this.stopResize);
    }
    
    @HostListener('window:resize')
    onWindowResize(): void {
        // Ensure the details panel height remains valid on window resize
        const currentHeight = parseInt(this.detailsPanelHeight, 10);
        const maxHeight = window.innerHeight * 0.6;
        if (currentHeight > maxHeight) {
            this.detailsPanelHeight = `${maxHeight}px`;
        }
    }

    async ngAfterViewInit() {
        // Initialize libraries once per application if not already done
        if (!SkipDynamicUIComponentComponent.librariesInitialized) {
            try {
                await this.adapter.initialize(undefined, SKIP_CHAT_ADDITIONAL_LIBRARIES);
                SkipDynamicUIComponentComponent.librariesInitialized = true;
            } catch (error) {
                LogError('Failed to initialize Skip Chat libraries', error as any);
            }
        }
        
        if (this.SkipData) {
            this.setupReportOptions(this.SkipData);
        }
        
        // Initialize utilities and styles once using React runtime
        const runtimeUtils = createRuntimeUtilities();
        this.utilities = runtimeUtils.buildUtilities();
        this.componentStyles = SetupStyles();
        
        // Initialize user states for all options
        // Use Promise.resolve to avoid ExpressionChangedAfterItHasBeenCheckedError
        if (this.reportOptions.length > 0) {
            Promise.resolve().then(() => {
                this.reportOptions.forEach((_, index) => {
                    if (!this.userStates.has(index)) {
                        this.userStates.set(index, {});
                    }
                });
                this.cdr.detectChanges();
            });
        }
    }
    
    ngOnDestroy(): void {
        // Clean up user states
        this.userStates.clear();
        
        // Ensure resize listeners are removed if still active
        if (this.isResizing) {
            this.stopResize();
        }
        
        // The MJReactComponent handles its own cleanup
    }
    
    ngOnChanges(changes: SimpleChanges): void {
        if (changes['SkipData']) {
            // Clear cached data context when SkipData changes
            this._flattenedDataContext = null;
            this._lastDataContextHash = null;
            
            const skipData = changes['SkipData'].currentValue;
            if (skipData) {
                this.setupReportOptions(skipData);
            }
        }
    }

    /**
     * Get the currently active React component
     */
    private getCurrentReactComponent(): MJReactComponent | null {
        return this.getReactComponentForOption(this.selectedReportOptionIndex);
    }
  
    private _skipData: SkipAPIAnalysisCompleteResponse | undefined;
    @Input() get SkipData(): SkipAPIAnalysisCompleteResponse | undefined {
        return this._skipData ? this._skipData : undefined;   
    }
    set SkipData(d: SkipAPIAnalysisCompleteResponse | undefined){
        const hadData = this._skipData ? true : false;
        this._skipData = d;
        if (d) {
            // For backward compatibility, check if we have component options
            if (d.componentOptions && d.componentOptions.length > 0) {
                // Use the first component option (or the highest ranked one)
                const component = d.componentOptions[0];
                this.UIComponentCode = BuildComponentCompleteCode(component.option);
                this.ComponentObjectName = component.option.name;
            } else {
                // Fallback for old format
                this.UIComponentCode = (d as any).htmlReport;
                this.ComponentObjectName = (d as any).htmlReportObjectName;
            }
        }
        if (d && hadData) {
            // Update the current display with new data
            this.updateCurrentReport();
        }
    }

    /**
     * Sets up the component options from the SkipData, prioritizing the new componentOptions array
     * but falling back to the deprecated htmlReport/htmlReportObjectName for backward compatibility
     */
    private setupReportOptions(data: SkipAPIAnalysisCompleteResponse): void {
        // Check if we have the new componentOptions array
        if (data.componentOptions && data.componentOptions.length > 0) {
            // Sort by AIRank (lower numbers = better ranking)
            this.reportOptions = [...data.componentOptions].sort((a, b) => {
                const rankA = a.AIRank ?? Number.MAX_SAFE_INTEGER;
                const rankB = b.AIRank ?? Number.MAX_SAFE_INTEGER;
                return rankA - rankB;
            });
            
            // Select the best option (first in sorted array)
            this.selectedReportOptionIndex = 0;
            const bestOption = this.reportOptions[0];
            this.UIComponentCode = BuildComponentCompleteCode(bestOption.option);
            this.ComponentObjectName = bestOption.option.name;
            
            // Update cached component type name after current change detection cycle
            Promise.resolve().then(() => {
                this._cachedComponentTypeName = this.getComponentTypeName(bestOption);
                this.cdr.detectChanges();
            });
        } 
    }


    /**
     * Initialize user state for a specific option index
     */
    private initializeUserStateForOption(optionIndex: number): void {
        // Initialize user state if not exists
        if (!this.userStates.has(optionIndex)) {
            this.userStates.set(optionIndex, {});
        }
    }
    
    /**
     * Handle state change events from React components
     */
    public onStateChange(optionIndex: number, event: StateChangeEvent): void {
        const currentState = this.userStates.get(optionIndex) || {};
        this.userStates.set(optionIndex, {
            ...currentState,
            [event.path]: event.value
        });
        
        // Handle any additional state change logic
        this.handleUpdateUserState({ [event.path]: event.value });
    }
    
    /**
     * Handle component events from React components
     */
    public onComponentEvent(optionIndex: number, event: ReactComponentEvent): void {
        if (event.type === 'error') {
            this.currentError = {
                type: event.payload.source || 'React Component Error',
                message: event.payload.error || 'An unknown error occurred',
                technicalDetails: event.payload.errorInfo || ''
            };
        } else {
            this.handleNotifyEvent(event.type, event.payload);
        }
    }
    
    /**
     * Handle open entity record events
     */
    public onOpenEntityRecord(event: { entityName: string; key: CompositeKey }): void {
        this.handleOpenEntityRecord(event.entityName, event.key);
    }

    
    public getFlattenedDataContext(): Record<string, any> {
        // Create a simple hash of the data context to detect changes
        let currentHash = '';
        if (this.SkipData?.dataContext) {
            const loadedItems = this.SkipData.dataContext.Items.filter((i: any) => i.DataLoaded && i._Data?.length > 0);
            currentHash = loadedItems.map((item: any) => `${item.ID}_${item._Data?.length || 0}`).join('_');
        }
        
        // Check if we need to recalculate (data changed)
        if (this._flattenedDataContext && this._lastDataContextHash === currentHash) {
            return this._flattenedDataContext;
        }
        
        // Recalculate and cache
        const flattenedDataContext: Record<string, any> = {};
        
        if (this.SkipData?.dataContext) {
            const loadedItems = this.SkipData.dataContext.Items.filter((i: any) => i.DataLoaded && i._Data?.length > 0);
            for (let i = 0; i < loadedItems.length; i++) {
                flattenedDataContext["data_item_" + i] = loadedItems[i]._Data;
            }
        }
        
        this._flattenedDataContext = flattenedDataContext;
        this._lastDataContextHash = currentHash;
        
        return this._flattenedDataContext;
    }

    // Event handler implementations
    public handleRefreshData(): void {
        console.log('Component requested data refresh');
        // Emit an event or call parent component method to refresh data
    }
    
    private handleOpenEntityRecord(entityName: string, key: CompositeKey): void {
        if (entityName) {
            // bubble this up to our parent component as we don't directly open records in this component
            const md = new Metadata();
            const entityMatch = md.EntityByName(entityName);
            if (!entityMatch) {
                // couldn't find it, but sometimes the AI uses a table name or a view name, let's check for that
                const altMatch = md.Entities.filter(e => e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                        e.BaseView.toLowerCase() === entityName.toLowerCase() || 
                                                        e.SchemaName.toLowerCase() + '.' + e.BaseTable.toLowerCase() === entityName.toLowerCase() ||
                                                        e.SchemaName.toLowerCase() + '.' + e.BaseView.toLowerCase() === entityName.toLowerCase());
                if (altMatch && altMatch.length === 1) { 
                    entityName = altMatch[0].Name;
                }
            }
            // check what we were passed, it might be a real CompositeKey or a KeyValuePair[]
            if (!(key instanceof CompositeKey)) {
                // convert KeyValuePair[] to CompositeKey
                key = new CompositeKey(key as KeyValuePair[]);
            }
            // Emit the drill down event with the entity name and where clause
            this.DrillDownEvent.emit(new DrillDownInfo(entityName, key.ToWhereClause()));
        }
    }
    
    private handleUpdateUserState(userState: any): void {
        console.log('Component updated user state:', userState);
        // TODO: Implement user state persistence if needed
    }
    
    private handleNotifyEvent(eventName: string, eventData: any): void {
        console.log(`Component raised event: ${eventName} notified with data:`, eventData);
        
        // Handle component errors from React host
        if (eventName === 'componentError') {
            this.currentError = {
                type: eventData.source || 'React Component Error',
                message: eventData.error || 'An unknown error occurred in the React component',
                technicalDetails: eventData.stackTrace || eventData.errorInfo?.componentStack || ''
            };
        }
        // TODO: Handle other custom events as needed
    }
 

    public async refreshReport(data?: any): Promise<void> {
        const currentComponent = this.getCurrentReactComponent();
        if (currentComponent) {
            currentComponent.refresh(data);
        }
    }
}

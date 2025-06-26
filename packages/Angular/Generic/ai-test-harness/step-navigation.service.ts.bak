import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Interface for step navigation data
 */
export interface StepNavigationData {
    stepId: string;
    stepName: string;
    stepType: string;
    runId: string;
    runType: 'agent' | 'prompt';
    timestamp: Date;
}

/**
 * Service for communicating step navigation between the test harness and run detail forms
 * This service acts as a bridge to pass step-specific information when opening run records
 */
@Injectable({
    providedIn: 'root'
})
export class StepNavigationService {
    private targetStepSubject = new BehaviorSubject<StepNavigationData | null>(null);
    
    /**
     * Observable for components to subscribe to step navigation events
     */
    public targetStep$: Observable<StepNavigationData | null> = this.targetStepSubject.asObservable();
    
    /**
     * Set the target step for navigation
     * Call this before opening the run record
     */
    public setTargetStep(stepData: StepNavigationData): void {
        console.log('🎯 StepNavigationService: Setting target step', stepData);
        this.targetStepSubject.next(stepData);
    }
    
    /**
     * Get the current target step and clear it
     * Call this from the run form to get the step to navigate to
     */
    public getAndClearTargetStep(): StepNavigationData | null {
        const currentStep = this.targetStepSubject.value;
        if (currentStep) {
            console.log('📍 StepNavigationService: Retrieved and clearing target step', currentStep);
            this.targetStepSubject.next(null); // Clear after retrieval
        }
        return currentStep;
    }
    
    /**
     * Get the current target step without clearing it
     * Useful for checking if there's a pending navigation
     */
    public peekTargetStep(): StepNavigationData | null {
        return this.targetStepSubject.value;
    }
    
    /**
     * Clear the target step
     * Call this to cancel any pending navigation
     */
    public clearTargetStep(): void {
        console.log('🧹 StepNavigationService: Clearing target step');
        this.targetStepSubject.next(null);
    }
    
    /**
     * Check if there's a target step for a specific run
     */
    public hasTargetStepForRun(runId: string): boolean {
        const targetStep = this.targetStepSubject.value;
        return targetStep !== null && targetStep.runId === runId;
    }
}

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FlowEditorService {
  private selectedNode$ = new BehaviorSubject<any>(null);
  public selectedNode = this.selectedNode$.asObservable();
  
  private allSteps: any[] = [];

  constructor() { }

  selectNode(node: any): void {
    this.selectedNode$.next(node);
  }

  updateNode(node: any): void {
    // Trigger any necessary updates
  }
  
  setAllSteps(steps: any[]): void {
    this.allSteps = steps;
  }
  
  getAllSteps(): any[] {
    return this.allSteps;
  }
}
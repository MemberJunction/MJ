import { Component, OnInit } from '@angular/core';
import * as monaco from 'monaco-editor';
 
 
@Component({
  selector: 'mj-code-editor',
  templateUrl: './ng-code-editor.component.html',
  styleUrls: ['./ng-code-editor.component.css']
})
export class CodeEditorComponent implements OnInit {
  ngOnInit() {
    const el = document.getElementById('editor');
    if (el) {
      monaco.editor.create(el, {
        value: 'function x() {\n  console.log("Hello world!");\n}',
        language: 'typescript',
        theme: 'vs-dark'
      });  
    }
  }
}

 

import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  {
    path: 'home',
    loadComponent: () => import('./home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'text-chat',
    loadComponent: () => import('./chat/chat.component').then(m => m.ChatComponent)
  },
  {
    path: 'audio-chat',
    loadComponent: () => import('./audio-chat/audio-chat.component').then(m => m.AudioChatComponent)
  }
];

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root',
  })
  export class MSFTUserImageService {
    private url = 'https://graph.microsoft.com/v1.0/me/photo/$value';
  
    constructor(private http: HttpClient) {}
  
    getPhoto(token: string): Observable<Blob> {
      const headers = new HttpHeaders().set('Authorization', `Bearer ${token}`);
      const val = this.http.get(this.url, { headers, responseType: 'blob' });
      return val;
    }
  }
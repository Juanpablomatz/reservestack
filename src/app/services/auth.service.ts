import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly BASE_URL = environment.apiUrl;
  private readonly TOKEN_KEY = 'reservestack_token';
  private readonly USER_KEY = 'reservestack_user';
  private readonly LAST_ROUTE_KEY = 'reservestack_last_route';

  constructor(private http: HttpClient, private router: Router) {}

  login(usuario: string, password: string): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/auth/login`, { usuario, password }).pipe(
      tap((res: any) => {
        if (res && res.success) {
          const tokenAGuardar = res.token || res.jwt || 'SESSION_ACTIVE_TOKEN';
          localStorage.setItem(this.TOKEN_KEY, tokenAGuardar);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.usuario || { usuario }));
        }
      })
    );
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('jwt');
    localStorage.removeItem(this.LAST_ROUTE_KEY);
    this.router.navigate(['/login']);
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem(this.TOKEN_KEY);
    return !!token && token !== 'null' && token !== 'undefined';
  }

  getUser() {
    const user = localStorage.getItem(this.USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getAuthHeaders(): { headers: HttpHeaders } {
    const token = this.getToken();
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      })
    };
  }

 
  guardarUltimaRuta(ruta: string): void {
    if (ruta && !ruta.includes('/login') && !ruta.includes('/reservar')) {
      localStorage.setItem(this.LAST_ROUTE_KEY, ruta);
    }
  }


  obtenerUltimaRuta(): string {
    return localStorage.getItem(this.LAST_ROUTE_KEY) || '/panel';
  }
}
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

  constructor(private http: HttpClient, private router: Router) {}

  login(usuario: string, password: string): Observable<any> {
    return this.http.post(`${this.BASE_URL}/api/auth/login`, { usuario, password }).pipe(
      tap((res: any) => {
        if (res && res.success) {
          // ✅ Garantiza el almacenamiento del token (res.token o fallback)
          const tokenAGuardar = res.token || res.jwt || 'SESSION_ACTIVE_TOKEN';
          localStorage.setItem(this.TOKEN_KEY, tokenAGuardar);
          localStorage.setItem(this.USER_KEY, JSON.stringify(res.usuario || { usuario }));
        }
      })
    );
  }

  logout() {
    // 🧹 Limpieza completa de sesión
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem('jwt');
    this.router.navigate(['/login']);
  }

  // 🛡️ Comprueba si la sesión está activa al recargar (F5)
  isAuthenticated(): boolean {
    const token = localStorage.getItem(this.TOKEN_KEY);
    return !!token && token !== 'null' && token !== 'undefined';
  }

  getUser() {
    const user = localStorage.getItem(this.USER_KEY);
    return user ? JSON.parse(user) : null;
  }

  // 🔑 Devuelve el Token JWT almacenado
  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  // 🛡️ Genera los Encabezados HTTP con el Bearer Token para peticiones protegidas
  getAuthHeaders(): { headers: HttpHeaders } {
    const token = this.getToken();
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      })
    };
  }
}
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class LoginPage {
  usuario: string = '';
  password: string = '';
  cargando: boolean = false;
  errorMessage: string = '';

  constructor(
    private authService: AuthService, 
    private router: Router
  ) {}

  entrarAlSistema() {
    if (!this.usuario.trim() || !this.password.trim()) {
      this.errorMessage = 'Ingresa usuario y contraseña.';
      return;
    }

    this.cargando = true;
    this.errorMessage = '';

    this.authService.login(this.usuario.trim(), this.password.trim()).subscribe({
      next: (res: any) => {
        this.cargando = false;
        if (res && res.success) {
          // 🔑 Autenticación exitosa -> Te dirige al panel de selección de restaurante
          this.router.navigate(['/panel']);
        } else {
          this.errorMessage = res?.message || 'Usuario o contraseña incorrectos.';
        }
      },
      error: (err: any) => {
        this.cargando = false;
        this.errorMessage = err?.error?.message || 'Error de conexión con el servidor.';
      }
    });
  }
}
import { Component, OnInit } from '@angular/core';
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
export class LoginPage implements OnInit {
  // Login principal (usuario almacena el correo electrónico)
  usuario: string = '';
  password: string = '';
  cargando: boolean = false;
  errorMessage: string = '';

  // 🔑 Variables de Recuperación de Contraseña por PIN
  modalRecuperarAbierto: boolean = false;
  pasoRecuperacion: number = 1; // 1: Pedir Email, 2: Pedir PIN, 3: Nueva Contraseña
  emailRecuperar: string = '';
  pinRecuperar: string = '';
  nuevaPassword: string = '';
  confirmarNuevaPassword: string = '';
  
  recuperarMensaje: string = '';
  recuperarError: string = '';
  recuperandoCargando: boolean = false;

  readonly BASE_URL = 'http://localhost:3000';

  constructor(
    private authService: AuthService, 
    private router: Router
  ) {}

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/panel']);
    }
  }

  entrarAlSistema() {
    const valUsuario = this.usuario.trim();
    const valPass = this.password.trim();

    if (!valUsuario || !valPass) {
      this.errorMessage = 'Ingresa tu correo electrónico y contraseña.';
      return;
    }

    // 🛡️ Validación estricta de formato de correo electrónico
    const regexEmail = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!regexEmail.test(valUsuario) && valUsuario !== 'admin' && valUsuario !== 'hostess') {
      this.errorMessage = 'Ingresa un correo electrónico válido (ej. correo@ejemplo.com).';
      return;
    }

    this.cargando = true;
    this.errorMessage = '';

    this.authService.login(valUsuario, valPass).subscribe({
      next: (res: any) => {
        this.cargando = false;
        if (res && res.success) {
          // 🔑 Autenticación exitosa -> Dirige al panel
          this.router.navigate(['/panel']);
        } else {
          this.errorMessage = res?.message || 'Correo o contraseña incorrectos.';
        }
      },
      error: (err: any) => {
        this.cargando = false;
        this.errorMessage = err?.error?.message || 'Error de conexión con el servidor.';
      }
    });
  }

  // =================================================================
  // 🔑 MÉTODOS DE RECUPERACIÓN DE CONTRASEÑA VÍA PIN
  // =================================================================

  abrirModalRecuperar() {
    this.modalRecuperarAbierto = true;
    this.pasoRecuperacion = 1;
    this.emailRecuperar = '';
    this.pinRecuperar = '';
    this.nuevaPassword = '';
    this.confirmarNuevaPassword = '';
    this.recuperarMensaje = '';
    this.recuperarError = '';
  }

  cerrarModalRecuperar() {
    this.modalRecuperarAbierto = false;
    this.recuperandoCargando = false;
  }

  // PASO 1: Enviar PIN al correo del usuario
  async solicitarPin() {
    if (!this.emailRecuperar.trim()) {
      this.recuperarError = 'Ingresa tu correo electrónico registrado.';
      return;
    }

    const regexEmail = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    if (!regexEmail.test(this.emailRecuperar.trim())) {
      this.recuperarError = 'Ingresa una dirección de correo válida.';
      return;
    }

    this.recuperandoCargando = true;
    this.recuperarError = '';
    this.recuperarMensaje = '';

    try {
      const resp = await fetch(`${this.BASE_URL}/api/auth/recuperar-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.emailRecuperar.trim() })
      });
      const data = await resp.json();
      this.recuperandoCargando = false;

      if (data.success) {
        this.pasoRecuperacion = 2;
        this.recuperarMensaje = data.message;
      } else {
        this.recuperarError = data.message || 'No se pudo enviar el PIN.';
      }
    } catch (e) {
      this.recuperandoCargando = false;
      this.recuperarError = 'Error al conectar con el servidor.';
    }
  }

  // PASO 2: Validar el PIN de 6 dígitos ingresado
  async verificarPin() {
    if (!this.pinRecuperar.trim() || this.pinRecuperar.trim().length !== 6) {
      this.recuperarError = 'Ingresa el PIN de 6 dígitos enviado a tu correo.';
      return;
    }

    this.recuperandoCargando = true;
    this.recuperarError = '';
    this.recuperarMensaje = '';

    try {
      const resp = await fetch(`${this.BASE_URL}/api/auth/verificar-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: this.emailRecuperar.trim(), 
          pin: this.pinRecuperar.trim() 
        })
      });
      const data = await resp.json();
      this.recuperandoCargando = false;

      if (data.success) {
        this.pasoRecuperacion = 3;
        this.recuperarMensaje = 'PIN verificado. Ingresa tu nueva contraseña.';
      } else {
        this.recuperarError = data.message || 'PIN incorrecto o expirado.';
      }
    } catch (e) {
      this.recuperandoCargando = false;
      this.recuperarError = 'Error al verificar el PIN.';
    }
  }

  // PASO 3: Guardar la nueva contraseña
  async restablecerPassword() {
    if (!this.nuevaPassword.trim() || this.nuevaPassword.trim().length < 6) {
      this.recuperarError = 'La nueva contraseña debe tener al menos 6 caracteres.';
      return;
    }

    if (this.nuevaPassword.trim() !== this.confirmarNuevaPassword.trim()) {
      this.recuperarError = 'Las contraseñas no coinciden.';
      return;
    }

    this.recuperandoCargando = true;
    this.recuperarError = '';
    this.recuperarMensaje = '';

    try {
      const resp = await fetch(`${this.BASE_URL}/api/auth/restablecer-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: this.emailRecuperar.trim(), 
          pin: this.pinRecuperar.trim(),
          nuevaPassword: this.nuevaPassword.trim()
        })
      });
      const data = await resp.json();
      this.recuperandoCargando = false;

      if (data.success) {
        alert('🎉 ¡Tu contraseña se actualizó con éxito! Ya puedes ingresar.');
        this.password = this.nuevaPassword.trim();
        this.usuario = this.emailRecuperar.trim();
        this.cerrarModalRecuperar();
      } else {
        this.recuperarError = data.message || 'No se pudo actualizar la contraseña.';
      }
    } catch (e) {
      this.recuperandoCargando = false;
      this.recuperarError = 'Error al conectar con el servidor.';
    }
  }
}
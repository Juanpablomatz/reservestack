import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class LoginPage {
  constructor(private router: Router) {}

  entrarAlSistema() {
    // Por ahora, al hacer clic "simulamos" que el login fue exitoso 
    // y te manda directo a la pantalla de selección de restaurante.
    this.router.navigate(['/panel']);
  }
}
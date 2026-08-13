import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-reservar',
  templateUrl: './reservar.page.html',
  styleUrls: ['./reservar.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ReservarPage implements OnInit {

  readonly BASE_URL = 'http://localhost:3000';

  todayDate: string = new Date().toISOString().split('T')[0];
  fecha: string = this.todayDate;
  hora: string = '14:00';
  personas: number = 2;
  zona: string = 'Piso';
  zonasDisponibles: string[] = ['Piso', 'Terraza', 'Jardín', 'Cava'];

  nombre: string = '';
  apellido: string = '';
  telefono: string = '';
  email: string = '';
  nota: string = '';

  cargando: boolean = false;

  constructor() { }

  ngOnInit() { }

  limpiarTelefono(event: any) {
    if (this.telefono) {
      this.telefono = this.telefono.replace(/\D/g, '');
    }
  }

  async confirmarReservacion() {
    if (!this.nombre || !this.telefono || !this.email) {
      alert('Por favor completa los campos obligatorios: Nombre, Teléfono y Correo.');
      return;
    }

    this.cargando = true;

  const payload = {
  idRestaurante: 2, 
  fecha: this.fecha,
  hora: this.hora,
  personas: this.personas,
  zona: this.zona,
  nombre: `${this.nombre} ${this.apellido}`.trim(),
  telefono: this.telefono,
  email: this.email,
  nota: this.nota
  };

    try {
      const response = await fetch(`${this.BASE_URL}/api/publico/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert('✅ ¡Reservación confirmada! Te hemos enviado un correo de confirmación.');
        this.limpiarFormulario();
      } else {
        alert('⚠️ ' + (data.message || 'No fue posible realizar la reservación.'));
      }
    } catch (e) {
      alert('❌ Error de conexión con el servidor.');
    } finally {
      this.cargando = false;
    }
  }

  limpiarFormulario() {
    this.fecha = this.todayDate;
    this.hora = '14:00';
    this.personas = 2;
    this.zona = 'Piso';
    this.nombre = '';
    this.apellido = '';
    this.telefono = '';
    this.email = '';
    this.nota = '';
  }
}
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reservar-llorona',
  templateUrl: './reservar-llorona.page.html',
  styleUrls: ['./reservar-llorona.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class ReservarLloronaPage {
  fecha: string = new Date().toISOString().split('T')[0];
  hora: string = '20:00';
  personas: number = 2;
  zona: string = 'Terraza';
  nombre: string = '';
  telefono: string = '';
  email: string = '';
  nota: string = '';

  readonly BASE_URL = 'http://localhost:3000';

  async hacerReservaCliente(e: Event) {
    e.preventDefault();

    const reservaData = {
      id: Date.now(),
      idRestaurante: 3, // Llorona Comedor
      fecha: this.fecha,
      hora: this.hora,
      zona: this.zona,
      idMesa: '1', // Asignación automática o sugerida
      nombre: this.nombre,
      personas: this.personas,
      telefono: this.telefono,
      email: this.email,
      nota: this.nota,
      estado: 'reservada',
      isNewRecord: true // 📧 Dispara el correo oficial con Nodemailer
    };

    try {
      const response = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reservaData)
      });

      const data = await response.json();

      alert(`🥂 ¡Tu reserva en Llorona Comedor ha sido confirmada con éxito!\n\nTe hemos enviado un correo de confirmación a: ${this.email}`);

      // Limpiar formulario
      this.nombre = '';
      this.telefono = '';
      this.email = '';
      this.nota = '';
    } catch (err) {
      alert('⚠️ Hubo un error al procesar tu reserva. Inténtalo nuevamente.');
    }
  }
}
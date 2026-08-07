import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  calendarOutline, 
  timeOutline, 
  peopleOutline, 
  restaurantOutline, 
  personOutline, 
  callOutline, 
  mailOutline, 
  documentTextOutline 
} from 'ionicons/icons';

@Component({
  selector: 'app-reservar-llorona',
  templateUrl: './reservar-llorona.page.html',
  styleUrls: ['./reservar-llorona.page.scss'],
  standalone: true,
  imports: [IonContent, IonIcon, CommonModule, FormsModule]
})
export class ReservarLloronaPage implements OnInit {

  fecha: string = '';
  hora: string = '';
  zona: string = 'Piso';
  nombre: string = '';
  apellido: string = ''; 
  personas: number = 2;
  telefono: string = '';
  email: string = '';
  nota: string = '';

  todayDate: string = '';
  cargando: boolean = false;

  zonasDisponibles: string[] = ['Piso'];

  restauranteLayout: any = {
    'Piso': [
      {id:1,c:4},{id:2,c:4},{id:3,c:4},{id:4,c:4},{id:5,c:4},
      {id:6,c:4},{id:7,c:4},{id:8,c:4},{id:9,c:4},{id:10,c:4}
    ]
  };

  readonly BASE_URL = 'http://localhost:3000';

  constructor() {
    addIcons({
      calendarOutline,
      timeOutline,
      peopleOutline,
      restaurantOutline,
      personOutline,
      callOutline,
      mailOutline,
      documentTextOutline
    });
  }

  async ngOnInit() {
    this.calcularFechaMinimaLocal();
    await this.cargarDisenoMesas();
  }

  calcularFechaMinimaLocal() {
    const localDate = new Date();
    const offset = localDate.getTimezoneOffset();
    const adjustedDate = new Date(localDate.getTime() - (offset * 60 * 1000));
    this.todayDate = adjustedDate.toISOString().split('T')[0];
    this.fecha = this.todayDate;
    this.hora = '20:00';
  }

  limpiarTelefono(event: any) {
    const input = event.target;
    if (input) {
      let value = input.value;
      value = value.replace(/[^0-9]/g, '');
      input.value = value;
      this.telefono = value;
    }
  }

  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/diseno`);
      const data = await resp.json();
      
      const tieneMesas = Object.values(data).some((arr: any) => arr && arr.length > 0);
      if (tieneMesas) {
        this.restauranteLayout = data;
        this.zonasDisponibles = Object.keys(data);
      }
    } catch (e) {
      console.warn('⚠️ Usando distribución de mesas de Llorona Comedor local de respaldo.');
    }
  }

  async buscarMesaDisponible(personasRequeridas: number): Promise<number> {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`);
      const todasLasReservas = await resp.json();

      const ocupadasHoy = todasLasReservas.filter((r: any) => 
        r.fecha === this.fecha && 
        r.estado !== 'finalizada' && 
        r.estado !== 'cancelada' && 
        r.estado !== 'liberada'
      );
      const idsMesasOcupadas = ocupadasHoy.map((r: any) => r.idMesa.toString());

      const mesasDeZona = this.restauranteLayout[this.zona] || [];

      const mesaIdeal = mesasDeZona.find((m: any) => 
        m.c >= personasRequeridas && 
        !idsMesasOcupadas.includes(m.id.toString())
      );

      if (mesaIdeal) return mesaIdeal.id;

      const cualquierMesaLibre = mesasDeZona.find((m: any) => 
        !idsMesasOcupadas.includes(m.id.toString())
      );

      if (cualquierMesaLibre) return cualquierMesaLibre.id;

    } catch (error) {
      console.error('Error en el algoritmo de asignación de mesa en Llorona:', error);
    }

    const mesasRespaldo = this.restauranteLayout[this.zona] || [];
    return mesasRespaldo.length > 0 ? mesasRespaldo[0].id : 1;
  }

  async confirmarReservacion() {
    const regexTexto = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    const regexEmail = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const regexTel = /^[0-9]+$/;

    if (!this.nombre.trim() || !this.apellido.trim() || !this.fecha || !this.hora) {
      alert('Por favor, completa los campos requeridos: Fecha, Hora, Nombre y Apellido.');
      return;
    }

    if (!regexTexto.test(this.nombre) || !regexTexto.test(this.apellido)) {
      alert('Tu Nombre y Apellido solo deben contener letras.');
      return;
    }

    const pax = Number(this.personas);
    if (isNaN(pax) || pax < 1 || pax > 50) {
      alert('El número de personas debe ser un valor numérico entre 1 y 50.');
      return;
    }

    if (this.telefono.trim() && (!regexTel.test(this.telefono) || this.telefono.length < 8 || this.telefono.length > 15)) {
      alert('El número de teléfono debe contener únicamente dígitos numéricos (entre 8 y 15 números).');
      return;
    }

    if (this.email.trim() && !regexEmail.test(this.email)) {
      alert('Por favor, ingresa una dirección de correo electrónico válida (ejemplo@correo.com).');
      return;
    }

    this.cargando = true;
    const idMesaAsignada = await this.buscarMesaDisponible(pax);
    const nombreCompleto = `${this.nombre.trim()} ${this.apellido.trim()}`;

    const nuevaReserva = {
      id: Date.now(), 
      idRestaurante: 3, // Llorona Comedor
      fecha: this.fecha,
      hora: this.hora,
      zona: this.zona,
      idMesa: idMesaAsignada.toString(),
      nombre: nombreCompleto,
      personas: pax.toString(),
      telefono: this.telefono.trim() || null,
      email: this.email.trim() || null,
      nota: this.nota.trim() || null,
      estado: 'reservada',
      isNewRecord: true
    };

    try {
      const response = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaReserva)
      });
      const data = await response.json();
      this.cargando = false;

      if (data.success || response.ok) {
        alert(`🎉 ¡Reserva en Llorona Comedor confirmada con éxito!\nTe hemos asignado automáticamente la Mesa ${idMesaAsignada} en la zona ${this.zona.toUpperCase()}.\nConfirmación enviada a: ${this.email || 'tu correo'}`);
        this.limpiarFormulario();
      } else {
        alert(' Error al procesar tu registro. Por favor vuelve a intentarlo.');
      }
    } catch (e) {
      this.cargando = false;
      console.error('Error al enviar la reserva:', e);
      alert(' No se pudo conectar al servidor de reservas. Inténtalo de nuevo más tarde.');
    }
  }

  limpiarFormulario() {
    this.nombre = '';
    this.apellido = '';
    this.personas = 2;
    this.telefono = '';
    this.email = '';
    this.nota = '';
    this.hora = '';
    this.fecha = this.todayDate;
  }
}
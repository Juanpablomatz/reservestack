import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, 
  IonInput, 
  IonSelect, 
  IonSelectOption, 
  IonTextarea, 
  IonButton,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  calendarOutline, 
  timeOutline, 
  peopleOutline, 
  restaurantOutline, 
  personOutline, 
  callOutline, 
  mailOutline, 
  documentTextOutline,
  gridOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-reservar-pietra',
  templateUrl: './reservar-pietra.page.html',
  styleUrls: ['./reservar-pietra.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, 
    FormsModule,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonButton,
    IonIcon
  ]
})
export class ReservarPietraPage implements OnInit {

  // Modelo de datos del formulario del cliente externo
  fecha: string = '';
  hora: string = '';
  zona: string = 'Terraza';
  nombre: string = '';
  apellido: string = ''; 
  personas: number = 2;
  telefono: string = '';
  email: string = '';
  nota: string = '';

  todayDate: string = ''; // Fecha mínima de reserva permitida

  // Zonas predeterminadas oficiales de Pietra Cucina
  zonasDisponibles: string[] = ['Terraza', 'Nivel bajo', 'Nivel medio', 'Pared lloron'];

  // Distribución física de respaldo (Pietra) si la base de datos está en blanco
  restauranteLayout: any = {
    'Terraza': [{id:100,c:4},{id:101,c:4},{id:102,c:4},{id:103,c:4},{id:104,c:4},{id:105,c:4},{id:106,c:4}],
    'Nivel bajo': [{id:90,c:4},{id:91,c:4},{id:92,c:4}],
    'Nivel medio': [{id:80,c:4},{id:81,c:4},{id:82,c:4},{id:83,c:4},{id:84,c:4},{id:85,c:4},{id:86,c:4}],
    'Pared lloron': [{id:70,c:4},{id:71,c:4},{id:72,c:4},{id:73,c:4},{id:74,c:4},{id:75,c:4},{id:76,c:4}]
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
      documentTextOutline,
      gridOutline
    });
  }

  async ngOnInit() {
    this.calcularFechaMinimaLocal();
    await this.cargarDisenoMesas();
  }

  // Calcula la fecha de hoy en formato local del restaurante para bloquear días pasados
  calcularFechaMinimaLocal() {
    const localDate = new Date();
    const offset = localDate.getTimezoneOffset();
    const adjustedDate = new Date(localDate.getTime() - (offset * 60 * 1000));
    this.todayDate = adjustedDate.toISOString().split('T')[0];
    this.fecha = this.todayDate;
  }

  // Intercepta el teclado a nivel de DOM físico para rechazar de inmediato cualquier letra
  limpiarTelefono(event: any) {
    const input = event.target;
    if (input) {
      let value = input.value;
      value = value.replace(/[^0-9]/g, ''); // Deja solo dígitos
      input.value = value;                  // Forza la actualización visual en pantalla
      this.telefono = value;                // Forza la sincronización en memoria
    }
  }

  // Cargar el diseño de las mesas desde MySQL o usar el respaldo local
  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/pietra/diseno`);
      const data = await resp.json();
      
      // Si la base de datos tiene mesas guardadas, las cargamos de forma dinámica
      const tieneMesas = Object.values(data).some((arr: any) => arr && arr.length > 0);
      if (tieneMesas) {
        this.restauranteLayout = data;
        this.zonasDisponibles = Object.keys(data);
      }
    } catch (e) {
      console.warn('⚠️ Usando distribución de mesas de Pietra local de respaldo (API desconectada).');
    }
  }

  // --- ALGORITMO DE AUTO-ASIGNACIÓN DE MESAS ---
  async buscarMesaDisponible(personasRequeridas: number): Promise<number> {
    try {
      // 1. Obtenemos todas las reservas para validar disponibilidad real
      const resp = await fetch(`${this.BASE_URL}/api/pietra/reservas`);
      const todasLasReservas = await resp.json();

      // 2. Filtramos únicamente las reservaciones activas de esta fecha específica
      const ocupadasHoy = todasLasReservas.filter((r: any) => 
        r.fecha === this.fecha && 
        r.estado !== 'finalizada' && 
        r.estado !== 'cancelada' && 
        r.estado !== 'liberada'
      );
      const idsMesasOcupadas = ocupadasHoy.map((r: any) => r.idMesa.toString());

      // 3. Obtenemos las mesas asignadas a esta zona
      const mesasDeZona = this.restauranteLayout[this.zona] || [];

      // A. Buscamos primero la mesa ideal que quepa el número de personas (PAX)
      const mesaIdeal = mesasDeZona.find((m: any) => 
        m.c >= personasRequeridas && 
        !idsMesasOcupadas.includes(m.id.toString())
      );

      if (mesaIdeal) return mesaIdeal.id;

      // B. Si no hay ideal, asignamos cualquier mesa libre en la zona
      const cualquierMesaLibre = mesasDeZona.find((m: any) => 
        !idsMesasOcupadas.includes(m.id.toString())
      );

      if (cualquierMesaLibre) return cualquierMesaLibre.id;

    } catch (error) {
      console.error('Error en el algoritmo de asignación de mesa:', error);
    }

    // C. Si la base de datos está vacía, asignamos la mesa 100 de Pietra de respaldo
    const mesasRespaldo = this.restauranteLayout[this.zona] || [];
    return mesasRespaldo.length > 0 ? mesasRespaldo[0].id : 100;
  }

  // Confirmar reservación y guardar en MySQL
  async confirmarReservacion() {
    const regexTexto = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    const regexEmail = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const regexTel = /^[0-9]+$/; // Expresión estricta: solo dígitos

    // 1. Validaciones requeridas de existencia
    if (!this.nombre.trim() || !this.apellido.trim() || !this.fecha || !this.hora) {
      alert('Por favor, completa los campos requeridos: Fecha, Hora, Nombre y Apellido.');
      return;
    }

    // 2. Validación de formato de texto (Evitar inyecciones SQL o scripts extraños)
    if (!regexTexto.test(this.nombre) || !regexTexto.test(this.apellido)) {
      alert('Tu Nombre y Apellido solo deben contener letras.');
      return;
    }

    // 3. Validación ampliada de comensales (PAX de 1 a 50)
    const pax = Number(this.personas);
    if (isNaN(pax) || pax < 1 || pax > 50) {
      alert('El número de personas debe ser un valor numérico entre 1 y 50.');
      return;
    }

    // 4. Validación opcional de Teléfono estrictamente numérico
    if (this.telefono.trim() && (!regexTel.test(this.telefono) || this.telefono.length < 8 || this.telefono.length > 15)) {
      alert('El número de teléfono debe contener únicamente dígitos numéricos (entre 8 y 15 números).');
      return;
    }

    // 5. Validación opcional de Email (Crucial para Nodemailer)
    if (this.email.trim() && !regexEmail.test(this.email)) {
      alert('Por favor, ingresa una dirección de correo electrónico válida (ejemplo@correo.com).');
      return;
    }

    // 6. Ejecutamos el algoritmo de auto-asignación de mesa
    const idMesaAsignada = await this.buscarMesaDisponible(pax);

    const nombreCompleto = `${this.nombre.trim()} ${this.apellido.trim()}`;

    const nuevaReserva = {
      id: Date.now(), 
      fecha: this.fecha,
      hora: this.hora,
      zona: this.zona,
      idMesa: idMesaAsignada.toString(), // Mesa asignada de forma asíncrona
      nombre: nombreCompleto,
      personas: pax.toString(),
      telefono: this.telefono.trim() || null,
      email: this.email.trim() || null,
      nota: this.nota.trim() || null,
      estado: 'reservada' 
    };

    try {
      const response = await fetch(`${this.BASE_URL}/api/pietra/reservas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nuevaReserva)
      });
      const data = await response.json();

      if (data.success) {
        alert(` ¡Reserva confirmada con éxito!\nTe hemos asignado automáticamente la Mesa ${idMesaAsignada} en la zona ${this.zona.toUpperCase()}.\nConfirmación enviada a: ${this.email || 'tu correo'}`);
        this.limpiarFormulario();
      } else {
        alert(' Error al procesar tu registro. Por favor vuelve a intentarlo.');
      }
    } catch (e) {
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
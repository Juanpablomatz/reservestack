import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
import { 
  IonContent, 
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
  gridOutline,
  logoWhatsapp 
} from 'ionicons/icons';

@Component({
  selector: 'app-reservar-llorona',
  templateUrl: './reservar-llorona.page.html',
  styleUrls: ['./reservar-llorona.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    IonIcon, 
    CommonModule, 
    FormsModule
  ]
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

  // Datos de contacto oficial para grupos grandes
  readonly TEL_RECEPCION: string = '4493937923';
  readonly TEL_MOSTRADO: string = '449 393 79 23';

  // Zona unica oficial de Llorona Comedor
  zonasDisponibles: string[] = ['Piso'];

  // Distribucion fisica de respaldo (Mesas 1 a 10)
  restauranteLayout: any = {
    'Piso': [
      {id:1,c:4},{id:2,c:4},{id:3,c:4},{id:4,c:4},{id:5,c:4},
      {id:6,c:4},{id:7,c:4},{id:8,c:4},{id:9,c:4},{id:10,c:4}
    ]
  };

  readonly BASE_URL = environment.apiUrl;

  constructor() {
    addIcons({
      calendarOutline,
      timeOutline,
      peopleOutline,
      callOutline,
      logoWhatsapp,
      restaurantOutline,
      personOutline,
      mailOutline,
      documentTextOutline,
      gridOutline
    });
  }

  async ngOnInit() {
    this.calcularFechaMinimaLocal();
    await this.cargarDisenoMesas();
  }

  // Generadores dinamicos de enlaces para contacto de grupos
  get enlaceLlamada(): string {
    return `tel:${this.TEL_RECEPCION}`;
  }

  get enlaceWhatsapp(): string {
    const textoMensaje = encodeURIComponent(
      `Hola, deseo solicitar una reservacion para un grupo de ${this.personas} personas en Llorona Comedor.`
    );
    return `https://wa.me/52${this.TEL_RECEPCION}?text=${textoMensaje}`;
  }

  calcularFechaMinimaLocal() {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    this.todayDate = `${year}-${month}-${day}`;
    this.fecha = this.todayDate;
    this.hora = '16:00';
  }

  alCambiarFechaOHora() {
    if (this.fecha < this.todayDate) {
      this.fecha = this.todayDate;
    }
  }

  alCambiarPersonas() {
    if (this.personas < 1) this.personas = 1;
    if (this.personas > 50) this.personas = 50;
  }

  limpiarTelefono(event: any) {
    const input = event.target;
    if (input) {
      let value = input.value || '';
      value = value.replace(/[^0-9]/g, '');
      if (value.length > 10) value = value.substring(0, 10);
      input.value = value;
      this.telefono = value;
    }
  }

  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/diseno`);
      if (resp.ok) {
        const data = await resp.json();
        const tieneMesas = data && typeof data === 'object' && Object.values(data).some((arr: any) => Array.isArray(arr) && arr.length > 0);
        if (tieneMesas) {
          this.restauranteLayout = data;
          this.zonasDisponibles = Object.keys(data);
          if (!this.zonasDisponibles.includes(this.zona) && this.zonasDisponibles.length > 0) {
            this.zona = this.zonasDisponibles[0];
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Usando distribucion de mesas de Llorona Comedor local de respaldo.');
    }

    this.zonasDisponibles = ['Piso'];
    this.zona = 'Piso';
  }

  // Validacion de horarios y dias de servicio
  validarHorarioServicio(fechaStr: string, horaStr: string): { valido: boolean; mensaje: string } {
    if (!fechaStr || !horaStr) {
      return { valido: false, mensaje: 'Por favor selecciona fecha y hora.' };
    }

    const [year, month, day] = fechaStr.split('-').map(Number);
    const fechaObj = new Date(year, month - 1, day);
    const diaSemana = fechaObj.getDay(); // 0: Domingo, 1: Lunes, ..., 6: Sabado

    // 1. Dias cerrados en Llorona Comedor (Lunes y Martes)
    if (diaSemana === 1 || diaSemana === 2) {
      const nomDia = diaSemana === 1 ? 'Lunes' : 'Martes';
      return { valido: false, mensaje: `Llorona Comedor se encuentra cerrado los dias ${nomDia}.` };
    }

    // 2. Horarios oficiales por dia en Llorona Comedor
    let horaApertura = '15:00';
    let horaCierre = '21:00';

    if (diaSemana >= 3 && diaSemana <= 5) { // Miercoles a Viernes (3:00 PM - 9:00 PM)
      horaApertura = '15:00'; 
      horaCierre = '21:00';
    } else if (diaSemana === 6 || diaSemana === 0) { // Sabado y Domingo (2:00 PM - 10:00 PM)
      horaApertura = '14:00'; 
      horaCierre = '22:00';
    }

    if (horaStr < horaApertura || horaStr > horaCierre) {
      const nomDia = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'][diaSemana];
      return { 
        valido: false, 
        mensaje: `Nuestro horario de atencion los dias ${nomDia} en Llorona Comedor es de ${horaApertura} a ${horaCierre} hs. Por favor elige una hora dentro del servicio.` 
      };
    }

    // 3. Bloqueo de horas pasadas para la fecha de HOY
    if (fechaStr === this.todayDate) {
      const ahora = new Date();
      const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
      if (horaStr <= horaActual) {
        return { valido: false, mensaje: 'No puedes reservar para una hora que ya ha pasado hoy. Por favor elige una hora posterior.' };
      }
    }

    return { valido: true, mensaje: '' };
  }

  async buscarMesaDisponible(personasRequeridas: number): Promise<any> {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`);
      let todasLasReservas: any[] = [];
      if (resp.ok) {
        todasLasReservas = await resp.json();
      }

      const [hE, mE] = this.hora.split(':').map(Number);
      const minsElegidos = (hE * 60) + mE;

      // 1. Filtrar reservaciones que choquen en la misma fecha y ventana de 90 minutos
      const ocupadasOEnConflicto = todasLasReservas.filter((r: any) => {
        if (!r.fecha || r.fecha !== this.fecha) return false;
        if (r.estado === 'finalizada' || r.estado === 'cancelada' || r.estado === 'liberada') return false;
        
        // Bloqueo total de la mesa en la fecha
        if (r.estado === 'bloqueada') return true;

        if (r.hora) {
          const [hR, mR] = r.hora.split(':').map(Number);
          const minsR = (hR * 60) + mR;
          return Math.abs(minsElegidos - minsR) < 90;
        }

        return true;
      });

      const idsMesasNoDisponibles = ocupadasOEnConflicto.map((r: any) => r.idMesa ? r.idMesa.toString().trim().toLowerCase() : '');

      const mesasDeZona = this.restauranteLayout[this.zona] || [];

      // 2. Verificar ocupacion considerando mesas simples y fusionadas
      const mesaEstaOcupada = (m: any) => {
        if (!m || m.id === undefined) return true;
        const mIdStr = m.id.toString().trim().toLowerCase();
        const displayStr = m.displayId ? m.displayId.toString().trim().toLowerCase() : '';

        if (idsMesasNoDisponibles.includes(mIdStr) || (displayStr && idsMesasNoDisponibles.includes(displayStr))) {
          return true;
        }

        if (m.isMerged) {
          if (displayStr && displayStr.includes('+')) {
            const subIds = displayStr.split('+').map((s: string) => s.trim().toLowerCase());
            if (subIds.some((s: string) => idsMesasNoDisponibles.includes(s))) return true;
          }
          if (m.originalTables && Array.isArray(m.originalTables)) {
            if (m.originalTables.some((orig: any) => orig.id && idsMesasNoDisponibles.includes(orig.id.toString().toLowerCase()))) {
              return true;
            }
          }
        }
        return false;
      };

      // 3. Obtener todas las mesas libres de la zona elegida
      const mesasLibres = mesasDeZona.filter((m: any) => !mesaEstaOcupada(m));

      if (mesasLibres.length > 0) {
        // Filtrar mesas con capacidad suficiente para el grupo
        const candidatas = mesasLibres.filter((m: any) => Number(m.c) >= personasRequeridas);

        if (candidatas.length > 0) {
          candidatas.sort((a: any, b: any) => {
            const desperdicioA = Number(a.c) - personasRequeridas;
            const desperdicioB = Number(b.c) - personasRequeridas;

            if (desperdicioA !== desperdicioB) {
              return desperdicioA - desperdicioB;
            }

            if (a.isMerged && !b.isMerged) return 1;
            if (!a.isMerged && b.isMerged) return -1;

            return 0;
          });

          return candidatas[0].displayId || candidatas[0].id;
        }

        mesasLibres.sort((a: any, b: any) => Number(b.c) - Number(a.c));
        return mesasLibres[0].displayId || mesasLibres[0].id;
      }

    } catch (error) {
      console.error('Error en el algoritmo de asignacion de mesa en Llorona:', error);
    }

    const mesasRespaldo = this.restauranteLayout[this.zona] || [];
    return mesasRespaldo.length > 0 ? (mesasRespaldo[0].displayId || mesasRespaldo[0].id) : '1';
  }

  async confirmarReservacion() {
    if (this.cargando) return;

    const regexTexto = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    const regexEmail = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const regexTel = /^[0-9]{10}$/;

    if (!this.nombre.trim() || !this.apellido.trim() || !this.fecha || !this.hora) {
      alert('Por favor, completa los campos requeridos: Fecha, Hora, Nombre y Apellido.');
      return;
    }

    const checkHorario = this.validarHorarioServicio(this.fecha, this.hora);
    if (!checkHorario.valido) {
      alert(checkHorario.mensaje);
      return;
    }

    if (!regexTexto.test(this.nombre) || !regexTexto.test(this.apellido)) {
      alert('Tu Nombre y Apellido solo deben contener letras.');
      return;
    }

    const pax = Number(this.personas);
    if (isNaN(pax) || pax < 1) {
      alert('El numero de personas debe ser como minimo 1.');
      return;
    }

    // Bloqueo estricto para grupos de 15 o mas
    if (pax >= 15) {
      alert(`Para reservaciones de 15 personas o mas, por favor comunicate directamente con recepcion al ${this.TEL_MOSTRADO}.`);
      return;
    }

    if (this.telefono.trim() && !regexTel.test(this.telefono.trim())) {
      alert('El numero de telefono debe tener exactamente 10 digitos numericos.');
      return;
    }

    if (this.email.trim() && !regexEmail.test(this.email.trim())) {
      alert('Por favor, ingresa una direccion de correo electronico valida.');
      return;
    }

    this.cargando = true;

    try {
      const idMesaAsignada = await this.buscarMesaDisponible(pax);
      const nombreCompleto = `${this.nombre.trim()} ${this.apellido.trim()}`;

      const nuevaReserva = {
        id: Date.now().toString(), 
        idRestaurante: 3, // Llorona Comedor
        fecha: this.fecha,
        hora: this.hora,
        zona: this.zona || 'Piso',
        idMesa: idMesaAsignada ? idMesaAsignada.toString() : '1',
        nombre: nombreCompleto,
        personas: pax,
        telefono: this.telefono.trim() || null,
        email: this.email.trim() || null,
        nota: this.nota.trim() || null
      };

      const response = await fetch(`${this.BASE_URL}/api/publico/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaReserva)
      });
      const data = await response.json();

      if (data.success || response.ok) {
        alert(`Reserva en Llorona Comedor confirmada con exito.\nTe hemos asignado automaticamente la Mesa ${nuevaReserva.idMesa} en la zona ${this.zona.toUpperCase()}.\nConfirmacion enviada a: ${this.email || 'tu correo registrado'}`);
        this.limpiarFormulario();
      } else {
        alert(data.message || 'Error al procesar tu registro. Por favor vuelve a intentarlo.');
      }
    } catch (e) {
      console.error('Error al enviar la reserva:', e);
      alert('No se pudo conectar al servidor de reservas. Intentalo de nuevo mas tarde.');
    } finally {
      this.cargando = false;
    }
  }

  limpiarFormulario() {
    this.nombre = '';
    this.apellido = '';
    this.personas = 2;
    this.telefono = '';
    this.email = '';
    this.nota = '';
    this.hora = '16:00';
    this.fecha = this.todayDate;
  }
}
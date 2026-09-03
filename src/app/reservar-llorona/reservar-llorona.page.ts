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
  hora: string = '16:00';
  zona: string = 'Piso';
  nombre: string = '';
  apellido: string = ''; 
  personas: number = 2;
  telefono: string = '';
  email: string = '';
  nota: string = '';

  todayDate: string = '';
  cargando: boolean = false;

  // Contacto oficial para eventos y grupos grandes
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
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    this.todayDate = `${year}-${month}-${day}`;
    if (!this.fecha) {
      this.fecha = this.todayDate;
    }
  }

  normalizarHora(horaStr: string): string {
    if (!horaStr) return '16:00';
    const str = horaStr.toString().trim();
    const match12 = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|a\.\s*m\.|p\.\s*m\.)?$/i);
    if (match12 && match12[4]) {
      let h = parseInt(match12[1], 10);
      const m = match12[2];
      const period = match12[4].toLowerCase().replace(/\./g, '').trim();
      if (period === 'pm' && h < 12) h += 12;
      if (period === 'am' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${m}`;
    }
    const parts = str.split(':');
    if (parts.length >= 2) {
      const h = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
      const m = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
      return `${h}:${m}`;
    }
    return '16:00';
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
        const tieneMesas = Object.values(data).some((arr: any) => Array.isArray(arr) && arr.length > 0);
        if (tieneMesas) {
          this.restauranteLayout = data;
          this.zonasDisponibles = Object.keys(data);
          if (!this.zonasDisponibles.includes(this.zona) && this.zonasDisponibles.length > 0) {
            this.zona = this.zonasDisponibles[0];
          }
        }
      }
    } catch (e) {
      console.warn('Usando distribucion de mesas de Llorona Comedor local de respaldo.');
    }

    this.zonasDisponibles = ['Piso'];
    this.zona = 'Piso';
  }

  validarHorarioServicio(fechaStr: string, horaStr: string): { valido: boolean; mensaje: string } {
    if (!fechaStr || !horaStr) {
      return { valido: false, mensaje: 'Por favor selecciona fecha y hora.' };
    }

    const horaNorm = this.normalizarHora(horaStr);
    const [year, month, day] = fechaStr.split('-').map(Number);
    const fechaObj = new Date(year, month - 1, day);
    const diaSemana = fechaObj.getDay(); 

    if (diaSemana === 1 || diaSemana === 2) {
      const nomDia = diaSemana === 1 ? 'Lunes' : 'Martes';
      return { valido: false, mensaje: `Llorona Comedor se encuentra cerrado los dias ${nomDia}.` };
    }

    let horaApertura = '15:00';
    let horaCierre = '21:00';

    if (diaSemana >= 3 && diaSemana <= 5) {
      horaApertura = '15:00'; 
      horaCierre = '21:00';
    } else if (diaSemana === 6 || diaSemana === 0) {
      horaApertura = '14:00'; 
      horaCierre = '22:00';
    }

    if (horaNorm < horaApertura || horaNorm > horaCierre) {
      const nomDia = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'][diaSemana];
      return { 
        valido: false, 
        mensaje: `El horario de atencion los dias ${nomDia} en Llorona Comedor es de ${horaApertura} a ${horaCierre} hs.` 
      };
    }

    if (fechaStr === this.todayDate) {
      const ahora = new Date();
      const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
      if (horaNorm <= horaActual) {
        return { valido: false, mensaje: 'No es posible reservar para una hora anterior a la actual.' };
      }
    }

    return { valido: true, mensaje: '' };
  }

  async buscarMesaDisponible(personasRequeridas: number): Promise<string> {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`);
      const todasLasReservas = await resp.json();

      const horaSolicitada = this.normalizarHora(this.hora);
      const [hS, mS] = horaSolicitada.split(':').map(Number);
      const minsSolicitados = (hS * 60) + mS;

      const reservasEnFecha = Array.isArray(todasLasReservas)
        ? todasLasReservas.filter((r: any) => 
            r.fecha === this.fecha && 
            r.estado !== 'finalizada' && 
            r.estado !== 'cancelada' && 
            r.estado !== 'liberada'
          )
        : [];

      const idsMesasNoDisponibles: string[] = [];

      reservasEnFecha.forEach((r: any) => {
        if (!r.idMesa) return;
        const idMesaStr = r.idMesa.toString().trim().toLowerCase();

        if (r.estado === 'bloqueada') {
          idsMesasNoDisponibles.push(idMesaStr);
          return;
        }

        if (r.hora) {
          const horaRes = this.normalizarHora(r.hora);
          const [hR, mR] = horaRes.split(':').map(Number);
          const minsRes = (hR * 60) + mR;
          
          if (Math.abs(minsSolicitados - minsRes) < 90) {
            idsMesasNoDisponibles.push(idMesaStr);
          }
        } else {
          idsMesasNoDisponibles.push(idMesaStr);
        }
      });

      const mesasDeZona = this.restauranteLayout[this.zona] || [];

      const mesaEstaOcupada = (m: any) => {
        const mIdStr = m.id ? m.id.toString().trim().toLowerCase() : '';
        const mDispStr = m.displayId ? m.displayId.toString().trim().toLowerCase() : '';

        if (idsMesasNoDisponibles.includes(mIdStr) || (mDispStr && idsMesasNoDisponibles.includes(mDispStr))) {
          return true;
        }

        if (m.isMerged) {
          if (mDispStr && mDispStr.includes('+')) {
            const subIds = mDispStr.split('+').map((s: string) => s.trim().toLowerCase());
            if (subIds.some((s: string) => idsMesasNoDisponibles.includes(s))) return true;
          }
          if (m.originalTables && Array.isArray(m.originalTables)) {
            if (m.originalTables.some((orig: any) => idsMesasNoDisponibles.includes((orig.id || '').toString().toLowerCase()))) {
              return true;
            }
          }
        }
        return false;
      };

      const mesasLibres = mesasDeZona.filter((m: any) => !mesaEstaOcupada(m));

      if (mesasLibres.length > 0) {
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

          return candidatas[0].displayId || candidatas[0].id.toString();
        }

        mesasLibres.sort((a: any, b: any) => Number(b.c) - Number(a.c));
        return mesasLibres[0].displayId || mesasLibres[0].id.toString();
      }

    } catch (error) {
      console.error('Error en el algoritmo de asignacion de mesa en Llorona:', error);
    }

    const mesasRespaldo = this.restauranteLayout[this.zona] || [];
    if (mesasRespaldo.length > 0) {
      return mesasRespaldo[0].displayId || mesasRespaldo[0].id.toString();
    }
    return '1';
  }

  async confirmarReservacion() {
    if (this.cargando) return;

    const regexTexto = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    const regexEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const regexTel = /^[0-9]{10}$/;

    if (!this.nombre.trim() || !this.apellido.trim() || !this.fecha || !this.hora) {
      alert('Por favor completa los campos requeridos: Fecha, Hora, Nombre y Apellido.');
      return;
    }

    const horaNormalizada = this.normalizarHora(this.hora);
    const checkHorario = this.validarHorarioServicio(this.fecha, horaNormalizada);
    if (!checkHorario.valido) {
      alert(checkHorario.mensaje);
      return;
    }

    if (!regexTexto.test(this.nombre.trim()) || !regexTexto.test(this.apellido.trim())) {
      alert('El Nombre y Apellido deben contener unicamente letras.');
      return;
    }

    const pax = Number(this.personas);
    if (isNaN(pax) || pax < 1) {
      alert('El numero de personas debe ser como minimo 1.');
      return;
    }

    if (pax >= 15) {
      alert(`Para reservaciones de 15 personas o mas, comunicate directamente con recepcion al ${this.TEL_MOSTRADO} para coordinar el acomodo de mesas.`);
      return;
    }

    if (this.telefono.trim() && !regexTel.test(this.telefono.trim())) {
      alert('El numero de telefono debe contener exactamente 10 digitos numericos.');
      return;
    }

    if (this.email.trim() && !regexEmail.test(this.email.trim())) {
      alert('Por favor ingresa una direccion de correo electronico valida.');
      return;
    }

    this.cargando = true;

    try {
      const idMesaAsignada = await this.buscarMesaDisponible(pax);
      const nombreCompleto = `${this.nombre.trim()} ${this.apellido.trim()}`;

      const payload = {
        idRestaurante: 3,
        fecha: this.fecha,
        hora: horaNormalizada,
        zona: this.zona,
        idMesa: idMesaAsignada,
        nombre: nombreCompleto,
        personas: pax,
        telefono: this.telefono.trim() || null,
        email: this.email.trim() || null,
        nota: this.nota.trim() || null
      };

      const response = await fetch(`${this.BASE_URL}/api/publico/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (response.ok && data.success) {
        alert(`Reserva confirmada con exito en Llorona Comedor.\nMesa asignada: ${idMesaAsignada} (${this.zona.toUpperCase()}).\nSe envio el comprobante al correo: ${this.email || 'No proporcionado'}`);
        this.limpiarFormulario();
      } else {
        alert(data.message || 'Error al procesar tu registro. Por favor vuelve a intentarlo.');
      }
    } catch (e) {
      console.error('Error al enviar la reserva:', e);
      alert('No se pudo conectar con el servidor de reservas.');
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
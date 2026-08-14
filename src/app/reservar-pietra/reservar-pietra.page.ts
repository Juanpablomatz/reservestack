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
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonButton,
    IonIcon,
    CommonModule, 
    FormsModule
  ]
})
export class ReservarPietraPage implements OnInit {

  fecha: string = '';
  hora: string = '';
  zona: string = 'Terraza';
  nombre: string = '';
  apellido: string = ''; 
  personas: number = 2;
  telefono: string = '';
  email: string = '';
  nota: string = '';

  todayDate: string = ''; 
  cargando: boolean = false;

  // Zonas oficiales de Pietra Cucina
  zonasDisponibles: string[] = ['Terraza', 'Nivel bajo', 'Nivel medio', 'Pared lloron'];

  // Distribución de respaldo de Pietra Cucina
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

  calcularFechaMinimaLocal() {
    const localDate = new Date();
    const offset = localDate.getTimezoneOffset();
    const adjustedDate = new Date(localDate.getTime() - (offset * 60 * 1000));
    this.todayDate = adjustedDate.toISOString().split('T')[0];
    this.fecha = this.todayDate;
    this.hora = '15:00';
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
      const resp = await fetch(`${this.BASE_URL}/api/pietra/diseno`);
      const data = await resp.json();
      
      const tieneMesas = Object.values(data).some((arr: any) => arr && arr.length > 0);
      if (tieneMesas) {
        this.restauranteLayout = data;
        this.zonasDisponibles = Object.keys(data);
        if (!this.zonasDisponibles.includes(this.zona) && this.zonasDisponibles.length > 0) {
          this.zona = this.zonasDisponibles[0];
        }
      }
    } catch (e) {
      console.warn('⚠️ Usando distribución de mesas de Pietra Cucina de respaldo.');
    }
  }

  validarHorarioServicio(fechaStr: string, horaStr: string): { valido: boolean; mensaje: string } {
    if (!fechaStr || !horaStr) {
      return { valido: false, mensaje: 'Por favor selecciona fecha y hora.' };
    }

    const [year, month, day] = fechaStr.split('-').map(Number);
    const fechaObj = new Date(year, month - 1, day);
    const diaSemana = fechaObj.getDay(); 

    let horaApertura = '13:00';
    let horaCierre = '23:00';

    if (horaStr < horaApertura || horaStr > horaCierre) {
      const nomDia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][diaSemana];
      return { 
        valido: false, 
        mensaje: `Nuestro horario de atención los ${nomDia}s en Pietra Cucina es de ${horaApertura} a ${horaCierre} hs.` 
      };
    }

    if (fechaStr === this.todayDate) {
      const ahora = new Date();
      const horaActual = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
      if (horaStr <= horaActual) {
        return { valido: false, mensaje: 'No puedes reservar para una hora que ya ha pasado hoy. Por favor elige una hora posterior.' };
      }
    }

    return { valido: true, mensaje: '' };
  }

  async buscarMesaDisponible(personasRequeridas: number): Promise<number> {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/pietra/reservas`);
      const todasLasReservas = await resp.json();

      const ocupadasHoy = todasLasReservas.filter((r: any) => 
        r.fecha === this.fecha && 
        r.estado !== 'finalizada' && 
        r.estado !== 'cancelada' && 
        r.estado !== 'liberada'
      );
      const idsMesasOcupadas = ocupadasHoy.map((r: any) => r.idMesa.toString());

      const mesasDeZona = this.restauranteLayout[this.zona] || [];

      const mesaEstaOcupada = (m: any) => {
        const mIdStr = m.id.toString();
        if (idsMesasOcupadas.includes(mIdStr)) return true;
        if (m.displayId && idsMesasOcupadas.includes(m.displayId.toString())) return true;
        if (m.isMerged) {
          if (m.displayId) {
            const subIds = m.displayId.split('+').map((s: string) => s.trim());
            if (subIds.some((s: string) => idsMesasOcupadas.includes(s))) return true;
          }
          if (m.originalTables && Array.isArray(m.originalTables)) {
            if (m.originalTables.some((orig: any) => idsMesasOcupadas.includes(orig.id.toString()))) return true;
          }
        }
        return false;
      };

      const mesaIdeal = mesasDeZona.find((m: any) => 
        m.c >= personasRequeridas && !mesaEstaOcupada(m)
      );

      if (mesaIdeal) return mesaIdeal.id;

      const cualquierMesaLibre = mesasDeZona.find((m: any) => !mesaEstaOcupada(m));
      if (cualquierMesaLibre) return cualquierMesaLibre.id;

    } catch (error) {
      console.error('Error al buscar mesa en Pietra Cucina:', error);
    }

    const mesasRespaldo = this.restauranteLayout[this.zona] || [];
    return mesasRespaldo.length > 0 ? mesasRespaldo[0].id : 100;
  }

  async confirmarReservacion() {
    const regexTexto = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    const regexEmail = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    const regexTel = /^[0-9]+$/;

    if (!this.nombre.trim() || !this.apellido.trim() || !this.fecha || !this.hora) {
      alert('Por favor, completa los campos requeridos: Fecha, Hora, Nombre y Apellido.');
      return;
    }

    const checkHorario = this.validarHorarioServicio(this.fecha, this.hora);
    if (!checkHorario.valido) {
      alert(`⚠️ ${checkHorario.mensaje}`);
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
      alert('El número de teléfono debe contener únicamente dígitos numéricos.');
      return;
    }

    if (this.email.trim() && !regexEmail.test(this.email)) {
      alert('Por favor, ingresa un correo electrónico válido.');
      return;
    }

    this.cargando = true;
    const idMesaAsignada = await this.buscarMesaDisponible(pax);
    const nombreCompleto = `${this.nombre.trim()} ${this.apellido.trim()}`;

    const nuevaReserva = {
      id: Date.now(), 
      idRestaurante: 1, // Pietra Cucina
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
      isNewRecord: true,
      tipoCorreo: 'crear'
    };

    try {
      const response = await fetch(`${this.BASE_URL}/api/pietra/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaReserva)
      });
      const data = await response.json();
      this.cargando = false;

      if (data.success || response.ok) {
        alert(`¡Reserva confirmada con éxito en Pietra Cucina!\nTe hemos asignado la Mesa ${idMesaAsignada} en la zona ${this.zona.toUpperCase()}.\nConfirmación enviada a: ${this.email || 'tu correo'}`);
        this.limpiarFormulario();
      } else {
        alert('Error al procesar tu registro. Por favor vuelve a intentarlo.');
      }
    } catch (e) {
      this.cargando = false;
      console.error('Error al enviar la reserva:', e);
      alert('No se pudo conectar al servidor de reservas.');
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
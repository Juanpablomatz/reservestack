import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

declare var io: any;

@Component({
  selector: 'app-llorona',
  templateUrl: './llorona.page.html',
  styleUrls: ['./llorona.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LloronaPage implements AfterViewInit, OnDestroy {

  // PLANO MAESTRO FÍSICO DE LLORONA COMEDOR (1 SOLA ZONA "PISO" CON SUS 10 MESAS)
  readonly PLANO_DEFECTO: any = {
    'Piso': [
      {id:1,c:4,x:10,y:10},{id:2,c:4,x:35,y:10},{id:3,c:4,x:60,y:10},{id:4,c:4,x:85,y:10},
      {id:5,c:4,x:10,y:40},{id:6,c:4,x:35,y:40},{id:7,c:4,x:60,y:40},{id:8,c:4,x:85,y:40},
      {id:9,c:4,x:25,y:70},{id:10,c:4,x:60,y:70}
    ]
  };

  disenoMaestro: any = null;
  restaurante: any = {};

  todasLasReservas: any[] = [];
  fechaSeleccionada: string = new Date().toISOString().split('T')[0];
  zonaActiva: string = 'Piso'; 
  socket: any;

  readonly BASE_URL = 'http://localhost:3000';

  constructor() {
    this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
  }

  cargarLayoutPorFecha(fecha: string) {
    const keyFecha = `llorona_layout_${fecha}`;
    const layoutGuardado = localStorage.getItem(keyFecha);

    if (layoutGuardado) {
      try {
        this.restaurante = JSON.parse(layoutGuardado);
      } catch(e) {
        this.restaurante = JSON.parse(JSON.stringify(this.disenoMaestro || this.PLANO_DEFECTO));
      }
    } else {
      this.restaurante = JSON.parse(JSON.stringify(this.disenoMaestro || this.PLANO_DEFECTO));
    }
  }

  guardarLayoutFechaActual() {
    const keyFecha = `llorona_layout_${this.fechaSeleccionada}`;
    localStorage.setItem(keyFecha, JSON.stringify(this.restaurante));
  }

  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/diseno`);
      const data = await resp.json();
      const tieneMesas = Object.values(data).some((arr: any) => arr && arr.length > 0);
      if (tieneMesas) this.disenoMaestro = data;
    } catch (e) {
      this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    }
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
    this.dibujarMesas(this.zonaActiva);
  }

  ngAfterViewInit() {
    setTimeout(() => { this.inicializarSistema(); }, 150);
  }

  ngOnDestroy() {
    if (this.socket) this.socket.disconnect();
  }

  async inicializarSistema() {
    this.configurarFiltros();
    try {
      this.socket = io(this.BASE_URL);
      this.socket.emit('join_restaurante', 3);
      this.socket.on('actualizar_reservas', (r: any[]) => { 
        this.todasLasReservas = r; 
        this.actualizarVistaCompleta(); 
      });
    } catch(e) {}

    await this.cargarDisenoMesas();
    this.cargarReservaciones();
  }

  configurarFiltros() {
    const inputFecha = document.getElementById('filtro-fecha-global') as HTMLInputElement;
    if(inputFecha) {
      inputFecha.value = this.fechaSeleccionada;
      inputFecha.addEventListener('change', (e: any) => {
        this.fechaSeleccionada = e.target.value;
        this.cargarLayoutPorFecha(this.fechaSeleccionada);
        this.dibujarMesas('Piso');
      });
    }
  }

  async cargarReservaciones() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`);
      const data = await resp.json();
      this.todasLasReservas = data;
      this.actualizarVistaCompleta();
    } catch(e) { this.actualizarVistaCompleta(); }
  }

  actualizarVistaCompleta() {
    const reservasDelDia = this.todasLasReservas.filter(r => !r.fecha || r.fecha === this.fechaSeleccionada);
    this.actualizarEstadoMesas(reservasDelDia);
    this.dibujarListaDeReservas(reservasDelDia);
  }

  dibujarMesas(zona: string) {
    const plano = document.getElementById('plano-restaurante');
    if(!plano) return;
    plano.innerHTML = '';
    const mesas = this.restaurante['Piso'] || [];

    mesas.forEach((mesa: any) => {
      const divMesa = document.createElement('div');
      let claseDoble = mesa.isMerged ? (mesa.isVertical ? 'doble-alto' : 'doble-ancho') : '';
      
      divMesa.className = `mesa ${claseDoble}`;
      divMesa.id = `mesa-${mesa.id}`;
      divMesa.style.left = `${mesa.x || 10}%`;
      divMesa.style.top = `${mesa.y || 10}%`;

      const textoNumero = mesa.isMerged ? mesa.displayId : mesa.id;
      divMesa.innerHTML = `<span class="mesa-numero">${textoNumero}</span><span class="mesa-capacidad">(${mesa.c}p)</span>`;
      plano.appendChild(divMesa);
    });

    this.actualizarVistaCompleta();
  }

  actualizarEstadoMesas(reservas: any[]) {
    document.querySelectorAll('.mesa').forEach((m) => {
      const mesaEl = m as HTMLElement;
      mesaEl.className = 'mesa libre';
    });

    reservas.forEach(res => {
      if (res.idMesa && res.estado !== 'finalizada' && res.estado !== 'cancelada' && res.estado !== 'liberada') {
        const elemento = document.getElementById(`mesa-${res.idMesa}`) as HTMLElement;
        if (elemento) {
          elemento.className = `mesa ${res.estado}`;
          let nombreCorto = res.nombre ? res.nombre.split(' ')[0].substring(0, 8) : 'Cliente';
          elemento.innerHTML = `<span class="res-nombre">${nombreCorto}</span><span class="res-pax">${res.personas}p</span>`;
        }
      }
    });
  }

  dibujarListaDeReservas(reservas: any[]) {
    const lista = document.getElementById('lista-reservas-sidebar');
    if(!lista) return;
    lista.innerHTML = '';
    const activas = reservas.filter(x => x.estado !== 'finalizada' && x.estado !== 'cancelada' && x.estado !== 'liberada');

    if (activas.length === 0) {
      lista.innerHTML = '<p style="color:#7f8c8d; padding:20px; text-align:center;">No hay reservas hoy en Llorona Comedor.</p>';
      return;
    }

    activas.forEach(res => {
      const item = document.createElement('div');
      item.className = 'reserva-item-sidebar';
      item.innerHTML = `<strong>${res.nombre}</strong> - ${res.personas}p • Mesa ${res.idMesa}`;
      lista.appendChild(item);
    });
  }
}
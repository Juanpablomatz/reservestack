import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

declare var io: any;
declare var Chart: any;

@Component({
  selector: 'app-rosa',
  templateUrl: './rosa.page.html',
  styleUrls: ['./rosa.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class RosaPage implements AfterViewInit, OnDestroy {

  // PLANO MAESTRO FÍSICO DE ROSA MEXICANO (4 ZONAS)
  readonly PLANO_DEFECTO: any = {
    'Terraza': [{id:1,c:4},{id:2,c:4},{id:3,c:4},{id:4,c:4}],
    'Piso': [{id:10,c:4},{id:11,c:4},{id:12,c:4},{id:13,c:4},{id:14,c:4}],
    'Jardín': [{id:20,c:4},{id:21,c:4},{id:22,c:4},{id:23,c:4}],
    'Cava': [{id:30,c:4},{id:31,c:4},{id:32,c:4}]
  };

  disenoMaestro: any = null;
  restaurante: any = {};

  todasLasReservas: any[] = [];
  fechaSeleccionada: string = new Date().toISOString().split('T')[0];
  zonaActiva: string = 'Terraza'; 
  
  modoMover: boolean = false;
  reservaAMoverId: any = null;
  idReservaAEditar: any = null; 
  socket: any;

  mesaSeleccionadaTemp: { id: number, zona: string } | null = null;
  chartInstance: any = null;
  tipoGrafica: string = 'pie';

  // --- VARIABLES DEL EDITOR ---
  modoEdicion: boolean = false;
  modoCombinar: boolean = false;
  mesaACombinar: any = null;
  mesaSeleccionadaEdicion: any = null; 
  respaldoRestaurante: string = '';

  readonly BASE_URL = 'http://localhost:3000';

  constructor() {
    this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
  }

  cargarLayoutPorFecha(fecha: string) {
    const keyFecha = `rosa_layout_${fecha}`;
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
    this.asegurarCoordenadasGrid();
  }

  guardarLayoutFechaActual() {
    const keyFecha = `rosa_layout_${this.fechaSeleccionada}`;
    localStorage.setItem(keyFecha, JSON.stringify(this.restaurante));
  }

  async guardarReservaEnServidor(reserva: any) {
    try {
      reserva.idRestaurante = 2; // ID 2 = Rosa Mexicano
      const response = await fetch(`${this.BASE_URL}/api/restaurantes/2/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reserva)
      });
      const data = await response.json();
      console.log('Rosa Mexicano - Sincronizado:', data.message);
    } catch (e) {
      console.error('❌ Error de conexión Rosa Mexicano MySQL:', e);
    }
  }

  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/2/diseno`);
      const data = await resp.json();
      const tieneMesas = Object.values(data).some((arr: any) => arr && arr.length > 0);
      if (tieneMesas) {
        this.disenoMaestro = data;
      }
    } catch (e) {
      this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    }
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
    this.dibujarMesas(this.zonaActiva);
  }

  async guardarDisenoEnServidor() {
    try {
      await fetch(`${this.BASE_URL}/api/restaurantes/2/diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.restaurante)
      });
      this.guardarLayoutFechaActual();
    } catch (e) {
      console.error('❌ Error al guardar diseño Rosa Mexicano:', e);
    }
  }

  ngAfterViewInit() {
    setTimeout(() => { this.inicializarSistema(); }, 150);
  }

  ngOnDestroy() {
    if (this.socket) this.socket.disconnect();
  }

  asegurarCoordenadasGrid() {
    for (const zona in this.restaurante) {
      this.restaurante[zona].forEach((mesa: any, index: number) => {
        if (mesa.x === undefined || mesa.y === undefined) {
          const cols = 4;
          const row = Math.floor(index / cols);
          const col = index % cols;
          mesa.x = 8 + (col * 24);  
          mesa.y = 10 + (row * 22); 
        }
      });
    }
  }

  async inicializarSistema() {
    this.configurarNavegacionSidebar();
    this.configurarFiltros();
    this.configurarBotonesZonas();
    this.configurarMenuContextual();
    this.configurarModales(); 
    this.configurarFormularioReserva();
    this.configurarOpcionesEditor();
    
    document.getElementById('btn-toggle-chart')?.addEventListener('click', () => {
      this.tipoGrafica = this.tipoGrafica === 'pie' ? 'bar' : 'pie';
      this.actualizarVistaCompleta();
    });

    try {
      this.socket = io(this.BASE_URL);
      this.socket.emit('join_restaurante', 2);
      this.socket.on('actualizar_reservas', (r: any[]) => { 
        this.todasLasReservas = r; 
        this.actualizarVistaCompleta(); 
      });
    } catch(e) {}

    await this.cargarDisenoMesas();
    this.cargarReservaciones();
  }

  configurarNavegacionSidebar() {
    const links = document.querySelectorAll('.nav-link');
    const vistas = document.querySelectorAll('.vista');
    links.forEach(link => {
      link.addEventListener('click', (e: any) => {
        e.preventDefault();
        links.forEach(l => l.classList.remove('active'));
        vistas.forEach(v => v.classList.add('oculto'));
        e.currentTarget.classList.add('active');
        const vistaId = `vista-${e.currentTarget.dataset.vista}`;
        const vistaObj = document.getElementById(vistaId);
        if (vistaObj) vistaObj.classList.remove('oculto');
      });
    });
  }

  configurarFiltros() {
    const inputFecha = document.getElementById('filtro-fecha-global') as HTMLInputElement;
    if(inputFecha) {
      inputFecha.value = this.fechaSeleccionada;
      inputFecha.addEventListener('change', (e: any) => {
        this.fechaSeleccionada = e.target.value;
        this.cargarLayoutPorFecha(this.fechaSeleccionada);
        this.actualizarVistaCompleta();
      });
    }

    const btnPrev = document.getElementById('btn-prev-day');
    const btnNext = document.getElementById('btn-next-day');
    
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        const current = new Date(this.fechaSeleccionada + 'T12:00:00');
        current.setDate(current.getDate() - 1);
        this.fechaSeleccionada = current.toISOString().split('T')[0];
        if(inputFecha) inputFecha.value = this.fechaSeleccionada;
        this.cargarLayoutPorFecha(this.fechaSeleccionada);
        this.actualizarVistaCompleta();
      });
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        const current = new Date(this.fechaSeleccionada + 'T12:00:00');
        current.setDate(current.getDate() + 1);
        this.fechaSeleccionada = current.toISOString().split('T')[0];
        if(inputFecha) inputFecha.value = this.fechaSeleccionada;
        this.cargarLayoutPorFecha(this.fechaSeleccionada);
        this.actualizarVistaCompleta();
      });
    }

    document.getElementById('btn-editar-plano')?.addEventListener('click', () => {
      this.activarModoEdicion();
    });
  }

  configurarBotonesZonas() {
    const botones = document.querySelectorAll('.zona-btn');
    botones.forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        botones.forEach(b => b.classList.remove('active'));
        const elementBtn = e.target as HTMLElement;
        elementBtn.classList.add('active');
        this.zonaActiva = elementBtn.dataset['zona'] || 'Terraza';
        this.dibujarMesas(this.zonaActiva);
      });
    });
  }

  configurarOpcionesEditor() {
    document.getElementById('btn-add-mesa')?.addEventListener('click', () => {
      const numMesa = prompt('Número de la nueva mesa en Rosa Mexicano:');
      if (!numMesa) return;
      const numId = parseInt(numMesa, 10);
      if (isNaN(numId)) return;

      this.restaurante[this.zonaActiva].push({ id: numId, c: 4, x: 45, y: 40 });
      this.guardarLayoutFechaActual();
      this.dibujarMesas(this.zonaActiva);
    });

    document.getElementById('btn-combinar-mesas')?.addEventListener('click', () => {
      this.modoCombinar = !this.modoCombinar;
      this.mesaACombinar = null;
      const aviso = document.getElementById('aviso-combinar');
      if (this.modoCombinar) aviso?.classList.remove('oculto'); else aviso?.classList.add('oculto');
      this.dibujarMesas(this.zonaActiva);
    });

    document.getElementById('btn-save-diseno')?.addEventListener('click', async () => {
      await this.guardarDisenoEnServidor(); 
      this.modoEdicion = false;
      this.modoCombinar = false;
      document.getElementById('toolbar-editor')?.classList.add('oculto');
      document.getElementById('aviso-combinar')?.classList.add('oculto');
      this.actualizarVistaCompleta();
    });

    document.getElementById('btn-cancel-edicion')?.addEventListener('click', () => {
      this.cargarLayoutPorFecha(this.fechaSeleccionada);
      this.modoEdicion = false;
      this.modoCombinar = false;
      document.getElementById('toolbar-editor')?.classList.add('oculto');
      document.getElementById('aviso-combinar')?.classList.add('oculto');
      this.actualizarVistaCompleta();
    });
  }

  activarModoEdicion() {
    this.modoEdicion = true;
    this.respaldoRestaurante = JSON.stringify(this.restaurante); 
    document.getElementById('toolbar-editor')?.classList.remove('oculto');
    this.dibujarMesas(this.zonaActiva);
  }

  async cargarReservaciones() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/2/reservas`);
      const data = await resp.json();
      this.todasLasReservas = data;
      this.actualizarVistaCompleta();
    } catch(e) { this.actualizarVistaCompleta(); }
  }

  actualizarVistaCompleta() {
    const reservasDelDia = this.todasLasReservas.filter(r => !r.fecha || r.fecha === this.fechaSeleccionada);
    this.actualizarEstadoMesas(reservasDelDia);
    this.dibujarListaDeReservas(reservasDelDia);
    this.actualizarEstadisticas(reservasDelDia);
    this.actualizarAnalitica(reservasDelDia);
  }

  dibujarMesas(zona: string) {
    const plano = document.getElementById('plano-restaurante');
    if(!plano) return;
    plano.innerHTML = '';
    const mesas = this.restaurante[zona] || [];

    mesas.forEach((mesa: any) => {
      const divMesa = document.createElement('div');
      let claseDoble = mesa.isMerged ? (mesa.isVertical ? 'doble-alto' : 'doble-ancho') : '';
      
      divMesa.className = `mesa ${claseDoble} ${this.modoMover ? 'seleccionable' : ''}`;
      divMesa.id = `mesa-${mesa.id}`;
      divMesa.style.left = `${mesa.x || 10}%`;
      divMesa.style.top = `${mesa.y || 10}%`;

      const textoNumero = mesa.isMerged ? mesa.displayId : mesa.id;
      divMesa.innerHTML = `<span class="mesa-numero">${textoNumero}</span><span class="mesa-capacidad">(${mesa.c}p)</span>`;
      divMesa.addEventListener('click', (e) => this.gestionarClickMesa(e, mesa, zona));
      plano.appendChild(divMesa);
    });

    if (!this.modoEdicion) {
      this.actualizarVistaCompleta();
    }
  }

  fusionarMesas(mesaA: any, mesaB: any) {
    const zona = this.zonaActiva;
    const nuevoId = mesaA.id * 1000 + mesaB.id; 
    const esVertical = Math.abs(mesaA.y - mesaB.y) > Math.abs(mesaA.x - mesaB.x);

    const mesaFusionada = {
      id: nuevoId,
      c: mesaA.c + mesaB.c, 
      x: Math.round((mesaA.x + mesaB.x) / 2), 
      y: Math.round((mesaA.y + mesaB.y) / 2),
      isMerged: true,
      isVertical: esVertical, 
      displayId: `${mesaA.id}+${mesaB.id}`, 
      originalTables: [JSON.parse(JSON.stringify(mesaA)), JSON.parse(JSON.stringify(mesaB))]
    };

    this.restaurante[zona] = this.restaurante[zona].filter((m: any) => m.id !== mesaA.id && m.id !== mesaB.id);
    this.restaurante[zona].push(mesaFusionada);
    this.guardarLayoutFechaActual();
    alert(`Mesas fusionadas con éxito para Rosa Mexicano el día ${this.fechaSeleccionada}.`);
    this.dibujarMesas(zona);
  }

  actualizarEstadoMesas(reservas: any[]) {
    if (this.modoEdicion) return;

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
      lista.innerHTML = '<p style="color:#7f8c8d; padding:20px; text-align:center;">No hay reservas hoy en Rosa Mexicano.</p>';
      return;
    }

    activas.forEach(res => {
      const item = document.createElement('div');
      item.className = 'reserva-item-sidebar';
      item.innerHTML = `<strong>${res.nombre}</strong> - ${res.personas}p • Mesa ${res.idMesa}`;
      lista.appendChild(item);
    });
  }

  actualizarEstadisticas(reservasDelDia: any[]) {
    const ocupadas = reservasDelDia.filter(r => r.estado === 'ocupada').length;
    const reservadas = reservasDelDia.filter(r => r.estado === 'reservada').length;
    const act = (id: string, val: string | number) => { const el = document.getElementById(id); if(el) el.textContent = val.toString(); };
    act('stats-ocupadas', ocupadas); 
    act('stats-reservadas', reservadas); 
  }

  gestionarClickMesa(evento: any, mesa: any, zona: string) {
    if (this.modoCombinar) {
      if (this.mesaACombinar === null) {
        this.mesaACombinar = mesa;
        alert(`Mesa A seleccionada: Mesa ${mesa.id}. Selecciona la Mesa B.`);
      } else {
        this.fusionarMesas(this.mesaACombinar, mesa);
        this.mesaACombinar = null;
        this.modoCombinar = false;
        document.getElementById('aviso-combinar')?.classList.add('oculto');
      }
    }
  }

  configurarMenuContextual() {}
  configurarModales() {}
  configurarFormularioReserva() {}
  actualizarAnalitica(reservas: any[]) {}
}
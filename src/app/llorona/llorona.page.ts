import { Component, AfterViewInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

Chart.register(...registerables);

declare var io: any;

@Component({
  selector: 'app-llorona',
  templateUrl: './llorona.page.html',
  styleUrls: ['./llorona.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class LloronaPage implements AfterViewInit, OnDestroy {

  // PLANO MAESTRO FISICO DE LLORONA COMEDOR (ZONA UNICA: Piso, MESAS 1 A 10)
  readonly PLANO_DEFECTO: any = {
    'Piso': [
      {id:1,c:4},{id:2,c:4},{id:3,c:4},{id:4,c:4},{id:5,c:4},
      {id:6,c:4},{id:7,c:4},{id:8,c:4},{id:9,c:4},{id:10,c:4}
    ]
  };

  disenoMaestro: any = null;
  restaurante: any = {};

  todasLasReservas: any[] = [];
  fechaSeleccionada: string = this.obtenerFechaActualLocal();
  zonaActiva: string = 'Piso'; 
  turnoSeleccionado: string = 'todo'; 
  
  modoMover: boolean = false;
  reservaAMoverId: any = null;
  idReservaAEditar: any = null; 
  socket: any = null;

  mesaSeleccionadaTemp: { id: number, zona: string } | null = null;
  
  // INSTANCIAS DE GRAFICAS CHART.JS
  chartInstanceZonas: any = null;
  chartInstanceHorarios: any = null;
  chartInstanceOrigen: any = null;
  tipoGraficaZonas: string = 'pie';

  // CONTROL DEL EDITOR DE PLANO
  modoEdicion: boolean = false;
  modoCombinar: boolean = false;
  mesaACombinar: any = null;
  mesaSeleccionadaEdicion: any = null; 
  respaldoRestaurante: string = '';
  resolverTipoFusion: ((esPermanente: boolean | null) => void) | null = null;

  // CONTROL DE RENDERIZADO Y REINTENTOS
  private reintentosDibujo: number = 0;
  private maxReintentos: number = 10;
  private sistemaInicializado: boolean = false;

  readonly BASE_URL = environment.apiUrl;

  constructor(
    private authService: AuthService, 
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.authService.guardarUltimaRuta('/llorona');
    this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
    this.cargarReservasDesdeCache();
  }

  irAlPanel() {
    this.router.navigate(['/panel']);
  }

  cerrarSesion() {
    this.authService.logout();
  }

  obtenerFechaActualLocal(): string {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  tieneMesasValidas(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;
    return Object.values(obj).some((arr: any) => Array.isArray(arr) && arr.length > 0);
  }

  limpiarTexto(txt: string): string {
    return (txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  obtenerMesasDeZona(nombreZona: string): any[] {
    if (!this.restaurante || typeof this.restaurante !== 'object') return [];
    if (this.restaurante[nombreZona]) return this.restaurante[nombreZona];
    
    const keyLimpia = this.limpiarTexto(nombreZona);
    for (const z of Object.keys(this.restaurante)) {
      if (this.limpiarTexto(z) === keyLimpia) {
        return this.restaurante[z] || [];
      }
    }
    return [];
  }

  cargarReservasDesdeCache() {
    const cache = localStorage.getItem('llorona_reservas_cache');
    if (cache) {
      try {
        const parsed = JSON.parse(cache);
        if (Array.isArray(parsed)) {
          this.todasLasReservas = parsed;
        }
      } catch (e) {}
    }
  }

  guardarReservasEnCache() {
    if (Array.isArray(this.todasLasReservas)) {
      localStorage.setItem('llorona_reservas_cache', JSON.stringify(this.todasLasReservas));
    }
  }

  ngAfterViewInit() {
    this.ejecutarMontajeVista();
  }

  ionViewWillEnter() {
    this.authService.guardarUltimaRuta('/llorona');
    this.cargarReservasDesdeCache();
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
    this.ejecutarMontajeVista();
  }

  ionViewDidEnter() {
    this.ejecutarMontajeVista();
  }

  ejecutarMontajeVista() {
    this.reintentosDibujo = 0;

    const inputFecha = document.getElementById('filtro-fecha-global') as HTMLInputElement;
    if (inputFecha) {
      inputFecha.value = this.fechaSeleccionada;
    }

    this.cargarLayoutPorFecha(this.fechaSeleccionada);
    this.dibujarMesas(this.zonaActiva);
    this.actualizarVistaCompleta();

    if (!this.sistemaInicializado) {
      this.inicializarSistema();
    } else {
      this.cargarDisenoMesas();
      this.cargarReservaciones();
    }

    this.cdr.detectChanges();
  }

  cargarLayoutPorFecha(fecha: string) {
    const keyFecha = `llorona_layout_${fecha}`;
    const layoutGuardado = localStorage.getItem(keyFecha);

    if (layoutGuardado) {
      try {
        const parsed = JSON.parse(layoutGuardado);
        if (this.tieneMesasValidas(parsed)) {
          this.restaurante = parsed;
          this.asegurarCoordenadasGrid();
          return;
        }
      } catch (e) {}
    }

    if (this.tieneMesasValidas(this.disenoMaestro)) {
      this.restaurante = JSON.parse(JSON.stringify(this.disenoMaestro));
      this.asegurarCoordenadasGrid();
      return;
    }

    this.restaurante = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    this.asegurarCoordenadasGrid();
  }

  guardarLayoutFechaActual() {
    if (this.tieneMesasValidas(this.restaurante)) {
      const keyFecha = `llorona_layout_${this.fechaSeleccionada}`;
      localStorage.setItem(keyFecha, JSON.stringify(this.restaurante));
    }
  }

  async guardarDisenoPermanente() {
    const layoutPermanente = JSON.parse(JSON.stringify(this.restaurante));
    this.disenoMaestro = JSON.parse(JSON.stringify(layoutPermanente));
    this.guardarLayoutFechaActual();

    const response = await fetch(`${this.BASE_URL}/api/restaurantes/3/diseno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layoutPermanente)
    });
    if (!response.ok) throw new Error('No se pudo guardar el diseno permanente en el servidor');
  }

  async guardarReservaEnServidor(reserva: any, tipoCorreo?: string) {
    try {
      const payload = { ...reserva, idRestaurante: 3 };
      if (tipoCorreo) {
        payload.tipoCorreo = tipoCorreo;
      }
      
      const response = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'El servidor no pudo guardar la reserva');
      }

      delete reserva.isNewRecord;
      delete reserva.tipoCorreo;
      this.guardarReservasEnCache();
      console.log('Llorona Comedor - Sincronizado:', data.message);
    } catch (e) {
      alert(`No se guardo la operacion en Llorona Comedor. ${e instanceof Error ? e.message : 'Revisa la conexion con el servidor.'}`);
      console.error('Error de conexion a MySQL Llorona Comedor:', e);
    }
  }

  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/diseno`);
      if (resp.ok) {
        const data = await resp.json();
        if (this.tieneMesasValidas(data)) {
          this.disenoMaestro = data;
          this.cargarLayoutPorFecha(this.fechaSeleccionada);

          const zonas = Object.keys(data);
          if (zonas.length > 0) {
            const existeActiva = zonas.some(z => this.limpiarTexto(z) === this.limpiarTexto(this.zonaActiva));
            if (!existeActiva) {
              this.zonaActiva = zonas[0];
            }
          }

          this.dibujarMesas(this.zonaActiva);
          this.actualizarVistaCompleta();
          return;
        }
      }
    } catch (e) {
      console.warn('Usando distribucion de mesas de Llorona Comedor local de respaldo.');
    }
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
    this.dibujarMesas(this.zonaActiva);
    this.actualizarVistaCompleta();
  }

  async guardarDisenoEnServidor() {
    try {
      await this.guardarDisenoPermanente();
      console.log('Nuevo diseno guardado en la nube para Llorona Comedor');
      alert('Nueva distribucion de mesas guardada y sincronizada con exito.');
    } catch (e) {
      console.error('Error al guardar diseno permanente Llorona Comedor:', e);
      this.disenoMaestro = JSON.parse(JSON.stringify(this.restaurante));
      this.guardarLayoutFechaActual();
      alert('No se pudo sincronizar el diseno con el servidor. Se mantuvo la copia local.');
    }
  }

  ngOnDestroy() {
    if (this.socket) this.socket.disconnect();
    this.destruirGraficas();
  }

  destruirGraficas() {
    try {
      const c1 = document.getElementById('grafica-zonas') as HTMLCanvasElement;
      if (c1) Chart.getChart(c1)?.destroy();
      if (this.chartInstanceZonas) { this.chartInstanceZonas.destroy(); this.chartInstanceZonas = null; }

      const c2 = document.getElementById('grafica-horarios') as HTMLCanvasElement;
      if (c2) Chart.getChart(c2)?.destroy();
      if (this.chartInstanceHorarios) { this.chartInstanceHorarios.destroy(); this.chartInstanceHorarios = null; }

      const c3 = document.getElementById('grafica-origen') as HTMLCanvasElement;
      if (c3) Chart.getChart(c3)?.destroy();
      if (this.chartInstanceOrigen) { this.chartInstanceOrigen.destroy(); this.chartInstanceOrigen = null; }
    } catch (e) {}
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
    this.configurarBotonesTurnos();
    this.configurarMenuContextual();
    this.configurarModales(); 
    this.configurarFormularioReserva();
    this.configurarOpcionesEditor();
    
    document.getElementById('btn-toggle-chart')?.addEventListener('click', () => {
      this.tipoGraficaZonas = this.tipoGraficaZonas === 'pie' ? 'bar' : 'pie';
      const reservasDelDia = this.todasLasReservas.filter(r => !r.fecha || r.fecha === this.fechaSeleccionada);
      this.actualizarAnalitica(reservasDelDia);
    });

    document.addEventListener('click', (e: any) => {
      if (this.modoEdicion && !e.target.closest('.mesa') && !e.target.closest('.editor-toolbar-container')) {
        this.mesaSeleccionadaEdicion = null;
        this.dibujarMesas(this.zonaActiva);
      }
    });

    if (!this.socket && typeof io !== 'undefined') {
      try {
        this.socket = io(this.BASE_URL);
        this.socket.emit('join_restaurante', 3);

        this.socket.on('actualizar_llorona', (r: any[]) => { 
          this.ngZone.run(() => {
            this.todasLasReservas = r; 
            this.guardarReservasEnCache();
            this.actualizarVistaCompleta(); 
            this.cdr.detectChanges();
          });
        });

        this.socket.on('actualizar_diseno_llorona', (diseno: any) => {
          this.ngZone.run(() => {
            if (this.tieneMesasValidas(diseno)) {
              this.disenoMaestro = diseno;
              this.cargarLayoutPorFecha(this.fechaSeleccionada);
              this.dibujarMesas(this.zonaActiva);
              this.actualizarVistaCompleta();
              this.cdr.detectChanges();
            }
          });
        });
      } catch(e) {
        console.warn('Socket error Llorona:', e);
      }
    }

    this.sistemaInicializado = true;

    this.cargarDisenoMesas();
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
        if (vistaObj) {
          vistaObj.classList.remove('oculto');
          if (vistaId === 'vista-analitica') {
            setTimeout(() => {
              const reservasDelDia = this.todasLasReservas.filter(r => !r.fecha || r.fecha === this.fechaSeleccionada);
              this.actualizarAnalitica(reservasDelDia);
            }, 60);
          }
        }
      });
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
      this.irAlPanel();
    });
  }

  configurarBotonesTurnos() {
    const botonesTurno = document.querySelectorAll('.shift-btn');
    botonesTurno.forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        botonesTurno.forEach(b => b.classList.remove('active'));
        const el = e.currentTarget as HTMLElement;
        el.classList.add('active');
        this.turnoSeleccionado = el.dataset['shift'] || 'todo';
        const reservasDelDia = this.todasLasReservas.filter(r => !r.fecha || r.fecha === this.fechaSeleccionada);
        this.actualizarAnalitica(reservasDelDia);
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
        this.dibujarMesas(this.zonaActiva);
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
        this.dibujarMesas(this.zonaActiva);
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
        this.dibujarMesas(this.zonaActiva);
        this.actualizarVistaCompleta();
      });
    }

    document.getElementById('btn-editar-plano')?.addEventListener('click', () => {
      this.activarModoEdicion();
    });

    const inputBuscador = document.getElementById('input-buscador') as HTMLInputElement;
    if(inputBuscador) {
      inputBuscador.addEventListener('input', (e: any) => {
        const texto = e.target.value.toLowerCase().trim();
        const delDia = this.todasLasReservas.filter(r => !r.fecha || r.fecha === this.fechaSeleccionada);
        
        document.querySelectorAll('.mesa').forEach((m: any) => {
            m.style.boxShadow = ''; m.style.transform = ''; m.style.border = ''; m.style.transition = 'all 0.3s ease';
        });

        if (texto === '') { this.dibujarListaDeReservas(delDia); return; }

        const filtradas = delDia.filter(r => (r.nombre && r.nombre.toLowerCase().includes(texto)) || (r.idMesa && r.idMesa.toString().includes(texto)));
        this.dibujarListaDeReservas(filtradas);

        filtradas.forEach(res => {
            if (res.idMesa && res.estado !== 'finalizada' && res.estado !== 'cancelada' && res.estado !== 'liberada' && res.zona === this.zonaActiva) {
                const mesaEl = document.getElementById(`mesa-${res.idMesa}`);
                if (mesaEl) {
                    mesaEl.style.boxShadow = '0 0 20px 5px var(--accent)';
                    mesaEl.style.transform = 'scale(1.08)';
                    mesaEl.style.border = '2px solid var(--accent)';
                    setTimeout(() => { mesaEl.style.boxShadow = ''; mesaEl.style.transform = ''; mesaEl.style.border = ''; }, 2000); 
                }
            }
        });
      });
    }
  }

  configurarBotonesZonas() {
    const botones = document.querySelectorAll('.zona-btn');
    botones.forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        botones.forEach(b => b.classList.remove('active'));
        const elementBtn = e.target as HTMLElement;
        elementBtn.classList.add('active');
        this.zonaActiva = elementBtn.dataset['zona'] || 'Piso';
        this.dibujarMesas(this.zonaActiva);
      });
    });
  }

  configurarOpcionesEditor() {
    document.getElementById('btn-add-mesa')?.addEventListener('click', () => {
      const numMesa = prompt('Escribe el numero de la nueva mesa para Llorona Comedor:');
      if (!numMesa) return;
      const numId = parseInt(numMesa, 10);
      if (isNaN(numId)) { alert('Numero de mesa no valido.'); return; }

      let existe = false;
      for (const z in this.restaurante) {
        if (this.restaurante[z].some((m: any) => m.id === numId || m.displayId === numMesa.trim())) { 
          existe = true; 
          break; 
        }
      }
      if (existe) { alert('El numero de mesa ya existe.'); return; }

      const capMesa = prompt('Escribe la capacidad de comensales (PAX) para la Mesa ' + numId + ':', '4');
      const capNum = capMesa ? parseInt(capMesa, 10) : 4;
      const finalCap = (!isNaN(capNum) && capNum > 0 && capNum <= 50) ? capNum : 4;

      const nuevaMesaObj = { id: numId, displayId: numMesa.trim(), c: finalCap, x: 45, y: 40 };

      if (!this.restaurante[this.zonaActiva]) this.restaurante[this.zonaActiva] = [];
      this.restaurante[this.zonaActiva].push(nuevaMesaObj);

      if (!this.disenoMaestro) this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
      if (!this.disenoMaestro[this.zonaActiva]) this.disenoMaestro[this.zonaActiva] = [];
      const yaExisteMaestro = this.disenoMaestro[this.zonaActiva].some((m: any) => m.id === numId);
      if (!yaExisteMaestro) {
        this.disenoMaestro[this.zonaActiva].push(JSON.parse(JSON.stringify(nuevaMesaObj)));
      }

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

    document.getElementById('btn-cancelar-combinar')?.addEventListener('click', () => {
      this.modoCombinar = false;
      this.mesaACombinar = null;
      document.getElementById('aviso-combinar')?.classList.add('oculto');
      this.dibujarMesas(this.zonaActiva);
    });

    const resolverFusion = (esPermanente: boolean | null) => {
      document.getElementById('modal-tipo-fusion')?.classList.add('oculto');
      const resolver = this.resolverTipoFusion;
      this.resolverTipoFusion = null;
      resolver?.(esPermanente);
    };
    document.getElementById('btn-fusion-temporal')?.addEventListener('click', () => resolverFusion(false));
    document.getElementById('btn-fusion-permanente')?.addEventListener('click', () => resolverFusion(true));
    document.getElementById('btn-cancelar-tipo-fusion')?.addEventListener('click', () => resolverFusion(null));

    const btnSaveDiseno = document.getElementById('btn-save-diseno');
    btnSaveDiseno?.addEventListener('click', async () => {
      const btn = btnSaveDiseno as HTMLButtonElement;
      const textoOriginal = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 6px;"></i> Guardando...';

      try {
        await this.guardarDisenoEnServidor();
      } finally {
        btn.disabled = false;
        btn.innerHTML = textoOriginal;
        this.modoEdicion = false;
        this.modoCombinar = false;
        this.mesaACombinar = null;
        this.mesaSeleccionadaEdicion = null;
        document.getElementById('toolbar-editor')?.classList.add('oculto');
        document.getElementById('aviso-combinar')?.classList.add('oculto');
        this.actualizarVistaCompleta();
      }
    });

    document.getElementById('btn-cancel-edicion')?.addEventListener('click', () => {
      if (confirm('Deseas descartar los cambios de distribucion de mesa?')) {
        this.cargarLayoutPorFecha(this.fechaSeleccionada);
        this.modoEdicion = false;
        this.modoCombinar = false;
        this.mesaACombinar = null;
        this.mesaSeleccionadaEdicion = null;
        document.getElementById('toolbar-editor')?.classList.add('oculto');
        document.getElementById('aviso-combinar')?.classList.add('oculto');
        this.actualizarVistaCompleta();
      }
    });
  }

  activarModoEdicion() {
    this.modoEdicion = true;
    this.modoCombinar = false;
    this.mesaACombinar = null;
    this.mesaSeleccionadaEdicion = null;
    this.respaldoRestaurante = JSON.stringify(this.restaurante); 
    document.getElementById('toolbar-editor')?.classList.remove('oculto');
    this.dibujarMesas(this.zonaActiva);
  }

  async cargarReservaciones() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/restaurantes/3/reservas`);
      const data = await resp.json();
      if (Array.isArray(data)) {
        this.todasLasReservas = data;
        this.guardarReservasEnCache();
      }
      this.actualizarVistaCompleta();
    } catch(e) { 
      this.actualizarVistaCompleta(); 
    }
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
    
    if (!plano) {
      if (this.reintentosDibujo < this.maxReintentos) {
        this.reintentosDibujo++;
        setTimeout(() => this.dibujarMesas(zona), 80);
      }
      return;
    }

    this.reintentosDibujo = 0;
    plano.innerHTML = '';
    const mesas = this.obtenerMesasDeZona(zona);

    mesas.forEach((mesa: any) => {
      const divMesa = document.createElement('div');
      
      const isSelectedEditor = this.mesaSeleccionadaEdicion === mesa.id;
      let claseEdicion = this.modoEdicion ? 'en-edicion' : '';
      if (this.modoEdicion && isSelectedEditor) claseEdicion += ' activa-editor';

      let claseDoble = mesa.isMerged ? (mesa.isVertical ? 'doble-alto' : 'doble-ancho') : '';
      
      divMesa.className = `mesa ${claseEdicion} ${claseDoble} ${this.modoMover ? 'seleccionable' : ''}`;
      divMesa.id = `mesa-${mesa.id}`;
      divMesa.setAttribute('data-zona', zona);
      
      divMesa.style.left = `${mesa.x || 10}%`;
      divMesa.style.top = `${mesa.y || 10}%`;

      if (this.modoEdicion) {
        let controlesHtml = '';
        if (isSelectedEditor) {
          let btnUnlinkHtml = mesa.isMerged ? `<span class="btn-unlink-mesa" title="Separar mesas"><i class="fas fa-unlink"></i></span>` : '';
          controlesHtml = `
            <div class="controles-edicion-mesa">
              ${btnUnlinkHtml}
              <span class="btn-edit-pax" title="Editar mesa"><i class="fas fa-pencil-alt"></i></span>
              <span class="btn-delete-mesa" title="Eliminar mesa">&times;</span>
            </div>
          `;
        }

        if (this.modoCombinar && this.mesaACombinar && this.mesaACombinar.id === mesa.id) {
          divMesa.style.border = '3.5px solid var(--accent)';
          divMesa.style.boxShadow = '0 0 20px rgba(241, 196, 15, 0.8)';
        }

        const textoNumero = mesa.displayId || mesa.id;
        divMesa.innerHTML = `
          <span class="mesa-numero">${textoNumero}</span>
          <span class="mesa-capacidad">(${mesa.c}p)</span>
          ${controlesHtml}
        `;

        const iniciarArrastre = (e: any) => {
          if (!this.modoEdicion || this.modoCombinar || (e.target as HTMLElement).closest('.controles-edicion-mesa')) return;
          e.preventDefault();

          const rect = plano.getBoundingClientRect();

          const moverElement = (moveEvent: any) => {
            const currentX = moveEvent.type.includes('touch') ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const currentY = moveEvent.type.includes('touch') ? moveEvent.touches[0].clientY : moveEvent.clientY;
            let posX = currentX - rect.left;
            let posY = currentY - rect.top;
            let pctX = Math.round((posX / rect.width) * 100);
            let pctY = Math.round((posY / rect.height) * 100);

            const limiteMaxX = mesa.isMerged && !mesa.isVertical ? 78 : 88;
            const limiteMaxY = mesa.isMerged && mesa.isVertical ? 72 : 84;
            pctX = Math.max(1, Math.min(limiteMaxX, pctX));
            pctY = Math.max(1, Math.min(limiteMaxY, pctY));

            mesa.x = pctX; mesa.y = pctY;
            divMesa.style.left = `${pctX}%`; divMesa.style.top = `${pctY}%`;
          };

          const terminarArrastre = () => {
            this.guardarLayoutFechaActual();
            document.removeEventListener('mousemove', moverElement);
            document.removeEventListener('mouseup', terminarArrastre);
            document.removeEventListener('touchmove', moverElement);
            document.removeEventListener('touchend', terminarArrastre);
          };

          document.addEventListener('mousemove', moverElement);
          document.addEventListener('mouseup', terminarArrastre);
          document.addEventListener('touchmove', moverElement, { passive: false });
          document.addEventListener('touchend', terminarArrastre);
        };

        divMesa.addEventListener('mousedown', iniciarArrastre);
        divMesa.addEventListener('touchstart', iniciarArrastre, { passive: false });

        if (isSelectedEditor) {
          divMesa.querySelector('.btn-edit-pax')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const nuevoId = prompt(`Nuevo numero/etiqueta para la Mesa ${textoNumero}:`, textoNumero.toString());
            if (nuevoId && nuevoId.trim() !== '') {
              const valTrim = nuevoId.trim();
              mesa.displayId = valTrim;
              
              if (!mesa.isMerged) {
                const numInt = parseInt(valTrim, 10);
                if (!isNaN(numInt)) {
                  mesa.id = numInt;
                }
              }
            }
            const nuevaCap = prompt(`Cambiar capacidad para la Mesa ${textoNumero} (Minimo 1, Maximo 50):`, mesa.c.toString());
            if (nuevaCap) {
              let capNum = parseInt(nuevaCap, 10);
              if (!isNaN(capNum) && capNum > 0) {
                if (capNum > 50) capNum = 50; 
                mesa.c = capNum;
              }
            }
            this.guardarLayoutFechaActual();
            this.dibujarMesas(this.zonaActiva);
          });

          divMesa.querySelector('.btn-unlink-mesa')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.desvincularMesa(mesa);
          });

          divMesa.querySelector('.btn-delete-mesa')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Deseas eliminar la Mesa ${textoNumero}?`)) {
              for (const z in this.restaurante) {
                this.restaurante[z] = this.restaurante[z].filter((m: any) => m !== mesa && m.id !== mesa.id);
              }
              if (this.disenoMaestro) {
                for (const z in this.disenoMaestro) {
                  this.disenoMaestro[z] = this.disenoMaestro[z].filter((m: any) => m !== mesa && m.id !== mesa.id);
                }
              }
              this.mesaSeleccionadaEdicion = null;
              this.guardarLayoutFechaActual();
              this.dibujarMesas(this.zonaActiva);
            }
          });
        }
      } else {
        const textoNumero = mesa.displayId || mesa.id;
        divMesa.innerHTML = `<span class="mesa-numero">${textoNumero}</span><span class="mesa-capacidad">(${mesa.c}p)</span>`;
      }

      divMesa.addEventListener('click', (e) => this.gestionarClickMesa(e, mesa, zona));
      plano.appendChild(divMesa);
    });

    if (!this.modoEdicion) {
      this.actualizarVistaCompleta();
    }
  }

  solicitarTipoFusion(): Promise<boolean | null> {
    document.getElementById('modal-tipo-fusion')?.classList.remove('oculto');
    return new Promise((resolve) => {
      this.resolverTipoFusion = resolve;
    });
  }

  async fusionarMesas(mesaA: any, mesaB: any, esPermanente: boolean) {
    const zona = this.zonaActiva;
    const nuevoId = Date.now(); 
    const esVertical = Math.abs(mesaA.y - mesaB.y) > Math.abs(mesaA.x - mesaB.x);

    const mesaFusionada = {
      id: nuevoId,
      c: Number(mesaA.c) + Number(mesaB.c), 
      x: Math.round((mesaA.x + mesaB.x) / 2), 
      y: Math.round((mesaA.y + mesaB.y) / 2),
      isMerged: true,
      isVertical: esVertical, 
      displayId: `${mesaA.displayId || mesaA.id}+${mesaB.displayId || mesaB.id}`, 
      originalTables: [
        JSON.parse(JSON.stringify(mesaA)),
        JSON.parse(JSON.stringify(mesaB))
      ]
    };

    if (!this.restaurante[zona]) this.restaurante[zona] = [];
    this.restaurante[zona] = this.restaurante[zona].filter((m: any) => m.id !== mesaA.id && m.id !== mesaB.id);
    this.restaurante[zona].push(mesaFusionada);

    if (esPermanente) {
      try {
        await this.guardarDisenoPermanente();
      } catch (error) {
        this.disenoMaestro = JSON.parse(JSON.stringify(this.restaurante));
      }
    } else {
      this.guardarLayoutFechaActual();
    }

    this.modoEdicion = false;
    this.modoCombinar = false;
    this.mesaACombinar = null;
    this.mesaSeleccionadaEdicion = null;
    document.getElementById('toolbar-editor')?.classList.add('oculto');
    document.getElementById('aviso-combinar')?.classList.add('oculto');

    alert(`Mesas fusionadas con exito como Mesa ${mesaFusionada.displayId}.`);
    this.dibujarMesas(zona);
    this.actualizarVistaCompleta();
  }

  desvincularMesa(mesa: any) {
    if (!mesa.isMerged || !mesa.originalTables || !Array.isArray(mesa.originalTables)) return;
    
    const textoNombre = mesa.displayId || mesa.id;
    if (confirm(`Deseas desvincular la Mesa ${textoNombre} y restaurar las mesas individuales originales en Llorona Comedor?`)) {
      const zona = this.zonaActiva;

      if (this.restaurante[zona]) {
        const indiceRestaurante = this.restaurante[zona].findIndex((m: any) => m === mesa || m.id === mesa.id);
        if (indiceRestaurante !== -1) {
          this.restaurante[zona].splice(indiceRestaurante, 1);
        }
      }

      if (this.disenoMaestro && this.disenoMaestro[zona]) {
        const indiceMaestro = this.disenoMaestro[zona].findIndex((m: any) => m === mesa || m.id === mesa.id);
        if (indiceMaestro !== -1) {
          this.disenoMaestro[zona].splice(indiceMaestro, 1);
        }
      }

      mesa.originalTables.forEach((orig: any) => {
        const copiaOriginal = JSON.parse(JSON.stringify(orig));
        
        if (!this.restaurante[zona]) this.restaurante[zona] = [];
        const existeEnRestaurante = this.restaurante[zona].some((m: any) => m.id === copiaOriginal.id);
        if (!existeEnRestaurante) {
          this.restaurante[zona].push(copiaOriginal);
        }

        if (this.disenoMaestro && this.disenoMaestro[zona]) {
          const existeEnMaestro = this.disenoMaestro[zona].some((m: any) => m.id === copiaOriginal.id);
          if (!existeEnMaestro) {
            this.disenoMaestro[zona].push(JSON.parse(JSON.stringify(copiaOriginal)));
          }
        }
      });

      this.mesaSeleccionadaEdicion = null;
      this.guardarLayoutFechaActual();
      alert('Mesas separadas de manera exitosa.');
      this.dibujarMesas(zona);
    }
  }

  reservaPerteneceAMesa(res: any, mesa: any): boolean {
    if (!res || !res.idMesa || !mesa) return false;
    const resIdStr = res.idMesa.toString().trim().toLowerCase();
    const mesaIdStr = mesa.id !== undefined && mesa.id !== null ? mesa.id.toString().trim().toLowerCase() : '';
    const displayIdStr = mesa.displayId ? mesa.displayId.toString().trim().toLowerCase() : '';

    if (resIdStr === mesaIdStr || (displayIdStr && resIdStr === displayIdStr)) {
      return true;
    }

    if (mesa.isMerged) {
      let esSubMesa = false;

      if (displayIdStr.includes('+')) {
        const subIds = displayIdStr.split('+').map((s: string) => s.trim().toLowerCase());
        if (subIds.includes(resIdStr)) {
          esSubMesa = true;
        }
      }

      if (!esSubMesa && mesa.originalTables && Array.isArray(mesa.originalTables)) {
        esSubMesa = mesa.originalTables.some((orig: any) => {
          const origId = orig.id !== undefined && orig.id !== null ? orig.id.toString().trim().toLowerCase() : '';
          const origDisplay = orig.displayId ? orig.displayId.toString().trim().toLowerCase() : '';
          return resIdStr === origId || (origDisplay && resIdStr === origDisplay);
        });
      }

      if (esSubMesa) {
        let mesaIndependienteExiste = false;
        for (const z in this.restaurante) {
          const encontrada = (this.restaurante[z] || []).some((m: any) => {
            if (m.id === mesa.id) return false;
            const mId = m.id !== undefined && m.id !== null ? m.id.toString().trim().toLowerCase() : '';
            const mDisp = m.displayId ? m.displayId.toString().trim().toLowerCase() : '';
            return mId === resIdStr || mDisp === resIdStr;
          });
          if (encontrada) {
            mesaIndependienteExiste = true;
            break;
          }
        }

        if (!mesaIndependienteExiste) {
          return true;
        }
      }
    }

    return false;
  }

  actualizarEstadoMesas(reservas: any[]) {
    if (this.modoEdicion) return;

    document.querySelectorAll('.mesa').forEach((m) => {
      const mesaEl = m as HTMLElement;
      const idMesaStr = mesaEl.id.split('-')[1];
      let mesaFisica = null;
      for(const z in this.restaurante) {
        const found = this.restaurante[z].find((x:any) => x.id.toString() === idMesaStr);
        if(found) mesaFisica = found;
      }
      
      if (!mesaFisica) return;
      let claseDoble = '';
      if (mesaFisica.isMerged) claseDoble = mesaFisica.isVertical ? 'doble-alto' : 'doble-ancho';

      mesaEl.className = `mesa libre ${claseDoble} ${this.modoMover ? 'seleccionable' : ''}`;
      mesaEl.removeAttribute('data-info');
      mesaEl.style.background = ''; 
      
      const numMostrado = mesaFisica.displayId || mesaFisica.id;
      mesaEl.innerHTML = `<span class="mesa-numero">${numMostrado}</span><span class="mesa-capacidad">(${mesaFisica.c}p)</span>`;
    });

    const mesasAgrupadas: any = {};
    
    reservas.forEach(res => {
      if (res.idMesa && res.estado !== 'finalizada' && res.estado !== 'cancelada' && res.estado !== 'liberada') {
        const mesasDeZona = this.obtenerMesasDeZona(this.zonaActiva);
        const mesaFisicaMacheada = mesasDeZona.find((m: any) => this.reservaPerteneceAMesa(res, m));
        if (mesaFisicaMacheada) {
          if (!mesasAgrupadas[mesaFisicaMacheada.id]) mesasAgrupadas[mesaFisicaMacheada.id] = [];
          mesasAgrupadas[mesaFisicaMacheada.id].push(res);
        }
      }
    });

    Object.keys(mesasAgrupadas).forEach(idMesaKey => {
      const arr = mesasAgrupadas[idMesaKey];
      const elemento = document.getElementById(`mesa-${idMesaKey}`) as HTMLElement;
      if (!elemento) return;

      elemento.classList.remove('libre');
      if (this.modoMover) {
        elemento.classList.add('seleccionable');
      } else {
        elemento.classList.remove('seleccionable');
      }
      elemento.setAttribute('data-info', JSON.stringify(arr));

      if (arr.length === 1) {
        const res = arr[0];
        const estadoClase = res.estado === 'confirmada' ? 'reservada' : res.estado;
        elemento.classList.add(estadoClase);
        let nombreCorto = res.nombre ? res.nombre.split(' ')[0].substring(0, 8) : 'Cliente';
        elemento.innerHTML = `<span class="res-nombre">${nombreCorto}</span><span class="res-pax">${res.personas}p</span>`;
      } else {
        const tieneReservada = arr.some((r: any) => r.estado === 'reservada' || r.estado === 'confirmada');
        const tieneOcupada = arr.some((r: any) => r.estado === 'ocupada');
        
        if (tieneReservada && tieneOcupada) elemento.classList.add('mixta');
        else if (tieneReservada) elemento.classList.add('reservada-doble');
        else if (tieneOcupada) elemento.classList.add('ocupada-doble');
        else elemento.classList.add('bloqueada');
        
        const totalPax = arr.reduce((sum: number, r: any) => sum + parseInt(r.personas || 0), 0);
        elemento.innerHTML = `<span class="res-nombre">Multiples</span><span class="res-pax">${totalPax}p</span>`;
      }
    });
  }

  dibujarListaDeReservas(reservas: any[]) {
    const lista = document.getElementById('lista-reservas-sidebar');
    if(!lista) {
      setTimeout(() => this.dibujarListaDeReservas(reservas), 100);
      return;
    }
    lista.innerHTML = '';
    const activas = reservas.filter(x => x.estado !== 'finalizada' && x.estado !== 'cancelada' && x.estado !== 'liberada');
    const finalizadas = reservas.filter(x => x.estado === 'finalizada' || x.estado === 'cancelada' || x.estado === 'liberada');

    if (activas.length === 0 && finalizadas.length === 0) {
      lista.innerHTML = '<p style="color:var(--text-sec); padding:20px; text-align:center;">No hay reservas hoy en Llorona Comedor.</p>';
      return;
    }

    activas.forEach(res => {
      const item = document.createElement('div');
      item.className = 'reserva-item-sidebar';
      let borderColor = 'transparent';
      if(res.estado === 'reservada' || res.estado === 'confirmada') borderColor = 'var(--res)';
      if(res.estado === 'ocupada') borderColor = 'var(--occ)';
      if(res.estado === 'bloqueada') borderColor = 'var(--blo)';
      item.style.borderLeftColor = borderColor;
      item.innerHTML = `
        <div class="reserva-info-left"><strong>${res.nombre}</strong></div>
        <div class="reserva-info-right">
          ${res.personas}p • Mesa ${res.idMesa || ''}
          <i class="fas fa-info-circle icono-mas-info" style="margin-left: 8px; color: rgba(255,255,255,0.45); cursor: pointer;"></i>
        </div>`;
      item.addEventListener('click', () => this.mostrarDetalleReserva(res));
      lista.appendChild(item);
    });

    if (finalizadas.length > 0) {
       const separador = document.createElement('div');
       separador.innerHTML = '<p style="color:var(--text-sec); font-size:10px; text-align:center; margin: 15px 0 5px 0; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-weight:bold;">HISTORIAL LLORONA COMEDOR</p>';
       lista.appendChild(separador);

       finalizadas.forEach(res => {
          const item = document.createElement('div');
          item.className = 'reserva-item-sidebar';
          item.style.opacity = '0.5';
          item.innerHTML = `
            <div class="reserva-info-left"><strong style="text-decoration: line-through;">${res.nombre}</strong></div>
            <div class="reserva-info-right">
              ${res.personas}p • Mesa ${res.idMesa || ''}
              <i class="fas fa-info-circle icono-mas-info" style="margin-left: 8px; color: rgba(255,255,255,0.3); cursor: pointer;"></i>
            </div>`;
          item.addEventListener('click', () => this.mostrarDetalleReserva(res));
          lista.appendChild(item);
       });
    }
  }

  actualizarEstadisticas(reservasDelDia: any[]) {
    const ocupadas = reservasDelDia.filter(r => r.estado === 'ocupada').length;
    const reservadas = reservasDelDia.filter(r => r.estado === 'reservada' || r.estado === 'confirmada').length;
    
    let totalComensalesDia = 0;
    reservasDelDia.forEach(r => {
      if (r.estado !== 'cancelada' && r.estado !== 'bloqueada') {
        totalComensalesDia += Number(r.personas || 0);
      }
    });

    let totalMesasFisicas = 0;
    Object.values(this.restaurante).forEach((zona: any) => totalMesasFisicas += (Array.isArray(zona) ? zona.length : 0));
    const libres = Math.max(0, totalMesasFisicas - (ocupadas + reservadas));
    const porcentaje = totalMesasFisicas > 0 ? Math.round((ocupadas / totalMesasFisicas) * 100) : 0;

    const act = (id: string, val: string | number) => { 
      const el = document.getElementById(id); 
      if(el) el.textContent = val.toString(); 
    };

    act('stats-ocupadas', ocupadas); 
    act('stats-reservadas', reservadas); 
    act('stats-libres', libres); 
    act('stats-pax-total', totalComensalesDia); 
    act('stats-totales-dia', totalMesasFisicas); 
    act('stats-porcentaje-ocupacion', `${porcentaje}%`);
  }

  cancelarModoMover() {
    this.modoMover = false;
    this.reservaAMoverId = null;
    const avisoMover = document.getElementById('aviso-mover');
    if (avisoMover) avisoMover.classList.add('oculto');
    this.dibujarMesas(this.zonaActiva);
  }

  ejecutarMover(idMesaNueva: any, zonaNueva: any) {
    this.modoMover = false;
    this.mesaSeleccionadaTemp = null;

    const avisoMover = document.getElementById('aviso-mover');
    if (avisoMover) avisoMover.classList.add('oculto');

    const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
    if (res) {
        res.idMesa = idMesaNueva.toString();
        res.zona = zonaNueva;
        
        delete res.isNewRecord;
        delete res.tipoCorreo;
        
        this.guardarReservaEnServidor(res); 
    }

    this.reservaAMoverId = null;
    this.dibujarMesas(this.zonaActiva);
    this.actualizarVistaCompleta();
  }

  async gestionarClickMesa(evento: any, mesa: any, zona: string) {
    evento.stopPropagation(); 

    if (this.modoEdicion && this.modoCombinar) {
      if (!this.mesaACombinar) {
        this.mesaACombinar = mesa;
        alert(`Mesa ${mesa.displayId || mesa.id} seleccionada en Llorona Comedor. Ahora haz clic en la segunda mesa para fusionarlas.`);
        this.dibujarMesas(zona);
      } else {
        if (this.mesaACombinar.id === mesa.id) {
          alert('Seleccionaste la misma mesa. Por favor selecciona una mesa diferente.');
          return;
        }
        const esPermanente = await this.solicitarTipoFusion();
        if (esPermanente === null) return;
        await this.fusionarMesas(this.mesaACombinar, mesa, esPermanente);
        this.modoCombinar = false;
        this.mesaACombinar = null;
        document.getElementById('aviso-combinar')?.classList.add('oculto');
      }
      return; 
    }

    if (this.modoEdicion) {
      this.mesaSeleccionadaEdicion = mesa.id;
      this.dibujarMesas(zona);
      return; 
    }

    this.mesaSeleccionadaTemp = { id: mesa.id, zona: zona };
    const idMesa = mesa.displayId || mesa.id;

    if (this.modoMover) {
      if(confirm(`Deseas mover la reserva a Mesa ${idMesa}?`)) {
          this.ejecutarMover(idMesa, zona);
      } else {
          this.cancelarModoMover();
      }
      return;
    }

    const mesaDiv = evento.currentTarget as HTMLElement;
    const infoAtributo = mesaDiv.getAttribute('data-info');
    let arrReservas: any[] = [];
    if (infoAtributo) {
      try { arrReservas = JSON.parse(infoAtributo); } catch(e) {}
    }

    this.mostrarPopoverRapido(mesa, arrReservas);
  }

  mostrarPopoverRapido(mesa: any, arrReservas: any[]) {
    const popover = document.getElementById('popover-rapido-mesa');
    const contenedorBotones = document.getElementById('pop-acciones-group');
    const singleInfoBox = document.getElementById('pop-single-info');
    if (!popover || !contenedorBotones) return;

    const elTxt = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const statusBadge = document.getElementById('pop-status-badge');
    contenedorBotones.innerHTML = '';

    const btnCerrar = document.getElementById('btn-close-popover');
    if (btnCerrar) {
      btnCerrar.onclick = () => popover.classList.add('oculto');
    }

    const crearBotonPop = (texto: string, claseCss: string, icono: string, accion: () => void) => {
      const btn = document.createElement('button');
      btn.className = `btn-pop-action ${claseCss}`;
      btn.innerHTML = `<i class="fas ${icono}"></i> ${texto}`;
      btn.onclick = (e) => {
        e.stopPropagation();
        accion();
      };
      contenedorBotones.appendChild(btn);
    };

    const numMesa = mesa.displayId || mesa.id;
    elTxt('pop-mesa-id', numMesa.toString());

    if (!arrReservas || arrReservas.length === 0) {
      if (singleInfoBox) singleInfoBox.style.display = 'grid';
      const notaBox = document.getElementById('pop-nota-container');
      if (notaBox) notaBox.classList.add('oculto');

      elTxt('pop-mesa-pax', mesa.c.toString());
      elTxt('pop-cliente-nombre', 'Mesa Disponible');
      elTxt('pop-hora', '--:--');
      elTxt('pop-tel', `Mesa ${numMesa}`);

      if (statusBadge) {
        statusBadge.textContent = 'LIBRE';
        statusBadge.className = 'popover-status-badge libre';
      }

      contenedorBotones.className = 'popover-actions-container popover-actions-grid';
      crearBotonPop('Nueva Reserva', 'btn-crear', 'fa-plus', () => {
        popover.classList.add('oculto');
        this.abrirModalNuevaReserva(this.zonaActiva, numMesa);
      });
      crearBotonPop('Walk-in', 'btn-walkin', 'fa-street-view', () => {
        popover.classList.add('oculto');
        const modalWalkin = document.getElementById('modal-walkin');
        if (modalWalkin) modalWalkin.classList.remove('oculto');
      });
      crearBotonPop('Bloquear', 'btn-liberar', 'fa-lock', () => {
        popover.classList.add('oculto');
        this.crearRegistroRapido(numMesa, this.zonaActiva, 'Mesa Bloqueada', 'bloqueada', '0');
      });
    } else if (arrReservas.length === 1) {
      if (singleInfoBox) singleInfoBox.style.display = 'grid';
      const resTemp = arrReservas[0];
      const realRes = this.todasLasReservas.find(r => Number(r.id) === Number(resTemp.id)) || resTemp;

      elTxt('pop-mesa-pax', `${realRes.personas} / ${mesa.c}`);
      elTxt('pop-cliente-nombre', realRes.nombre || 'Cliente');
      elTxt('pop-hora', realRes.hora || '--:--');
      elTxt('pop-tel', `Mesa ${numMesa}`);

      const notaBox = document.getElementById('pop-nota-container');
      const notaTxt = document.getElementById('pop-nota-texto');
      if (notaBox && notaTxt) {
        if (realRes.nota && realRes.nota.trim() !== '') {
          notaTxt.textContent = realRes.nota;
          notaBox.classList.remove('oculto');
        } else {
          notaBox.classList.add('oculto');
        }
      }

      if (statusBadge) {
        const estadoClase = realRes.estado === 'confirmada' ? 'reservada' : realRes.estado;
        statusBadge.textContent = realRes.estado.toUpperCase();
        statusBadge.className = `popover-status-badge ${estadoClase}`;
      }

      contenedorBotones.className = 'popover-actions-container popover-actions-grid';

      if (realRes.estado !== 'bloqueada') {
        crearBotonPop('Agregar Reserva', 'btn-crear', 'fa-plus', () => {
          popover.classList.add('oculto');
          this.abrirModalNuevaReserva(this.zonaActiva, numMesa);
        });
      }

      if (realRes.estado === 'reservada' || realRes.estado === 'confirmada' || realRes.estado === 'ocupada') {
        crearBotonPop('Agregar Walk-in', 'btn-walkin', 'fa-street-view', () => {
          popover.classList.add('oculto');
          document.getElementById('modal-walkin')?.classList.remove('oculto');
        });
      }

      if (realRes.estado === 'reservada' || realRes.estado === 'confirmada') {
        crearBotonPop('Ver Info', 'btn-info', 'fa-info-circle', () => {
          popover.classList.add('oculto');
          this.mostrarDetalleReserva(realRes);
        });
        crearBotonPop('Marcar Llegada', 'btn-llegada', 'fa-bell-concierge', () => {
          popover.classList.add('oculto');
          realRes.estado = 'ocupada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(realRes);
          this.actualizarVistaCompleta();
        });
        crearBotonPop('Mover Mesa', 'btn-mover', 'fa-arrows-alt', () => {
          popover.classList.add('oculto');
          this.reservaAMoverId = Number(realRes.id);
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
        crearBotonPop('Cancelar', 'btn-cancelar', 'fa-trash-alt', () => {
          popover.classList.add('oculto');
          if (confirm('Deseas cancelar la reserva y notificar al cliente por correo?')) {
            realRes.estado = 'cancelada';
            this.guardarReservasEnCache();
            this.guardarReservaEnServidor(realRes, 'noshow');
            this.actualizarVistaCompleta();
          }
        });
      } else if (realRes.estado === 'ocupada') {
        crearBotonPop('Ver Info', 'btn-info', 'fa-info-circle', () => {
          popover.classList.add('oculto');
          this.mostrarDetalleReserva(realRes);
        });
        crearBotonPop('Liberar Mesa', 'btn-liberar', 'fa-broom', () => {
          popover.classList.add('oculto');
          realRes.estado = 'liberada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(realRes);
          this.actualizarVistaCompleta();
        });
        crearBotonPop('Mover Mesa', 'btn-mover', 'fa-arrows-alt', () => {
          popover.classList.add('oculto');
          this.reservaAMoverId = Number(realRes.id);
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
      } else if (realRes.estado === 'bloqueada') {
        crearBotonPop('Desbloquear', 'btn-liberar', 'fa-unlock', () => {
          popover.classList.add('oculto');
          realRes.estado = 'finalizada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(realRes);
          this.actualizarVistaCompleta();
        });
      }
    } else {
      if (singleInfoBox) singleInfoBox.style.display = 'none';
      const notaBox = document.getElementById('pop-nota-container');
      if (notaBox) notaBox.classList.add('oculto');

      if (statusBadge) {
        statusBadge.textContent = `MULTIPLES (${arrReservas.length})`;
        statusBadge.className = 'popover-status-badge reservada';
      }

      contenedorBotones.className = 'popover-actions-container';

      const btnAgregarOtra = document.createElement('button');
      btnAgregarOtra.className = 'btn-pop-action btn-crear';
      btnAgregarOtra.style.marginBottom = '12px';
      btnAgregarOtra.style.width = '100%';
      btnAgregarOtra.innerHTML = `<i class="fas fa-plus"></i> AGREGAR OTRA RESERVA A MESA ${numMesa}`;
      btnAgregarOtra.onclick = (e) => {
        e.stopPropagation();
        popover.classList.add('oculto');
        this.abrirModalNuevaReserva(this.zonaActiva, numMesa);
      };
      contenedorBotones.appendChild(btnAgregarOtra);

      if (arrReservas.some((res: any) => res.estado === 'reservada' || res.estado === 'confirmada' || res.estado === 'ocupada')) {
        const btnAgregarWalkin = document.createElement('button');
        btnAgregarWalkin.className = 'btn-pop-action btn-walkin';
        btnAgregarWalkin.style.marginBottom = '12px';
        btnAgregarWalkin.style.width = '100%';
        btnAgregarWalkin.innerHTML = '<i class="fas fa-street-view"></i> AGREGAR WALK-IN';
        btnAgregarWalkin.onclick = (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          document.getElementById('modal-walkin')?.classList.remove('oculto');
        };
        contenedorBotones.appendChild(btnAgregarWalkin);
      }

      arrReservas.forEach((resTemp: any) => {
        const realItem = this.todasLasReservas.find(r => Number(r.id) === Number(resTemp.id)) || resTemp;
        const cardItem = document.createElement('div');
        const estadoClase = realItem.estado === 'confirmada' ? 'reservada' : realItem.estado;
        cardItem.className = `multi-res-item-card ${estadoClase}`;

        let botonEstadoHtml = '';
        if (realItem.estado === 'reservada' || realItem.estado === 'confirmada') {
          botonEstadoHtml = `<button class="btn-llegada" title="Marcar Llegada"><i class="fas fa-bell-concierge"></i> Llegada</button>`;
        } else if (realItem.estado === 'ocupada') {
          botonEstadoHtml = `<button class="btn-liberar" title="Liberar Mesa"><i class="fas fa-broom"></i> Liberar</button>`;
        } else if (realItem.estado === 'bloqueada') {
          botonEstadoHtml = `<button class="btn-llegada" title="Desbloquear"><i class="fas fa-unlock"></i> Desbloquear</button>`;
        }

        const mostrarBotonCancelar = realItem.estado !== 'ocupada' && realItem.estado !== 'bloqueada';

        cardItem.innerHTML = `
          <div class="multi-res-header">
            <div class="multi-res-title">
              <strong>${realItem.nombre}</strong>
              <span class="multi-res-mesa-tag"><i class="fas fa-chair"></i> Mesa ${numMesa}</span>
            </div>
            <div class="multi-res-pax-tag">
              <i class="fas fa-users"></i> ${realItem.personas}p • <i class="far fa-clock"></i> ${realItem.hora} hs
            </div>
          </div>
          ${realItem.nota && realItem.nota.trim() !== '' ? `<div class="multi-res-nota"><i class="far fa-sticky-note"></i> ${realItem.nota}</div>` : ''}
          <div class="multi-res-actions">
            ${botonEstadoHtml}
            <button class="btn-info" title="Ver Detalle Completo"><i class="fas fa-info-circle"></i> Info</button>
            ${realItem.estado !== 'bloqueada' ? '<button class="btn-mover"><i class="fas fa-arrows-alt"></i> Mover</button>' : ''}
            ${mostrarBotonCancelar ? '<button class="btn-cancelar"><i class="fas fa-trash-alt"></i> Cancelar</button>' : ''}
          </div>
        `;

        cardItem.querySelector('.btn-llegada')?.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          realItem.estado = 'ocupada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(realItem);
          this.actualizarVistaCompleta();
        });

        cardItem.querySelector('.btn-liberar')?.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          realItem.estado = 'liberada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(realItem);
          this.actualizarVistaCompleta();
        });

        cardItem.querySelector('.btn-info')?.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          this.mostrarDetalleReserva(realItem);
        });

        cardItem.querySelector('.btn-mover')?.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          this.reservaAMoverId = Number(realItem.id);
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });

        cardItem.querySelector('.btn-cancelar')?.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          if (confirm(`Deseas cancelar la reserva de ${realItem.nombre} y enviar correo?`)) {
            realItem.estado = 'cancelada';
            this.guardarReservasEnCache();
            this.guardarReservaEnServidor(realItem, 'noshow');
            this.actualizarVistaCompleta();
          }
        });

        contenedorBotones.appendChild(cardItem);
      });
    }

    popover.classList.remove('oculto');
  }

  configurarMenuContextual() {}

  crearRegistroRapido(idMesa: any, zona: string, nombre: string, estado: string, pax: string = "2") {
    const nuevo = {
      id: Date.now(),
      idRestaurante: 3,
      fecha: this.fechaSeleccionada,
      hora: new Date().toTimeString().substring(0,5),
      zona: zona,
      idMesa: idMesa.toString(),
      nombre: nombre,
      personas: pax,
      estado: estado,
      isNewRecord: true 
    };
    this.todasLasReservas.push(nuevo);
    this.guardarReservasEnCache();
    this.guardarReservaEnServidor(nuevo); 
    this.actualizarVistaCompleta();
  }

  cambiarEstadoReserva(idReserva: number, nuevoEstado: string) {
    const res = this.todasLasReservas.find(r => Number(r.id) === Number(idReserva));
    if (res) {
      res.estado = nuevoEstado;
      this.guardarReservasEnCache();
      this.guardarReservaEnServidor(res); 
      this.actualizarVistaCompleta();
    }
  }

  abrirModalListaMesa(reservasEnMesa: any[]) {
    const modal = document.getElementById('modal-lista-mesa');
    const contenedor = document.getElementById('lista-conflictos');
    if (!contenedor || !modal) return;
    
    contenedor.innerHTML = '';
    reservasEnMesa.forEach(res => {
      const btn = document.createElement('div');
      btn.className = 'conflicto-item';
      btn.innerHTML = `<strong>${res.nombre}</strong> <span style="color:var(--accent); font-weight:bold;">${res.estado.toUpperCase()}</span>`;
      
      btn.addEventListener('click', () => {
        modal.classList.add('oculto');
        this.mostrarDetalleReserva(res); 
      });
      contenedor.appendChild(btn);
    });
    
    modal.classList.remove('oculto');
  }

  resetWalkinModal() {
    this.idReservaAEditar = null;
    const modalWalkin = document.getElementById('modal-walkin');
    if (modalWalkin) {
        const h2 = modalWalkin.querySelector('.modal-header h2');
        if (h2) h2.textContent = 'Walk-in Rapido - Llorona Comedor';
        const btn = document.getElementById('btn-confirmar-walkin');
        if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Ocupar Mesa';
        const inputWalkin = document.getElementById('input-pax-walkin') as HTMLInputElement;
        if (inputWalkin) inputWalkin.value = '2';
    }
  }

  configurarModales() {
    document.querySelectorAll('.modal-overlay, .popover-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e: any) => {
        if (e.target === overlay) {
          overlay.classList.add('oculto');
          this.resetWalkinModal();
        }
      });
    });

    document.getElementById('btn-cancelar-mover')?.addEventListener('click', () => {
      this.cancelarModoMover();
    });

    document.querySelectorAll('.modal-close-btn, #close-nueva-reserva, #lista-mesa-close-btn, #close-walkin, #btn-close-popover').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const overlay = e.target.closest('.modal-overlay, .popover-overlay');
        if (overlay) overlay.classList.add('oculto');
        this.resetWalkinModal();
      });
    });

    document.getElementById('nueva-reserva-btn')?.addEventListener('click', () => {
      this.abrirModalNuevaReserva(this.zonaActiva);
    });

    const inputWalkin = document.getElementById('input-pax-walkin') as HTMLInputElement;
    
    document.getElementById('btn-minus-walkin')?.addEventListener('click', () => {
      if (inputWalkin && parseInt(inputWalkin.value) > 1) {
        inputWalkin.value = (parseInt(inputWalkin.value) - 1).toString();
      }
    });

    document.getElementById('btn-plus-walkin')?.addEventListener('click', () => {
      if (inputWalkin) {
        let actual = parseInt(inputWalkin.value);
        if (isNaN(actual)) actual = 1;
        inputWalkin.value = (actual + 1).toString();
      }
    });
    
    document.getElementById('btn-confirmar-walkin')?.addEventListener('click', () => {
      if (inputWalkin) {
        let paxFinal = parseInt(inputWalkin.value);
        if (isNaN(paxFinal) || paxFinal < 1) paxFinal = 1; 

        if (this.idReservaAEditar !== null) {
            const resObj = this.todasLasReservas.find(r => Number(r.id) === Number(this.idReservaAEditar));
            if (resObj) {
              resObj.personas = paxFinal.toString();
              this.guardarReservasEnCache();
              this.guardarReservaEnServidor(resObj); 
              alert('Cantidad de comensales actualizada.');
            }
            this.actualizarVistaCompleta();
        } else if (this.mesaSeleccionadaTemp) {
            this.crearRegistroRapido(this.mesaSeleccionadaTemp.id, this.mesaSeleccionadaTemp.zona, 'Walk-in Cliente', 'ocupada', paxFinal.toString());
        }
        
        document.querySelectorAll('.modal-overlay, .popover-overlay').forEach(modal => modal.classList.add('oculto'));
        this.resetWalkinModal();
      }
    });
  }

  abrirModalNuevaReserva(zonaPredeterminada: string, mesaPreseleccionada?: any) {
    this.idReservaAEditar = null;
    const popover = document.getElementById('popover-rapido-mesa');
    if (popover) popover.classList.add('oculto');

    const modal = document.getElementById('modal-nueva-reserva');
    const form = document.getElementById('form-nueva-reserva') as HTMLFormElement;
    if (form) form.reset();

    const inputFecha = document.getElementById('res-fecha') as HTMLInputElement;
    if (inputFecha) inputFecha.value = this.fechaSeleccionada;
    
    const inputHora = document.getElementById('res-hora') as HTMLInputElement;
    if (inputHora) inputHora.value = new Date().toTimeString().substring(0,5);
    
    const selectZona = document.getElementById('res-zona') as HTMLSelectElement;
    if (selectZona) {
      selectZona.innerHTML = '';
      const zonas = Object.keys(this.restaurante);
      zonas.forEach(z => {
        selectZona.innerHTML += `<option value="${z}">${z.toUpperCase()}</option>`;
      });

      const zonaMatch = zonas.find(z => this.limpiarTexto(z) === this.limpiarTexto(zonaPredeterminada));
      selectZona.value = zonaMatch || (zonas[0] || 'Piso');
    }
    
    const zonaActual = selectZona ? selectZona.value : zonaPredeterminada;
    this.actualizarSelectMesas(zonaActual, mesaPreseleccionada);
    if (modal) modal.classList.remove('oculto');
  }

  abrirEdicionReserva(reserva: any) {
    const esWalkIn = reserva.nombre && reserva.nombre.toLowerCase().includes('walk-in');

    const popover = document.getElementById('popover-rapido-mesa');
    if (popover) popover.classList.add('oculto');

    const modalDetalle = document.getElementById('modal-detalle-reserva');
    if (modalDetalle) modalDetalle.classList.add('oculto');

    if (esWalkIn) {
      this.idReservaAEditar = Number(reserva.id);
      const modalWalkin = document.getElementById('modal-walkin');
      const inputPax = document.getElementById('input-pax-walkin') as HTMLInputElement;
      
      if (inputPax) inputPax.value = reserva.personas ? reserva.personas.toString() : '2';
      
      if (modalWalkin) {
        modalWalkin.classList.remove('oculto');
      }
    } else {
      this.idReservaAEditar = Number(reserva.id);
      const modal = document.getElementById('modal-nueva-reserva');
      
      const setVal = (id: string, val: any) => {
        const el = document.getElementById(id) as any;
        if (el) el.value = val !== null && val !== undefined ? val : '';
      };

      setVal('res-fecha', reserva.fecha);
      setVal('res-hora', reserva.hora);
      setVal('res-nombre', reserva.nombre);
      setVal('res-personas', reserva.personas);
      setVal('res-telefono', reserva.telefono);
      setVal('res-email', reserva.email);

      const selectZona = document.getElementById('res-zona') as HTMLSelectElement;
      if (selectZona) {
        selectZona.innerHTML = '';
        const zonas = Object.keys(this.restaurante);
        zonas.forEach(z => {
          selectZona.innerHTML += `<option value="${z}">${z.toUpperCase()}</option>`;
        });

        const zonaMatch = zonas.find(z => this.limpiarTexto(z) === this.limpiarTexto(reserva.zona));
        if (zonaMatch) {
          selectZona.value = zonaMatch;
        }
        this.actualizarSelectMesas(selectZona.value, reserva.idMesa);
      }
      
      const inputNotas = (document.getElementById('res-notas') as HTMLTextAreaElement) || (document.getElementById('res-notes') as HTMLTextAreaElement);
      if (inputNotas) inputNotas.value = reserva.nota || '';

      if (modal) modal.classList.remove('oculto');
    }
  }

  actualizarSelectMesas(zona: string, mesaPreseleccionada?: any) {
    const selectMesa = document.getElementById('res-mesa') as HTMLSelectElement;
    if(!selectMesa) return;
    selectMesa.innerHTML = '';
    const mesas = this.obtenerMesasDeZona(zona);

    mesas.forEach((m: any) => {
      const valorOpcion = m.displayId || m.id.toString();
      const labelMesa = `Mesa ${valorOpcion} (${m.c} pers)`;
      selectMesa.innerHTML += `<option value="${valorOpcion}">${labelMesa}</option>`;
    });

    if (mesaPreseleccionada !== undefined && mesaPreseleccionada !== null) {
      const idBuscado = mesaPreseleccionada.toString().trim();
      const encontrada = mesas.find((m: any) => 
        m.id.toString().trim() === idBuscado || (m.displayId && m.displayId.toString().trim() === idBuscado)
      );
      if (encontrada) {
        selectMesa.value = encontrada.displayId || encontrada.id.toString();
      }
    }
  }

  configurarFormularioReserva() {
    const form = document.getElementById('form-nueva-reserva') as HTMLFormElement;
    const selectZona = document.getElementById('res-zona') as HTMLSelectElement;
    if(selectZona) {
      selectZona.innerHTML = '';
      Object.keys(this.restaurante).forEach(zona => {
        selectZona.innerHTML += `<option value="${zona}">${zona.toUpperCase()}</option>`;
      });
      selectZona.addEventListener('change', () => this.actualizarSelectMesas(selectZona.value));
    }
    form?.addEventListener('submit', (e) => {
      e.preventDefault(); 
      const idMesaElegida = (document.getElementById('res-mesa') as HTMLSelectElement).value;
      const fechaElegida = (document.getElementById('res-fecha') as HTMLInputElement).value;
      const horaElegida = (document.getElementById('res-hora') as HTMLInputElement).value;

      const choques = this.todasLasReservas.filter(r => 
        r.fecha === fechaElegida && 
        r.idMesa && r.idMesa.toString() === idMesaElegida.toString() && 
        r.estado !== 'finalizada' && r.estado !== 'cancelada' && r.estado !== 'liberada' && 
        Number(r.id) !== Number(this.idReservaAEditar) 
      );
      
      const hayBloqueo = choques.some(r => r.estado === 'bloqueada');
      if (hayBloqueo) {
          alert('ACCION DENEGADA: La mesa seleccionada se encuentra BLOQUEADA.');
          return;
      }

      const [hE, mE] = horaElegida.split(':').map(Number);
      const minsElegidos = (hE * 60) + mE;

      let alertaChoque = false;
      for (let r of choques) {
          if (!r.hora) continue;
          const [hR, mR] = r.hora.split(':').map(Number);
          const minsR = (hR * 60) + mR;
          
          if (Math.abs(minsElegidos - minsR) < 60) {
              alertaChoque = true;
              break;
          }
      }

      if (alertaChoque) {
          const confirmar = confirm('ATENCION: Ya hay una reserva en esa mesa con menos de 1 hora de diferencia. Deseas forzar esta reserva?');
          if (!confirmar) return; 
      }

      const inputNotas = (document.getElementById('res-notas') as HTMLTextAreaElement) || (document.getElementById('res-notes') as HTMLTextAreaElement);
      const notaValor = inputNotas ? inputNotas.value : '';

      const esEdicion = this.idReservaAEditar !== null;

      if (esEdicion) {
        const resObj = this.todasLasReservas.find(r => Number(r.id) === Number(this.idReservaAEditar));
        if (resObj) {
          resObj.fecha = fechaElegida;
          resObj.hora = horaElegida;
          resObj.zona = selectZona.value;
          resObj.idMesa = idMesaElegida;
          resObj.nombre = (document.getElementById('res-nombre') as HTMLInputElement).value;
          resObj.personas = (document.getElementById('res-personas') as HTMLInputElement).value;
          resObj.telefono = (document.getElementById('res-telefono') as HTMLInputElement).value;
          resObj.email = (document.getElementById('res-email') as HTMLInputElement).value;
          resObj.nota = notaValor;
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(resObj); 
        }
        this.idReservaAEditar = null;
      } else {
        const nuevaReserva: any = {
          id: Date.now(), 
          idRestaurante: 3,
          fecha: fechaElegida,
          hora: horaElegida,
          zona: selectZona.value,
          idMesa: idMesaElegida,
          nombre: (document.getElementById('res-nombre') as HTMLInputElement).value,
          personas: (document.getElementById('res-personas') as HTMLInputElement).value,
          telefono: (document.getElementById('res-telefono') as HTMLInputElement).value,
          email: (document.getElementById('res-email') as HTMLInputElement).value,
          nota: notaValor,
          estado: 'reservada',
          isNewRecord: true 
        };
        this.todasLasReservas.push(nuevaReserva);
        this.guardarReservasEnCache();
        this.guardarReservaEnServidor(nuevaReserva, 'crear'); 
      }

      this.actualizarVistaCompleta();

      document.querySelectorAll('.modal-overlay, .popover-overlay').forEach(modal => {
        modal.classList.add('oculto');
      });

      form.reset();

      setTimeout(() => {
        if (esEdicion) {
          alert('Datos de la reserva actualizados con exito en Llorona Comedor.');
        } else {
          alert('Nueva reserva guardada con exito en Llorona Comedor.');
        }
      }, 50);
    });
  }

  mostrarDetalleReserva(reserva: any) {
    const actualizarTxt = (id: string, val: string) => { const el = document.getElementById(id); if(el) el.textContent = val; };
    const esWalkIn = reserva.nombre && reserva.nombre.toLowerCase().includes('walk-in');
    
    let horaFormat = reserva.hora;
    if (reserva.hora) {
        const [h, m] = reserva.hora.split(':');
        let horas = parseInt(h, 10);
        const ampm = horas >= 12 ? 'PM' : 'AM';
        horas = horas % 12;
        horas = horas ? horas : 12; 
        const horaStr = horas < 10 ? '0' + horas : horas;
        horaFormat = `${horaStr}:${m} ${ampm}`;
    }

    actualizarTxt('popup-nombre', reserva.nombre);
    actualizarTxt('popup-personas', reserva.personas);
    actualizarTxt('popup-mesa', reserva.idMesa || '');
    actualizarTxt('popup-fecha', reserva.fecha);       
    actualizarTxt('popup-hora', horaFormat);           
    actualizarTxt('popup-zona', reserva.zona);
    actualizarTxt('popup-status', reserva.estado.toUpperCase());
    actualizarTxt('popup-tel', reserva.telefono || 'Sin registro');
    actualizarTxt('popup-email', reserva.email || 'Sin registro');
    actualizarTxt('popup-nota', reserva.nota || 'Ninguna');

    const accionesContenedor = document.getElementById('popup-acciones');
    if (accionesContenedor) {
      accionesContenedor.innerHTML = '';
      const crearBoton = (texto: string, clase: string, icono: string, accion: () => void) => {
        const btn = document.createElement('button');
        btn.className = `btn-accion-full ${clase}`;
        btn.innerHTML = `<i class="fas ${icono}"></i> ${texto}`;
        btn.onclick = () => {
          accion();
          const modalDetalle = document.getElementById('modal-detalle-reserva');
          if (modalDetalle) modalDetalle.classList.add('oculto');
        };
        accionesContenedor.appendChild(btn);
      };

      if (reserva.estado === 'reservada' || reserva.estado === 'confirmada') {
        crearBoton('Marcar Llegada', 'btn-llegada', 'fa-bell-concierge', () => {
          reserva.estado = 'ocupada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(reserva);
          this.actualizarVistaCompleta();
        });
        crearBoton('Editar Datos', 'btn-editar-datos', 'fa-pen', () => this.abrirEdicionReserva(reserva));
        crearBoton('Mover Mesa', 'btn-mover', 'fa-arrows-up-down-left-right', () => {
          this.reservaAMoverId = Number(reserva.id);
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
        crearBoton('Cancelar por No-Show (15 min)', 'btn-cancelar', 'fa-trash-alt', () => {
          if (confirm('Deseas cancelar por tolerancia de 15 minutos vencida y notificar por correo?')) {
            reserva.estado = 'cancelada';
            this.guardarReservasEnCache();
            this.guardarReservaEnServidor(reserva, 'noshow');
            this.actualizarVistaCompleta();
          }
        });
      } else if (reserva.estado === 'ocupada') {
        crearBoton('Liberar Mesa', 'btn-liberar', 'fa-broom', () => {
          reserva.estado = 'liberada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(reserva);
          this.actualizarVistaCompleta();
        });
        crearBoton('Mover Mesa', 'btn-mover', 'fa-arrows-up-down-left-right', () => {
          this.reservaAMoverId = Number(reserva.id);
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
        if (!esWalkIn) {
            crearBoton('Deshacer Llegada', 'btn-editar-datos', 'fa-undo', () => {
              reserva.estado = 'reservada';
              this.guardarReservasEnCache();
              this.guardarReservaEnServidor(reserva);
              this.actualizarVistaCompleta();
            });
        }
        crearBoton(esWalkIn ? 'Editar Personas' : 'Editar Datos', 'btn-editar-datos', 'fa-pen', () => this.abrirEdicionReserva(reserva));
      } else if (reserva.estado === 'bloqueada') {
        crearBoton('Desbloquear', 'btn-liberar', 'fa-unlock', () => {
          reserva.estado = 'finalizada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(reserva);
          this.actualizarVistaCompleta();
        });
      } else if (reserva.estado === 'finalizada' || reserva.estado === 'cancelada' || reserva.estado === 'liberada') {
        crearBoton('Restaurar Registro', 'btn-llegada', 'fa-trash-restore', () => {
          reserva.estado = esWalkIn ? 'ocupada' : 'reservada';
          this.guardarReservasEnCache();
          this.guardarReservaEnServidor(reserva);
          this.actualizarVistaCompleta();
        });
      }
    }

    const modalDetalle = document.getElementById('modal-detalle-reserva');
    if (modalDetalle) modalDetalle.classList.remove('oculto');
  }

  // =========================================================================
  // MOTOR DE ANALITICA Y REPORTES - LLORONA COMEDOR
  // =========================================================================
  async cargarChartJS(): Promise<void> {
    return new Promise((resolve) => {
      if ((window as any).Chart) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  actualizarAnalitica(reservasDelDia: any[]) {
    try {
      const reservasFiltradasPorTurno = reservasDelDia.filter(r => {
        if (this.turnoSeleccionado === 'todo') return true;
        if (!r.hora) return true;
        const horaNum = parseInt(r.hora.split(':')[0], 10);
        if (this.turnoSeleccionado === 'comida') return horaNum >= 13 && horaNum < 18;
        if (this.turnoSeleccionado === 'cena') return horaNum >= 18 && horaNum <= 23;
        return true;
      });

      const efectivas = reservasFiltradasPorTurno.filter(r => r.estado !== 'cancelada' && r.estado !== 'bloqueada');
      const canceladas = reservasFiltradasPorTurno.filter(r => r.estado === 'cancelada');

      const totalComensalesPax = efectivas.reduce((sum, r) => sum + parseInt(r.personas || 0, 10), 0);
      const totalMesasOperadas = efectivas.length;

      let totalReservasWeb = 0;
      let totalWalkins = 0;
      efectivas.forEach(r => {
        const nombreLower = (r.nombre || '').toLowerCase();
        if (nombreLower.includes('walk-in') || nombreLower.includes('walkin')) {
          totalWalkins++;
        } else {
          totalReservasWeb++;
        }
      });

      const paxPromedio = totalMesasOperadas > 0 ? (totalComensalesPax / totalMesasOperadas).toFixed(1) : '0.0';

      const horasConteo: { [key: string]: number } = {};
      efectivas.forEach(r => {
        if (r.hora) {
          const horaCorta = r.hora.substring(0, 2) + ':00';
          horasConteo[horaCorta] = (horasConteo[horaCorta] || 0) + parseInt(r.personas || 0, 10);
        }
      });

      let horaPico = '--:--';
      let maxPaxHora = 0;
      Object.keys(horasConteo).forEach(h => {
        if (horasConteo[h] > maxPaxHora) {
          maxPaxHora = horasConteo[h];
          horaPico = h;
        }
      });

      const zonasConteo: { [key: string]: number } = {
        'Piso': 0
      };

      efectivas.forEach(r => {
        if (r.zona) {
          const keyMatch = Object.keys(zonasConteo).find(z => this.limpiarTexto(z) === this.limpiarTexto(r.zona));
          if (keyMatch) {
            zonasConteo[keyMatch] += parseInt(r.personas || 0, 10);
          } else {
            zonasConteo['Piso'] += parseInt(r.personas || 0, 10);
          }
        } else {
          zonasConteo['Piso'] += parseInt(r.personas || 0, 10);
        }
      });

      let zonaTop = 'Piso';

      const totalIntentos = efectivas.length + canceladas.length;
      const tasaEfectividadNum = totalIntentos > 0 ? Math.round((efectivas.length / totalIntentos) * 100) : 100;
      const tasaEfectividadTxt = `${tasaEfectividadNum}%`;

      let totalMesasFisicas = 0;
      Object.values(this.restaurante).forEach((arr: any) => totalMesasFisicas += (Array.isArray(arr) ? arr.length : 0));
      const rotacionMesas = totalMesasFisicas > 0 ? (totalMesasOperadas / totalMesasFisicas).toFixed(1) + 'x' : '0.0x';

      const el = (id: string, val: string | number) => { 
        const e = document.getElementById(id); 
        if (e) e.textContent = val.toString(); 
      };

      el('kpi-total-pax', totalComensalesPax);
      el('kpi-mesas-operadas', totalMesasOperadas);
      el('kpi-ratio-clientes', `${totalReservasWeb} Res / ${totalWalkins} Walk`);
      el('kpi-avg-pax', `${paxPromedio} pax`);
      el('kpi-peak-hour', horaPico !== '--:--' ? `${horaPico} (${maxPaxHora}p)` : '--:--');
      el('kpi-top-zone', zonaTop);
      el('kpi-tasa-efectividad', tasaEfectividadTxt);
      el('kpi-rotacion-mesas', rotacionMesas);

      this.renderizarGraficasAnalitica(efectivas, zonasConteo, totalReservasWeb, totalWalkins);
    } catch (err) {
      console.warn('Error no bloqueante en calculo de analitica Llorona:', err);
    }
  }

  async renderizarGraficasAnalitica(efectivas: any[], datosZonas: any, reservasWeb: number, walkins: number) {
    try {
      const vistaAnalitica = document.getElementById('vista-analitica');
      if (vistaAnalitica && vistaAnalitica.classList.contains('oculto')) {
        return;
      }

      await this.cargarChartJS();
      if (!(window as any).Chart) return;

      this.dibujarGraficaHorarios(efectivas);
      this.dibujarGraficaZonas(datosZonas);
      this.dibujarGraficaOrigen(reservasWeb, walkins);
    } catch (e) {
      console.warn('Error al renderizar graficas Llorona:', e);
    }
  }

  dibujarGraficaHorarios(efectivas: any[]) {
    const canvas = document.getElementById('grafica-horarios') as HTMLCanvasElement;
    if (!canvas) return;

    try {
      const chartExistente = Chart.getChart(canvas);
      if (chartExistente) chartExistente.destroy();
      if (this.chartInstanceHorarios) {
        this.chartInstanceHorarios.destroy();
        this.chartInstanceHorarios = null;
      }
    } catch (e) {}

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const horasRango = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'];
    const comensalesPorHora = horasRango.map(h => {
      const hInt = parseInt(h.split(':')[0], 10);
      return efectivas.reduce((acc, r) => {
        if (!r.hora) return acc;
        const rHora = parseInt(r.hora.split(':')[0], 10);
        return rHora === hInt ? acc + parseInt(r.personas || 0, 10) : acc;
      }, 0);
    });

    try {
      this.chartInstanceHorarios = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: horasRango,
          datasets: [{
            label: 'Comensales (PAX)',
            data: comensalesPorHora,
            backgroundColor: 'rgba(241, 196, 15, 0.75)',
            borderColor: '#f1c40f',
            borderWidth: 2,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 2 } },
            x: { grid: { display: false } }
          }
        }
      });
    } catch (e) {}
  }

  dibujarGraficaZonas(datosZonas: any) {
    const canvas = document.getElementById('grafica-zonas') as HTMLCanvasElement;
    if (!canvas) return;

    try {
      const chartExistente = Chart.getChart(canvas);
      if (chartExistente) chartExistente.destroy();
      if (this.chartInstanceZonas) {
        this.chartInstanceZonas.destroy();
        this.chartInstanceZonas = null;
      }
    } catch (e) {}

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = Object.keys(datosZonas);
    const data = Object.values(datosZonas);
    const colors = ['#f1c40f', '#e67e22', '#3d2314', '#8e44ad'];

    try {
      this.chartInstanceZonas = new Chart(canvas, {
        type: this.tipoGraficaZonas === 'pie' ? 'doughnut' : 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Comensales por Zona',
            data: data,
            backgroundColor: colors,
            borderColor: '#2b170c',
            borderWidth: 2,
            borderRadius: this.tipoGraficaZonas === 'bar' ? 6 : 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { family: 'Segoe UI', size: 11, weight: 'bold' }, color: '#2b170c', padding: 10 }
            }
          },
          scales: this.tipoGraficaZonas === 'bar' ? {
            y: { beginAtZero: true, ticks: { stepSize: 2 } }
          } : {}
        }
      });
    } catch (e) {}
  }

  dibujarGraficaOrigen(reservasWeb: number, walkins: number) {
    const canvas = document.getElementById('grafica-origen') as HTMLCanvasElement;
    if (!canvas) return;

    try {
      const chartExistente = Chart.getChart(canvas);
      if (chartExistente) chartExistente.destroy();
      if (this.chartInstanceOrigen) {
        this.chartInstanceOrigen.destroy();
        this.chartInstanceOrigen = null;
      }
    } catch (e) {}

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      this.chartInstanceOrigen = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: ['Reservas Web', 'Walk-ins (Puerta)'],
          datasets: [{
            data: [reservasWeb, walkins],
            backgroundColor: ['#f1c40f', '#2b170c'],
            borderColor: '#ffffff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { family: 'Segoe UI', size: 11, weight: 'bold' }, color: '#2b170c', padding: 10 }
            }
          }
        }
      });
    } catch (e) {}
  }
}
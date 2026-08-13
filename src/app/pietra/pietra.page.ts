import { Component, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { AuthService } from '../services/auth.service';

Chart.register(...registerables);

declare var io: any;

@Component({
  selector: 'app-pietra',
  templateUrl: './pietra.page.html',
  styleUrls: ['./pietra.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PietraPage implements AfterViewInit, OnDestroy {

  readonly PLANO_DEFECTO: any = {
    'Terraza': [{id:100,c:4},{id:101,c:4},{id:102,c:4},{id:103,c:4},{id:104,c:4},{id:105,c:4},{id:106,c:4}],
    'Nivel bajo': [{id:90,c:4},{id:91,c:4},{id:92,c:4}],
    'Nivel medio': [{id:80,c:4},{id:81,c:4},{id:82,c:4},{id:83,c:4},{id:84,c:4},{id:85,c:4},{id:86,c:4}],
    'Pared lloron': [{id:70,c:4},{id:71,c:4},{id:72,c:4},{id:73,c:4},{id:74,c:4},{id:75,c:4},{id:76,c:4}]
  };

  disenoMaestro: any = null;
  restaurante: any = {};

  todasLasReservas: any[] = [];
  
  fechaSeleccionada: string = this.obtenerFechaActualLocal();
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
  resolverTipoFusion: ((esPermanente: boolean | null) => void) | null = null;

  readonly BASE_URL = 'http://localhost:3000';

  constructor(private authService: AuthService, private ngZone: NgZone) {
    this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
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

  cargarLayoutPorFecha(fecha: string) {
    const keyFecha = `pietra_layout_${fecha}`;
    const layoutGuardado = localStorage.getItem(keyFecha);
    let disenoBase = this.disenoMaestro || this.PLANO_DEFECTO;
    
    const disenoProgramado = localStorage.getItem('pietra_diseno_permanente');
    if (disenoProgramado) {
      try {
        const programacion = JSON.parse(disenoProgramado);
        if (programacion.desde <= fecha && programacion.layout) {
          disenoBase = programacion.layout;
        }
      } catch (e) {}
    }

    if (layoutGuardado) {
      try {
        this.restaurante = JSON.parse(layoutGuardado);
      } catch(e) {
        this.restaurante = JSON.parse(JSON.stringify(disenoBase));
      }
    } else {
      this.restaurante = JSON.parse(JSON.stringify(disenoBase));
    }
    this.asegurarCoordenadasGrid();
  }

  guardarLayoutFechaActual() {
    const keyFecha = `pietra_layout_${this.fechaSeleccionada}`;
    localStorage.setItem(keyFecha, JSON.stringify(this.restaurante));
  }

  async guardarDisenoPermanente() {
    const layoutPermanente = JSON.parse(JSON.stringify(this.restaurante));
    localStorage.setItem('pietra_diseno_permanente', JSON.stringify({ desde: this.fechaSeleccionada, layout: layoutPermanente }));
    
    const response = await fetch(`${this.BASE_URL}/api/pietra/diseno`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layoutPermanente)
    });
    if (!response.ok) throw new Error('No se pudo guardar el diseño permanente en el servidor');

    this.disenoMaestro = JSON.parse(JSON.stringify(layoutPermanente));
    this.guardarLayoutFechaActual();

    const prefijo = 'pietra_layout_';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefijo) && key.substring(prefijo.length) >= this.fechaSeleccionada) {
        localStorage.setItem(key, JSON.stringify(layoutPermanente));
      }
    }
  }

  async guardarReservaEnServidor(reserva: any, tipoCorreo?: string) {
    try {
      const payload = { ...reserva };
      if (tipoCorreo) {
        payload.tipoCorreo = tipoCorreo;
      }
      
      const response = await fetch(`${this.BASE_URL}/api/pietra/reservas`, {
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
      console.log('Sincronizado con MySQL:', data.message);
    } catch (e) {
      alert(`No se guardó la operación en Pietra Cucina. ${e instanceof Error ? e.message : 'Revisa la conexión con el servidor.'}`);
      console.error('❌ Error de conexión al sincronizar con MySQL:', e);
    }
  }

  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/pietra/diseno`);
      const data = await resp.json();
      const tieneMesas = Object.values(data).some((arr: any) => arr && arr.length > 0);
      if (tieneMesas) {
        const layoutLimpio: any = {};
        for (const z in data) {
          layoutLimpio[z] = [];
          data[z].forEach((m: any) => {
            if (m.isMerged && m.originalTables) {
              m.originalTables.forEach((orig: any) => layoutLimpio[z].push(orig));
            } else {
              layoutLimpio[z].push(m);
            }
          });
        }
        this.disenoMaestro = layoutLimpio;
      }
    } catch (e) {
      this.disenoMaestro = JSON.parse(JSON.stringify(this.PLANO_DEFECTO));
    }
    this.cargarLayoutPorFecha(this.fechaSeleccionada);
    this.dibujarMesas(this.zonaActiva);
  }

  async guardarDisenoEnServidor() {
    try {
      await this.guardarDisenoPermanente();
      console.log('📐 Nuevo diseño de mesas guardado PERMANENTEMENTE para todos los días en Pietra Cucina');
      alert('✅ ¡Nueva distribución de mesas guardada para TODOS los días con éxito!');
    } catch (e) {
      console.error('❌ Error al guardar diseño permanente Pietra Cucina:', e);
      this.disenoMaestro = JSON.parse(JSON.stringify(this.restaurante));
      this.guardarLayoutFechaActual();
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.inicializarSistema();
    }, 150);
  }

  ngOnDestroy() {
    if (this.socket) this.socket.disconnect();
    if (this.chartInstance) this.chartInstance.destroy();
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

    document.addEventListener('click', (e: any) => {
      if (this.modoEdicion && !e.target.closest('.mesa') && !e.target.closest('.editor-toolbar-container')) {
        this.mesaSeleccionadaEdicion = null;
        this.dibujarMesas(this.zonaActiva);
      }
    });

    try {
      this.socket = io(this.BASE_URL);
      this.socket.emit('join_restaurante', 1);

      // ⚡ NgZone + Sincronización en tiempo real para Pietra Cucina
      this.socket.on('actualizar_pietra', (r: any[]) => { 
        this.ngZone.run(() => {
          this.todasLasReservas = this.limpiarNombresZonasViejas(r); 
          this.actualizarVistaCompleta(); 
        });
      });
    } catch(e) {}

    await this.cargarDisenoMesas();
    this.cargarReservaciones();
  }

  limpiarNombresZonasViejas(datos: any[]) {
    return datos.map(r => {
      if (r.zona) {
        const z = r.zona.toLowerCase().replace(/\s/g, '');
        if (z === 'salon' || z === 'piso') r.zona = 'Nivel medio';
        if (z === 'plantabaja' || z === 'jardin') r.zona = 'Nivel bajo';
        if (z === 'cava') r.zona = 'Terraza';
      }
      return r;
    });
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
            }, 50);
          }
        }
      });
    });
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      if(confirm("¿Cerrar sesión de ReserveStack?")) console.log("Saliendo...");
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
        this.zonaActiva = elementBtn.dataset['zona'] || 'Terraza';
        this.dibujarMesas(this.zonaActiva);
      });
    });
  }

  configurarOpcionesEditor() {
    document.getElementById('btn-add-mesa')?.addEventListener('click', () => {
      const numMesa = prompt('Escribe el número de la nueva mesa:');
      if (!numMesa) return;
      const numId = parseInt(numMesa, 10);
      if (isNaN(numId)) { alert('Número de mesa no válido.'); return; }

      let existe = false;
      for (const z in this.restaurante) {
        if (this.restaurante[z].some((m: any) => m.id === numId)) { existe = true; break; }
      }
      if (existe) { alert('El número de mesa ya existe.'); return; }

      const capMesa = prompt('Escribe la capacidad de comensales (PAX) para la Mesa ' + numId + ':', '4');
      const capNum = capMesa ? parseInt(capMesa, 10) : 4;
      const finalCap = (!isNaN(capNum) && capNum > 0 && capNum <= 50) ? capNum : 4;

      const nuevaMesaObj = { id: numId, c: finalCap, x: 45, y: 40 };

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

    document.getElementById('btn-save-diseno')?.addEventListener('click', async () => {
      await this.guardarDisenoEnServidor(); 
      this.modoEdicion = false;
      this.modoCombinar = false;
      this.mesaACombinar = null;
      this.mesaSeleccionadaEdicion = null;
      document.getElementById('toolbar-editor')?.classList.add('oculto');
      document.getElementById('aviso-combinar')?.classList.add('oculto');
      this.actualizarVistaCompleta();
    });

    document.getElementById('btn-cancel-edicion')?.addEventListener('click', () => {
      if (confirm('¿Descartar los cambios de distribución de mesa?')) {
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
      const resp = await fetch(`${this.BASE_URL}/api/pietra/reservas`);
      const data = await resp.json();
      this.todasLasReservas = this.limpiarNombresZonasViejas(data);
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
          let btnUnlinkHtml = mesa.isMerged ? `<span class="btn-unlink-mesa" title="Separar y restaurar mesas originales"><i class="fas fa-unlink"></i></span>` : '';
          controlesHtml = `
            <div class="controles-edicion-mesa">
              ${btnUnlinkHtml}
              <span class="btn-edit-pax" title="Editar capacidad"><i class="fas fa-pencil-alt"></i></span>
              <span class="btn-delete-mesa" title="Eliminar mesa">&times;</span>
            </div>
          `;
        }

        if (this.modoCombinar && this.mesaACombinar && this.mesaACombinar.id === mesa.id) {
          divMesa.style.border = '3.5px solid #8e44ad';
          divMesa.style.boxShadow = '0 0 20px rgba(142, 68, 173, 0.8)';
        }

        const textoNumero = mesa.isMerged ? mesa.displayId : mesa.id;
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
            const nuevaCap = prompt(`Cambiar capacidad para la Mesa ${textoNumero} (Mínimo 1, Máximo 50):`, mesa.c.toString());
            if (nuevaCap) {
              let capNum = parseInt(nuevaCap, 10);
              if (!isNaN(capNum) && capNum > 0) {
                if (capNum > 50) capNum = 50; 
                mesa.c = capNum;
                this.guardarLayoutFechaActual();
                this.dibujarMesas(this.zonaActiva);
              }
            }
          });

          divMesa.querySelector('.btn-unlink-mesa')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.desvincularMesa(mesa);
          });

          divMesa.querySelector('.btn-delete-mesa')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`¿Eliminar la Mesa ${textoNumero}?`)) {
              this.restaurante[zona] = this.restaurante[zona].filter((m: any) => m.id !== mesa.id);
              if (this.disenoMaestro && this.disenoMaestro[zona]) {
                this.disenoMaestro[zona] = this.disenoMaestro[zona].filter((m: any) => m.id !== mesa.id);
              }
              this.mesaSeleccionadaEdicion = null;
              this.guardarLayoutFechaActual();
              this.dibujarMesas(this.zonaActiva);
            }
          });
        }
      } else {
        const textoNumero = mesa.isMerged ? mesa.displayId : mesa.id;
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
      originalTables: [
        JSON.parse(JSON.stringify(mesaA)),
        JSON.parse(JSON.stringify(mesaB))
      ]
    };

    this.restaurante[zona] = this.restaurante[zona].filter((m: any) => m.id !== mesaA.id && m.id !== mesaB.id);
    this.restaurante[zona].push(mesaFusionada);
    if (esPermanente) {
      try {
        await this.guardarDisenoPermanente();
      } catch (error) {
        this.disenoMaestro = JSON.parse(JSON.stringify(this.restaurante));
        console.warn('La fusión permanente no se pudo sincronizar con el servidor.', error);
      }
    }
    this.guardarLayoutFechaActual();
    alert(`Mesas fusionadas con éxito como Mesa ${mesaFusionada.displayId} exclusivamente para la fecha ${this.fechaSeleccionada}.`);
    this.dibujarMesas(zona);
  }

  desvincularMesa(mesa: any) {
    if (!mesa.isMerged || !mesa.originalTables) return;
    
    if (confirm(`¿Desvincular la Mesa ${mesa.displayId} y restaurar las dos mesas individuales originales?`)) {
      const zona = this.zonaActiva;
      mesa.originalTables.forEach((orig: any) => { this.restaurante[zona].push(orig); });
      this.restaurante[zona] = this.restaurante[zona].filter((m: any) => m.id !== mesa.id);
      this.mesaSeleccionadaEdicion = null;
      
      this.guardarLayoutFechaActual();
      alert('Mesas separadas de manera exitosa.');
      this.dibujarMesas(zona);
    }
  }

  reservaPerteneceAMesa(res: any, mesa: any): boolean {
    if (!res || !res.idMesa) return false;
    const resIdStr = res.idMesa.toString().trim();
    const mesaIdStr = mesa.id.toString().trim();

    if (resIdStr === mesaIdStr) return true;

    if (mesa.isMerged) {
      if (mesa.displayId && resIdStr === mesa.displayId.toString().trim()) return true;

      if (mesa.displayId) {
        const subIds = mesa.displayId.split('+').map((s: string) => s.trim());
        if (subIds.includes(resIdStr)) return true;
      }

      if (mesa.originalTables && Array.isArray(mesa.originalTables)) {
        const tieneSubId = mesa.originalTables.some((orig: any) => orig.id.toString().trim() === resIdStr);
        if (tieneSubId) return true;
      }
    }

    return false;
  }

  actualizarEstadoMesas(reservas: any[]) {
    if (this.modoEdicion) return;

    document.querySelectorAll('.mesa').forEach((m) => {
      const mesaEl = m as HTMLElement;
      const idMesa = parseInt(mesaEl.id.split('-')[1], 10);
      let mesaFisica = null;
      for(const z in this.restaurante) {
        const found = this.restaurante[z].find((x:any) => x.id === idMesa);
        if(found) mesaFisica = found;
      }
      
      if (!mesaFisica) return;
      let claseDoble = '';
      if (mesaFisica.isMerged) claseDoble = mesaFisica.isVertical ? 'doble-alto' : 'doble-ancho';

      mesaEl.className = `mesa libre ${claseDoble} ${this.modoMover ? 'seleccionable' : ''}`;
      mesaEl.removeAttribute('data-info');
      mesaEl.style.background = ''; 
      
      const numMostrado = mesaFisica.isMerged ? mesaFisica.displayId : mesaFisica.id;
      mesaEl.innerHTML = `<span class="mesa-numero">${numMostrado}</span><span class="mesa-capacidad">(${mesaFisica.c}p)</span>`;
    });

    const mesasAgrupadas: any = {};
    
    reservas.forEach(res => {
      if (res.idMesa && res.estado !== 'finalizada' && res.estado !== 'cancelada' && res.estado !== 'liberada') {
        const mesasDeZona = this.restaurante[this.zonaActiva] || [];
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

      elemento.classList.remove('libre', 'seleccionable');
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
        elemento.innerHTML = `<span class="res-nombre">Múltiples</span><span class="res-pax">${totalPax}p</span>`;
      }
    });
  }

  dibujarListaDeReservas(reservas: any[]) {
    const lista = document.getElementById('lista-reservas-sidebar');
    if(!lista) return;
    lista.innerHTML = '';
    const activas = reservas.filter(x => x.estado !== 'finalizada' && x.estado !== 'cancelada' && x.estado !== 'liberada');
    const finalizadas = reservas.filter(x => x.estado === 'finalizada' || x.estado === 'cancelada' || x.estado === 'liberada');

    if (activas.length === 0 && finalizadas.length === 0) {
      lista.innerHTML = '<p style="color:#7f8c8d; padding:20px; text-align:center;">No hay reservas hoy.</p>';
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
          ${res.personas}p • Mesa ${res.idMesa}
          <i class="fas fa-info-circle icono-mas-info" style="margin-left: 8px; color: rgba(255,255,255,0.45); cursor: pointer;"></i>
        </div>`;
      item.addEventListener('click', () => this.mostrarDetalleReserva(res));
      lista.appendChild(item);
    });

    if (finalizadas.length > 0) {
       const separador = document.createElement('div');
       separador.innerHTML = '<p style="color:#7f8c8d; font-size:10px; text-align:center; margin: 15px 0 5px 0; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-weight:bold;">HISTORIAL (CANCELADAS / LIBERADAS)</p>';
       lista.appendChild(separador);

       finalizadas.forEach(res => {
          const item = document.createElement('div');
          item.className = 'reserva-item-sidebar';
          if (res.estado === 'cancelada') {
            item.style.borderLeftColor = '#c0392b'; item.style.backgroundColor = 'rgba(192, 57, 43, 0.15)'; item.style.color = '#ff9f9f';
          } else if (res.estado === 'liberada') {
            item.style.borderLeftColor = '#f1c40f'; item.style.backgroundColor = 'rgba(241, 196, 15, 0.15)'; item.style.color = '#fff3a3';
          } else {
            item.style.borderLeftColor = '#7f8c8d'; item.style.opacity = '0.5'; 
          }
          item.innerHTML = `
            <div class="reserva-info-left"><strong style="text-decoration: line-through;">${res.nombre}</strong></div>
            <div class="reserva-info-right">
              ${res.personas}p • Mesa ${res.idMesa}
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
    const bloqueadas = reservasDelDia.filter(r => r.estado === 'bloqueada').length;
    
    let paxAcumulado = 0;
    reservasDelDia.forEach(r => {
      if (r.estado === 'ocupada') {
        paxAcumulado += Number(r.personas || 0); 
      }
    });

    let totalMesasFisicas = 0;
    Object.values(this.restaurante).forEach((zona: any) => totalMesasFisicas += zona.length);
    const libres = totalMesasFisicas - (ocupadas + reservadas + bloqueadas);
    const porcentaje = totalMesasFisicas > 0 ? Math.round((ocupadas / totalMesasFisicas) * 100) : 0;
    const totalesDia = reservasDelDia.filter(r => r.estado !== 'bloqueada').length;

    const act = (id: string, val: string | number) => { const el = document.getElementById(id); if(el) el.textContent = val.toString(); };
    act('stats-ocupadas', ocupadas); 
    act('stats-reservadas', reservadas); 
    act('stats-libres', libres); 
    act('stats-bloqueadas', bloqueadas); 
    act('stats-pax-total', paxAcumulado); 
    act('stats-porcentaje-ocupacion', `${porcentaje}%`);
    act('stats-totales-dia', totalesDia); 
  }

  ejecutarMover(idMesaNueva: any, zonaNueva: any) {
    this.modoMover = false;
    this.mesaSeleccionadaTemp = null;

    // 1. Ocultar el aviso morado de la pantalla
    const avisoMover = document.getElementById('aviso-mover');
    if (avisoMover) avisoMover.classList.add('oculto'); // ✅ Cambiado remove por add

    // 2. Buscar y actualizar la reserva
    const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
    if (res) {
        res.idMesa = idMesaNueva.toString();
        res.zona = zonaNueva;
        
        delete res.isNewRecord;
        delete res.tipoCorreo;
        
        this.guardarReservaEnServidor(res); 
    }

    this.reservaAMoverId = null; // Limpiar ID de reserva a mover
    this.actualizarVistaCompleta();
  }

  async gestionarClickMesa(evento: any, mesa: any, zona: string) {
    evento.stopPropagation(); 

    if (this.modoEdicion && this.modoCombinar) {
      if (!this.mesaACombinar) {
        this.mesaACombinar = mesa;
        alert(`Mesa ${mesa.isMerged ? mesa.displayId : mesa.id} seleccionada. Ahora haz clic en la segunda mesa para fusionarlas.`);
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
    const idMesa = mesa.id;

    if (this.modoMover) {
      if(confirm(`¿Mover reserva a Mesa ${idMesa}?`)) {
          this.ejecutarMover(idMesa, zona);
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

    const numMesa = mesa.isMerged ? mesa.displayId : mesa.id;
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
        this.crearRegistroRapido(mesa.id, this.zonaActiva, 'Mesa Bloqueada', 'bloqueada', '0');
      });
    } else if (arrReservas.length === 1) {
      if (singleInfoBox) singleInfoBox.style.display = 'grid';
      const resTemp = arrReservas[0];
      const realRes = this.todasLasReservas.find(r => Number(r.id) === Number(resTemp.id)) || resTemp;
      this.reservaAMoverId = Number(realRes.id);

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
          this.guardarReservaEnServidor(realRes); // Sin correo de llegada
          this.actualizarVistaCompleta();
        });
        crearBotonPop('Mover Mesa', 'btn-mover', 'fa-arrows-alt', () => {
          popover.classList.add('oculto');
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
        // 📧 ENVÍA CORREO DE CANCELACIÓN AL CANCELAR DESDE EL POPOVER
        crearBotonPop('Cancelar', 'btn-cancelar', 'fa-trash-alt', () => {
          popover.classList.add('oculto');
          if (confirm('¿Cancelar la reserva y notificar al cliente por correo?')) {
            realRes.estado = 'cancelada';
            this.guardarReservaEnServidor(realRes, 'noshow');
            this.actualizarVistaCompleta();
          }
        });
      } else if (realRes.estado === 'ocupada') {
        // 🛡️ MESA OCUPADA: Se oculta el botón CANCELAR
        crearBotonPop('Ver Info', 'btn-info', 'fa-info-circle', () => {
          popover.classList.add('oculto');
          this.mostrarDetalleReserva(realRes);
        });
        crearBotonPop('Liberar Mesa', 'btn-liberar', 'fa-broom', () => {
          popover.classList.add('oculto');
          realRes.estado = 'liberada';
          this.guardarReservaEnServidor(realRes);
          this.actualizarVistaCompleta();
        });
        crearBotonPop('Mover Mesa', 'btn-mover', 'fa-arrows-alt', () => {
          popover.classList.add('oculto');
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
      } else if (realRes.estado === 'bloqueada') {
        crearBotonPop('Desbloquear', 'btn-llegada', 'fa-unlock', () => {
          popover.classList.add('oculto');
          realRes.estado = 'finalizada';
          this.guardarReservaEnServidor(realRes);
          this.actualizarVistaCompleta();
        });
      }
    } else {
      if (singleInfoBox) singleInfoBox.style.display = 'none';
      const notaBox = document.getElementById('pop-nota-container');
      if (notaBox) notaBox.classList.add('oculto');

      if (statusBadge) {
        statusBadge.textContent = `MÚLTIPLES (${arrReservas.length})`;
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

        // 🛡️ SI ESTÁ OCUPADA O BLOQUEADA, NO SE MUESTRA BOTÓN CANCELAR
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
          this.guardarReservaEnServidor(realItem); // Sin correo de llegada
          this.actualizarVistaCompleta();
        });

        cardItem.querySelector('.btn-liberar')?.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          realItem.estado = 'liberada';
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
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });

        // 📧 ENVÍA CORREO DE CANCELACIÓN AL CANCELAR DESDE MÚLTIPLES
        cardItem.querySelector('.btn-cancelar')?.addEventListener('click', (e) => {
          e.stopPropagation();
          popover.classList.add('oculto');
          if (confirm(`¿Cancelar reserva de ${realItem.nombre} y enviar correo?`)) {
            realItem.estado = 'cancelada';
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

  crearRegistroRapido(idMesa: number, zona: string, nombre: string, estado: string, pax: string = "2") {
    const nuevo = {
      id: Date.now(),
      idRestaurante: 1,
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
    this.guardarReservaEnServidor(nuevo); 
    this.actualizarVistaCompleta();
  }

  cambiarEstadoReserva(idReserva: number, nuevoEstado: string) {
    const res = this.todasLasReservas.find(r => Number(r.id) === Number(idReserva));
    if (res) {
      res.estado = nuevoEstado;
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
        if (h2) h2.textContent = 'Walk-in Rápido';
        const btn = document.getElementById('btn-confirmar-walkin');
        if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Ocupar Mesa';
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

    document.querySelectorAll('.modal-close-btn, #btn-cancelar-mover, #close-nueva-reserva, #lista-mesa-close-btn, #close-walkin, #btn-close-popover').forEach(btn => {
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
              this.guardarReservaEnServidor(resObj); 
              alert('✅ ¡Cantidad de comensales actualizada!');
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
    if (selectZona) selectZona.value = zonaPredeterminada;
    
    this.actualizarSelectMesas(zonaPredeterminada, mesaPreseleccionada);
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
      if (selectZona && reserva.zona) {
        selectZona.value = reserva.zona;
        this.actualizarSelectMesas(reserva.zona, reserva.idMesa);
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
    const mesas = this.restaurante[zona] || [];

    mesas.forEach((m: any) => {
      const labelMesa = m.isMerged ? `Mesa ${m.displayId} (${m.c} pers)` : `Mesa ${m.id} (${m.c} pers)`;
      selectMesa.innerHTML += `<option value="${m.id}">${labelMesa}</option>`;
    });

    if (mesaPreseleccionada !== undefined && mesaPreseleccionada !== null) {
      const idBuscado = mesaPreseleccionada.toString().trim();
      const encontrada = mesas.find((m: any) => 
        m.id.toString().trim() === idBuscado || (m.isMerged && m.displayId && m.displayId.toString().trim() === idBuscado)
      );
      if (encontrada) {
        selectMesa.value = encontrada.id.toString();
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
        r.idMesa === idMesaElegida && 
        r.estado !== 'finalizada' && r.estado !== 'cancelada' && r.estado !== 'liberada' && 
        Number(r.id) !== Number(this.idReservaAEditar) 
      );
      
      const hayBloqueo = choques.some(r => r.estado === 'bloqueada');
      if (hayBloqueo) {
          alert('⚠️ ACCIÓN DENEGADA: La mesa seleccionada se encuentra BLOQUEADA.');
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
          const confirmar = confirm('⚠️ ATENCIÓN: Ya hay una reserva en esa mesa con menos de 1 hora de diferencia. ¿Deseas forzar este Double-Booking?');
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
          this.guardarReservaEnServidor(resObj); 
        }
        this.idReservaAEditar = null;
      } else {
        const nuevaReserva: any = {
          id: Date.now(), 
          idRestaurante: 1,
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
        this.guardarReservaEnServidor(nuevaReserva, 'crear'); 
      }

      this.actualizarVistaCompleta();

      document.querySelectorAll('.modal-overlay, .popover-overlay').forEach(modal => {
        modal.classList.add('oculto');
      });

      form.reset();

      setTimeout(() => {
        if (esEdicion) {
          alert('✅ ¡Datos de la reserva actualizados con éxito!');
        } else {
          alert('✅ ¡Nueva reserva guardada con éxito!');
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
    actualizarTxt('popup-mesa', reserva.idMesa);
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
          this.guardarReservaEnServidor(reserva); // Sin correo de llegada
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
        // 📧 ENVÍA CORREO DE CANCELACIÓN AL CANCELAR DESDE EL DETALLE
        crearBoton('Cancelar por No-Show (15 min)', 'btn-cancelar', 'fa-trash-alt', () => {
          if (confirm('¿Cancelar por tolerancia de 15 minutos vencida y notificar por correo?')) {
            reserva.estado = 'cancelada';
            this.guardarReservaEnServidor(reserva, 'noshow');
            this.actualizarVistaCompleta();
          }
        });
      } else if (reserva.estado === 'ocupada') {
        // 🛡️ MESA OCUPADA: Se oculta el botón CANCELAR
        crearBoton('Liberar Mesa', 'btn-liberar', 'fa-broom', () => {
          reserva.estado = 'liberada';
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
              this.guardarReservaEnServidor(reserva);
              this.actualizarVistaCompleta();
            });
        }
        crearBoton(esWalkIn ? 'Editar Personas' : 'Editar Datos', 'btn-editar-datos', 'fa-pen', () => this.abrirEdicionReserva(reserva));
      } else if (reserva.estado === 'bloqueada') {
        crearBoton('Desbloquear', 'btn-liberar', 'fa-unlock', () => {
          reserva.estado = 'finalizada';
          this.guardarReservaEnServidor(reserva);
          this.actualizarVistaCompleta();
        });
      } else if (reserva.estado === 'finalizada' || reserva.estado === 'cancelada' || reserva.estado === 'liberada') {
        crearBoton('Restaurar Registro', 'btn-llegada', 'fa-trash-restore', () => {
          reserva.estado = esWalkIn ? 'ocupada' : 'reservada';
          this.guardarReservaEnServidor(reserva);
          this.actualizarVistaCompleta();
        });
      }
    }

    const modalDetalle = document.getElementById('modal-detalle-reserva');
    if (modalDetalle) modalDetalle.classList.remove('oculto');
  }

  // 📊 MÉTODOS DE ANALÍTICA Y GRÁFICAS PIETRA CUCINA
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
    const activas = reservasDelDia.filter(r => r.estado !== 'finalizada' && r.estado !== 'cancelada' && r.estado !== 'liberada');
    const totalMesas = activas.length;
    const totalPax = activas.reduce((sum, r) => sum + parseInt(r.personas || 0), 0);
    const paxPromedio = totalMesas > 0 ? (totalPax / totalMesas).toFixed(1) : '0.0';

    const horasConteo: { [key: string]: number } = {};
    activas.forEach(r => {
      if (r.hora) {
        const horaCorta = r.hora.substring(0, 2) + ':00';
        horasConteo[horaCorta] = (horasConteo[horaCorta] || 0) + 1;
      }
    });

    let horaPico = '--:--';
    let maxHoraCount = 0;
    Object.keys(horasConteo).forEach(h => {
      if (horasConteo[h] > maxHoraCount) {
        maxHoraCount = horasConteo[h];
        horaPico = h;
      }
    });

    const zonasConteo: { [key: string]: number } = {
      'Terraza': 0,
      'Nivel bajo': 0,
      'Nivel medio': 0,
      'Pared lloron': 0
    };

    activas.forEach(r => {
      if (r.zona && zonasConteo[r.zona] !== undefined) {
        zonasConteo[r.zona] += 1;
      }
    });

    let zonaTop = '--';
    let maxZonaCount = 0;
    Object.keys(zonasConteo).forEach(z => {
      if (zonasConteo[z] > maxZonaCount) {
        maxZonaCount = zonasConteo[z];
        zonaTop = z;
      }
    });

    const el = (id: string, val: string) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('data-avg-pax', paxPromedio);
    el('data-total-reservas', totalMesas.toString());
    el('data-peak-hour', horaPico);
    el('data-top-zone', zonaTop);

    this.dibujarGrafica(zonasConteo);
  }

  async dibujarGrafica(datosZonas: any) {
    await this.cargarChartJS();

    const canvas = document.getElementById('grafica-zonas') as HTMLCanvasElement;
    if (!canvas || !(window as any).Chart) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = Object.keys(datosZonas);
    const data = Object.values(datosZonas);

    const colors = ['#d4af37', '#2c3e50', '#e67e22', '#8e44ad'];

    this.chartInstance = new Chart(canvas, {
      type: this.tipoGrafica === 'pie' ? 'doughnut' : 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Reservas por Zona',
          data: data,
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2,
          borderRadius: this.tipoGrafica === 'bar' ? 6 : 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { family: 'Segoe UI', size: 12, weight: 'bold' },
              color: '#2c3e50',
              padding: 15
            }
          }
        },
        scales: this.tipoGrafica === 'bar' ? {
          y: { beginAtZero: true, ticks: { stepSize: 1 } }
        } : {}
      }
    });
  }
}
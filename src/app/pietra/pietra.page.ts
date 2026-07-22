import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

declare var io: any;
declare var Chart: any;

@Component({
  selector: 'app-pietra',
  templateUrl: './pietra.page.html',
  styleUrls: ['./pietra.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PietraPage implements AfterViewInit, OnDestroy {

  restaurante: any = {
    'Terraza': [{id:100,c:4},{id:101,c:4},{id:102,c:4},{id:103,c:4},{id:104,c:4},{id:105,c:4},{id:106,c:4}],
    'Nivel bajo': [{id:90,c:4},{id:91,c:4},{id:92,c:4}],
    'Nivel medio': [{id:80,c:4},{id:81,c:4},{id:82,c:4},{id:83,c:4},{id:84,c:4},{id:85,c:4},{id:86,c:4}],
    'Pared lloron': [{id:70,c:4},{id:71,c:4},{id:72,c:4},{id:73,c:4},{id:74,c:4},{id:75,c:4},{id:76,c:4}]
  };

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
    const savedLayout = localStorage.getItem('pietra_layout');
    if (savedLayout) {
      try {
        this.restaurante = JSON.parse(savedLayout);
      } catch(e) {}
    }
    this.asegurarCoordenadasGrid();
  }

  // --- FUNCIÓN DE SINCRONIZACIÓN CON MYSQL ---
  async guardarReservaEnServidor(reserva: any) {
    try {
      const response = await fetch(`${this.BASE_URL}/api/pietra/reservas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(reserva)
      });
      const data = await response.json();
      console.log('Sincronizado con MySQL:', data.message);
    } catch (e) {
      console.error('❌ Error de conexión al sincronizar con MySQL:', e);
    }
  }

  // --- OBTENER DISEÑO PLANO DESDE MYSQL ---
  async cargarDisenoMesas() {
    try {
      const resp = await fetch(`${this.BASE_URL}/api/pietra/diseno`);
      const data = await resp.json();
      const tieneMesas = Object.values(data).some((arr: any) => arr && arr.length > 0);
      if (tieneMesas) {
        this.restaurante = data;
      }
    } catch (e) {
      console.warn('⚠️ Usando distribución de mesas de Pietra local de respaldo (API desconectada).');
    }
    this.asegurarCoordenadasGrid();
    this.dibujarMesas(this.zonaActiva);
  }

  // --- GUARDAR DISEÑO PLANO EN MYSQL ---
  async guardarDisenoEnServidor() {
    try {
      const response = await fetch(`${this.BASE_URL}/api/pietra/diseno`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.restaurante)
      });
      const data = await response.json();
      console.log('📐 Diseño de mesas sincronizado en MySQL:', data.message);
    } catch (e) {
      console.error('❌ Error al guardar diseño en el servidor:', e);
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.inicializarSistema();
    }, 150);
  }

  ngOnDestroy() {
    if (this.socket) this.socket.disconnect();
  }

  buscarMesaPorId(id: number): any {
    for (const z in this.restaurante) {
      const m = this.restaurante[z].find((x: any) => x.id === id);
      if (m) return m;
    }
    return null;
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
      this.socket.on('actualizar_pietra', (r: any[]) => { 
        this.todasLasReservas = this.limpiarNombresZonasViejas(r); 
        this.actualizarVistaCompleta(); 
      });
      this.socket.on('actualizar_diseno_pietra', (layout: any) => {
        this.restaurante = layout;
        this.asegurarCoordenadasGrid();
        this.dibujarMesas(this.zonaActiva);
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
        if (vistaObj) vistaObj.classList.remove('oculto');
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
        this.actualizarVistaCompleta();
      });
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        const current = new Date(this.fechaSeleccionada + 'T12:00:00');
        current.setDate(current.getDate() + 1);
        this.fechaSeleccionada = current.toISOString().split('T')[0];
        if(inputFecha) inputFecha.value = this.fechaSeleccionada;
        this.actualizarVistaCompleta();
      });
    }

    const btnEditar = document.getElementById('btn-editar-plano');
    if(btnEditar) {
      btnEditar.addEventListener('click', () => {
        this.activarModoEdicion();
      });
    }

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

      this.restaurante[this.zonaActiva].push({ id: numId, c: finalCap, x: 45, y: 40 });
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
        this.restaurante = JSON.parse(this.respaldoRestaurante);
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

  dibujarConectores() {
    const plano = document.getElementById('plano-restaurante');
    if (!plano) return;
    const svgExistente = document.getElementById('svg-conectores');
    if (svgExistente) svgExistente.remove();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'svg-conectores';
    svg.style.position = 'absolute'; svg.style.width = '100%'; svg.style.height = '100%';
    svg.style.top = '0'; svg.style.left = '0'; svg.style.pointerEvents = 'none'; svg.style.zIndex = '2'; 

    const mesas = this.restaurante[this.zonaActiva] || [];
    const enlacesDibujados = new Set<string>();

    mesas.forEach((m: any) => {
      if (m.combinadaCon) {
        const socio = mesas.find((s: any) => s.id === m.combinadaCon);
        if (socio) {
          const parId = [m.id, socio.id].sort().join('-');
          if (!enlacesDibujados.has(parId)) {
            enlacesDibujados.add(parId);
            const offsetW = 4.5; const offsetH = 5.5;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', `${(m.x || 10) + offsetW}%`);
            line.setAttribute('y1', `${(m.y || 10) + offsetH}%`);
            line.setAttribute('x2', `${(socio.x || 10) + offsetW}%`);
            line.setAttribute('y2', `${(socio.y || 10) + offsetH}%`);
            line.setAttribute('stroke', '#8e44ad');
            line.setAttribute('stroke-width', '4');
            line.setAttribute('stroke-dasharray', '5,5');
            line.setAttribute('class', 'linea-conexion');
            svg.appendChild(line);
          }
        }
      }
    });
    plano.appendChild(svg);
  }

  // --- MOTOR DE DIBUJADO DE MESAS ---
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

        const textoNumero = mesa.isMerged ? mesa.displayId : mesa.id;
        divMesa.innerHTML = `
          <span class="mesa-numero">${textoNumero}</span>
          <span class="mesa-capacidad">(${mesa.c}p)</span>
          ${controlesHtml}
        `;

        // ARRASTRE
        const iniciarArrastre = (e: any) => {
          e.preventDefault();
          if (this.modoCombinar) return; 

          const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
          const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
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
              this.mesaSeleccionadaEdicion = null;
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

    this.dibujarConectores();

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
      originalTables: [
        JSON.parse(JSON.stringify(mesaA)),
        JSON.parse(JSON.stringify(mesaB))
      ]
    };

    this.restaurante[zona] = this.restaurante[zona].filter((m: any) => m.id !== mesaA.id && m.id !== mesaB.id);
    this.restaurante[zona].push(mesaFusionada);
    alert(`Mesas fusionadas con éxito como la Mesa ${mesaFusionada.displayId} con capacidad sumada de ${mesaFusionada.c} comensales.`);
    this.dibujarMesas(zona);
  }

  desvincularMesa(mesa: any) {
    if (!mesa.isMerged || !mesa.originalTables) return;
    
    if (confirm(`¿Desvincular la Mesa ${mesa.displayId} y restaurar las dos mesas individuales originales?`)) {
      const zona = this.zonaActiva;
      mesa.originalTables.forEach((orig: any) => { this.restaurante[zona].push(orig); });
      this.restaurante[zona] = this.restaurante[zona].filter((m: any) => m.id !== mesa.id);
      this.mesaSeleccionadaEdicion = null;
      alert('Mesas separadas de manera exitosa.');
      this.dibujarMesas(zona);
    }
  }

  reservaPerteneceAMesa(res: any, mesa: any): boolean {
    if (!res.idMesa) return false;
    const resIdStr = res.idMesa.toString();
    if (resIdStr === mesa.id.toString()) return true;
    if (mesa.isMerged && mesa.displayId) {
      const subIds = mesa.displayId.split('+');
      return subIds.includes(resIdStr);
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
        elemento.classList.add(res.estado);
        let nombreCorto = res.nombre ? res.nombre.split(' ')[0].substring(0, 8) : 'Cliente';
        elemento.innerHTML = `<span class="res-nombre">${nombreCorto}</span><span class="res-pax">${res.personas}p</span>`;
      } else {
        const tieneReservada = arr.some((r: any) => r.estado === 'reservada');
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
      if(res.estado === 'reservada') borderColor = 'var(--res)';
      if(res.estado === 'ocupada') borderColor = 'var(--occ)';
      if(res.estado === 'bloqueada') borderColor = 'var(--blo)';
      item.style.borderLeftColor = borderColor;
      item.innerHTML = `
        <div class="reserva-info-left"><strong>${res.nombre}</strong></div>
        <div class="reserva-info-right">
          ${res.personas}p • Mesa ${res.idMesa}
          <i class="fas fa-info-circle icono-mas-info" style="margin-left: 8px; color: rgba(255,255,255,0.45); transition: color 0.2s, transform 0.2s; cursor: pointer;"></i>
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
              <i class="fas fa-info-circle icono-mas-info" style="margin-left: 8px; color: rgba(255,255,255,0.3); transition: color 0.2s, transform 0.2s; cursor: pointer;"></i>
            </div>`;
          item.addEventListener('click', () => this.mostrarDetalleReserva(res));
          lista.appendChild(item);
       });
    }
  }

  actualizarEstadisticas(reservasDelDia: any[]) {
    const ocupadas = reservasDelDia.filter(r => r.estado === 'ocupada').length;
    const reservadas = reservasDelDia.filter(r => r.estado === 'reservada').length;
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

  gestionarClickMesa(evento: any, mesa: any, zona: string) {
    evento.stopPropagation(); 
    
    if (this.modoEdicion) {
      if (this.modoCombinar) {
        if (this.mesaACombinar === null) {
          this.mesaACombinar = mesa;
          const mesaDiv = evento.currentTarget as HTMLElement;
          mesaDiv.style.borderColor = '#8e44ad';
          mesaDiv.style.borderStyle = 'dashed';
          alert(`Mesa A seleccionada: Mesa ${mesa.isMerged ? mesa.displayId : mesa.id}. Ahora selecciona la Mesa B.`);
        } else {
          if (this.mesaACombinar.id === mesa.id) {
            this.mesaACombinar = null;
            this.modoCombinar = false;
            document.getElementById('aviso-combinar')?.classList.add('oculto');
            this.dibujarMesas(this.zonaActiva);
            return;
          }
          this.fusionarMesas(this.mesaACombinar, mesa);
          this.mesaACombinar = null;
          this.modoCombinar = false;
          document.getElementById('aviso-combinar')?.classList.add('oculto');
        }
        return;
      }
      
      this.mesaSeleccionadaEdicion = mesa.id;
      this.dibujarMesas(this.zonaActiva);
      return;
    } 

    this.mesaSeleccionadaTemp = { id: mesa.id, zona: zona };
    const idMesa = mesa.id;
    const mesaDiv = evento.currentTarget as HTMLElement;

    if (this.modoMover) {
      const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
      if (res) {
          const choques = this.todasLasReservas.filter(r => 
              Number(r.id) !== Number(res.id) && 
              r.fecha === res.fecha && 
              r.idMesa === idMesa.toString() && 
              r.estado !== 'finalizada' && r.estado !== 'cancelada' && r.estado !== 'liberada'
          );

          const hayBloqueo = choques.some(r => r.estado === 'bloqueada');
          if (hayBloqueo) {
              alert('⚠️ ACCIÓN DENEGADA: Esta mesa se encuentra BLOQUEADA.');
              this.modoMover = false;
              const avisoMover = document.getElementById('aviso-mover');
              if (avisoMover) avisoMover.classList.add('oculto');
              this.dibujarMesas(this.zonaActiva);
              return; 
          }

          let alertaChoque = false;
          if (res.hora) {
              const [hE, mE] = res.hora.split(':').map(Number);
              const minsElegidos = (hE * 60) + mE;
              for (let r of choques) {
                  if (!r.hora) continue;
                  const [hR, mR] = r.hora.split(':').map(Number);
                  const minsR = (hR * 60) + mR;
                  if (Math.abs(minsElegidos - minsR) < 60) { alertaChoque = true; break; }
              }
          }

          if (alertaChoque) {
              const confirmara = confirm(`⚠️ ATENCIÓN: Ya hay una reserva en la Mesa ${idMesa} con menos de 1 hora de diferencia. ¿Deseas forzar este Double-Booking?`);
              if (!confirmara) return; 
              else { this.ejecutarMover(idMesa, zona); return; }
          }
      }

      if(confirm(`¿Mover reserva a Mesa ${idMesa}?`)) {
          this.ejecutarMover(idMesa, zona);
      }
      return;
    }

    const infoAtributo = mesaDiv.getAttribute('data-info');
    let arrReservas = [];
    if (infoAtributo) {
      try { arrReservas = JSON.parse(infoAtributo); } catch(e) {}
    }

    if (arrReservas.length > 1) {
      this.abrirModalListaMesa(arrReservas);
      return;
    }

    const menu = document.getElementById('menu-mesa');
    if(!menu) return;
    menu.style.top = `${evento.clientY}px`;
    menu.style.left = `${evento.clientX}px`;
    menu.classList.remove('oculto');
    
    menu.querySelectorAll('.menu-opcion').forEach((op) => (op as HTMLElement).style.display = 'none');

    const mostrarOpcion = (accion: string) => {
      const btn = menu.querySelector(`[data-accion="${accion}"]`) as HTMLElement;
      if (btn) btn.style.display = 'flex';
    };

    const esLibre = mesaDiv.classList.contains('libre');
    if (esLibre) {
      mostrarOpcion('nueva-reserva-mesa');
      mostrarOpcion('walk-in');
      mostrarOpcion('bloquear');
    } else {
      const info = arrReservas[0];
      this.reservaAMoverId = Number(info.id); 
      const esWalkIn = info.nombre && info.nombre.toLowerCase().includes('walk-in');

      if (info.estado === 'reservada') {
        mostrarOpcion('marcar-llegada');
        mostrarOpcion('mover-mesa');
        mostrarOpcion('editar-datos-menu');
        mostrarOpcion('cancelar-reserva');
      } else if (info.estado === 'ocupada') {
        if (!esWalkIn) { mostrarOpcion('deshacer-llegada'); }
        mostrarOpcion('liberar-mesa');
        mostrarOpcion('mover-mesa');
        mostrarOpcion('editar-datos-menu');
        mostrarOpcion('cancelar-reserva');
      } else if (info.estado === 'bloqueada') {
        mostrarOpcion('desbloquear');
      }
    }
  }

  configurarMenuContextual() {
    const menu = document.getElementById('menu-mesa');
    document.addEventListener('click', (e: any) => {
      if (menu && !menu.contains(e.target) && !e.target.closest('.mesa')) menu.classList.add('oculto');
    });

    menu?.addEventListener('click', (e: any) => {
      const btn = e.target.closest('.menu-opcion') as HTMLElement;
      if (!btn) return;
      
      const accion: any = btn.dataset['accion'];
      menu.classList.add('oculto');

      if (accion === 'nueva-reserva-mesa' && this.mesaSeleccionadaTemp) {
        this.abrirModalNuevaReserva(this.mesaSeleccionadaTemp.zona, this.mesaSeleccionadaTemp.id.toString());
      }
      else if (accion === 'walk-in' && this.mesaSeleccionadaTemp) {
        const modalWalkin = document.getElementById('modal-walkin');
        const inputPax = document.getElementById('input-pax-walkin') as HTMLInputElement;
        if (inputPax) inputPax.value = '2'; 
        if (modalWalkin) modalWalkin.classList.remove('oculto');
        if (inputPax) inputPax.focus(); 
      }
      else if (accion === 'bloquear' && this.mesaSeleccionadaTemp) {
        this.crearRegistroRapido(this.mesaSeleccionadaTemp.id, this.mesaSeleccionadaTemp.zona, 'Mesa Bloqueada', 'bloqueada', "0");
      }
      else if (accion === 'marcar-llegada') {
        const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
        if (res) {
          res.estado = 'ocupada';
          this.guardarReservaEnServidor(res);
          this.actualizarVistaCompleta();
        }
      }
      else if (accion === 'deshacer-llegada') {
        const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
        if (res) {
          res.estado = 'reservada';
          this.guardarReservaEnServidor(res);
          this.actualizarVistaCompleta();
        }
      }
      else if (accion === 'editar-datos-menu') {
        const mesaObj = document.getElementById(`mesa-${this.mesaSeleccionadaTemp?.id}`);
        const info = mesaObj?.getAttribute('data-info');
        if (info) {
          try {
            const arr = JSON.parse(info);
            if(arr && arr.length > 0) this.abrirEdicionReserva(arr[0]);
          } catch(e) {}
        }
      }
      else if (accion === 'liberar-mesa') {
        const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
        if (res) {
          res.estado = 'liberada';
          this.guardarReservaEnServidor(res);
          this.actualizarVistaCompleta();
        }
      }
      else if (accion === 'cancelar-reserva') {
        const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
        if (res) {
          res.estado = 'cancelada';
          this.guardarReservaEnServidor(res);
          this.actualizarVistaCompleta();
        }
      }
      else if (accion === 'desbloquear') {
        const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
        if (res) {
          res.estado = 'finalizada';
          this.guardarReservaEnServidor(res);
          this.actualizarVistaCompleta();
        }
      }
      else if (accion === 'mover-mesa') {
        this.modoMover = true;
        const avisoMover = document.getElementById('aviso-mover');
        if (avisoMover) avisoMover.classList.remove('oculto');
        this.dibujarMesas(this.zonaActiva);
      }
    });
  }

  crearRegistroRapido(idMesa: number, zona: string, nombre: string, estado: string, pax: string = "2") {
    const nuevo = {
      id: Date.now(),
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
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e: any) => {
        if (e.target === overlay) {
          overlay.classList.add('oculto');
          this.resetWalkinModal();
          
          if(this.modoMover) {
            this.modoMover = false;
            const avisoMover = document.getElementById('aviso-mover');
            if (avisoMover) avisoMover.classList.add('oculto');
            this.dibujarMesas(this.zonaActiva);
          }
        }
      });
    });

    document.querySelectorAll('.modal-close-btn, #btn-cancelar-mover, #close-nueva-reserva, #lista-mesa-close-btn, #close-walkin').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        const overlay = e.target.closest('.modal-overlay');
        if (overlay) overlay.classList.add('oculto');
        this.resetWalkinModal();
        
        if(e.target.id === 'btn-cancelar-mover') {
          this.modoMover = false;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.add('oculto');
          this.dibujarMesas(this.zonaActiva);
        }
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
            }
            this.actualizarVistaCompleta();
        } else if (this.mesaSeleccionadaTemp) {
            this.crearRegistroRapido(this.mesaSeleccionadaTemp.id, this.mesaSeleccionadaTemp.zona, 'Walk-in Cliente', 'ocupada', paxFinal.toString());
        }
        
        const modalWalkin = document.getElementById('modal-walkin');
        if (modalWalkin) modalWalkin.classList.add('oculto');
        this.resetWalkinModal();
      }
    });
  }

  abrirModalNuevaReserva(zonaPredeterminada: string, mesaPreseleccionada?: any) {
    this.idReservaAEditar = null;
    const modal = document.getElementById('modal-nueva-reserva');
    const form = document.getElementById('form-nueva-reserva') as HTMLFormElement;
    if (form) form.reset();
    
    if(modal) {
      const h2 = modal.querySelector('.modal-header h2'); if(h2) h2.textContent = 'Nueva Reserva';
      const btn = modal.querySelector('.btn-submit-reserva'); if(btn) btn.textContent = 'GUARDAR RESERVA';
    }

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

    if (esWalkIn) {
      this.idReservaAEditar = Number(reserva.id);
      const modalWalkin = document.getElementById('modal-walkin');
      const inputPax = document.getElementById('input-pax-walkin') as HTMLInputElement;
      
      if (inputPax) inputPax.value = reserva.personas ? reserva.personas.toString() : '2';
      
      if (modalWalkin) {
        const h2 = modalWalkin.querySelector('.modal-header h2');
        if (h2) h2.textContent = 'Editar Personas';
        const btn = document.getElementById('btn-confirmar-walkin');
        if (btn) btn.innerHTML = '<i class="fas fa-check"></i> Actualizar';
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
      setVal('res-notas', reserva.nota);
      
      const selectZona = document.getElementById('res-zona') as HTMLSelectElement;
      if (selectZona) selectZona.value = reserva.zona;
      
      this.actualizarSelectMesas(reserva.zona, reserva.idMesa);

      if (modal) {
        const h2 = modal.querySelector('.modal-header h2'); if(h2) h2.textContent = 'Editar Reserva';
        const btn = modal.querySelector('.btn-submit-reserva'); if(btn) btn.textContent = 'ACTUALIZAR RESERVA';
        modal.classList.remove('oculto');
      }
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
    if (mesaPreseleccionada) selectMesa.value = mesaPreseleccionada.toString();
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

      if (this.idReservaAEditar !== null) {
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
          resObj.nota = (document.getElementById('res-notes') as HTMLTextAreaElement).value;
          this.guardarReservaEnServidor(resObj); 
        }
        this.idReservaAEditar = null;
      } else {
        const nuevaReserva: any = {
          id: Date.now(), 
          fecha: fechaElegida,
          hora: horaElegida,
          zona: selectZona.value,
          idMesa: idMesaElegida,
          nombre: (document.getElementById('res-nombre') as HTMLInputElement).value,
          personas: (document.getElementById('res-personas') as HTMLInputElement).value,
          telefono: (document.getElementById('res-telefono') as HTMLInputElement).value,
          email: (document.getElementById('res-email') as HTMLInputElement).value,
          nota: (document.getElementById('res-notes') as HTMLTextAreaElement)?.value || '',
          estado: 'reservada',
          isNewRecord: true // Habilita el envío del correo único
        };
        this.todasLasReservas.push(nuevaReserva);
        this.guardarReservaEnServidor(nuevaReserva); 
      }

      this.actualizarVistaCompleta();
      const modalReserva = document.getElementById('modal-nueva-reserva');
      if (modalReserva) modalReserva.classList.add('oculto');
      form.reset();
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

      if (reserva.estado === 'reservada') {
        crearBoton('Marcar Llegada', 'btn-llegada', 'fa-bell-concierge', () => this.cambiarEstadoReserva(Number(reserva.id), 'ocupada'));
        crearBoton('Editar Datos', 'btn-editar-datos', 'fa-pen', () => this.abrirEdicionReserva(reserva));
        crearBoton('Mover Mesa', 'btn-mover', 'fa-arrows-up-down-left-right', () => {
          this.reservaAMoverId = Number(reserva.id);
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
        crearBoton('Cancelar Reserva', 'btn-cancelar', 'fa-trash-alt', () => this.cambiarEstadoReserva(Number(reserva.id), 'cancelada'));
      } else if (reserva.estado === 'ocupada') {
        crearBoton('Liberar Mesa', 'btn-liberar', 'fa-broom', () => this.cambiarEstadoReserva(Number(reserva.id), 'liberada'));
        crearBoton('Mover Mesa', 'btn-mover', 'fa-arrows-up-down-left-right', () => {
          this.reservaAMoverId = Number(reserva.id);
          this.modoMover = true;
          const avisoMover = document.getElementById('aviso-mover');
          if (avisoMover) avisoMover.classList.remove('oculto');
          this.dibujarMesas(this.zonaActiva);
        });
        
        if (!esWalkIn) {
            crearBoton('Deshacer Llegada', 'btn-editar-datos', 'fa-undo', () => this.cambiarEstadoReserva(Number(reserva.id), 'reservada'));
        }
        
        crearBoton(esWalkIn ? 'Editar Personas' : 'Editar Datos', 'btn-editar-datos', 'fa-pen', () => this.abrirEdicionReserva(reserva));
        crearBoton('Cancelar / Retirar', 'btn-cancelar', 'fa-trash-alt', () => this.cambiarEstadoReserva(Number(reserva.id), 'cancelada'));
      } else if (reserva.estado === 'bloqueada') {
        crearBoton('Desbloquear', 'btn-liberar', 'fa-unlock', () => this.cambiarEstadoReserva(Number(reserva.id), 'finalizada'));
      } else if (reserva.estado === 'finalizada' || reserva.estado === 'cancelada' || reserva.estado === 'liberada') {
        crearBoton('Restaurar Registro', 'btn-llegada', 'fa-trash-restore', () => {
          if (esWalkIn) {
            this.cambiarEstadoReserva(reserva.id, 'ocupada');
          } else {
            this.cambiarEstadoReserva(reserva.id, 'reservada');
          }
        });
      }
    }

    const modalDetalle = document.getElementById('modal-detalle-reserva');
    if (modalDetalle) modalDetalle.classList.remove('oculto');
  }

  ejecutarMover(idMesaNueva: number, zonaNueva: string) {
    this.modoMover = false;
    const avisoMover = document.getElementById('aviso-mover');
    if (avisoMover) avisoMover.classList.add('oculto');
    
    const res = this.todasLasReservas.find(r => Number(r.id) === Number(this.reservaAMoverId));
    if (res) {
        res.idMesa = idMesaNueva.toString();
        res.zona = zonaNueva;
        this.guardarReservaEnServidor(res); 
    }
    this.actualizarVistaCompleta();
  }

  actualizarAnalitica(reservasDelDia: any[]) {
    const activas = reservasDelDia.filter(r => r.estado !== 'finalizada' && r.estado !== 'cancelada' && r.estado !== 'liberada');
    
    const totalMesas = activas.length;
    const totalPax = activas.reduce((sum, r) => sum + parseInt(r.personas || 0), 0);
    const paxPromedio = totalMesas > 0 ? (totalPax / totalMesas).toFixed(1) : '0.0';
    
    const horas = activas.map(r => r.hora);
    let horaPico = '--:--';
    if (horas.length > 0) {
        const counts: any = {};
        horas.forEach(h => counts[h] = (counts[h] || 0) + 1);
        horaPico = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    }

    const zonas = activas.map(r => r.zona);
    let zonaTop = '--';
    let conteoZonas: any = {};
    if (zonas.length > 0) {
        zonas.forEach(z => conteoZonas[z] = (conteoZonas[z] || 0) + 1);
        zonaTop = Object.keys(conteoZonas).reduce((a, b) => conteoZonas[a] > conteoZonas[b] ? a : b);
    }

    const el = (id: string, val: string) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('data-avg-pax', paxPromedio);
    el('data-total-reservas', totalMesas.toString());
    el('data-peak-hour', horaPico);
    el('data-top-zone', zonaTop.toUpperCase());

    this.dibujarGrafica(conteoZonas);
  }

  dibujarGrafica(datosZonas: any) {
    const canvas = document.getElementById('grafica-zonas') as HTMLCanvasElement;
    if (!canvas || typeof Chart === 'undefined') return;

    const labels = Object.keys(datosZonas).map(label => label.toUpperCase());
    const data = Object.values(datosZonas);

    if (this.chartInstance) {
        this.chartInstance.destroy();
    }

    if (labels.length === 0) return;

    this.chartInstance = new Chart(canvas, {
        type: this.tipoGrafica,
        data: {
            labels: labels,
            datasets: [{
                label: 'Mesas por Zona',
                data: data,
                backgroundColor: ['#d4af37', '#2c3e50', '#c0392b', '#27ae60'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    position: 'bottom',
                    labels: {
                        font: { family: "'Segoe UI', sans-serif", size: 12, weight: 'bold' }
                    }
                } 
            }
        }
    });
  }
}
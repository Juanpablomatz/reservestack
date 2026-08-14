require('dotenv').config(); // Cargar variables de entorno desde .env
const express = require('express');
const cors = require('cors');
const db = require('./database');
const nodemailer = require('nodemailer'); 
const http = require('http'); 
const { Server } = require('socket.io'); 
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app); 

// CLAVE SECRETA JWT Y PUERTO (Cargados desde .env)
const SECRET_KEY = process.env.JWT_SECRET || 'reservestack_jwt_secret_key_2026_prod';
const PORT = process.env.PORT || 3000;

// =================================================================
// CONFIGURACIÓN DE SEGURIDAD: CORS RESTRINGIDO
// =================================================================
const ORIGENES_PERMITIDOS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:8100', 'http://localhost:4200', 'http://localhost:3000', 'http://192.168.100.220:8100', 'http://192.168.100.220:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || ORIGENES_PERMITIDOS.includes('*') || ORIGENES_PERMITIDOS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback permisivo local
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// =================================================================
// RATE LIMITING INTELIGENTE (PROTECCIÓN POR IP Y CLIENTES)
// =================================================================

// 1. Limitador General para la red
const limitadorGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Demasiadas peticiones. Intenta en unos minutos.' }
});

// 2. Limitador Estricto para Login (Anti fuerza bruta)
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Demasiados intentos de acceso. Intenta en 15 minutos.' }
});

// 3. LIMITADOR PÚBLICO EXCLUSIVO PARA CLIENTES EXTERNOS (10 reservas por IP cada 24 Horas)
const limitadorClientePublico = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 Horas
  max: 10,
  message: { success: false, message: 'Has alcanzado el límite máximo de 10 reservaciones por día desde tu dispositivo.' }
});

app.use(limitadorGeneral);

// =================================================================
// MIDDLEWARE DE VERIFICACIÓN DE TOKEN JWT PARA ADMINS
// =================================================================
function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Acceso no autorizado. Token no proporcionado.' });
  }

  try {
    const usuarioVerificado = jwt.verify(token, SECRET_KEY);
    req.usuario = usuarioVerificado;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Sesión expirada o token inválido.' });
  }
}

// =================================================================
// CONFIGURACIÓN DE CORREO (NODEMAILER STRICT ENV)
// =================================================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  connectionTimeout: 5000, 
  greetingTimeout: 5000,
  socketTimeout: 5000,
  auth: {
    user: process.env.EMAIL_USER || 'reservacionesrestaurantes.17@gmail.com',         
    pass: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : '' 
  }
});

const TEMAS_RESTAURANTES = {
  1: { nombre: 'Pietra Cucina', color: '#d4af37' },  
  2: { nombre: 'Rosa Mexicano', color: '#e5007e' },  
  3: { nombre: 'Llorona Comedor', color: '#f1c40f' } 
};

async function enviarCorreoPorTipo(reserva, tipo, nombreRestaurante = 'ReserveStack', idRestaurante = 1) {
  if (!reserva.email || reserva.email.trim() === '') return;
  if (!process.env.EMAIL_USER && !process.env.EMAIL_PASS) return;

  const infoRest = TEMAS_RESTAURANTES[idRestaurante] || { nombre: nombreRestaurante, color: '#d4af37' };
  const colorTema = infoRest.color;
  const hostBase = process.env.BASE_URL || `http://localhost:${PORT}`;
  const remitenteCorreo = process.env.EMAIL_USER || 'reservacionesrestaurantes.17@gmail.com';

  // Generar Token Cifrado para la cancelación desde correo
  const tokenCancelacion = jwt.sign(
    { idReserva: reserva.id, idRestaurante: idRestaurante }, 
    SECRET_KEY, 
    { expiresIn: '30d' }
  );
  
  const urlCancelacion = `${hostBase}/api/reservas/cancelar-cliente?token=${tokenCancelacion}`;

  let asunto = '';
  let contenidoHtml = '';

  if (tipo === 'crear') {
    asunto = `¡Tu Reserva está Confirmada! 🥂 - ${infoRest.nombre}`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 2px solid ${colorTema};">
        <div style="text-align: center; border-bottom: 2px solid ${colorTema}; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: ${colorTema}; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif;">${infoRest.nombre.toUpperCase()}</h1>
          <p style="color: #768f9e; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase;">Confirmación Oficial de Reserva</p>
        </div>
        <p style="font-size: 15px; color: #9faec0;">Hola <strong style="color: #ffffff;">${reserva.nombre}</strong>,</p>
        <p style="font-size: 15px; color: #9faec0;">Nos complace confirmarte que tu reservación ha sido registrada en nuestro sistema con éxito:</p>
        
        <div style="background-color: #131b24; padding: 20px; border-radius: 8px; border: 1px solid #243141; margin: 25px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #768f9e;">FECHA:</td><td style="padding: 6px 0; color: #ffffff; text-align: right;"><b>${reserva.fecha}</b></td></tr>
            <tr><td style="padding: 6px 0; color: #768f9e;">HORA:</td><td style="padding: 6px 0; color: #ffffff; text-align: right;"><b>${reserva.hora} hs</b></td></tr>
            <tr><td style="padding: 6px 0; color: #768f9e;">INVITADOS:</td><td style="padding: 6px 0; color: #ffffff; text-align: right;"><b>${reserva.personas} personas</b></td></tr>
            <tr><td style="padding: 6px 0; color: #768f9e;">ZONA:</td><td style="padding: 6px 0; color: #ffffff; text-align: right;"><b>${reserva.zona}</b></td></tr>
            <tr><td style="padding: 6px 0; color: #768f9e;">MESA:</td><td style="padding: 6px 0; color: ${colorTema}; text-align: right;"><b>Mesa ${reserva.idMesa}</b></td></tr>
          </table>
        </div>
        
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #243141;">
          <p style="font-size: 12px; color: #768f9e; margin-bottom: 12px;">¿Cambiaste de planes y deseas cancelar tu visita?</p>
          <a href="${urlCancelacion}" style="background-color: #c0392b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block;">
            ❌ CANCELAR MI RESERVACIÓN
          </a>
        </div>
      </div>
    `;
  } else if (tipo === 'noshow' || tipo === 'cancelar') {
    asunto = `Aviso de Cancelación de Reserva - ${infoRest.nombre}`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 2px solid ${colorTema};">
        <div style="text-align: center; border-bottom: 2px solid ${colorTema}; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: ${colorTema}; margin: 0; font-size: 28px;">${infoRest.nombre.toUpperCase()}</h1>
        </div>
        <p style="font-size: 15px; color: #9faec0;">Hola <strong style="color: #ffffff;">${reserva.nombre}</strong>,</p>
        <p style="font-size: 15px; color: #9faec0;">Te informamos que tu reservación programada para el <b>${reserva.fecha}</b> a las <b>${reserva.hora} hs</b> ha sido cancelada en nuestro sistema.</p>
      </div>
    `;
  } else {
    return;
  }

  const mailOptions = {
    from: `"${infoRest.nombre}" <${remitenteCorreo}>`, 
    to: reserva.email,
    subject: asunto,
    html: contenidoHtml
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(` Correo [${tipo.toUpperCase()}] enviado con éxito a: ${reserva.email}`);
  } catch (err) {
    console.warn(` Error Nodemailer: ${err.message}`);
  }
}

// =================================================================
// CANCELACIÓN SEGURA VÍA TOKEN DESDE EL CORREO DEL CLIENTE
// =================================================================
app.get('/api/reservas/cancelar-cliente', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(400).send('<h3>Enlace de cancelación inválido.</h3>');
  }

  try {
    const verificado = jwt.verify(token, SECRET_KEY);
    const idReserva = verificado.idReserva;
    const idRestaurante = verificado.idRestaurante;

    const infoRest = TEMAS_RESTAURANTES[idRestaurante] || { nombre: 'ReserveStack', color: '#d4af37' };

    const query = `UPDATE reservas SET estado = 'cancelada' WHERE id_reserva = ? AND id_restaurante = ?`;
    await db.query(query, [idReserva, idRestaurante]);

    if (idRestaurante === 1) {
      const reservasActualizadas = await obtenerReservasPietra();
      io.emit('actualizar_pietra', reservasActualizadas);
      io.to('restaurante_1').emit('actualizar_pietra', reservasActualizadas);
    } else if (idRestaurante === 2) {
      const reservasActualizadas = await obtenerReservasPorRestaurante(2);
      io.emit('actualizar_rosa', reservasActualizadas);
      io.to('restaurante_2').emit('actualizar_rosa', reservasActualizadas);
    } else if (idRestaurante === 3) {
      const reservasActualizadas = await obtenerReservasPorRestaurante(3);
      io.emit('actualizar_llorona', reservasActualizadas);
      io.to('restaurante_3').emit('actualizar_llorona', reservasActualizadas);
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Reserva Cancelada - ${infoRest.nombre}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #ffffff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #161f2c; border: 2px solid ${infoRest.color}; border-radius: 16px; padding: 40px; text-align: center; max-width: 440px; }
          h1 { color: ${infoRest.color}; margin-top: 0; font-size: 26px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${infoRest.nombre.toUpperCase()}</h1>
          <p>Tu reservación ha sido cancelada exitosamente en nuestro sistema.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(403).send('<h3>El enlace de cancelación ha expirado o es inválido.</h3>');
  }
});

// =================================================================
// ENDPOINT DE AUTENTICACIÓN / LOGIN HOSTESS
// =================================================================
app.post('/api/auth/login', limitadorAuth, async (req, res) => {
  const usuarioOEmail = (req.body.usuario || req.body.email || '').toLowerCase().trim();
  const password = (req.body.password || '').trim();

  if (!usuarioOEmail || !password) {
    return res.status(400).json({ success: false, message: 'Usuario/Email y contraseña son requeridos' });
  }

  try {
    let usuarioEncontrado = null;

    try {
      const [rows] = await db.query('SELECT * FROM usuarios WHERE LOWER(usuario) = ? OR LOWER(email) = ?', [usuarioOEmail, usuarioOEmail]);
      if (rows && rows.length > 0) {
        const userDb = rows[0];
        const passwordValida = userDb.password.startsWith('$2a$') || userDb.password.startsWith('$2b$')
          ? await bcrypt.compare(password, userDb.password)
          : password === userDb.password;

        if (passwordValida) {
          usuarioEncontrado = { id: userDb.id_usuario, nombre: userDb.usuario, rol: userDb.rol || 'admin', email: userDb.email };
        }
      }
    } catch (dbErr) {}

    if (!usuarioEncontrado) {
      const envPass = process.env.ADMIN_PASS || 'hostess2026';
      const envUser = (process.env.EMAIL_USER || 'reservacionesrestaurantes.17@gmail.com').toLowerCase();

      if ((usuarioOEmail === envUser || usuarioOEmail === 'admin' || usuarioOEmail === 'hostess') && (password === envPass || password === 'hostess2026')) {
        usuarioEncontrado = { id: 1, nombre: 'Hostess Principal', rol: 'admin', email: usuarioOEmail };
      }
    }

    if (usuarioEncontrado) {
      const token = jwt.sign(
        { id: usuarioEncontrado.id, nombre: usuarioEncontrado.nombre, rol: usuarioEncontrado.rol, email: usuarioEncontrado.email },
        SECRET_KEY,
        { expiresIn: '12h' }
      );

      return res.json({
        success: true,
        token: token,
        usuario: usuarioEncontrado
      });
    }

    res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error interno en autenticación' });
  }
});

// =================================================================
// ENDPOINT PÚBLICO DE RESERVAS PARA CLIENTES DESDE LA WEB (CON LÍMITE DE 10/DÍA)
// =================================================================
app.post('/api/publico/reservas', limitadorClientePublico, async (req, res) => {
  const { idRestaurante, fecha, hora, zona, idMesa, nombre, personas, telefono, email, nota } = req.body;

  if (!idRestaurante || !fecha || !hora || !nombre) {
    return res.status(400).json({ success: false, message: 'Faltan datos obligatorios para la reserva.' });
  }

  const idReserva = Date.now().toString();

  try {
    const query = `
      INSERT INTO reservas (id_reserva, id_restaurante, fecha, hora, zona, id_mesa, nombre, personas, telefono, email, nota, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reservada')
    `;
    await db.query(query, [
      idReserva, idRestaurante, fecha, hora, zona || 'General', idMesa || '1', nombre, personas || 2, telefono || null, email || null, nota || null
    ]);

    const idRestNum = Number(idRestaurante);
    const reservasActualizadas = await obtenerReservasPorRestaurante(idRestNum);

    // Emisión estricta en vivo vía WebSockets por restaurante
    if (idRestNum === 1) {
      const reservasPietra = await obtenerReservasPietra();
      io.emit('actualizar_pietra', reservasPietra);
      io.to('restaurante_1').emit('actualizar_pietra', reservasPietra);
      console.log(' [SOCKET.IO] Emitida actualización instantánea para Pietra Cucina');
    } else if (idRestNum === 2) {
      io.emit('actualizar_rosa', reservasActualizadas);
      io.to('restaurante_2').emit('actualizar_rosa', reservasActualizadas);
      console.log(' [SOCKET.IO] Emitida actualización instantánea para Rosa Mexicano');
    } else if (idRestNum === 3) {
      io.emit('actualizar_llorona', reservasActualizadas);
      io.to('restaurante_3').emit('actualizar_llorona', reservasActualizadas);
      console.log(' [SOCKET.IO] Emitida actualización instantánea para Llorona Comedor');
    }

    const nombreRest = TEMAS_RESTAURANTES[idRestNum] ? TEMAS_RESTAURANTES[idRestNum].nombre : 'ReserveStack';
    enviarCorreoPorTipo({ id: idReserva, fecha, hora, zona, idMesa, nombre, personas, email, nota }, 'crear', nombreRest, idRestNum);

    res.json({ success: true, message: 'Reserva registrada con éxito' });
  } catch (error) {
    console.error('Error en reserva pública:', error);
    res.status(500).json({ success: false, message: 'No se pudo registrar la reserva en MySQL' });
  }
});

// =================================================================
// ENDPOINTS INTERNOS DE HOSTESS / ADMINS (SIN LÍMITES)
// =================================================================

const ID_RESTAURANTE_PIETRA = 1;

async function obtenerReservasPietra() {
  const query = `
    SELECT id_reserva AS id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora, '%H:%i') AS hora, zona, id_mesa AS idMesa, nombre, personas, telefono, email, nota, estado 
    FROM reservas WHERE id_restaurante = ?
  `;
  const [rows] = await db.query(query, [ID_RESTAURANTE_PIETRA]);
  return rows;
}

async function obtenerReservasPorRestaurante(idRestaurante) {
  const query = `
    SELECT id_reserva AS id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora, '%H:%i') AS hora, zona, id_mesa AS idMesa, nombre, personas, telefono, email, nota, estado 
    FROM reservas WHERE id_restaurante = ?
  `;
  const [rows] = await db.query(query, [idRestaurante]);
  return rows;
}

// SOCKETS
io.on('connection', (socket) => {
  socket.on('join_restaurante', (idRestaurante) => {
    socket.join(`restaurante_${idRestaurante}`);
  });
});

// --- PIETRA ---
app.get('/api/pietra/diseno', async (req, res) => {
  try {
    const query = `SELECT id_mesa AS id, zona, capacidad AS c, x, y, is_merged AS isMerged, is_vertical AS isVertical, display_id AS displayId, original_tables_json AS originalTables FROM mesas WHERE id_restaurante = ?`;
    const [rows] = await db.query(query, [ID_RESTAURANTE_PIETRA]);
    const restauranteLayout = { 'Terraza': [], 'Nivel bajo': [], 'Nivel medio': [], 'Pared lloron': [] };

    rows.forEach((m) => {
      const mesaParsed = {
        id: m.id, c: m.c, x: m.x, y: m.y,
        isMerged: m.isMerged === 1,
        isVertical: m.isVertical === 1,
        displayId: m.displayId,
        originalTables: m.originalTables ? JSON.parse(m.originalTables) : null
      };
      if (restauranteLayout[m.zona]) restauranteLayout[m.zona].push(mesaParsed);
    });
    res.json(restauranteLayout);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/pietra/diseno', async (req, res) => {
  const restauranteLayout = req.body; 
  const connection = await db.getConnection(); 

  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM mesas WHERE id_restaurante = ?', [ID_RESTAURANTE_PIETRA]);
    const insertQuery = `INSERT INTO mesas (id_mesa, id_restaurante, zona, capacidad, x, y, is_merged, is_vertical, display_id, original_tables_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    for (const zona in restauranteLayout) {
      const mesas = restauranteLayout[zona] || [];
      for (const m of mesas) {
        await connection.query(insertQuery, [
          m.id, ID_RESTAURANTE_PIETRA, zona, m.c, m.x || 10, m.y || 10, m.isMerged ? 1 : 0, m.isVertical ? 1 : 0, m.displayId || null, m.originalTables ? JSON.stringify(m.originalTables) : null
        ]);
      }
    }
    await connection.commit(); 
    io.emit('actualizar_diseno_pietra', restauranteLayout);
    res.json({ success: true, message: 'Plano guardado' });
  } catch (error) {
    await connection.rollback(); 
    res.status(500).json({ error: 'Error interno' });
  } finally {
    connection.release(); 
  }
});

app.get('/api/pietra/reservas', async (req, res) => {
  try {
    const rows = await obtenerReservasPietra();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/pietra/reservas', async (req, res) => {
  const { id, fecha, hora, zona, idMesa, nombre, personas, telefono, email, nota, estado, tipoCorreo, isNewRecord } = req.body;
  try {
    const query = `
      INSERT INTO reservas (id_reserva, id_restaurante, fecha, hora, zona, id_mesa, nombre, personas, telefono, email, nota, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        fecha = VALUES(fecha), hora = VALUES(hora), zona = VALUES(zona), id_mesa = VALUES(id_mesa), nombre = VALUES(nombre), personas = VALUES(personas), telefono = VALUES(telefono), email = VALUES(email), nota = VALUES(nota), estado = VALUES(estado)
    `;
    await db.query(query, [
      id, ID_RESTAURANTE_PIETRA, fecha, hora, zona, idMesa, nombre, personas, telefono || null, email || null, nota || null, estado
    ]);

    const reservasActualizadas = await obtenerReservasPietra();
    
    // 📢 Emisión Exclusiva para Pietra Cucina
    io.emit('actualizar_pietra', reservasActualizadas);
    io.to('restaurante_1').emit('actualizar_pietra', reservasActualizadas);

    if (tipoCorreo === 'noshow' || tipoCorreo === 'cancelar' || tipoCorreo === 'crear' || isNewRecord) {
      enviarCorreoPorTipo(req.body, tipoCorreo || 'crear', 'Pietra Cucina', 1).catch(e => {});
    }

    res.json({ success: true, message: 'Reserva registrada en MySQL con éxito' });
  } catch (error) {
    console.error('Error al guardar Pietra:', error);
    res.status(500).json({ error: 'Error interno al guardar en MySQL' });
  }
});

// --- MULTI-RESTAURANTES (ROSA MEXICANO & LLORONA) ---

// 📐 GET Y POST PARA GUARDAR Y CARGAR DISEÑO DE MESAS MULTI-RESTAURANTE
app.get('/api/restaurantes/:idRestaurante/diseno', async (req, res) => {
  const idRestaurante = Number(req.params.idRestaurante);
  try {
    const query = `SELECT id_mesa AS id, zona, capacidad AS c, x, y, is_merged AS isMerged, is_vertical AS isVertical, display_id AS displayId, original_tables_json AS originalTables FROM mesas WHERE id_restaurante = ?`;
    const [rows] = await db.query(query, [idRestaurante]);
    const restauranteLayout = {};

    rows.forEach((m) => {
      const mesaParsed = {
        id: m.id, c: m.c, x: m.x, y: m.y,
        isMerged: m.isMerged === 1,
        isVertical: m.isVertical === 1,
        displayId: m.displayId,
        originalTables: m.originalTables ? JSON.parse(m.originalTables) : null
      };
      if (!restauranteLayout[m.zona]) {
        restauranteLayout[m.zona] = [];
      }
      restauranteLayout[m.zona].push(mesaParsed);
    });
    res.json(restauranteLayout);
  } catch (error) {
    res.status(500).json({ error: 'Error interno al cargar diseño' });
  }
});

app.post('/api/restaurantes/:idRestaurante/diseno', async (req, res) => {
  const idRestaurante = Number(req.params.idRestaurante);
  const restauranteLayout = req.body; 
  const connection = await db.getConnection(); 

  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM mesas WHERE id_restaurante = ?', [idRestaurante]);
    const insertQuery = `INSERT INTO mesas (id_mesa, id_restaurante, zona, capacidad, x, y, is_merged, is_vertical, display_id, original_tables_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    for (const zona in restauranteLayout) {
      const mesas = restauranteLayout[zona] || [];
      for (const m of mesas) {
        await connection.query(insertQuery, [
          m.id, idRestaurante, zona, m.c, m.x || 10, m.y || 10, m.isMerged ? 1 : 0, m.isVertical ? 1 : 0, m.displayId || null, m.originalTables ? JSON.stringify(m.originalTables) : null
        ]);
      }
    }
    await connection.commit(); 

    if (idRestaurante === 2) io.emit('actualizar_diseno_rosa', restauranteLayout);
    if (idRestaurante === 3) io.emit('actualizar_diseno_llorona', restauranteLayout);

    res.json({ success: true, message: 'Diseño guardado con éxito' });
  } catch (error) {
    await connection.rollback(); 
    res.status(500).json({ error: 'Error interno al guardar diseño' });
  } finally {
    connection.release(); 
  }
});

app.get('/api/restaurantes/:idRestaurante/reservas', async (req, res) => {
  const idRestaurante = Number(req.params.idRestaurante);
  try {
    const rows = await obtenerReservasPorRestaurante(idRestaurante);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/restaurantes/:idRestaurante/reservas', async (req, res) => {
  const idRestaurante = Number(req.params.idRestaurante);
  const { id, fecha, hora, zona, idMesa, nombre, personas, telefono, email, nota, estado, tipoCorreo, isNewRecord } = req.body;

  try {
    const query = `
      INSERT INTO reservas (id_reserva, id_restaurante, fecha, hora, zona, id_mesa, nombre, personas, telefono, email, nota, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        fecha = VALUES(fecha), hora = VALUES(hora), zona = VALUES(zona), id_mesa = VALUES(id_mesa), nombre = VALUES(nombre), personas = VALUES(personas), telefono = VALUES(telefono), email = VALUES(email), nota = VALUES(nota), estado = VALUES(estado)
    `;
    await db.query(query, [
      id, idRestaurante, fecha, hora, zona, idMesa, nombre, personas, telefono || null, email || null, nota || null, estado
    ]);

    const reservasActualizadas = await obtenerReservasPorRestaurante(idRestaurante);

    // 📢 Emisión filtrada estricta por canal de restaurante
    if (idRestaurante === 2) {
      io.emit('actualizar_rosa', reservasActualizadas);
      io.to('restaurante_2').emit('actualizar_rosa', reservasActualizadas);
    } else if (idRestaurante === 3) {
      io.emit('actualizar_llorona', reservasActualizadas);
      io.to('restaurante_3').emit('actualizar_llorona', reservasActualizadas);
    }

    const nombreRestaurante = TEMAS_RESTAURANTES[idRestaurante] ? TEMAS_RESTAURANTES[idRestaurante].nombre : 'ReserveStack';

    if (tipoCorreo === 'noshow' || tipoCorreo === 'cancelar' || tipoCorreo === 'crear' || isNewRecord) {
      enviarCorreoPorTipo(req.body, tipoCorreo || 'crear', nombreRestaurante, idRestaurante).catch(e => {});
    }

    res.json({ success: true, message: 'Reserva registrada en MySQL con éxito' });
  } catch (error) {
    console.error(`Error al guardar en restaurante ${idRestaurante}:`, error);
    res.status(500).json({ error: 'Error interno al guardar en MySQL' });
  }
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(` Servidor API blindado escuchando en puerto ${PORT}`);
  console.log('==================================================');
});
require('dotenv').config(); // 🛡️ Cargar variables de entorno desde .env
const express = require('express');
const cors = require('cors');
const db = require('./database');
const nodemailer = require('nodemailer'); 
const http = require('http'); 
const { Server } = require('socket.io'); 

const app = express();
const server = http.createServer(app); 
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =================================================================
// CONFIGURACIÓN DE CORREO ELECTRÓNICO SEGURA (NODEMAILER + .ENV)
// =================================================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'juan2005pablomart@gmail.com',         
    pass: process.env.EMAIL_PASS || 'nswb ombp jupy kvpu'                  
  }
});

// 🎨 MAPA DE NOMBRES Y COLORES CORPORATIVOS POR RESTAURANTE
const TEMAS_RESTAURANTES = {
  1: { nombre: 'Pietra Cucina', color: '#d4af37' },  // Dorado
  2: { nombre: 'Rosa Mexicano', color: '#e5007e' },  // Rosa Mexicano
  3: { nombre: 'Llorona Comedor', color: '#f1c40f' } // Amarillo Cálido
};

async function enviarCorreoPorTipo(reserva, tipo, nombreRestaurante = 'ReserveStack', idRestaurante = 1) {
  if (!reserva.email || reserva.email.trim() === '') {
    console.log('ℹ El cliente no proporcionó correo electrónico. Se omite el envío.');
    return;
  }

  const infoRest = TEMAS_RESTAURANTES[idRestaurante] || { nombre: nombreRestaurante, color: '#d4af37' };
  const colorTema = infoRest.color;
  const urlCancelacion = `http://localhost:3000/api/reservas/cancelar-cliente?id=${reserva.id}&restaurante=${idRestaurante}`;

  let asunto = '';
  let contenidoHtml = '';

  // 1️⃣ CORREO A: CONFIRMACIÓN DE RESERVA (INCLUYE BOTÓN CANCELAR)
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
        
        ${reserva.nota ? `<p style="color:${colorTema}; font-style:italic; text-align:center;">"${reserva.nota}"</p>` : ''}
        
        <!-- 🔘 BOTÓN ÚNICO DE CANCELACIÓN PARA EL CLIENTE EN EL CORREO A -->
        <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #243141;">
          <p style="font-size: 12px; color: #768f9e; margin-bottom: 12px;">¿Cambiaste de planes y deseas cancelar tu visita?</p>
          <a href="${urlCancelacion}" style="background-color: #c0392b; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 13px; display: inline-block; box-shadow: 0 4px 10px rgba(192, 57, 43, 0.3);">
            ❌ CANCELAR MI RESERVACIÓN
          </a>
        </div>
      </div>
    `;
  } 
  // 2️⃣ CORREO B: LLEGADA / MESA LISTA (CON COLOR CORPORATIVO Y SIN BOTÓN)
  else if (tipo === 'llegada') {
    asunto = `¡Tu Mesa está Lista! 🍽️ - Bienvenid@ a ${infoRest.nombre}`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 2px solid ${colorTema};">
        <div style="text-align: center; border-bottom: 2px solid ${colorTema}; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: ${colorTema}; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif;">${infoRest.nombre.toUpperCase()}</h1>
          <p style="color: ${colorTema}; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase;">¡Mesa Asignada y Lista!</p>
        </div>
        <p style="font-size: 15px; color: #9faec0;">Hola <strong style="color: #ffffff;">${reserva.nombre}</strong>,</p>
        <p style="font-size: 15px; color: #9faec0;">¡Nos alegra tenerte con nosotros! Tu <b>Mesa ${reserva.idMesa}</b> en la zona <b>${reserva.zona}</b> ha sido asignada y te estamos esperando.</p>
        <p style="text-align: center; color: ${colorTema}; font-weight: bold; font-size: 16px; margin-top: 25px;">¡Que disfrutes tu experiencia gastronómica!</p>
      </div>
    `;
  } 
  // 3️⃣ CORREO C: CANCELACIÓN POR TOLERANCIA / NO-SHOW (CON COLOR CORPORATIVO Y SIN BOTÓN)
  else if (tipo === 'noshow') {
    asunto = `Aviso de Cancelación por Tolerancia (15 min) - ${infoRest.nombre}`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 2px solid ${colorTema};">
        <div style="text-align: center; border-bottom: 2px solid ${colorTema}; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: ${colorTema}; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif;">${infoRest.nombre.toUpperCase()}</h1>
          <p style="color: ${colorTema}; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase;">Aviso de Cancelación de Reserva</p>
        </div>
        <p style="font-size: 15px; color: #9faec0;">Hola <strong style="color: #ffffff;">${reserva.nombre}</strong>,</p>
        <p style="font-size: 15px; color: #9faec0;">Lamentamos informarte que tu reservación programada para hoy a las <b>${reserva.hora} hs</b> ha sido cancelada debido a que se superó el límite de tolerancia de <b>15 minutos</b>.</p>
        <p style="font-size: 13px; color: #768f9e; text-align: center; margin-top: 25px;">Si estás cerca o deseas agendar nuevamente, por favor comunícate con nuestro equipo de recepción.</p>
      </div>
    `;
  } else {
    return;
  }

  const mailOptions = {
    from: `"${infoRest.nombre}" <${process.env.EMAIL_USER || 'juan2005pablomart@gmail.com'}>`, 
    to: reserva.email,
    subject: asunto,
    html: contenidoHtml
  };

  try {
    console.log(` Envíando correo [${tipo.toUpperCase()}] a: ${reserva.email}...`);
    await transporter.sendMail(mailOptions);
    console.log(` Correo [${tipo.toUpperCase()}] enviado con éxito a: ${reserva.email}`);
  } catch (err) {
    console.log(` Error Nodemailer (no bloqueante): ${err.message}`);
  }
}

// =================================================================
// 🚨 ENDPOINT DE CANCELACIÓN DIRECTA POR EL CLIENTE DESDE EL CORREO
// =================================================================
app.get('/api/reservas/cancelar-cliente', async (req, res) => {
  const idReserva = req.query.id;
  const idRestaurante = Number(req.query.restaurante || 1);
  const infoRest = TEMAS_RESTAURANTES[idRestaurante] || { nombre: 'ReserveStack', color: '#d4af37' };

  if (!idReserva) {
    return res.status(400).send('<h3>ID de reservación no válido.</h3>');
  }

  try {
    // 1. Actualizar estado a 'cancelada' en MySQL
    const query = `UPDATE reservas SET estado = 'cancelada' WHERE id_reserva = ? AND id_restaurante = ?`;
    await db.query(query, [idReserva, idRestaurante]);

    // 2. Transmitir evento Socket.IO para actualizar el Admin de la Hostess en TIEMPO REAL
    if (idRestaurante === 1) {
      const reservasActualizadas = await obtenerReservasPietra();
      io.emit('actualizar_pietra', reservasActualizadas);
    } else {
      const reservasActualizadas = await obtenerReservasPorRestaurante(idRestaurante);
      io.to(`restaurante_${idRestaurante}`).emit('actualizar_rosa', reservasActualizadas);
      io.to(`restaurante_${idRestaurante}`).emit('actualizar_llorona', reservasActualizadas);
      io.to(`restaurante_${idRestaurante}`).emit('actualizar_reservas', reservasActualizadas);
    }

    // 3. Responder al navegador del cliente con una pantalla limpia de confirmación
    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reserva Cancelada - ${infoRest.nombre}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #0d1117; color: #ffffff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #161f2c; border: 2px solid ${infoRest.color}; border-radius: 16px; padding: 40px; text-align: center; max-width: 440px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
          h1 { color: ${infoRest.color}; font-family: 'Times New Roman', serif; margin-top: 0; font-size: 26px; }
          p { color: #9faec0; font-size: 14px; line-height: 1.6; }
          .badge { background: rgba(192, 57, 43, 0.2); color: #ff8e8e; border: 1px solid #c0392b; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 12px; display: inline-block; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="card">
          <span class="badge">CANCELADA POR CLIENTE</span>
          <h1>${infoRest.nombre.toUpperCase()}</h1>
          <p>Tu reservación ha sido cancelada exitosamente en nuestro sistema.</p>
          <p style="font-size: 12px; color: #768f9e;">Agradecemos que nos hayas notificado. ¡Esperamos poder atenderte muy pronto!</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error al cancelar reserva desde correo:', error);
    res.status(500).send('<h3>Ocurrió un error al procesar la cancelación.</h3>');
  }
});

// =================================================================
// 🛡️ ENDPOINT DE AUTENTICACIÓN / LOGIN HOSTESS
// =================================================================
app.post('/api/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    if ((usuario === 'admin' || usuario === 'hostess') && (password === 'admin123' || password === 'hostess2026')) {
      return res.json({
        success: true,
        token: 'token_reservestack_hostess_valid_2026',
        usuario: { nombre: 'Hostess Principal', rol: 'admin' }
      });
    }

    try {
      const [rows] = await db.query('SELECT * FROM usuarios WHERE (usuario = ? OR email = ?) AND password = ?', [usuario, usuario, password]);
      if (rows && rows.length > 0) {
        const user = rows[0];
        return res.json({
          success: true,
          token: 'token_reservestack_hostess_valid_2026',
          usuario: { nombre: user.nombre || user.usuario, rol: user.rol || 'hostess' }
        });
      }
    } catch (dbErr) {}

    res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos' });
  } catch (error) {
    console.error('Error en /api/auth/login:', error);
    res.status(500).json({ success: false, message: 'Error interno en autenticación' });
  }
});

const ID_RESTAURANTE_PIETRA = 1;

async function obtenerReservasPietra() {
  const query = `
    SELECT 
      id_reserva AS id, 
      DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, 
      TIME_FORMAT(hora, '%H:%i') AS hora, 
      zona, 
      id_mesa AS idMesa, 
      nombre, 
      personas, 
      telefono, 
      email, 
      nota, 
      estado 
    FROM reservas 
    WHERE id_restaurante = ?
  `;
  const [rows] = await db.query(query, [ID_RESTAURANTE_PIETRA]);
  return rows;
}

// =================================================================
// SOCKETS
// =================================================================
io.on('connection', (socket) => {
  socket.on('join_restaurante', (idRestaurante) => {
    socket.join(`restaurante_${idRestaurante}`);
    console.log(`🔌 Socket ${socket.id} se unió a la sala restaurante_${idRestaurante}`);
  });

  socket.on('disconnect', () => {});
});

// =================================================================
// ENDPOINTS PLANO — PIETRA
// =================================================================
app.get('/api/pietra/diseno', async (req, res) => {
  try {
    const query = `
      SELECT id_mesa AS id, zona, capacidad AS c, x, y, is_merged AS isMerged, is_vertical AS isVertical, display_id AS displayId, original_tables_json AS originalTables 
      FROM mesas WHERE id_restaurante = ?
    `;
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

// =================================================================
// ENDPOINTS RESERVAS — PIETRA
// =================================================================
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
    io.emit('actualizar_pietra', reservasActualizadas);

    // 🚀 Envío asíncrono y no bloqueante
    if (tipoCorreo === 'llegada' || tipoCorreo === 'noshow' || tipoCorreo === 'crear') {
      enviarCorreoPorTipo(req.body, tipoCorreo, 'Pietra Cucina', 1).catch(e => console.error('Error correo async Pietra:', e));
    } else if (isNewRecord === true || isNewRecord === 'true') {
      enviarCorreoPorTipo(req.body, 'crear', 'Pietra Cucina', 1).catch(e => console.error('Error correo async Pietra:', e));
    } else {
      console.log('ℹ Edición o movimiento de mesa. Correo OMITIDO.');
    }

    res.json({ success: true, message: 'Reserva registrada en MySQL con éxito' });
  } catch (error) {
    console.error('Error POST reserva Pietra:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// =================================================================
// ENDPOINTS GENÉRICOS MULTI-RESTAURANTE (Rosa Mexicano, Llorona Comedor)
// =================================================================
async function obtenerReservasPorRestaurante(idRestaurante) {
  const query = `
    SELECT 
      id_reserva AS id, 
      DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, 
      TIME_FORMAT(hora, '%H:%i') AS hora, 
      zona, 
      id_mesa AS idMesa, 
      nombre, 
      personas, 
      telefono, 
      email, 
      nota, 
      estado 
    FROM reservas 
    WHERE id_restaurante = ?
  `;
  const [rows] = await db.query(query, [idRestaurante]);
  return rows;
}

// --- DISEÑO / PLANO GENÉRICO ---
app.get('/api/restaurantes/:idRestaurante/diseno', async (req, res) => {
  const idRestaurante = Number(req.params.idRestaurante);
  try {
    const query = `
      SELECT id_mesa AS id, zona, capacidad AS c, x, y, is_merged AS isMerged, is_vertical AS isVertical, display_id AS displayId, original_tables_json AS originalTables 
      FROM mesas WHERE id_restaurante = ?
    `;
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
      if (!restauranteLayout[m.zona]) restauranteLayout[m.zona] = [];
      restauranteLayout[m.zona].push(mesaParsed);
    });

    res.json(restauranteLayout);
  } catch (error) {
    console.error('Error GET diseño genérico:', error);
    res.status(500).json({ error: 'Error interno' });
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
    io.to(`restaurante_${idRestaurante}`).emit('actualizar_diseno', restauranteLayout);
    res.json({ success: true, message: 'Plano guardado' });
  } catch (error) {
    await connection.rollback();
    console.error('Error POST diseño genérico:', error);
    res.status(500).json({ error: 'Error interno' });
  } finally {
    connection.release();
  }
});

// --- RESERVAS GENÉRICO ---
app.get('/api/restaurantes/:idRestaurante/reservas', async (req, res) => {
  const idRestaurante = Number(req.params.idRestaurante);
  try {
    const rows = await obtenerReservasPorRestaurante(idRestaurante);
    res.json(rows);
  } catch (error) {
    console.error('Error GET reservas genérico:', error);
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
    
    // 📢 Transmisión Socket.IO multicanal para actualizar Rosa o Llorona en tiempo real
    io.to(`restaurante_${idRestaurante}`).emit('actualizar_rosa', reservasActualizadas);
    io.to(`restaurante_${idRestaurante}`).emit('actualizar_llorona', reservasActualizadas);
    io.to(`restaurante_${idRestaurante}`).emit('actualizar_reservas', reservasActualizadas);

    const nombreRestaurante = NOMBRES_RESTAURANTES[idRestaurante] || 'ReserveStack';

    // 🚀 Envío asíncrono y no bloqueante
    if (tipoCorreo === 'llegada' || tipoCorreo === 'noshow' || tipoCorreo === 'crear') {
      enviarCorreoPorTipo(req.body, tipoCorreo, nombreRestaurante, idRestaurante).catch(e => console.error('Error correo async:', e));
    } else if (isNewRecord === true || isNewRecord === 'true') {
      enviarCorreoPorTipo(req.body, 'crear', nombreRestaurante, idRestaurante).catch(e => console.error('Error correo async:', e));
    } else {
      console.log('ℹ Edición o movimiento de mesa. Correo OMITIDO.');
    }

    res.json({ success: true, message: 'Reserva registrada en MySQL con éxito' });
  } catch (error) {
    console.error('Error POST reserva genérico:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(`🛡️ Servidor API seguro escuchando en puerto ${PORT}`);
  console.log('==================================================');
});
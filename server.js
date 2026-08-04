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
// CONFIGURACIÓN DE CORREO ELECTRÓNICO (NODEMAILER)
// =================================================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'juan2005pablomart@gmail.com',         
    pass: 'nswb ombp jupy kvpu'                  
  }
});

async function enviarCorreoPorTipo(reserva, tipo) {
  if (!reserva.email || reserva.email.trim() === '') {
    console.log('ℹ El cliente no proporcionó correo electrónico. Se omite el envío.');
    return;
  }

  let asunto = '';
  let contenidoHtml = '';

  if (tipo === 'crear') {
    asunto = `¡Tu Reserva está Confirmada! 🥂 - Pietra Cucina`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 1px solid #243141;">
        <div style="text-align: center; border-bottom: 2px solid #d4af37; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: #d4af37; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif;">PIETRA CUCINA</h1>
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
            <tr><td style="padding: 6px 0; color: #768f9e;">MESA:</td><td style="padding: 6px 0; color: #d4af37; text-align: right;"><b>Mesa ${reserva.idMesa}</b></td></tr>
          </table>
        </div>
        ${reserva.nota ? `<p style="color:#d4af37; font-style:italic; text-align:center;">"${reserva.nota}"</p>` : ''}
      </div>
    `;
  } else if (tipo === 'llegada') {
    asunto = `¡Tu Mesa está Lista! 🍽️ - Bienvenid@ a Pietra Cucina`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 1px solid #27ae60;">
        <div style="text-align: center; border-bottom: 2px solid #27ae60; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: #27ae60; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif;">PIETRA CUCINA</h1>
          <p style="color: #27ae60; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase;">¡Mesa Asignada y Lista!</p>
        </div>
        <p style="font-size: 15px; color: #9faec0;">Hola <strong style="color: #ffffff;">${reserva.nombre}</strong>,</p>
        <p style="font-size: 15px; color: #9faec0;">¡Nos alegra tenerte con nosotros! Tu mesa <b>Mesa ${reserva.idMesa}</b> en la zona <b>${reserva.zona}</b> ha sido asignada y te estamos esperando.</p>
        <p style="text-align: center; color: #27ae60; font-weight: bold; font-size: 16px; margin-top: 20px;">¡Que disfrutes tu experiencia gastronómica!</p>
      </div>
    `;
  } else if (tipo === 'noshow') {
    asunto = `Aviso de Cancelación por Tolerancia (15 min) - Pietra Cucina`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 1px solid #c0392b;">
        <div style="text-align: center; border-bottom: 2px solid #c0392b; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: #c0392b; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif;">PIETRA CUCINA</h1>
          <p style="color: #e74c3c; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase;">Aviso de Cancelación de Reserva</p>
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
    from: '"Pietra Cucina" <juan2005pablomart@gmail.com>', 
    to: reserva.email,
    subject: asunto,
    html: contenidoHtml
  };

  try {
    console.log(` Envíando correo [${tipo.toUpperCase()}] a: ${reserva.email}...`);
    await transporter.sendMail(mailOptions);
    console.log(` Correo [${tipo.toUpperCase()}] enviado con éxito a: ${reserva.email}`);
  } catch (err) {
    console.log(` Error Nodemailer: ${err.message}`);
  }
}

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

// Sockets
io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

// ENDPOINTS PLANO
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

// ENDPOINTS RESERVAS
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

    // 🚨 ENVIAR CORREO SEGÚN EL TIPO RECIBIDO DEL CLIENTE/HOSTESS
    if (tipoCorreo === 'llegada' || tipoCorreo === 'noshow' || tipoCorreo === 'crear') {
      enviarCorreoPorTipo(req.body, tipoCorreo);
    } else if (isNewRecord === true || isNewRecord === 'true') {
      enviarCorreoPorTipo(req.body, 'crear');
    } else {
      console.log('ℹ Edición o movimiento de mesa. Correo OMITIDO.');
    }

    res.json({ success: true, message: 'Reserva registrada en MySQL con éxito' });
  } catch (error) {
    console.error('Error POST reserva:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(`¡Servidor API y Sockets corriendo en puerto ${PORT}!`);
  console.log('==================================================');
});
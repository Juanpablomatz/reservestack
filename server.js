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
// CONFIGURACIÓN DE CORREO ELECTRONICO
// =================================================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'juan2005pablomart@gmail.com',         
    pass: 'nswb ombp jupy kvpu'                  
  }
});

async function enviarCorreoConfirmacion(reserva) {
  if (!reserva.email) {
    console.log('ℹ️ El cliente no proporcionó correo electrónico. Se omite el envío.');
    return;
  }

  const mailOptions = {
    from: '"Pietra Cucina" <juan2005pablomart@gmail.com>', 
    to: reserva.email,
    subject: `¡Tu Reserva está Confirmada! 🥂 - Pietra Cucina`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 1px solid #243141;">
        <div style="text-align: center; border-bottom: 2px solid #d4af37; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: #d4af37; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif; letter-spacing: 2px;">PIETRA CUCINA</h1>
          <p style="color: #768f9e; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px;">Confirmación Oficial de Reserva</p>
        </div>
        
        <p style="font-size: 15px; line-height: 1.6; color: #9faec0;">Hola <strong style="color: #ffffff;">${reserva.nombre}</strong>,</p>
        <p style="font-size: 15px; line-height: 1.6; color: #9faec0;">Nos complace confirmarte que tu reservación ha sido registrada en nuestro sistema con éxito. A continuación, te compartimos los detalles de tu mesa:</p>
        
        <div style="background-color: #131b24; padding: 20px; border-radius: 8px; border: 1px solid #243141; margin: 25px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #768f9e; font-size: 12px; text-transform: uppercase;">Fecha:</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: bold; text-align: right;">${reserva.fecha}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #768f9e; font-size: 12px; text-transform: uppercase;">Hora:</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: bold; text-align: right;">${reserva.hora} hs</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #768f9e; font-size: 12px; text-transform: uppercase;">Invitados:</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: bold; text-align: right;">${reserva.personas} comensales</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #768f9e; font-size: 12px; text-transform: uppercase;">Zona asignada:</td>
              <td style="padding: 6px 0; color: #ffffff; font-weight: bold; text-align: right; text-transform: uppercase;">${reserva.zona}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #768f9e; font-size: 12px; text-transform: uppercase;">Mesa física:</td>
              <td style="padding: 6px 0; color: #d4af37; font-weight: bold; text-align: right;">Mesa ${reserva.idMesa}</td>
            </tr>
          </table>
        </div>

        ${reserva.nota ? `
          <div style="background-color: rgba(212, 175, 55, 0.05); padding: 15px; border-left: 3px solid #d4af37; border-radius: 4px; margin-bottom: 25px;">
            <small style="color: #d4af37; font-weight: bold; text-transform: uppercase; display: block; font-size: 10px; margin-bottom: 5px;">Notas especiales:</small>
            <p style="margin: 0; color: #9faec0; font-size: 13px; font-style: italic;">"${reserva.nota}"</p>
          </div>
        ` : ''}

        <p style="font-size: 13px; line-height: 1.6; color: #768f9e; text-align: center; margin-top: 30px; border-top: 1px solid #243141; padding-top: 20px;">
          Si necesitas realizar algún cambio o cancelar tu reservación, por favor contáctanos con anticipación.<br>
          <strong style="color: #ffffff;">¡Estamos ansiosos por recibirte!</strong>
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Correo de confirmación enviado con éxito a: ${reserva.email}`);
  } catch (err) {
    console.log(`⚠️ Alerta de Correo: No se pudo enviar el email. Detalle: ${err.message}`);
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
  console.log(`🔌 Dispositivo conectado: ID ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`❌ Dispositivo desconectado.`);
  });
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
    console.error('Error GET diseño:', error);
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
    
    console.log(`📐 Distribución guardada en MySQL.`);
    io.emit('actualizar_diseno_pietra', restauranteLayout);
    res.json({ success: true, message: 'Plano guardado' });
  } catch (error) {
    await connection.rollback(); 
    console.error('Error POST diseño:', error);
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
    console.error('Error GET reservas:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/api/pietra/reservas', async (req, res) => {
  const { id, fecha, hora, zona, idMesa, nombre, personas, telefono, email, nota, estado, isNewRecord } = req.body;
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

    console.log(`✉️ Reserva de "${nombre}" registrada/actualizada con éxito.`);

    const reservasActualizadas = await obtenerReservasPietra();
    io.emit('actualizar_pietra', reservasActualizadas);

    if (isNewRecord) {
      enviarCorreoConfirmacion(req.body);
    }

    res.json({ success: true, message: 'Reserva registrada en MySQL con éxito' });
  } catch (error) {
    console.error('Error POST reserva:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(`¡Servidor API y Sockets iniciado con éxito!`);
  console.log(`Corriendo en: http://localhost:${PORT}`);
  console.log('==================================================');
});
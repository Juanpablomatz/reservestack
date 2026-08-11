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

// 🔑 Contraseña dinámica del Administrador en memoria (Inicia por defecto en 'hostess2026')
let activeAdminPassword = process.env.ADMIN_PASS || 'hostess2026';

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

// Almacenamiento temporal en memoria de los PINs de recuperación (Válidos por 10 min)
const recoveryPins = new Map();

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
  const hostBase = process.env.BASE_URL || `http://localhost:${PORT}`;
  const urlCancelacion = `${hostBase}/api/reservas/cancelar-cliente?id=${reserva.id}&restaurante=${idRestaurante}`;

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
  // 2️⃣ CORREO B: CANCELACIÓN POR TOLERANCIA / NO-SHOW / CANCELAR
  else if (tipo === 'noshow' || tipo === 'cancelar') {
    asunto = `Aviso de Cancelación de Reserva - ${infoRest.nombre}`;
    contenidoHtml = `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 2px solid ${colorTema};">
        <div style="text-align: center; border-bottom: 2px solid ${colorTema}; padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: ${colorTema}; margin: 0; font-size: 28px; font-family: 'Times New Roman', serif;">${infoRest.nombre.toUpperCase()}</h1>
          <p style="color: ${colorTema}; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase;">Aviso de Cancelación de Reserva</p>
        </div>
        <p style="font-size: 15px; color: #9faec0;">Hola <strong style="color: #ffffff;">${reserva.nombre}</strong>,</p>
        <p style="font-size: 15px; color: #9faec0;">Te informamos que tu reservación programada para la fecha <b>${reserva.fecha}</b> a las <b>${reserva.hora} hs</b> ha sido cancelada en nuestro sistema.</p>
        <p style="font-size: 13px; color: #768f9e; text-align: center; margin-top: 25px;">Si deseas agendar nuevamente en el futuro, por favor visita nuestra plataforma o comunícate con recepción.</p>
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
    console.log(`📧 Enviando correo [${tipo.toUpperCase()}] a: ${reserva.email}...`);
    await transporter.sendMail(mailOptions);
    console.log(`✅ Correo [${tipo.toUpperCase()}] enviado con éxito a: ${reserva.email}`);
  } catch (err) {
    console.log(`⚠️ Error Nodemailer (no bloqueante): ${err.message}`);
    console.log(`📩 [MODO DE RESPALDO DE CORREO LOCAL]`);
    console.log(`   Para: ${reserva.email}`);
    console.log(`   Asunto: ${asunto}`);
    console.log(`   URL de Cancelación directa: ${urlCancelacion}`);
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
    const query = `UPDATE reservas SET estado = 'cancelada' WHERE id_reserva = ? AND id_restaurante = ?`;
    await db.query(query, [idReserva, idRestaurante]);

    if (idRestaurante === 1) {
      const reservasActualizadas = await obtenerReservasPietra();
      io.emit('actualizar_pietra', reservasActualizadas);
      io.emit('actualizar_reservas', reservasActualizadas);
    } else {
      const reservasActualizadas = await obtenerReservasPorRestaurante(idRestaurante);
      io.emit('actualizar_rosa', reservasActualizadas);
      io.emit('actualizar_llorona', reservasActualizadas);
      io.emit('actualizar_reservas', reservasActualizadas);
      io.to(`restaurante_${idRestaurante}`).emit('actualizar_rosa', reservasActualizadas);
      io.to(`restaurante_${idRestaurante}`).emit('actualizar_llorona', reservasActualizadas);
      io.to(`restaurante_${idRestaurante}`).emit('actualizar_reservas', reservasActualizadas);
    }

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
// 🛡️ ENDPOINT DE AUTENTICACIÓN / LOGIN HOSTESS (CON SOPORTE DE EMAIL Y DUALIDAD)
// =================================================================
app.post('/api/auth/login', async (req, res) => {
  const usuarioOEmail = (req.body.usuario || req.body.email || '').toLowerCase().trim();
  const password = (req.body.password || '').trim();

  try {
    // 🔑 Acepta tu correo electrónico corporativo o los usuarios por defecto con la contraseña activa
    if (
      (usuarioOEmail === 'juan2005pablomart@gmail.com' || usuarioOEmail === 'admin' || usuarioOEmail === 'hostess') && 
      (password === activeAdminPassword)
    ) {
      return res.json({
        success: true,
        token: 'token_reservestack_hostess_valid_2026',
        usuario: { nombre: 'Hostess Principal', rol: 'admin', email: usuarioOEmail }
      });
    }

    // Comprueba también en MySQL si existe la tabla usuarios
    try {
      const [rows] = await db.query('SELECT * FROM usuarios WHERE (usuario = ? OR email = ?) AND password = ?', [usuarioOEmail, usuarioOEmail, password]);
      if (rows && rows.length > 0) {
        const user = rows[0];
        return res.json({
          success: true,
          token: 'token_reservestack_hostess_valid_2026',
          usuario: { nombre: user.nombre || user.usuario, rol: user.rol || 'hostess', email: user.email }
        });
      }
    } catch (dbErr) {}

    res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
  } catch (error) {
    console.error('Error en /api/auth/login:', error);
    res.status(500).json({ success: false, message: 'Error interno en autenticación' });
  }
});

// =================================================================
// 🔑 ENDPOINTS DE RECUPERACIÓN DE CONTRASEÑA VÍA PIN POR CORREO
// =================================================================

// 1. Solicitar PIN de recuperación
app.post('/api/auth/recuperar-password', async (req, res) => {
  const { email } = req.body;
  const correoAdmin = process.env.EMAIL_USER || 'juan2005pablomart@gmail.com';

  if (!email || email.trim() === '') {
    return res.status(400).json({ success: false, message: 'Debes proporcionar un correo electrónico válido' });
  }

  const emailLower = email.toLowerCase().trim();

  try {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // Válido por 10 minutos

    recoveryPins.set(emailLower, { pin, expiresAt });

    const mailOptions = {
      from: `"ReserveStack Seguridad" <${correoAdmin}>`,
      to: emailLower,
      subject: '🔑 PIN de Recuperación de Contraseña - ReserveStack',
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background-color: #0d1117; color: #ffffff; border-radius: 12px; border: 2px solid #e5007e;">
          <h2 style="color: #e5007e; text-align: center; margin-top: 0; font-family: 'Times New Roman', serif;">RESERVESTACK ADMIN</h2>
          <p style="font-size: 14px; color: #9faec0;">Hola,</p>
          <p style="font-size: 14px; color: #9faec0;">Has solicitado restablecer la contraseña de tu cuenta de administrador. Utiliza el siguiente PIN de seguridad:</p>
          
          <div style="background-color: #161f2c; border: 2px dashed #e5007e; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #e5007e;">${pin}</span>
          </div>

          <p style="font-size: 12px; color: #768f9e; text-align: center;">Este PIN es válido únicamente por <b>10 minutos</b>. Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`🔐 PIN de recuperación generado [${pin}] y enviado a: ${emailLower}`);

    res.json({ success: true, message: 'Te hemos enviado un PIN de 6 dígitos a tu correo electrónico' });
  } catch (error) {
    console.error('Error al enviar PIN de recuperación:', error);
    res.status(500).json({ success: false, message: 'No se pudo enviar el correo de recuperación. Revisa tu conexión.' });
  }
});

// 2. Verificar PIN ingresado
app.post('/api/auth/verificar-pin', (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) {
    return res.status(400).json({ success: false, message: 'Email y PIN son requeridos' });
  }

  const emailLower = email.toLowerCase().trim();
  const registro = recoveryPins.get(emailLower);

  if (!registro) {
    return res.status(400).json({ success: false, message: 'No hay ninguna solicitud de recuperación activa para este correo' });
  }

  if (Date.now() > registro.expiresAt) {
    recoveryPins.delete(emailLower);
    return res.status(400).json({ success: false, message: 'El PIN ha expirado. Solicita uno nuevo' });
  }

  if (registro.pin !== pin.trim()) {
    return res.status(400).json({ success: false, message: 'El PIN ingresado es incorrecto' });
  }

  res.json({ success: true, message: 'PIN verificado con éxito' });
});

// 3. Restablecer la contraseña
app.post('/api/auth/restablecer-password', async (req, res) => {
  const { email, pin, nuevaPassword } = req.body;

  if (!email || !pin || !nuevaPassword || nuevaPassword.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 6 caracteres' });
  }

  const emailLower = email.toLowerCase().trim();
  const registro = recoveryPins.get(emailLower);

  if (!registro || registro.pin !== pin.trim() || Date.now() > registro.expiresAt) {
    return res.status(400).json({ success: false, message: 'PIN inválido o expirado' });
  }

  try {
    // ⚡ 1. ACTUALIZA LA CONTRASEÑA EN MEMORIA DE INMEDIATO (Descarta la clave anterior)
    activeAdminPassword = nuevaPassword.trim();

    // 2. Intenta actualizar también en MySQL si existe la tabla usuarios
    try {
      const query = `UPDATE usuarios SET password = ? WHERE email = ? OR usuario = 'admin' OR usuario = 'hostess'`;
      await db.query(query, [nuevaPassword.trim(), emailLower]);
    } catch (dbError) {}

    recoveryPins.delete(emailLower);

    console.log(`✅ Contraseña del Administrador restablecida dinámicamente a: [${nuevaPassword.trim()}]`);
    res.json({ success: true, message: '¡Tu contraseña ha sido actualizada con éxito! Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({ success: false, message: 'Error interno al actualizar la contraseña' });
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
    
    // 📢 Transmisión Socket.IO en tiempo real (Global + Sala)
    io.emit('actualizar_pietra', reservasActualizadas);
    io.emit('actualizar_reservas', reservasActualizadas);
    io.to('restaurante_1').emit('actualizar_pietra', reservasActualizadas);

    if (tipoCorreo === 'noshow' || tipoCorreo === 'cancelar' || tipoCorreo === 'crear') {
      enviarCorreoPorTipo(req.body, tipoCorreo, 'Pietra Cucina', 1).catch(e => console.error('Error correo async Pietra:', e));
    } else if (isNewRecord === true || isNewRecord === 'true') {
      enviarCorreoPorTipo(req.body, 'crear', 'Pietra Cucina', 1).catch(e => console.error('Error correo async Pietra:', e));
    } else {
      console.log('ℹ Cambio de estado sin correo adicional.');
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
    
    // 📢 Transmisión Socket.IO multicanal global + sala en tiempo real
    io.emit('actualizar_rosa', reservasActualizadas);
    io.emit('actualizar_llorona', reservasActualizadas);
    io.emit('actualizar_reservas', reservasActualizadas);
    io.to(`restaurante_${idRestaurante}`).emit('actualizar_rosa', reservasActualizadas);
    io.to(`restaurante_${idRestaurante}`).emit('actualizar_llorona', reservasActualizadas);
    io.to(`restaurante_${idRestaurante}`).emit('actualizar_reservas', reservasActualizadas);

    const nombreRestaurante = TEMAS_RESTAURANTES[idRestaurante] ? TEMAS_RESTAURANTES[idRestaurante].nombre : 'ReserveStack';

    if (tipoCorreo === 'noshow' || tipoCorreo === 'cancelar' || tipoCorreo === 'crear') {
      enviarCorreoPorTipo(req.body, tipoCorreo, nombreRestaurante, idRestaurante).catch(e => console.error('Error correo async:', e));
    } else if (isNewRecord === true || isNewRecord === 'true') {
      enviarCorreoPorTipo(req.body, 'crear', nombreRestaurante, idRestaurante).catch(e => console.error('Error correo async:', e));
    } else {
      console.log('ℹ Cambio de estado sin correo adicional.');
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
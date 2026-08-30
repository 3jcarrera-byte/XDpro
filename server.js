// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const User = require('./models/User'); // Mapea directamente con tu esquema limpio

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io (Configurada para mitigar caídas en Render)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket'] // Evita el long-polling y microcortes de proxies en Render
});

// ========================================================
// MIDDLEWARES ESENCIALES
// ========================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); 

// ========================================================
// CONEXIÓN A LA BASE DE DATOS MONGODB
// ========================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xdpro'; 
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado a la base de datos MongoDB'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// ========================================================
// ENDPOINT: REGISTRO DE NUEVOS GLADIADORES (EXTENDIDO)
// ========================================================
app.post('/api/auth/register', async (req, res) => {
    // Recibe los 8 campos estructurados desde el frontend reactivo
    const { username, password, email, pais, nombre, apellido, wallet } = req.body;
    
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos.' });
        }

        // Búsqueda insensible a mayúsculas para evitar duplicidad de nicks en el Dominio
        const existingUser = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } 
        });

        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está tomado.' });
        }

        // SOLUCIÓN: Pasamos la contraseña en texto plano. 
        // Tu models/User.js se encargará de encriptarla automáticamente al ejecutar .save()
        const nuevoUsuario = new User({ 
            username: username.trim(), 
            password: password, 
            email: email ? email.trim() : null,
            pais: pais ? pais.trim() : null,
            nombre: nombre ? nombre.trim() : null,
            apellido: apellido ? apellido.trim() : null,
            wallet: wallet ? wallet.trim() : null
        });

        await nuevoUsuario.save();
        return res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
        
    } catch (error) {
        console.error('Error al registrar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

// ========================================================
// ENDPOINT: INICIO DE SESIÓN (LOGIN TOTALMENTE CORREGIDO)
// ========================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Campos incompletos.' });
        }

        // Búsqueda flexible e insensible a mayúsculas/minúsculas
        const usuario = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } 
        });

        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }
        
        // Control Antifraude
        if (usuario.status === 'banned_perm') {
            return res.status(403).json({ success: false, message: 'Cuenta suspendida permanentemente.' });
        }

        // SOLUCIÓN AL ACCESO: Usamos el método matemático comparePassword definido en tu models/User.js
        const esValido = await usuario.comparePassword(password);
        if (!esValido) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // Si las credenciales coinciden, otorgamos acceso inmediato al Panel del Imperio
        return res.status(200).json({ 
            success: true, 
            userId: usuario._id,
            username: usuario.username,
            balance: usuario.balance || 0
        });

    } catch (error) {
        console.error('Error al autenticar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

// ========================================================
// LÓGICA DE SOCKET.IO (EL ÁRBITRO EN TIEMPO REAL)
// ========================================================
io.on('connection', (socket) => {
    console.log(`🎮 Un jugador se ha conectado: ${socket.id}`);

    // Evento de autenticación en tiempo real para emparejar la sesión
    socket.on('jugador:autenticado', (data) => {
        console.log(`Gladiador verificado en red de sockets: ${data.username}`);
    });

    socket.on('join_arena', (data) => {
        console.log(`Jugador ${data.username} buscando partida en la Arena...`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Jugador desconectado: ${socket.id}`);
    });
});

// ========================================================
// RUTA COMODÍN PARA TU SPA (EVITA EL ERROR DE JAVASCRIPT)
// ========================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================================
// INICIAR EL SERVIDOR (OBLIGATORIO Usar server.listen para Sockets)
// ========================================================
const PORT = process.env.PORT || 5173; 
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Árbitro de XDpro corriendo en el puerto ${PORT}`);
});

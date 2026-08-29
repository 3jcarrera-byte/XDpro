// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const User = require('./models/User'); 

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io (Permite conexiones desde cualquier sitio web)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
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
// ENDPOINT: REGISTRO DE NUEVOS GLADIADORES
// ========================================================
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está tomado.' });
        }
        const nuevoUsuario = new User({ username, password });
        await nuevoUsuario.save();
        return res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (error) {
        console.error('Error al registrar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

// ========================================================
// ENDPOINT: INICIO DE SESIÓN (LOGIN)
// ========================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const usuario = await User.findOne({ username });
        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }
        
        // Control Antifraude Simple
        if (usuario.status === 'banned_perm') {
            return res.status(403).json({ success: false, message: 'Cuenta suspendida permanentemente.' });
        }

        // Validación de contraseña directa
        const esValido = (usuario.password === password);
        if (!esValido) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        return res.status(200).json({ 
            success: true, 
            userId: usuario._id,
            username: usuario.username,
            balance: usuario.balance
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

    // Aquí escucharás las acciones de la Arena, Carreón, etc.
    socket.on('join_arena', (data) => {
        console.log(`Jugador ${data.username} buscando partida en la Arena...`);
        // Lógica futura de emparejamiento de 3 jugadores
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

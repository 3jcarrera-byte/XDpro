const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// --- NUEVO: Importar los modelos de persistencia lógicos ---
const UserModel = require('./models/User');
const GameDataModel = require('./models/GameData');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Servir archivos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// "Base de Datos" temporal en memoria del servidor
const usuariosRegistrados = {};
const estadosDeJuego = {};

// Gestión de eventos en tiempo real con Socket.io
io.on('connection', (socket) => {
    console.log(`Dispositivo conectado al Árbitro: ${socket.id}`);

    // Manejo de Registro de nuevos usuarios reales
    socket.on('auth:register', (data) => {
        const { user, password } = data;
        
        if (!user || !password || user.trim() === "") {
            return socket.emit('auth:error', { mensaje: "Campos inválidos." });
        }

        if (usuariosRegistrados[user]) {
            return socket.emit('auth:error', { mensaje: "El usuario ya existe en el servidor." });
        }

        // Instanciar y almacenar la estructura del nuevo jugador
        usuariosRegistrados[user] = new UserModel(user, password);
        estadosDeJuego[user] = new GameDataModel(user);

        console.log(`[Servidor] Nuevo usuario creado: ${user}`);
        socket.emit('auth:register_success', { mensaje: "Cuenta creada exitosamente." });
    });

    // Manejo de Inicio de Sesión
    socket.on('auth:login', (data) => {
        const { user, password } = data;
        const cuenta = usuariosRegistrados[user];

        if (!cuenta || cuenta.password !== password) {
            return socket.emit('auth:error', { mensaje: "Credenciales incorrectas." });
        }

        // Vincular el socket del dispositivo al nombre de usuario actual
        socket.username = user;

        console.log(`[Servidor] Sesión iniciada para: ${user}`);
        
        // Enviar al cliente su perfil financiero y su progreso de cimientos
        socket.emit('auth:success', {
            user: cuenta.username,
            saldo: cuenta.saldoDisponible,
            poseeAldea: cuenta.poseeAldea,
            gameData: estadosDeJuego[user]
        });
    });

    // Desconexión del dispositivo
    socket.on('disconnect', () => {
        console.log(`Dispositivo desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Árbitro de XDpro operativo en puerto ${PORT}`);
});

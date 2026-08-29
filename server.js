const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir archivos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Gestión de conexiones de Socket.io
io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // Escuchar cuando un usuario intenta iniciar sesión o registrarse
    socket.on('auth:login', (data) => {
        // Aquí irá la validación con Base de Datos más adelante
        console.log(`Intento de login: ${data.user}`);
        // Respuesta simulada de éxito
        socket.emit('auth:success', { user: data.user, slotsUsados: 0 });
    });

    // Desconexión
    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Árbitro corriendo en el puerto ${PORT}`);
});

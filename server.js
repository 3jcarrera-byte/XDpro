// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto'); // Módulo nativo para generar UUIDs seguros
const User = require('./models/User'); 
const GameDataModel = require('./models/GameData'); // Tu clase POJO de control de inventario

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io (Configurada para mitigar caídas en Render)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket'] 
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
// CACHÉ EN MEMORIA DEL ÁRBITRO Y CATÁLOGO DE LA TIENDA
// ========================================================
const cachePartidas = {}; // Guarda instancias activas de GameDataModel indexadas por username
let stockTiendaSistema = { edificios: [], personajes: [], equipamiento: [] };

const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'granja', nombre: '🌾 Granja Imperial', rareza: 'Común', precioBase: 50 },
        { subtipo: 'aserradero', nombre: '🪓 Aserradero Alfa', rareza: 'Común', precioBase: 60 }
    ],
    personajes: [
        { subtipo: 'gladiador_minero', nombre: '👨‍🌾 Minero de Élite', rareza: 'Poco Común', precioBase: 120 },
        { subtipo: 'guerrero_arena', nombre: '⚔️ Recluta de Arena', rareza: 'Común', precioBase: 80 }
    ],
    equipamiento: [
        { subtipo: 'espada_bronce', nombre: '🗡️ Espada de Bronce', rareza: 'Común', precioBase: 30 }
    ]
};

// Genera cartas individuales destinadas al mostrador público de la tienda
function crearCartaParaTienda(diseño) {
    return {
        tiendaItemId: crypto.randomUUID(), // ID efímero de mostrador
        subtipo: diseño.subtipo,
        nombre: diseño.nombre,
        tipo: diseño.subtipo.includes('espada') ? 'equipamiento' : (diseño.subtipo.includes('gladiador') ? 'personaje' : 'edificio'),
        rareza: diseño.rareza,
        precio: diseño.precioBase
    };
}

// Rellena la tienda al encender el servidor con exactamente 3 cartas por tipo
function inicializarTiendaSistema() {
    stockTiendaSistema = { edificios: [], personajes: [], equipamiento: [] };
    for (const rubro in CATALOGO_DISEÑOS) {
        CATALOGO_DISEÑOS[rubro].forEach(diseño => {
            for (let i = 0; i < 3; i++) {
                stockTiendaSistema[rubro].push(crearCartaParaTienda(diseño));
            }
        });
    }
    console.log("🏪 Tienda AMM inicializada estrictamente con 3 cartas por tipo.");
}
inicializarTiendaSistema();

// ========================================================
// ENDPOINT: REGISTRO DE NUEVOS GLADIADORES (EXTENDIDO)
// ========================================================
app.post('/api/auth/register', async (req, res) => {
    const { username, password, email, pais, nombre, apellido, wallet } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos.' });
        }
        const existingUser = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } 
        });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está tomado.' });
        }
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
// ENDPOINT: INICIO DE SESIÓN
// ========================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Campos incompletos.' });
        }
        const usuario = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } 
        });
        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }
        if (usuario.status === 'banned_perm') {
            return res.status(403).json({ success: false, message: 'Cuenta suspendida permanentemente.' });
        }
        const esValido = await usuario.comparePassword(password);
        if (!esValido) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // Instanciar o recuperar el GameData del jugador en la caché del servidor al loguearse
        if (!cachePartidas[usuario.username]) {
            cachePartidas[usuario.username] = new GameDataModel(usuario.username);
        }

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

    // Evento de enlace de sesión
    socket.on('jugador:autenticado', (data) => {
        socket.username = data.username;
        console.log(`Gladiador verificado en red de sockets: ${data.username}`);
        
        // Si por alguna razón no se instanció en el HTTP login, lo creamos aquí
        if (data.username && !cachePartidas[data.username]) {
            cachePartidas[data.username] = new GameDataModel(data.username);
        }
    });

    // 1. Enviar stock del mercado del sistema al cliente
    socket.on('tienda:solicitar-stock', () => {
        socket.emit('tienda:recibir-stock', stockTiendaSistema);
    });

    // 2. Transacción de compra con validación atómica y regeneración
    socket.on('tienda:comprar-carta', async (datos) => {
        const { itemId, rubro } = datos;
        const username = socket.username;

        if (!username || !cachePartidas[username]) {
            return socket.emit('tienda:error', 'Sesión de juego no válida o expirada.');
        }
        if (!stockTiendaSistema[rubro]) {
            return socket.emit('tienda:error', 'Categoría comercial no válida.');
        }

        // Bloqueo de carrera: buscar si el artículo aún está disponible en la tienda
        const indexItem = stockTiendaSistema[rubro].findIndex(item => item.tiendaItemId === itemId);
        if (indexItem === -1) {
            return socket.emit('tienda:error', 'La carta ya fue adquirida por otro jugador.');
        }

        const cartaTienda = stockTiendaSistema[rubro][indexItem];

        try {
            // Validación financiera directa en MongoDB
            const usuario = await User.findOne({ username: username });
            if (!usuario || usuario.balance < cartaTienda.precio) {
                return socket.emit('tienda:error', 'Monedas imperiales insuficientes.');
            }

            // Descuento de saldo atómico
            usuario.balance -= cartaTienda.precio;
            await usuario.save();

            // Generación de ADN único e inyección segura en la estructura del inventario del jugador
            const juegoData = cachePartidas[username];
            const nuevaCartaUUID = crypto.randomUUID();
            const cartaRegistrada = juegoData.registrarNuevaCarta({
                uuid: nuevaCartaUUID,
                tipo: cartaTienda.tipo,
                subtipo: cartaTienda.subtipo,
                rareza: cartaTienda.rareza,
                nivel: 0
            });

            // DISPARADOR: Remover artículo comprado del mostrador y regenerar stock al instante
            stockTiendaSistema[rubro].splice(indexItem, 1);
            const diseñoOriginal = CATALOGO_DISEÑOS[rubro].find(d => d.subtipo === cartaTienda.subtipo);
            stockTiendaSistema[rubro].push(crearCartaParaTienda(diseñoOriginal));

            // Confirmación de éxito al comprador
            socket.emit('tienda:compra-exitosa', {
                nuevoBalance: usuario.balance,
                carta: cartaRegistrada
            });

             // Sincronización masiva de vitrina a todos los jugadores en línea
            io.emit('tienda:recibir-stock', stockTiendaSistema);

        } catch (error) {
            console.error('Error en transacción de mercado:', error);
            socket.emit('tienda:error', 'Error interno al procesar la compra.');
        }
    });

    // Evento de búsqueda de emparejamiento en la Arena (CON BACKTICKS CORREGIDOS)
    socket.on('join_arena', (data) => {
        console.log(`Jugador ${data.username} buscando partida en la Arena...`);
    });

    // Control de salida de jugadores en red
    socket.on('disconnect', () => {
        console.log(`❌ Jugador desconectado: ${socket.id}`);
    });
});

// ========================================================
// RUTA COMODÍN PARA TU SPA (Evita errores de recarga)
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

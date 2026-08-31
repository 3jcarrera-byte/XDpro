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

// CORRECCIÓN: Rarezas estandarizadas en minúsculas y sin acentos para que calcen con mercado.js
const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'granja', nombre: '🌾 Granja Imperial', rareza: 'comun', precioBase: 50 },
        { subtipo: 'aserradero', nombre: '🪓 Aserradero Alfa', rareza: 'comun', precioBase: 60 }
    ],
    personajes: [
        { subtipo: 'gladiador_minero', nombre: '👨‍🌾 Minero de élite', rareza: 'poco-comun', precioBase: 120 },
        { subtipo: 'guerrero_arena', nombre: '⚔️ Recluta de Arena', rareza: 'comun', precioBase: 80 }
    ],
    equipamiento: [
        { subtipo: 'espada_bronce', nombre: '🗡️ Espada de Bronce', rareza: 'comun', precioBase: 30 }
    ]
};

// Genera cartas individuales destinadas al mostrador público de la tienda
function crearCartaParaTienda(diseño) {
    return {
        tiendaItemId: crypto.randomUUID(), 
        subtipo: diseño.subtipo,
        nombre: diseño.nombre,
        tipo: diseño.subtipo.includes('espada') ? 'equipamiento' : (diseño.subtipo.includes('gladiador') ? 'personaje' : 'edificio'),
        rareza: diseño.rareza,
        precio: diseño.precioBase
    };
}

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
// ENDPOINT: INICIO DE SESIÓN (REPARADO Y BLINDADO)
// ========================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Campos incompletos.' });
        }

        // Buscar al gladiador ignorando mayúsculas/minúsculas y espacios
        const usuario = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } 
        });

        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // 🛡️ CONTROL DE ACCESO ESTRICTO: BANEO PERMANENTE
        if (usuario.status === 'banned_perm') {
            return res.status(403).json({ 
                success: false, 
                message: `Cuenta suspendida permanentemente. Razón: ${usuario.banReason || 'No especificada'}` 
            });
        }

        // 🛡️ CONTROL DE ACCESO ESTRICTO: BANEO TEMPORAL
        if (usuario.status === 'banned_temp') {
            if (usuario.banUntil && new Date() < usuario.banUntil) {
                const horasRestantes = Math.ceil((usuario.banUntil - new Date()) / (1000 * 60 * 60));
                return res.status(403).json({ 
                    success: false, 
                    message: `Cuenta suspendida temporalmente. Quedan ${horasRestantes} horas. Razón: ${usuario.banReason || 'No especificada'}` 
                });
            } else {
                // Si el tiempo de baneo ya expiró, reactivamos al usuario automáticamente
                usuario.status = 'active';
                usuario.banReason = null;
                usuario.banUntil = null;
                await usuario.save();
            }
        }

        // Verificar contraseña encriptada usando el método del modelo User.js
        const esValido = await usuario.comparePassword(password);
        if (!esValido) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // 🗄️ PERSISTENCIA AUTOMÁTICA EN MONGODB Y INICIALIZACIÓN DE CANVAS 3D
        if (!cachePartidas[usuario.username]) {
  let juegoData = await GameDataModel.findOne({ username: usuario.username });
  
  if (!juegoData) {
    juegoData = new GameDataModel({ username: usuario.username });
    juegoData.inicializarEspaciosVacios();
    await juegoData.save();
    // Guardar el objeto plano de JS en la caché del Árbitro
    cachePartidas[usuario.username] = juegoData.toObject();
  } else {
    cachePartidas[usuario.username] = juegoData.toObject();
  }
}

        // Respuesta exitosa al cliente SPA con datos de balance actualizados
        return res.status(200).json({ 
            success: true, 
            userId: usuario._id,
            username: usuario.username,
            balance: usuario.balance || 0,
            poseeAldea: usuario.poseeAldea || false 
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

    socket.on('jugador:autenticado', (data) => {
        socket.username = data.username;
        console.log(`Gladiador verificado en red de sockets: ${data.username}`);
        
        if (data.username && !cachePartidas[data.username]) {
            cachePartidas[data.username] = new GameDataModel(data.username);
        }
    });

    socket.on('tienda:solicitar-stock', () => {
        socket.emit('tienda:recibir-stock', stockTiendaSistema);
    });

    socket.on('tienda:comprar-carta', async (datos) => {
        const { itemId, rubro } = datos;
        const username = socket.username;

        if (!username || !cachePartidas[username]) {
            return socket.emit('tienda:error', 'Sesión de juego no válida o expirada.');
        }
        if (!stockTiendaSistema[rubro]) {
            return socket.emit('tienda:error', 'Categoría comercial no válida.');
        }

        const indexItem = stockTiendaSistema[rubro].findIndex(item => item.tiendaItemId === itemId);
        if (indexItem === -1) {
            return socket.emit('tienda:error', 'La carta ya fue adquirida por otro jugador.');
        }

        const cartaTienda = stockTiendaSistema[rubro][indexItem];

        try {
            const usuario = await User.findOne({ username: username });
            if (!usuario || usuario.balance < cartaTienda.precio) {
                return socket.emit('tienda:error', 'Monedas imperiales insuficientes.');
            }

            usuario.balance -= cartaTienda.precio;
            await usuario.save();

            const juegoData = cachePartidas[username];
            const nuevaCartaUUID = crypto.randomUUID();
            const cartaRegistrada = juegoData.registrarNuevaCarta({
                uuid: nuevaCartaUUID,
                tipo: cartaTienda.tipo,
                subtipo: cartaTienda.subtipo,
                rareza: cartaTienda.rareza,
                nivel: 0
            });

            stockTiendaSistema[rubro].splice(indexItem, 1);
            const diseñoOriginal = CATALOGO_DISEÑOS[rubro].find(d => d.subtipo === cartaTienda.subtipo);
            stockTiendaSistema[rubro].push(crearCartaParaTienda(diseñoOriginal));

            socket.emit('tienda:compra-exitosa', {
                nuevoBalance: usuario.balance,
                carta: cartaRegistrada
            });

            io.emit('tienda:recibir-stock', stockTiendaSistema);

        } catch (error) {
            console.error('Error en transacción de mercado:', error);
            socket.emit('tienda:error', 'Error interno al procesar la compra.');
        }
    });

    // INTEGRACIÓN RECEPTOR DRAG & DROP DEL CARRETÓN SANEADO
    socket.on('carreton:guardar-posicion', async (data) => {
        const { cartaId, bloqueDestino, slotDestinoIndex } = data;
        const username = socket.username;

        if (!username || !cachePartidas[username]) return;
        const juegoData = cachePartidas[username];

        let listaOrigen = null;
        let cartaEncontrada = null;
        
        ['cartasAldea', 'cartasFinca', 'cartasCentral'].forEach(bloque => {
            const idx = juegoData.carretonCartas[bloque].findIndex(c => c.id === cartaId);
            if (idx !== -1) {
                cartaEncontrada = juegoData.carretonCartas[bloque][idx];
                listaOrigen = juegoData.carretonCartas[bloque];
                listaOrigen.splice(idx, 1);
            }
        });

        if (!cartaEncontrada) return socket.emit('carreton:error', 'La carta especificada no existe.');
        
        cartaEncontrada.slotIndex = slotDestinoIndex;

        if (bloqueDestino === 'aldea') juegoData.carretonCartas.cartasAldea.push(cartaEncontrada);
        if (bloqueDestino === 'finca') juegoData.carretonCartas.cartasFinca.push(cartaEncontrada);
        if (bloqueDestino === 'central') juegoData.carretonCartas.cartasCentral.push(cartaEncontrada);

        console.log(`💾 Posición de carta ${cartaId} guardada con éxito para ${username}.`);

        socket.emit('carreton:actualizar-estado', {
            poseeAldea: juegoData.poseeAldea,
            slotsCentralMax: juegoData.poseeAldea ? 24 : 8,
            cartasAldea: juegoData.carretonCartas.cartasAldea,
            cartasFinca: juegoData.carretonCartas.cartasFinca,
            cartasCentral: juegoData.carretonCartas.cartasCentral
        });
    });

    // INTEGRACIÓN RECEPTOR SOLICITUD DE DATOS CARRETÓN
    socket.on('carreton:solicitar-datos', async () => {
        const username = socket.username;
        if (!username || !cachePartidas[username]) return;

        try {
            const usuarioBD = await User.findOne({ username: username });
            const juegoData = cachePartidas[username];
            if (!usuarioBD) return socket.emit('carreton:error', 'Usuario no encontrado.');

            juegoData.poseeAldea = usuarioBD.poseeAldea || false;
            const slotsHabilitadosCentral = juegoData.poseeAldea ? 24 : 8;

            socket.emit('carreton:actualizar-estado', {
                poseeAldea: juegoData.poseeAldea,
                slotsCentralMax: slotsHabilitadosCentral,
                cartasAldea: juegoData.carretonCartas.cartasAldea,
                cartasFinca: juegoData.carretonCartas.cartasFinca,
                cartasCentral: juegoData.carretonCartas.cartasCentral
            });
        } catch (error) {
            console.error("Error al consultar la base de datos para el Carretón:", error);
        }
    });

    socket.on('join_arena', (data) => {
        console.log(`Jugador ${data.username} buscando partida en la Arena...`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Jugador desconectado: ${socket.id}`);
    });
});

// ========================================================
// RUTA COMODÍN PARA SPA
// ========================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================================
// INICIAR EL SERVIDOR
// ========================================================
const PORT = process.env.PORT || 5173; 
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Árbitro de XDpro corriendo en el puerto ${PORT}`);
});

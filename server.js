// ========================================================
// server.js - Configuración e Inicialización Completa (Unificado 100%)
// ========================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const User = require('./models/User');
const GameDataModel = require('./models/GameData');

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io
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
// 🏗️ FUNCIÓN AUXILIAR DE INICIALIZACIÓN LIMPIA (EVITA FANTASMAS)
// ========================================================
function inicializarCimientosPorDefecto() {
    const cimientosFincaIniciales = [
        { slotId: 0, estaOcupado: false, subtipo: null, nivel: 0 },
        { slotId: 1, estaOcupado: false, subtipo: null, nivel: 0 },
        { slotId: 2, estaOcupado: false, subtipo: null, nivel: 0 },
        { slotId: 3, estaOcupado: false, subtipo: null, nivel: 0 },
        { slotId: 4, estaOcupado: false, subtipo: null, nivel: 0 }
    ];

    const cimientosAldeaIniciales = [];
    for (let i = 0; i < 12; i++) {
        cimientosAldeaIniciales.push({
            slotId: i,
            estaOcupado: false,
            subtipo: null,
            nivel: 0
        });
    }

    return {
        cimientosFinca: cimientosFincaIniciales,
        cimientosAldea: cimientosAldeaIniciales
    };
}

// ========================================================
// CACHÉ EN MEMORIA DEL ÁRBITRO Y CATÁLOGO DE LA TIENDA
// ========================================================
const cachePartidas = {};
let stockTiendaSistema = { edificios: [], aldeanos: [], equipamiento: [] };

const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'granja', nombre: '🌾 Granja Imperial', rareza: 'comun', precioBase: 50, nivelInicial: 0 },
        { subtipo: 'aserradero', nombre: '🪓 Aserradero Alfa', rareza: 'comun', precioBase: 60, nivelInicial: 0 }
    ],
    aldeanos: [
        { subtipo: 'gladiador_minero', nombre: '👨‍🌾 Minero de élite', rareza: 'poco-comun', precioBase: 120, nivelInicial: 0 },
        { subtipo: 'guerrero_arena', nombre: '⚔️ Recluta de Arena', rareza: 'comun', precioBase: 80, nivelInicial: 0 }
    ],
    equipamiento: [
        { subtipo: 'espada_bronce', nombre: '🗡️ Espada de Bronce', rareza: 'comun', precioBase: 30 }
    ]
};

function crearCartaParaTienda(diseño, rubro) {
    return {
        tiendaItemId: crypto.randomUUID(),
        subtipo: diseño.subtipo,
        nombre: diseño.nombre,
        tipo: rubro,
        rareza: diseño.rareza,
        precio: diseño.precioBase,
        nivel: diseño.nivelInicial !== undefined ? diseño.nivelInicial : 0
    };
}

function inicializarTiendaSistema() {
    stockTiendaSistema = { edificios: [], aldeanos: [], equipamiento: [] };
    for (const rubro in CATALOGO_DISEÑOS) {
        stockTiendaSistema[rubro] = [];
        CATALOGO_DISEÑOS[rubro].forEach(diseño => {
            for (let i = 0; i < 3; i++) {
                stockTiendaSistema[rubro].push(crearCartaParaTienda(diseño, rubro));
            }
        });
    }
    console.log("🏪 Tienda AMM inicializada strictly con 3 cartas por tipo.");
}

inicializarTiendaSistema();

// ========================================================
// ENDPOINTS HTTP DE AUTENTICACIÓN
// ========================================================

app.post('/api/auth/register', async (req, res) => {
    const { username, password, email, pais, nombre, apellido, wallet } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos.' });
        }

        const usernameLimpio = username.trim();
        
        if (cachePartidas[usernameLimpio]) {
            delete cachePartidas[usernameLimpio];
        }

        const usuarioExistente = await User.findOne({ username: new RegExp(`^${usernameLimpio}$`, 'i') });
        if (usuarioExistente) {
            return res.status(400).json({ success: false, message: 'El Nick ya está ocupado por otro gladiador.' });
        }
        
        await GameDataModel.deleteOne({ username: usernameLimpio });

        const nuevoUsuario = new User({ 
            username: usernameLimpio, 
            password: password, 
            email: email ? email.trim() : null,
            pais: pais ? pais.trim() : null,
            nombre: nombre ? nombre.trim() : null,
            apellido: apellido ? apellido.trim() : null,
            wallet: wallet ? wallet.trim() : null,
            balance: 100.00 
        });
        
        await nuevoUsuario.save();

        const juegoData = new GameDataModel({ 
            username: usernameLimpio,
            ...inicializarCimientosPorDefecto()
        });
        
        if (typeof juegoData.inicializarEspaciosVacios === 'function') {
            juegoData.inicializarEspaciosVacios();
        }

        if (!juegoData.almacenEdificiosDisponibles) {
            juegoData.almacenEdificiosDisponibles = [];
        }

        juegoData.almacenEdificiosDisponibles.push({
            uuid: crypto.randomUUID(),
            subtipo: 'casona',
            nombre: '🏛️ Casona Base',
            rareza: 'comun',
            nivel: 0
        });

        await juegoData.save();
        
        return res.status(201).json({ success: true, message: 'Usuario y Casona Base creados exitosamente.' });
    } catch (error) {
        console.error('❌ Error al registrar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

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
            return res.status(403).json({ 
                success: false, 
                message: `Cuenta suspendida permanentemente. Razón: ${usuario.banReason || 'No especificada'}` 
            });
        }

        if (usuario.status === 'banned_temp') {
            if (usuario.banUntil && new Date() < usuario.banUntil) {
                const horasRestantes = Math.ceil((usuario.banUntil - new Date()) / (1000 * 60 * 60));
                return res.status(403).json({ 
                    success: false, 
                    message: `Cuenta suspendida temporalmente. Quedan ${horasRestantes} horas. Razón: ${usuario.banReason || 'No especificada'}` 
                });
            } else {
                usuario.status = 'active';
                usuario.banReason = null;
                usuario.banUntil = null;
                await usuario.save();
            }
        }

        const esContraseñaValida = await usuario.comparePassword(password);
        if (!esContraseñaValida) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        const usernameReal = usuario.username; 

        let juegoData = await GameDataModel.findOne({ username: usernameReal });
        
        if (!juegoData) {
            juegoData = new GameDataModel({ 
                username: usernameReal,
                ...inicializarCimientosPorDefecto()
            });
            if (typeof juegoData.inicializarEspaciosVacios === 'function') {
                juegoData.inicializarEspaciosVacios();
            }
            
            if (!juegoData.almacenEdificiosDisponibles) {
                juegoData.almacenEdificiosDisponibles = [];
            }

            juegoData.almacenEdificiosDisponibles.push({
                uuid: crypto.randomUUID(),
                subtipo: 'casona',
                nombre: '🏛️ Casona Base',
                rareza: 'comun',
                nivel: 0
            });
            await juegoData.save();
        } else {
            if (!juegoData.cimientosFinca || juegoData.cimientosFinca.length === 0) {
                juegoData.cimientosFinca = inicializarCimientosPorDefecto().cimientosFinca;
                juegoData.markModified('cimientosFinca');
                await juegoData.save();
            }

            const tieneCasona = juegoData.almacenEdificiosDisponibles && juegoData.almacenEdificiosDisponibles.some(e => e.subtipo === 'casona');
            const estaConstruidaCasona = juegoData.cimientosFinca && juegoData.cimientosFinca.some(c => c.estaOcupado && c.subtipo === 'casona');

            if (!tieneCasona && !estaConstruidaCasona) {
                if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
                juegoData.almacenEdificiosDisponibles.push({
                    uuid: crypto.randomUUID(),
                    subtipo: 'casona',
                    nombre: '🏛️ Casona Base',
                    rareza: 'comun',
                    nivel: 0
                });
                juegoData.markModified('almacenEdificiosDisponibles');
                await juegoData.save();
            }
        }
        
        cachePartidas[usernameReal] = juegoData;
        cachePartidas[usernameReal]._poseeAldeaNFT = usuario.poseeAldea || false;

        return res.status(200).json({ 
            success: true, 
            userId: usuario._id,
            username: usernameReal,
            balance: usuario.balance || 0,
            poseeAldea: usuario.poseeAldea || false 
        });
        
    } catch (error) {
        console.error('❌ Error crítico en la autenticación:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

// ==========================================================================
// DESPACHO E INGENIERÍA TRANSACCIONAL (SOCKET.IO)
// ==========================================================================

// 🛠️ FUNCIÓN AUXILIAR DE SINCRONIZACIÓN DEL CARRETÓN DE CARTAS
async function forzarEnvioEstadoCarreton(socket, username, juegoData) {
    if (!juegoData) {
        juegoData = await GameDataModel.findOne({ username });
    }
    if (!juegoData) return;

    const poseeAldea = cachePartidas[username]?._poseeAldeaNFT || false;
    const maxSlots = poseeAldea ? 24 : 8;

    if (!juegoData.carretonCartas) {
        juegoData.carretonCartas = { cartasCentral: [] };
    }

    socket.emit('carreton:actualizar-estado', {
        cartasCentral: juegoData.carretonCartas.cartasCentral || [],
        maxSlots: maxSlots,
        poseeAldea: poseeAldea
    });
}

io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`); 

    if (socket.handshake?.auth?.username) {
        socket.username = socket.handshake.auth.username;
    }

    // ==========================================================================
    // 🛡️ VINCULACIÓN AUTORITARIA DE RED Y SINCRONIZACIÓN DE CACHÉ
    // ==========================================================================
    socket.on('jugador:autenticado', async (data) => {
        if (!data || !data.username) return;
        
        const usernameLimpio = data.username.trim();
        socket.username = usernameLimpio; 
        console.log(`🏛️ Gladiador enlazado con éxito en sockets: ${socket.username}`);
        
        try {
            let juegoData = await GameDataModel.findOne({ username: usernameLimpio });
            const usuarioBD = await User.findOne({ username: usernameLimpio });
            
            if (juegoData) {
                cachePartidas[usernameLimpio] = juegoData;
                cachePartidas[usernameLimpio]._poseeAldeaNFT = usuarioBD ? usuarioBD.poseeAldea : false;
                
                socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca || []);
                
                socket.emit('almacen:actualizar-estado', {
                    recursos: juegoData.almacenEdificiosDisponibles || []
                });
                
                await forzarEnvioEstadoCarreton(socket, usernameLimpio, juegoData);
            }
        } catch (err) {
            console.error("❌ Fallo crítico al sincronizar sesión de socket:", err);
        }
    });

    socket.emit('tienda:recibir-stock', stockTiendaSistema);

    socket.on('tienda:solicitar-stock', () => {
        socket.emit('tienda:recibir-stock', stockTiendaSistema);
    });

    socket.on('almacen:solicitar-recursos', async (data = {}) => {
        let username = socket.username || data.username;
        
        if (!username) {
            return socket.emit('almacen:error', 'Sesión no autenticada.');
        }
        
        socket.username = username;

        try {
            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData && cachePartidas[username]) {
                juegoData = cachePartidas[username];
            }
            
            if (!juegoData) {
                return socket.emit('almacen:error', 'Sesión de juego no encontrada.');
            }

            cachePartidas[username] = juegoData;
            
            socket.emit('almacen:actualizar-estado', { 
                recursos: juegoData.almacenEdificiosDisponibles || [] 
            });
        } catch (error) {
            console.error("❌ Error solicitando recursos del almacén:", error);
            socket.emit('almacen:error', 'Error interno al consultar el almacén.');
        }
    });

    // 🏪 TRANSACCIÓN ECONÓMICA ATÓMICA ULTRA-RESILIENTE
    socket.on('tienda:comprar-carta', async (datos) => {
        if (!datos) return;
        const { itemId, rubro } = datos;
        
        let username = socket.username || datos.username;
        
        if (!username) {
            return socket.emit('tienda:error', 'Sesión de juego no válida. Por favor, recarga o re-conecta.');
        }
        
        socket.username = username;

        if (!stockTiendaSistema[rubro]) {
            return socket.emit('tienda:error', 'Categoría comercial no válida.');
        }

        const indexItem = stockTiendaSistema[rubro].findIndex(item => item.tiendaItemId === itemId);
        if (indexItem === -1) {
            return socket.emit('tienda:error', 'La carta ya fue adquirida por otro gladiador.');
        }

        const cartaTienda = stockTiendaSistema[rubro][indexItem];

        try {
            const usuario = await User.findOne({ username: username });
            if (!usuario || usuario.balance < cartaTienda.precio) {
                return socket.emit('tienda:error', 'Monedas imperiales insuficientes en tus arcas.');
            }

            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData) {
                if (cachePartidas[username]) {
                    juegoData = cachePartidas[username];
                } else {
                    juegoData = new GameDataModel({ 
                        username: username,
                        ...inicializarCimientosPorDefecto()
                    });
                    if (typeof juegoData.inicializarEspaciosVacios === 'function') {
               juegoData.inicializarEspaciosVacios();
        }
    }
}
cachePartidas[username] = juegoData;

// 1. Validaciones de seguridad previa sobre la caché
const poseeNFT = Boolean(juegoData?._poseeAldeaNFT);
const maxSlotsCentral = poseeNFT ? 24 : 8;

// Asegurar estructura de carretonCartas antes de evaluar
if (!juegoData.carretonCartas) juegoData.carretonCartas = { cartasCentral: [] };
if (!juegoData.carretonCartas.cartasCentral) juegoData.carretonCartas.cartasCentral = [];

// 2. Control de capacidad del Carretón Central
if (cartaTienda.tipo === 'aldeanos' && juegoData.carretonCartas.cartasCentral.length >= maxSlotsCentral) {
    return socket.emit('tienda:error', 'Tu Carretón Central está lleno. Requiere liberar slots.');
}

// 3. Generación de identificador único de activo
const nuevoIdActivo = crypto.randomUUID();

// 4. Procesamiento de adquisición según el rubro
if (cartaTienda.tipo === 'aldeanos') {
    // Optimización en la búsqueda de slot index disponible mediante Set
    const slotsOcupados = new Set(juegoData.carretonCartas.cartasCentral.map(c => c.slotIndex));
    let slotLibre = 0;
    while (slotsOcupados.has(slotLibre)) {
        slotLibre++;
    }

    const nuevoPoblador = {
        id: nuevoIdActivo,
        uuid: nuevoIdActivo,
        subtipo: cartaTienda.subtipo,
        nombre: cartaTienda.nombre,
        rareza: cartaTienda.rareza,
        nivel: 0, 
        slotIndex: slotLibre,
        equipamientoAnidado: []
    };
    
    juegoData.carretonCartas.cartasCentral.push(nuevoPoblador);
    juegoData.markModified('carretonCartas');
} else {
    const nuevoEdificio = {
        id: nuevoIdActivo,
        uuid: nuevoIdActivo,
        subtipo: cartaTienda.subtipo,
        nombre: cartaTienda.nombre,
        rareza: cartaTienda.rareza,
        nivel: 0 
    };
    
    if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
    juegoData.almacenEdificiosDisponibles.push(nuevoEdificio);
    juegoData.markModified('almacenEdificiosDisponibles');
}

// 5. Persistencia Atómica: Se descuenta saldo y se guardan ambos documentos juntos
usuario.balance -= cartaTienda.precio;
await Promise.all([
    usuario.save(),
    juegoData.save()
]);

// 6. Rotación de Stock en Tienda Sistema
stockTiendaSistema[rubro].splice(indexItem, 1);
const catalogoRubro = rubro === 'aldeanos' ? 'aldeanos' : rubro;

if (typeof CATALOGO_DISEÑOS !== 'undefined' && CATALOGO_DISEÑOS[catalogoRubro]) {
    const diseñoOriginal = CATALOGO_DISEÑOS[catalogoRubro].find(d => d.subtipo === cartaTienda.subtipo);
    if (diseñoOriginal) {
        stockTiendaSistema[rubro].push(crearCartaParaTienda(diseñoOriginal, rubro));
    }
}

// 7. Notificaciones Sincronizadas
socket.emit('tienda:compra-exitosa', {
    nuevoBalance: usuario.balance,
    carta: { id: nuevoIdActivo, nombre: cartaTienda.nombre, tipo: cartaTienda.tipo }
});

io.emit('tienda:recibir-stock', stockTiendaSistema);

socket.emit('almacen:actualizar-estado', {
    recursos: juegoData.almacenEdificiosDisponibles || []
});

await forzarEnvioEstadoCarreton(socket, username, juegoData);

} catch (error) {
    console.error('❌ Error crítico en el procesamiento de compra:', error);
    socket.emit('tienda:error', 'Error interno al adjudicar activos en base de datos.');
}
});

   // ==========================================================================
    // 🚚 GESTIÓN DEL CARRETÓN Y EQUIPAMIENTO
    // ==========================================================================
    socket.on('carreton:solicitar-estado', async (data = {}) => {
        const username = socket.username || data?.username;
        if (!username) return;

        try {
            let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
            if (juegoData) {
                cachePartidas[username] = juegoData;
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }
        } catch (err) {
            console.error('❌ Error en carreton:solicitar-estado:', err);
        }
    });

    socket.on('carreton:mover-carta', async (data = {}) => {
        const { uuidCarta, haciaSlot } = data;
        const username = socket.username || data?.username;
        if (!username || uuidCarta === undefined || haciaSlot === undefined) return;

        try {
            let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
            if (!juegoData || !juegoData.carretonCartas?.cartasCentral) return;

            const carta = juegoData.carretonCartas.cartasCentral.find(c => c.uuid === uuidCarta || c.id === uuidCarta);
            if (carta) {
                carta.slotIndex = haciaSlot;
                juegoData.markModified('carretonCartas');
                
                await juegoData.save();
                cachePartidas[username] = juegoData;
                
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }
        } catch (err) {
            console.error('❌ Error al mover carta en el carretón:', err);
        }
    });

    socket.on('carreton:equipar-item', async (data = {}) => {
        const { uuidAldeano, uuidItem } = data;
        const username = socket.username || data?.username;
        if (!username || !uuidAldeano || !uuidItem) return;

        try {
            let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
            if (!juegoData) return;

            const aldeano = juegoData.carretonCartas?.cartasCentral?.find(c => c.uuid === uuidAldeano || c.id === uuidAldeano);
            
            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            const indexItem = juegoData.almacenEdificiosDisponibles.findIndex(i => i.uuid === uuidItem || i.id === uuidItem);

            if (aldeano && indexItem !== -1) {
                const [item] = juegoData.almacenEdificiosDisponibles.splice(indexItem, 1);
                if (!aldeano.equipamientoAnidado) aldeano.equipamientoAnidado = [];
                aldeano.equipamientoAnidado.push(item);

                juegoData.markModified('carretonCartas');
                juegoData.markModified('almacenEdificiosDisponibles');
                
                await juegoData.save();
                cachePartidas[username] = juegoData;

                await forzarEnvioEstadoCarreton(socket, username, juegoData);
                socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            }
        } catch (err) {
            console.error('❌ Error al equipar ítem:', err);
        }
    });

    // ==========================================================================
    // 🏗️ CONSTRUCCIÓN Y DESMANTELAMIENTO EN LA FINCA (CON EVACUACIÓN Y STACKS DE 99)
    // ==========================================================================
    socket.on('finca:construir', async (data = {}) => {
        const { slotId, uuidEdificio } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
            if (!juegoData) return socket.emit('finca:error', 'Datos de juego no encontrados.');

            if (!juegoData.cimientosFinca) juegoData.cimientosFinca = [];
            const slot = juegoData.cimientosFinca.find(s => s.slotId === slotId);
            
            if (!slot) return socket.emit('finca:error', 'Slot de finca no válido.');
            if (slot.estaOcupado) return socket.emit('finca:error', 'El slot ya está ocupado.');

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            const indexEdificio = juegoData.almacenEdificiosDisponibles.findIndex(e => e.uuid === uuidEdificio || e.id === uuidEdificio);
            if (indexEdificio === -1) return socket.emit('finca:error', 'Edificio no encontrado en el almacén.');

            const [edificio] = juegoData.almacenEdificiosDisponibles.splice(indexEdificio, 1);

            slot.estaOcupado = true;
            slot.subtipo = edificio.subtipo;
            slot.nivel = edificio.nivel || 0;
            slot.nombre = edificio.nombre || edificio.subtipo;
            slot.uuid = edificio.uuid || edificio.id;

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            
            await juegoData.save();
            cachePartidas[username] = juegoData;

            socket.emit('finca:construccion-exitosa', { slotId, edificio: slot });
            socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca);
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
        } catch (err) {
            console.error('❌ Error en finca:construir:', err);
            socket.emit('finca:error', 'Error al construir en la finca.');
        }
    });

    socket.on('finca:desmantelar', async (data = {}) => {
        const { slotId } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
            if (!juegoData || !juegoData.cimientosFinca) return socket.emit('finca:error', 'Datos de juego no encontrados.');

            const slotIndex = juegoData.cimientosFinca.findIndex(s => s.slotId === slotId);
            if (slotIndex === -1 || !juegoData.cimientosFinca[slotIndex].estaOcupado) {
                return socket.emit('finca:error', 'El slot especificado no tiene ninguna estructura para desmantelar.');
            }

            const slot = juegoData.cimientosFinca[slotIndex];

            // 1. Evacuar la estructura al almacén de edificios
            const uuidEvacuado = slot.uuid || crypto.randomUUID();
            const edificioEvacuado = {
                uuid: uuidEvacuado,
                id: uuidEvacuado,
                subtipo: slot.subtipo,
                nombre: slot.nombre || slot.subtipo,
                nivel: slot.nivel || 0,
                rareza: slot.rareza || 'comun'
            };

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            juegoData.almacenEdificiosDisponibles.push(edificioEvacuado);

            // 2. Evacuar recursos anidados acumulados con agrupación en stacks de 99
            if (slot.recursosAnidados && Array.isArray(slot.recursosAnidados)) {
                for (const item of slot.recursosAnidados) {
                    let cantidadRestante = Number(item.cantidad) || 1;
                    while (cantidadRestante > 0) {
                        let stackExistente = juegoData.almacenEdificiosDisponibles.find(
                            e => e.subtipo === item.subtipo && e.esRecurso && (Number(e.cantidad) || 1) < 99
                        );
                        if (stackExistente) {
                            const cantActual = Number(stackExistente.cantidad) || 1;
                            const espacioEnStack = 99 - cantActual;
                            const agregar = Math.min(cantidadRestante, espacioEnStack);
                            stackExistente.cantidad = cantActual + agregar;
                            cantidadRestante -= agregar;
                        } else {
                            const cantidadStack = Math.min(cantidadRestante, 99);
                            const idRecurso = crypto.randomUUID();
                            juegoData.almacenEdificiosDisponibles.push({
                                uuid: idRecurso,
                                id: idRecurso,
                                subtipo: item.subtipo,
                                nombre: item.nombre || `📦 ${item.subtipo}`,
                                esRecurso: true,
                                cantidad: cantidadStack
                            });
                            cantidadRestante -= cantidadStack;
                        }
                    }
                }
            }

            // 3. Limpiar y liberar el slot en la Finca
            juegoData.cimientosFinca[slotIndex] = {
                slotId: slotId,
                estaOcupado: false,
                subtipo: null,
                nivel: 0,
                nombre: null,
                uuid: null
            };

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            
            await juegoData.save();
            cachePartidas[username] = juegoData;

            socket.emit('finca:desmantelamiento-exitoso', { slotId });
            socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca);
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
        } catch (err) {
            console.error('❌ Error desmantelando estructura:', err);
            socket.emit('finca:error', 'Error al desmantelar la estructura.');
        }
    });

    // ==========================================================================
    // 🌾 PRODUCCIÓN Y RECOLECCIÓN CON AGRUPACIÓN EN STACKS DE 99
    // ==========================================================================
    socket.on('finca:recolectar-produccion', async (data = {}) => {
        const { slotId } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
            if (!juegoData || !juegoData.cimientosFinca) return socket.emit('finca:error', 'Datos no encontrados.');

            const slot = juegoData.cimientosFinca.find(s => s.slotId === slotId);
            if (!slot || !slot.estaOcupado) return socket.emit('finca:error', 'Estructura no encontrada.');

            if (!slot.produccionPendiente || slot.produccionPendiente <= 0) {
                return socket.emit('finca:error', 'No hay recursos pendientes para recolectar.');
            }

            let cantidadAñadir = Number(slot.produccionPendiente) || 0;
            const tipoRecurso = slot.subtipo === 'granja' ? 'trigo' : (slot.subtipo === 'aserradero' ? 'madera' : 'material');

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];

            // Lógica de llenado atómico hasta el límite de 99 por pila
            while (cantidadAñadir > 0) {
                let stackExistente = juegoData.almacenEdificiosDisponibles.find(
                    e => e.subtipo === tipoRecurso && e.esRecurso && (Number(e.cantidad) || 1) < 99
                );

                if (stackExistente) {
                    const cantActual = Number(stackExistente.cantidad) || 1;
                    const espacioEnStack = 99 - cantActual;
                    const agregar = Math.min(cantidadAñadir, espacioEnStack);
                    stackExistente.cantidad = cantActual + agregar;
                    cantidadAñadir -= agregar;
                } else {
                    const cantidadStack = Math.min(cantidadAñadir, 99);
                    const idRecurso = crypto.randomUUID();
                    juegoData.almacenEdificiosDisponibles.push({
                        uuid: idRecurso,
                        id: idRecurso,
                        subtipo: tipoRecurso,
                        nombre: `📦 ${tipoRecurso.charAt(0).toUpperCase() + tipoRecurso.slice(1)}`,
                        esRecurso: true,
                        cantidad: cantidadStack
                    });
                    cantidadAñadir -= cantidadStack;
                }
            }

            slot.produccionPendiente = 0;
            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            
            await juegoData.save();
            cachePartidas[username] = juegoData;

            socket.emit('finca:recoleccion-exitosa', { slotId, recurso: tipoRecurso });
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
        } catch (err) {
            console.error('❌ Error en recolección:', err);
            socket.emit('finca:error', 'Error al recolectar producción.');
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id} (${socket.username || 'invitado'})`);
    });
});

// ==========================================================================
// 🚀 INICIALIZACIÓN DEL SERVIDOR HTTP Y SOCKETS
// ==========================================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose exitosamente en el puerto ${PORT}`);
});

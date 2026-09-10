// ==========================================================================
// server.js - Servidor Principal Unificado y Definitivo (Con Casona y Población)
// ==========================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// ==========================================================================
// 📦 IMPORTACIÓN Y RESOLUCIÓN DEFENSIVA DE MODELOS (ANTI-MISSINGSCHEMA)
// ==========================================================================
const rawUser = require('./models/User');
const rawGameData = require('./models/GameData');

/**
 * 🛡️ RESOLUTORES DEFENSIVOS DE MODELOS
 * Resuelven el modelo directamente desde la caché activa de Mongoose (mongoose.models),
 * desde el módulo exportado, o compilan el Schema sobre la marcha.
 */
function obtenerModeloUsuario() {
    if (mongoose.models && mongoose.models.User) return mongoose.models.User;
    if (rawUser && typeof rawUser.findOne === 'function') return rawUser;
    if (rawUser && rawUser.User && typeof rawUser.User.findOne === 'function') return rawUser.User;
    if (rawUser && rawUser.UserModel && typeof rawUser.UserModel.findOne === 'function') return rawUser.UserModel;
    
    const schemaToCompile = rawUser?.schema || (rawUser?.obj ? rawUser : null);
    if (schemaToCompile) return mongoose.model('User', schemaToCompile);

    try {
        return mongoose.model('User');
    } catch (e) {
        throw new Error('El modelo "User" no está registrado ni exportado correctamente en ./models/User.js');
    }
}

function obtenerModeloGameData() {
    if (mongoose.models && mongoose.models.GameData) return mongoose.models.GameData;
    if (rawGameData && typeof rawGameData.findOne === 'function') return rawGameData;
    if (rawGameData && rawGameData.GameData && typeof rawGameData.GameData.findOne === 'function') return rawGameData.GameData;
    if (rawGameData && rawGameData.GameDataModel && typeof rawGameData.GameDataModel.findOne === 'function') return rawGameData.GameDataModel;

    const schemaToCompile = rawGameData?.schema || (rawGameData?.obj ? rawGameData : null);
    if (schemaToCompile) return mongoose.model('GameData', schemaToCompile);

    try {
        return mongoose.model('GameData');
    } catch (e) {
        throw new Error('El modelo "GameData" no está registrado ni exportado correctamente en ./models/GameData.js');
    }
}

const app = express();
const server = http.createServer(app);

// Configuración de Socket.io
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// ==========================================================================
// MIDDLEWARES ESENCIALES
// ==========================================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================================================
// 🔐 ENRUTADOR DE AUTENTICACIÓN IMPERIAL UNIFICADO
// ==========================================================================
const authRouter = express.Router();

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// 📝 1. RUTA DE REGISTRO DE GLADIADORES
authRouter.post('/register', async (req, res) => {
    try {
        const { username, password, email, pais, nombre, apellido, wallet } = req.body;

        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ success: false, message: 'El nombre de usuario y la contraseña son obligatorios.' });
        }

        const usernameLimpio = username.trim();
        if (usernameLimpio.length < 3) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario debe tener al menos 3 caracteres.' });
        }

        const User = obtenerModeloUsuario();
        const GameDataModel = obtenerModeloGameData();

        const usuarioExistente = await User.findOne({ username: new RegExp(`^${escapeRegex(usernameLimpio)}$`, 'i') });
        if (usuarioExistente) {
            return res.status(409).json({ success: false, message: 'El nombre de gladiador ya se encuentra registrado en el Imperio.' });
        }

        let passwordFinal = password;
        const dummyUser = new User({});
        if (typeof dummyUser.comparePassword !== 'function' && !password.startsWith('$2')) {
            const salt = await bcrypt.genSalt(10);
            passwordFinal = await bcrypt.hash(password, salt);
        }

        const nuevoUsuario = new User({
            username: usernameLimpio,
            password: passwordFinal,
            email: email && typeof email === 'string' ? email.trim().toLowerCase() : null,
            pais: pais && typeof pais === 'string' ? pais.trim() : null,
            nombre: nombre && typeof nombre === 'string' ? nombre.trim() : null,
            apellido: apellido && typeof apellido === 'string' ? apellido.trim() : null,
            wallet: wallet && typeof wallet === 'string' ? wallet.trim() : null,
            balance: 100.00
        });

        await nuevoUsuario.save();

        try {
            // ==========================================================================
            // 📦 INICIALIZACIÓN DE GAMEDATA CON LA CASONA ÚNICA INICIAL
            // ==========================================================================
            let nuevoGameData = new GameDataModel({
                username: nuevoUsuario.username,
                // Cada gladiador nace con su carta de estructura civil protegida
                almacenEdificiosDisponibles: [
                    {
                        uuid: `carta-casona-${nuevoUsuario.username}`,
                        id: `carta-casona-${nuevoUsuario.username}`,
                        tipo: 'estructura',
                        subtipo: 'casona',
                        nombre: 'Casona Imperial',
                        descripcion: 'Estructura civil única. Habilita +2 slots de población en la Finca.',
                        esTradeable: false,
                        esDestructible: false,
                        estaAnidado: false,
                        slotAnidado: null,
                        nivel: 0,
                        rareza: 'epica'
                    }
                ],
                carretonCartas: { cartasCentral: [], cartasFinca: [], cartasAldea: [] }
            });

            if (typeof nuevoGameData.inicializarEspaciosVacios === 'function') {
                nuevoGameData.inicializarEspaciosVacios();
            }
            await nuevoGameData.save();
        } catch (gameDataError) {
            console.error('⚠️ Error al crear GameData en el registro:', gameDataError);
            await User.deleteOne({ _id: nuevoUsuario._id });
            throw new Error('Fallo en la inicialización de los datos del juego del gladiador.');
        }

        return res.status(201).json({
            success: true,
            message: 'Gladiador registrado y parcelas del Imperio inicializadas correctamente.',
            username: nuevoUsuario.username
        });

    } catch (error) {
        console.error('❌ Error crítico en ruta /register:', error);
        if (error.code === 11000) {
            return res.status(409).json({ success: false, message: 'El nombre de gladiador o correo electrónico ya está registrado.' });
        }
        return res.status(500).json({ success: false, message: 'Error interno del servidor al procesar el registro imperial.' });
    }
});

// 🔑 2. RUTA DE INICIO DE SESIÓN (LOGIN ROBUSTO)
authRouter.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ success: false, message: 'Debe proveer usuario y contraseña válidos.' });
        }

        const usernameLimpio = username.trim();
        const User = obtenerModeloUsuario();
        const GameDataModel = obtenerModeloGameData();

        const usuario = await User.findOne({ username: new RegExp(`^${escapeRegex(usernameLimpio)}$`, 'i') });
        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas o gladiador no encontrado.' });
        }

        if (usuario.status && usuario.status !== 'active') {
            return res.status(403).json({ success: false, message: `Acceso restringido. Motivo: ${usuario.banReason || 'Sanción administrativa en curso.'}` });
        }

        let esPasswordValida = false;
        if (typeof usuario.comparePassword === 'function') {
            esPasswordValida = await usuario.comparePassword(password);
        } else if (usuario.password && typeof usuario.password === 'string' && usuario.password.startsWith('$2')) {
            esPasswordValida = await bcrypt.compare(password, usuario.password);
        } else {
            esPasswordValida = (usuario.password === password);
        }

        if (!esPasswordValida) {
            return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
        }

        let gameData = await GameDataModel.findOne({ username: usuario.username });
        if (!gameData) {
            gameData = new GameDataModel({ 
                username: usuario.username,
                almacenEdificiosDisponibles: [
                    {
                        uuid: `carta-casona-${usuario.username}`,
                        id: `carta-casona-${usuario.username}`,
                        tipo: 'estructura',
                        subtipo: 'casona',
                        nombre: 'Casona Imperial',
                        descripcion: 'Estructura civil única. Habilita +2 slots de población en la Finca.',
                        esTradeable: false,
                        esDestructible: false,
                        estaAnidado: false,
                        slotAnidado: null,
                        nivel: 0,
                        rareza: 'epica'
                    }
                ],
                carretonCartas: { cartasCentral: [], cartasFinca: [], cartasAldea: [] }
            });
            if (typeof gameData.inicializarEspaciosVacios === 'function') {
                gameData.inicializarEspaciosVacios();
            }
            await gameData.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Sesión iniciada con éxito.',
            username: usuario.username,
            balance: usuario.balance,
            poseeAldea: usuario.poseeAldea || false
        });

    } catch (error) {
        console.error('❌ Error crítico en ruta /login:', error);
        return res.status(500).json({ success: false, message: 'Error interno al intentar autenticar al gladiador.' });
    }
});

// Registrar el router de autenticación en Express
app.use('/api/auth', authRouter);

// ==========================================================================
// CONEXIÓN A LA BASE DE DATOS MONGODB
// ==========================================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xdpro';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado a la base de datos MongoDB'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// ==========================================================================
// 🏗️ FUNCIONES AUXILIARES Y ESTADO EN MEMORIA
// ==========================================================================
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

function inicializarCimientosPorDefecto() {
    return {
        cimientosFinca: Array.from({ length: 5 }, (_, i) => ({ slotId: i, estaOcupado: false, subtipo: null, nivel: 0 })),
        cimientosAldea: Array.from({ length: 12 }, (_, i) => ({ slotId: i, estaOcupado: false, subtipo: null, nivel: 0 }))
    };
}

function crearCartaParaTienda(diseño, rubro) {
    return {
        tiendaItemId: crypto.randomUUID(),
        subtipo: diseño.subtipo,
        nombre: diseño.nombre,
        tipo: rubro,
        rareza: diseño.rareza,
        precio: diseño.precioBase,
        nivel: diseño.nivelInicial ?? 0
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
    console.log("🏪 Tienda AMM inicializada con 3 cartas por tipo.");
}

inicializarTiendaSistema();

function agregarRecursoAlmacen(almacen, subtipo, cantidad, nombrePersonalizado = null) {
    if (!Array.isArray(almacen)) return;
    let cantidadRestante = Number(cantidad) || 0;
    while (cantidadRestante > 0) {
        let stackExistente = almacen.find(
            e => e.subtipo === subtipo && e.esRecurso && (Number(e.cantidad) || 1) < 99
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
            almacen.push({
                uuid: idRecurso,
                id: idRecurso,
                subtipo: subtipo,
                nombre: nombrePersonalizado || `📦 ${subtipo.charAt(0).toUpperCase() + subtipo.slice(1)}`,
                esRecurso: true,
                cantidad: cantidadStack
            });
            cantidadRestante -= cantidadStack;
        }
    }
}

async function obtenerOGenerarJuegoData(username) {
    const GameData = obtenerModeloGameData();
    let juegoData = cachePartidas[username] || await GameData.findOne({ username });
    if (!juegoData) {
        juegoData = new GameData({ 
            username, 
            ...inicializarCimientosPorDefecto(),
            almacenEdificiosDisponibles: [
                {
                    uuid: `carta-casona-${username}`,
                    id: `carta-casona-${username}`,
                    tipo: 'estructura',
                    subtipo: 'casona',
                    nombre: 'Casona Imperial',
                    descripcion: 'Estructura civil única. Habilita +2 slots de población en la Finca.',
                    esTradeable: false,
                    esDestructible: false,
                    estaAnidado: false,
                    slotAnidado: null,
                    nivel: 0,
                    rareza: 'epica'
                }
            ],
            carretonCartas: { cartasCentral: [] }
        });
        if (typeof juegoData.inicializarEspaciosVacios === 'function') {
            juegoData.inicializarEspaciosVacios();
        }
        await juegoData.save();
    }
    cachePartidas[username] = juegoData;
    return juegoData;
}

// ==========================================================================
// 📊 CONTROL DEMOGRÁFICO DE POBLACIÓN ACTIVA Y REPARTICIÓN DE POBLADORES
// ==========================================================================
async function enviarEstadoFincaActualizado(socket, username, juegoData) {
    if (!juegoData) {
        juegoData = await obtenerOGenerarJuegoData(username);
    }

    // 1. Contar si la casona única está activa (anidada) en algún cimiento 3D o en el almacén
    const casonaActiva = (juegoData.almacenEdificiosDisponibles || []).some(
        carta => carta.subtipo === 'casona' && carta.estaAnidado === true
    ) || (juegoData.cimientosFinca || []).some(
        cimiento => cimiento.estaOcupado && cimiento.subtipo === 'casona'
    );

    // 2. Establecer el límite demográfico dinámico (Casona otorga 2 de población máxima)
    const maxPobladores = casonaActiva ? 2 : 0;

    // 3. Contar cuántos pobladores reales se encuentran asignados a las parcelas de la Finca
    const cartasCentral = juegoData.carretonCartas?.cartasCentral || [];
    const actualesPobladores = cartasCentral.filter(
        c => c.bloque === 'finca' || c.ubicacion === 'finca'
    ).length;

    // Enviar los datos exactos en el canal que main.js escucha para pintar en la misma línea
    socket.emit('finca:actualizar-marcador-poblacion', {
        conteoTexto: `${actualesPobladores} / ${maxPobladores}`
    });
}

async function forzarEnvioEstadoCarreton(socket, username, juegoData) {
    if (!juegoData) {
        juegoData = await obtenerOGenerarJuegoData(username);
    }

    const poseeAldea = cachePartidas[username]?._poseeAldeaNFT || false;
    const maxSlots = poseeAldea ? 24 : 8;

    // Calcular estructuras activas para abrir ranuras dinámicas
    const casonasFinca = (juegoData.cimientosFinca || []).filter(s => s.estaOcupado && (s.subtipo === 'casona' || s.subtipo === 'casa')).length;
    const casonasAldea = (juegoData.cimientosAldea || []).filter(s => s.estaOcupado && (s.subtipo === 'casona' || s.subtipo === 'casa')).length;
    const totalCasonas = casonasFinca + casonasAldea;

    // Regla Imperial: Cada Casona habilita 2 ranuras elásticas de población
    const slotsFincaHabilitados = Math.min(8, Math.max(2, casonasFinca * 2)); 
    const slotsAldeaHabilitados = poseeAldea ? Math.min(16, casonasAldea * 2) : 0;

    if (!juegoData.carretonCartas) {
        juegoData.carretonCartas = { cartasCentral: [] };
    }

    const todasLasCartas = juegoData.carretonCartas.cartasCentral || [];

    // 🎯 REGLA DE ORO DE RED: Separar y mapear los sub-arreglos que exige de forma nativa tu carreton.js
    const cartasCentral = todasLasCartas.filter(c => !c.bloque || c.bloque === 'central' || c.bloque === 'central');
    const cartasFinca = todasLasCartas.filter(c => c.bloque === 'finca' || c.ubicacion === 'finca');
    const cartasAldea = todasLasCartas.filter(c => c.bloque === 'aldea' || c.ubicacion === 'aldea');

    // Emitir el payload unificado y completo para evitar variables undefined en el cliente
    socket.emit('carreton:actualizar-estado', {
        cartasCentral: cartasCentral,
        cartasFinca: cartasFinca,
        cartasAldea: cartasAldea,
        maxSlots: maxSlots,
        slotsCentralMax: maxSlots,
        slotsFincaMax: 8,
        slotsAldeaMax: 16,
        slotsFincaHabilitados: slotsFincaHabilitados,
        slotsAldeaHabilitados: slotsAldeaHabilitados,
        poseeAldea: poseeAldea
    });

    // Sincronizar el marcador en paralelo
    await enviarEstadoFincaActualizado(socket, username, juegoData);
}


// ==========================================================================
// 🔌 MANEJO DE EVENTOS WEBSOCKET (SOCKET.IO)
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`);

    if (socket.handshake?.auth?.username) {
        socket.username = socket.handshake.auth.username.trim();
    }

    socket.on('jugador:autenticado', async (data) => {
        if (!data?.username) return;
        
        const usernameLimpio = data.username.trim();
        socket.username = usernameLimpio;
        console.log(`🏛️ Gladiador enlazado con éxito en sockets: ${socket.username}`);
        
        try {
            const User = obtenerModeloUsuario();
            const juegoData = await obtenerOGenerarJuegoData(usernameLimpio);
            const usuarioBD = await User.findOne({ username: usernameLimpio });
            
            if (juegoData) {
                cachePartidas[usernameLimpio] = juegoData;
                cachePartidas[usernameLimpio]._poseeAldeaNFT = Boolean(usuarioBD?.poseeAldea);
                
                socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca || []);
                socket.emit('almacen:actualizar-estado', {
                    recursos: juegoData.almacenEdificiosDisponibles || []
                });
                socket.emit('almacen:actualizar-cartas', {
                    almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles || []
                });
                await forzarEnvioEstadoCarreton(socket, usernameLimpio, juegoData);
                await enviarEstadoFincaActualizado(socket, usernameLimpio, juegoData);
            }
        } catch (err) {
            console.error("❌ Fallo crítico al sincronizar sesión de socket:", err);
        }
    });

    socket.emit('tienda:recibir-stock', stockTiendaSistema);

    socket.on('tienda:solicitar-stock', () => {
        socket.emit('tienda:recibir-stock', stockTiendaSistema);
    });

    // 📦 ALMACÉN
    const responderAlmacen = async (data = {}) => {
        const username = socket.username || data.username;
        if (!username) return socket.emit('almacen:error', 'Sesión no autenticada.');
        
        socket.username = username;

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            socket.emit('almacen:actualizar-estado', { 
                recursos: juegoData.almacenEdificiosDisponibles || [] 
            });
            socket.emit('almacen:actualizar-cartas', {
                almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles || []
            });
        } catch (error) {
            console.error("❌ Error solicitando recursos del almacén:", error);
            socket.emit('almacen:error', 'Error interno al consultar el almacén.');
        }
    };

    socket.on('almacen:solicitar-recursos', responderAlmacen);
    socket.on('almacen:obtener-recursos', responderAlmacen);

    // 🏪 TIENDA
    socket.on('tienda:comprar-carta', async (datos = {}) => {
        const { itemId, rubro } = datos;
        const username = socket.username || datos.username;
        
        if (!username) return socket.emit('tienda:error', 'Sesión de juego no válida.');
        if (!stockTiendaSistema[rubro]) return socket.emit('tienda:error', 'Categoría comercial no válida.');

        const indexItem = stockTiendaSistema[rubro].findIndex(item => item.tiendaItemId === itemId);
        if (indexItem === -1) return socket.emit('tienda:error', 'La carta ya fue adquirida por otro gladiador.');

        const cartaTienda = stockTiendaSistema[rubro][indexItem];

        try {
            const User = obtenerModeloUsuario();
            const usuario = await User.findOne({ username });
            if (!usuario || usuario.balance < cartaTienda.precio) {
                return socket.emit('tienda:error', 'Monedas imperiales insuficientes en tus arcas.');
            }

            const juegoData = await obtenerOGenerarJuegoData(username);
            const poseeNFT = Boolean(cachePartidas[username]?._poseeAldeaNFT);
            const maxSlotsCentral = poseeNFT ? 24 : 8;

            if (!juegoData.carretonCartas) juegoData.carretonCartas = { cartasCentral: [] };

            if (cartaTienda.tipo === 'aldeanos' && juegoData.carretonCartas.cartasCentral.length >= maxSlotsCentral) {
                return socket.emit('tienda:error', 'Tu Carretón Central está lleno.');
            }

            const nuevoIdActivo = crypto.randomUUID();

            if (cartaTienda.tipo === 'aldeanos') {
                const slotsOcupados = new Set(juegoData.carretonCartas.cartasCentral.map(c => c.slotIndex));
                let slotLibre = 0;
                while (slotsOcupados.has(slotLibre)) slotLibre++;

                juegoData.carretonCartas.cartasCentral.push({
                    id: nuevoIdActivo,
                    uuid: nuevoIdActivo,
                    subtipo: cartaTienda.subtipo,
                    nombre: cartaTienda.nombre,
                    rareza: cartaTienda.rareza,
                    nivel: 0, 
                    slotIndex: slotLibre,
                    equipamientoAnidado: []
                });
                juegoData.markModified('carretonCartas');
            } else {
                if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
                juegoData.almacenEdificiosDisponibles.push({
                    id: nuevoIdActivo,
                    uuid: nuevoIdActivo,
                    subtipo: cartaTienda.subtipo,
                    nombre: cartaTienda.nombre,
                    rareza: cartaTienda.rareza,
                    nivel: 0,
                    estaAnidado: false
                });
                juegoData.markModified('almacenEdificiosDisponibles');
            }

            usuario.balance -= cartaTienda.precio;
            await Promise.all([usuario.save(), juegoData.save()]);

            stockTiendaSistema[rubro].splice(indexItem, 1);
            const diseñoOriginal = CATALOGO_DISEÑOS[rubro]?.find(d => d.subtipo === cartaTienda.subtipo);
            if (diseñoOriginal) {
                stockTiendaSistema[rubro].push(crearCartaParaTienda(diseñoOriginal, rubro));
            }

            socket.emit('tienda:compra-exitosa', {
                nuevoBalance: usuario.balance,
                carta: { id: nuevoIdActivo, nombre: cartaTienda.nombre, tipo: cartaTienda.tipo }
            });

            io.emit('tienda:recibir-stock', stockTiendaSistema);
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles || [] });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles || [] });
            await forzarEnvioEstadoCarreton(socket, username, juegoData);

        } catch (error) {
            console.error('❌ Error en el procesamiento de compra:', error);
            socket.emit('tienda:error', 'Error interno al procesar la compra.');
        }
    });

    // ==========================================================================
    // 🚚 CARRETÓN
    // ==========================================================================
    const responderCarreton = async (data = {}) => {
        const username = socket.username || data?.username;
        if (!username) return;

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            await forzarEnvioEstadoCarreton(socket, username, juegoData);
        } catch (err) {
            console.error('❌ Error en solicitud de estado del carretón:', err);
        }
    };

    socket.on('carreton:solicitar-datos', responderCarreton);
    socket.on('carreton:solicitar-estado', responderCarreton);

    socket.on('carreton:mover-carta', async (data = {}) => {
        const uuidCarta = data.uuidCarta || data.cartaId;
        const { haciaSlot } = data;
        const username = socket.username || data?.username;
        
        if (!username || uuidCarta === undefined || haciaSlot === undefined) return;

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            if (!juegoData?.carretonCartas?.cartasCentral) return;

            const carta = juegoData.carretonCartas.cartasCentral.find(c => c.uuid === uuidCarta || c.id === uuidCarta);
            if (carta) {
                carta.slotIndex = haciaSlot;
                juegoData.markModified('carretonCartas');
                await juegoData.save();
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
            const juegoData = await obtenerOGenerarJuegoData(username);

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

                await forzarEnvioEstadoCarreton(socket, username, juegoData);
                socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
                socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });
            }
        } catch (err) {
            console.error('❌ Error al equipar ítem:', err);
        }
    });

    // ==========================================================================
    // 🌾 FINCA Y CONSTRUCCIÓN
    // ==========================================================================
    socket.on('finca:construir', async (data = {}) => {
        const { slotId, uuidEdificio } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);

            if (!juegoData.cimientosFinca) juegoData.cimientosFinca = [];
            const slot = juegoData.cimientosFinca.find(s => s.slotId === slotId);
            
            if (!slot) return socket.emit('finca:error', 'Slot de finca no válido.');
            if (slot.estaOcupado) return socket.emit('finca:error', 'El slot ya está ocupado.');

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            const indexEdificio = juegoData.almacenEdificiosDisponibles.findIndex(e => e.uuid === uuidEdificio || e.id === uuidEdificio);
            if (indexEdificio === -1) return socket.emit('finca:error', 'Edificio no encontrado en el almacén.');

            // Si es una carta del almacén, podemos marcarla como anidada o removerla según el flujo actual
            const edificio = juegoData.almacenEdificiosDisponibles[indexEdificio];
            edificio.estaAnidado = true;
            edificio.slotAnidado = slotId;

            slot.estaOcupado = true;
            slot.subtipo = edificio.subtipo;
            slot.nivel = edificio.nivel || 0;
            slot.nombre = edificio.nombre || edificio.subtipo;
            slot.uuid = edificio.uuid || edificio.id;

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();

            socket.emit('finca:construccion-exitosa', { slotId, edificio: slot });
            socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca);
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });
            
            await enviarEstadoFincaActualizado(socket, username, juegoData);
            await forzarEnvioEstadoCarreton(socket, username, juegoData);
        } catch (err) {
            console.error('❌ Error en finca:construir:', err);
            socket.emit('finca:error', 'Error al construir en la finca.');
        }
    });

    // ==========================================================================
    // 🪵 DESMANTELAMIENTO Y RECOLECCIÓN EN TERRENOS
    // ==========================================================================
    socket.on('finca:desmantelar', async (data = {}) => {
        const { slotId } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            if (!juegoData?.cimientosFinca) return socket.emit('finca:error', 'Datos de juego no encontrados.');

            const slotIndex = juegoData.cimientosFinca.findIndex(s => s.slotId === slotId);
            if (slotIndex === -1 || !juegoData.cimientosFinca[slotIndex].estaOcupado) {
                return socket.emit('finca:error', 'El slot especificado no tiene ninguna estructura para desmantelar.');
            }

            const slot = juegoData.cimientosFinca[slotIndex];
            const uuidEvacuado = slot.uuid || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];

            // Buscar si la carta existe en el almacén para desmarcarla como anidada, o reinsertarla
            const cartaAlmacen = juegoData.almacenEdificiosDisponibles.find(c => c.uuid === uuidEvacuado || c.id === uuidEvacuado);
            if (cartaAlmacen) {
                cartaAlmacen.estaAnidado = false;
                cartaAlmacen.slotAnidado = null;
            } else {
                juegoData.almacenEdificiosDisponibles.push({
                    uuid: uuidEvacuado,
                    id: uuidEvacuado,
                    subtipo: slot.subtipo,
                    nombre: slot.nombre || slot.subtipo,
                    nivel: slot.nivel || 0,
                    rareza: slot.rareza || 'comun',
                    estaAnidado: false,
                    slotAnidado: null
                });
            }

            // Evacuar recursos anidados acumulados si los hay
            if (Array.isArray(slot.recursosAnidados) && slot.recursosAnidados.length > 0) {
                for (const item of slot.recursosAnidados) {
                    agregarRecursoAlmacen(
                        juegoData.almacenEdificiosDisponibles, 
                        item.subtipo, 
                        item.cantidad, 
                        item.nombre
                    );
                }
            }

            // Vaciar el slot del terreno
            juegoData.cimientosFinca[slotIndex] = {
                slotId: slotId,
                estaOcupado: false,
                subtipo: null,
                nivel: 0,
                nombre: null,
                uuid: null,
                produccionPendiente: 0,
                recursosAnidados: []
            };

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();

            socket.emit('finca:desmantelamiento-exitoso', { slotId });
            socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca);
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });
            
            await enviarEstadoFincaActualizado(socket, username, juegoData);
            await forzarEnvioEstadoCarreton(socket, username, juegoData);
        } catch (err) {
            console.error('❌ Error desmantelando estructura:', err);
            socket.emit('finca:error', 'Error al desmantelar la estructura.');
        }
    });

    socket.on('finca:recolectar-produccion', async (data = {}) => {
        const { slotId } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            if (!juegoData?.cimientosFinca) return socket.emit('finca:error', 'Datos no encontrados.');

            const slotIndex = juegoData.cimientosFinca.findIndex(s => s.slotId === slotId);
            if (slotIndex === -1 || !juegoData.cimientosFinca[slotIndex].estaOcupado) {
                return socket.emit('finca:error', 'Estructura no encontrada.');
            }

            const slot = juegoData.cimientosFinca[slotIndex];

            if (!slot.produccionPendiente || slot.produccionPendiente <= 0) {
                return socket.emit('finca:error', 'No hay recursos pendientes para recolectar.');
            }

            const tipoRecurso = slot.subtipo === 'granja' ? 'trigo' : (slot.subtipo === 'aserradero' ? 'madera' : 'material');
            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];

            agregarRecursoAlmacen(juegoData.almacenEdificiosDisponibles, tipoRecurso, slot.produccionPendiente);

            const cantidadRecolectada = slot.produccionPendiente;
            juegoData.cimientosFinca[slotIndex].produccionPendiente = 0;

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();

            socket.emit('finca:recoleccion-exitosa', { 
                slotId, 
                recurso: tipoRecurso, 
                cantidad: cantidadRecolectada 
            });
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });
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
// 🚀 INICIALIZACIÓN DEL SERVIDOR CON ENLACE UNIVERSAL
// ==========================================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose exitosamente en http://0.0.0.0:${PORT}`);
    console.log(`🏪 Canal de WebSockets enlazado a la par con el Motor 3D.`);
});

// ==========================================================================
// 🛡️ MANEJO DE ERRORES GLOBALES Y CIERRE CONTROLADO (GRACEFUL SHUTDOWN)
// ==========================================================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception lanzada:', err);
});

const apagarServidorLimpio = async (signal) => {
    console.log(`\n⚠️ Recibida señal ${signal}. Cerrando servidor de forma limpia...`);
    
    server.close(async () => {
        console.log('🔌 Servidor HTTP y WebSockets cerrados.');
        try {
            if (typeof mongoose !== 'undefined' && mongoose.connection && mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
                console.log('📦 Conexión a MongoDB cerrada con éxito.');
            }
            process.exit(0);
        } catch (err) {
            console.error('❌ Error al cerrar MongoDB:', err);
            process.exit(1);
        }
    });
};

process.on('SIGTERM', () => apagarServidorLimpio('SIGTERM'));
process.on('SIGINT', () => apagarServidorLimpio('SIGINT'));


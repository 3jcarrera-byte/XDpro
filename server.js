// ========================================================
// server.js - Servidor Principal Unificado y Modularizado
// ========================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

// Modelos de Mongoose
const User = require('./models/User');
const GameDataModel = require('./models/GameData');

// Rutas Modulares
const authRoutes = require('./routes/auth');

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
// MIDDLEWARES ESENCIALES Y RUTAS DE API
// ========================================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Delegación limpia a enrutador modular
app.use('/api/auth', authRoutes);

// ========================================================
// CONEXIÓN A LA BASE DE DATOS MONGODB
// ========================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xdpro';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conectado a la base de datos MongoDB'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// ========================================================
// 🏗️ FUNCIONES AUXILIARES Y ESTADO EN MEMORIA
// ========================================================
function inicializarCimientosPorDefecto() {
    const cimientosFincaIniciales = Array.from({ length: 5 }, (_, i) => ({
        slotId: i,
        estaOcupado: false,
        subtipo: null,
        nivel: 0
    }));

    const cimientosAldeaIniciales = Array.from({ length: 12 }, (_, i) => ({
        slotId: i,
        estaOcupado: false,
        subtipo: null,
        nivel: 0
    }));

    return {
        cimientosFinca: cimientosFincaIniciales,
        cimientosAldea: cimientosAldeaIniciales
    };
}

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
    console.log("🏪 Tienda AMM inicializada con 3 cartas por tipo.");
}

inicializarTiendaSistema();

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

// ==========================================================================
// 🔌 MANEJO DE EVENTOS WEBSOCKET (SOCKET.IO)
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`);

    if (socket.handshake?.auth?.username) {
        socket.username = socket.handshake.auth.username;
    }

    socket.on('jugador:autenticado', async (data) => {
        if (!data?.username) return;
        
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
        if (!username) return socket.emit('almacen:error', 'Sesión no autenticada.');
        
        socket.username = username;

        try {
            let juegoData = await GameDataModel.findOne({ username }) || cachePartidas[username];
            if (!juegoData) return socket.emit('almacen:error', 'Sesión de juego no encontrada.');

            cachePartidas[username] = juegoData;
            socket.emit('almacen:actualizar-estado', { 
                recursos: juegoData.almacenEdificiosDisponibles || [] 
            });
        } catch (error) {
            console.error("❌ Error solicitando recursos del almacén:", error);
            socket.emit('almacen:error', 'Error interno al consultar el almacén.');
        }
    });

    socket.on('tienda:comprar-carta', async (datos) => {
        if (!datos) return;
        const { itemId, rubro } = datos;
        let username = socket.username || datos.username;
        
        if (!username) return socket.emit('tienda:error', 'Sesión de juego no válida.');
        if (!stockTiendaSistema[rubro]) return socket.emit('tienda:error', 'Categoría comercial no válida.');

        const indexItem = stockTiendaSistema[rubro].findIndex(item => item.tiendaItemId === itemId);
        if (indexItem === -1) return socket.emit('tienda:error', 'La carta ya fue adquirida por otro gladiador.');

        const cartaTienda = stockTiendaSistema[rubro][indexItem];

        try {
            const usuario = await User.findOne({ username });
            if (!usuario || usuario.balance < cartaTienda.precio) {
                return socket.emit('tienda:error', 'Monedas imperiales insuficientes en tus arcas.');
            }

            let juegoData = await GameDataModel.findOne({ username }) || cachePartidas[username];
            if (!juegoData) {
                juegoData = new GameDataModel({ username, ...inicializarCimientosPorDefecto() });
                if (typeof juegoData.inicializarEspaciosVacios === 'function') {
                    juegoData.inicializarEspaciosVacios();
                }
            }

            cachePartidas[username] = juegoData;
            const poseeNFT = Boolean(juegoData?._poseeAldeaNFT);
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
                    nivel: 0 
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
            await forzarEnvioEstadoCarreton(socket, username, juegoData);

        } catch (error) {
            console.error('❌ Error en el procesamiento de compra:', error);
            socket.emit('tienda:error', 'Error interno al procesar la compra.');
        }
    });

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
            if (!juegoData?.cimientosFinca) return socket.emit('finca:error', 'Datos de juego no encontrados.');

            const slotIndex = juegoData.cimientosFinca.findIndex(s => s.slotId === slotId);
            if (slotIndex === -1 || !juegoData.cimientosFinca[slotIndex].estaOcupado) {
                return socket.emit('finca:error', 'El slot especificado no tiene ninguna estructura para desmantelar.');
            }

            const slot = juegoData.cimientosFinca[slotIndex];
            const uuidEvacuado = slot.uuid || crypto.randomUUID();

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            juegoData.almacenEdificiosDisponibles.push({
                uuid: uuidEvacuado,
                id: uuidEvacuado,
                subtipo: slot.subtipo,
                nombre: slot.nombre || slot.subtipo,
                nivel: slot.nivel || 0,
                rareza: slot.rareza || 'comun'
            });

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

    socket.on('finca:recolectar-produccion', async (data = {}) => {
        const { slotId } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
            if (!juegoData?.cimientosFinca) return socket.emit('finca:error', 'Datos no encontrados.');

            const slot = juegoData.cimientosFinca.find(s => s.slotId === slotId);
            if (!slot || !slot.estaOcupado) return socket.emit('finca:error', 'Estructura no encontrada.');

            if (!slot.produccionPendiente || slot.produccionPendiente <= 0) {
                return socket.emit('finca:error', 'No hay recursos pendientes para recolectar.');
            }

            let cantidadAñadir = Number(slot.produccionPendiente) || 0;
            const tipoRecurso = slot.subtipo === 'granja' ? 'trigo' : (slot.subtipo === 'aserradero' ? 'madera' : 'material');

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];

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
// 🚀 INICIALIZACIÓN DEL SERVIDOR CON ENLACE UNIVERSAL (ANTI-502)
// ==========================================================================
const PORT = process.env.PORT || 3000;

// Escuchar explícitamente en '0.0.0.0' para que Render rutee el tráfico hacia internet
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose exitosamente en http://0.0.0:${PORT}`);
    console.log(`🏪 Canal de WebSockets enlazado a la par con el Motor 3D.`);
});

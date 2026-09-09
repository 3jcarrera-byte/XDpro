// ========================================================
// server.js - Servidor Principal Unificado (Production Ready)
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
// 🔐 CONEXIÓN DE RUTAS DE AUTENTICACIÓN MODULARES
// ========================================================
// Reemplaza el router inline viejo por tu controlador externo purgado
const authRoutes = require('./routes/auth');
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

/**
 * Función auxiliar para apilar recursos en stacks de hasta 99 unidades en el almacén.
 */
function agregarRecursoAlmacen(almacen, subtipo, cantidad, nombrePersonalizado = null) {
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

/**
 * Obtener o cargar en caché los datos de juego de un usuario.
 */
async function obtenerOGenerarJuegoData(username) {
    let juegoData = cachePartidas[username] || await GameDataModel.findOne({ username });
    if (!juegoData) {
        juegoData = new GameDataModel({ username, ...inicializarCimientosPorDefecto() });
        if (typeof juegoData.inicializarEspaciosVacios === 'function') {
            juegoData.inicializarEspaciosVacios();
        }
    }
    cachePartidas[username] = juegoData;
    return juegoData;
}

async function forzarEnvioEstadoCarreton(socket, username, juegoData) {
    if (!juegoData) {
        juegoData = await obtenerOGenerarJuegoData(username);
    }

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
            const juegoData = await GameDataModel.findOne({ username: usernameLimpio });
            const usuarioBD = await User.findOne({ username: usernameLimpio });
            
            if (juegoData) {
                cachePartidas[usernameLimpio] = juegoData;
                cachePartidas[usernameLimpio]._poseeAldeaNFT = Boolean(usuarioBD?.poseeAldea);
                
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
        const username = socket.username || data.username;
        if (!username) return socket.emit('almacen:error', 'Sesión no autenticada.');
        
        socket.username = username;

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            socket.emit('almacen:actualizar-estado', { 
                recursos: juegoData.almacenEdificiosDisponibles || [] 
            });
        } catch (error) {
            console.error("❌ Error solicitando recursos del almacén:", error);
            socket.emit('almacen:error', 'Error interno al consultar el almacén.');
        }
    });

    socket.on('tienda:comprar-carta', async (datos = {}) => {
        const { itemId, rubro } = datos;
        const username = socket.username || datos.username;
        
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
                    nivel: 0 
                });
                juegoData.markModified('almacenEdificiosDisponibles');
            }

            usuario.balance -= cartaTienda.precio;
            await Promise.all([usuario.save(), juegoData.save()]);

            // Rotación de inventario en la tienda
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
            const juegoData = await obtenerOGenerarJuegoData(username);
            await forzarEnvioEstadoCarreton(socket, username, juegoData);
        } catch (err) {
            console.error('❌ Error en carreton:solicitar-estado:', err);
        }
    });

    socket.on('carreton:mover-carta', async (data = {}) => {
        const { uuidCarta, haciaSlot } = data;
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
            const juegoData = await obtenerOGenerarJuegoData(username);

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
            const juegoData = await obtenerOGenerarJuegoData(username);
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

            // Reubicación de recursos anidados usando la función modular
            if (Array.isArray(slot.recursosAnidados)) {
                for (const item of slot.recursosAnidados) {
                    agregarRecursoAlmacen(
                        juegoData.almacenEdificiosDisponibles, 
                        item.subtipo, 
                        item.cantidad, 
                        item.nombre
                    );
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
            const juegoData = await obtenerOGenerarJuegoData(username);
            if (!juegoData?.cimientosFinca) return socket.emit('finca:error', 'Datos no encontrados.');

            const slot = juegoData.cimientosFinca.find(s => s.slotId === slotId);
            if (!slot || !slot.estaOcupado) return socket.emit('finca:error', 'Estructura no encontrada.');

            if (!slot.produccionPendiente || slot.produccionPendiente <= 0) {
                return socket.emit('finca:error', 'No hay recursos pendientes para recolectar.');
            }

            const tipoRecurso = slot.subtipo === 'granja' ? 'trigo' : (slot.subtipo === 'aserradero' ? 'madera' : 'material');
            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];

            // Adición apilada limpia al almacén
            agregarRecursoAlmacen(juegoData.almacenEdificiosDisponibles, tipoRecurso, slot.produccionPendiente);

            slot.produccionPendiente = 0;
            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();

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

// Escuchar en '0.0.0.0' es imprescindible en Render para vincular la red externa
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
            await mongoose.connection.close();
            console.log('📦 Conexión a MongoDB cerrada con éxito.');
            process.exit(0);
        } catch (err) {
            console.error('❌ Error al cerrar MongoDB:', err);
            process.exit(1);
        }
    });
};

process.on('SIGTERM', () => apagarServidorLimpio('SIGTERM'));
process.on('SIGINT', () => apagarServidorLimpio('SIGINT'));

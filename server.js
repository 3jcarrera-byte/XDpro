// ==========================================================================
// 🏛️ SERVIDOR BACKEND XDPRO UNIFICADO Y DEFINITIVO (Node.js + Socket.io + Mongoose)
// ==========================================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ==========================================================================
// 📦 MEMORIA CACHÉ Y ESTADO GLOBAL DE TIENDA DEL SISTEMA
// ==========================================================================
const cachePartidas = {};
let stockTiendaSistema = {
    edificios: [],
    aldeanos: [],
    equipamiento: []
};

// Catalogo base para reposición dinámica de tienda (AMM)
const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'casona', nombre: '🏛️ Casona Imperial', precio: 1000, rareza: 'legendaria' },
        { subtipo: 'granja', nombre: '🌾 Granja de Trigo', precio: 150, rareza: 'comun' },
        { subtipo: 'aserradero', nombre: '🪵 Aserradero Real', precio: 200, rareza: 'comun' }
    ],
    aldeanos: [
        { subtipo: 'agricultor', nombre: '👨‍🌾 Agricultor Imperial', precio: 100, rareza: 'comun' },
        { subtipo: 'lenador', nombre: '🪓 Leñador Experto', precio: 120, rareza: 'comun' }
    ],
    equipamiento: [
        { subtipo: 'hacha_hierro', nombre: '🪓 Hacha de Hierro', precio: 80, rareza: 'poco_comun' },
        { subtipo: 'hoz_oro', nombre: '🌾 Hoz de Oro', precio: 250, rareza: 'rara' }
    ]
};

// Helper: Generador de cartas para la tienda
function crearCartaParaTienda(diseno, rubro) {
    return {
        tiendaItemId: crypto.randomUUID(),
        subtipo: diseno.subtipo,
        nombre: diseno.nombre,
        precio: diseno.precio,
        rareza: diseno.rareza,
        tipo: rubro
    };
}

// Inicializar stock inicial de la tienda
function inicializarStockTienda() {
    for (const rubro in CATALOGO_DISEÑOS) {
        stockTiendaSistema[rubro] = CATALOGO_DISEÑOS[rubro].map(d => crearCartaParaTienda(d, rubro));
    }
}
inicializarStockTienda();

// ==========================================================================
// 🛠️ FUNCIONES AUXILIARES DE MODELOS Y UTILIDADES
// ==========================================================================
function obtenerModeloUsuario() {
    return mongoose.models.User || mongoose.model('User', new mongoose.Schema({
        username: String,
        balance: { type: Number, default: 0 }
    }));
}

function obtenerModeloJuegoData() {
    return mongoose.models.JuegoData || mongoose.model('JuegoData', new mongoose.Schema({
        username: String,
        almacenEdificiosDisponibles: { type: Array, default: [] },
        carretonCartas: {
            cartasCentral: { type: Array, default: [] }
        },
        cimientosFinca: { type: Array, default: [] }
    }, { strict: false }));
}

async function obtenerOGenerarJuegoData(username) {
    const JuegoData = obtenerModeloJuegoData();
    let data = await JuegoData.findOne({ username });
    if (!data) {
        data = new JuegoData({
            username,
            almacenEdificiosDisponibles: [],
            carretonCartas: { cartasCentral: [] },
            cimientosFinca: Array.from({ length: 9 }, (_, i) => ({
                slotId: i,
                estaOcupado: false,
                subtipo: null,
                nivel: 0,
                nombre: null,
                uuid: null,
                produccionPendiente: 0,
                recursosAnidados: []
            }))
        });
        await data.save();
    }
    return data;
}

function agregarRecursoAlmacen(almacen, recurso, cantidad, nombre) {
    const existente = almacen.find(i => i.subtipo === recurso && !i.uuid);
    if (existente) {
        existente.cantidad = (existente.cantidad || 0) + cantidad;
    } else {
        almacen.push({
            subtipo: recurso,
            nombre: nombre || recurso,
            cantidad: cantidad,
            tipo: 'recurso',
            esTradeable: true
        });
    }
}

async function forzarEnvioEstadoCarreton(socket, username, juegoData) {
    if (!juegoData) juegoData = await obtenerOGenerarJuegoData(username);
    socket.emit('carreton:actualizar-estado', {
        cartasCentral: juegoData.carretonCartas?.cartasCentral || []
    });
}

async function enviarEstadoFincaActualizado(socket, username, juegoData) {
    if (!juegoData) juegoData = await obtenerOGenerarJuegoData(username);
    socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca || []);
}

// ==========================================================================
// 🏪 CANAL DE WEBSOCKETS (SOCKET.IO)
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`🔌 Nuevo gladiador conectado: ${socket.id}`);

    socket.on('autenticar', (datos) => {
        if (datos?.username) {
            socket.username = datos.username;
            console.log(`👤 Socket ${socket.id} autenticado como: ${socket.username}`);
        }
    });

    // ----------------------------------------------------------------------
    // 🛒 COMPRA EN TIENDA AMM Y REGISTRO EN ALMACÉN / CARRETÓN
    // ----------------------------------------------------------------------
    socket.on('tienda:comprar-carta', async (datos = {}) => {
        const itemId = datos.itemId || datos.tiendaItemId;
        const rubro = datos.rubro || datos.categoria;
        const username = socket.username || datos.username;

        if (!username) return socket.emit('tienda:error', 'Sesión de juego no válida.');
        if (!rubro || !stockTiendaSistema[rubro]) return socket.emit('tienda:error', 'Categoría comercial no válida.');

        const indexItem = stockTiendaSistema[rubro].findIndex(item => item.tiendaItemId === itemId);
        if (indexItem === -1) return socket.emit('tienda:error', 'La carta ya fue adquirida por otro gladiador.');

        const cartaTienda = stockTiendaSistema[rubro][indexItem];

        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const User = obtenerModeloUsuario();
            const usuario = await User.findOne({ username }).session(session);

            if (!usuario || usuario.balance < cartaTienda.precio) {
                await session.abortTransaction();
                return socket.emit('tienda:error', 'Monedas imperiales insuficientes en tus arcas.');
            }

            const juegoData = await obtenerOGenerarJuegoData(username);
            const poseeNFT = Boolean(cachePartidas[username]?._poseeAldeaNFT);
            const maxSlotsCentral = poseeNFT ? 24 : 8;

            if (!juegoData.carretonCartas) juegoData.carretonCartas = { cartasCentral: [] };

            if (cartaTienda.tipo === 'aldeanos' && juegoData.carretonCartas.cartasCentral.length >= maxSlotsCentral) {
                await session.abortTransaction();
                return socket.emit('tienda:error', 'Tu Carretón Central está lleno.');
            }

            // Transacción aprobada: Descontar saldo y retirar del stock
            usuario.balance -= cartaTienda.precio;
            stockTiendaSistema[rubro].splice(indexItem, 1);

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
                if (!Array.isArray(juegoData.almacenEdificiosDisponibles)) {
                    juegoData.almacenEdificiosDisponibles = [];
                }
                juegoData.almacenEdificiosDisponibles.push({
                    id: nuevoIdActivo,
                    uuid: nuevoIdActivo,
                    tipo: rubro === 'edificios' ? 'estructura' : 'equipamiento',
                    subtipo: cartaTienda.subtipo,
                    nombre: cartaTienda.nombre,
                    rareza: cartaTienda.rareza,
                    nivel: 0,
                    estaAnidado: false,
                    slotAnidado: null
                });
                juegoData.markModified('almacenEdificiosDisponibles');
            }

            await usuario.save({ session });
            await juegoData.save({ session });
            await session.commitTransaction();

            cachePartidas[username] = juegoData;

            // Reabastecimiento dinámico del stock AMM
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
            await session.abortTransaction();
            console.error('❌ Error en el procesamiento de compra:', error);
            socket.emit('tienda:error', 'Error interno al procesar la compra.');
        } finally {
            session.endSession();
        }
    });

    // ----------------------------------------------------------------------
    // 🚚 CARRETÓN DE CARTAS Y EQUIPAMIENTO
    // ----------------------------------------------------------------------
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
        const uuidCarta = data.uuidCarta || data.cartaId || data.cartaUuid;
        const haciaSlot = data.haciaSlot !== undefined ? data.haciaSlot : data.destino;
        const username = socket.username || data?.username;

        if (!username || !uuidCarta) return socket.emit('carreton:error', 'Parámetros de movimiento inválidos.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            if (!juegoData?.carretonCartas?.cartasCentral) return;

            // Caso A: Reordenar slot dentro del Carretón
            if (typeof haciaSlot === 'number') {
                const carta = juegoData.carretonCartas.cartasCentral.find(c => c.uuid === uuidCarta || c.id === uuidCarta);
                if (carta) {
                    carta.slotIndex = haciaSlot;
                    juegoData.markModified('carretonCartas');
                    await juegoData.save();
                    cachePartidas[username] = juegoData;
                    await forzarEnvioEstadoCarreton(socket, username, juegoData);
                }
                return;
            }

            // Caso B: Transferencia entre Carretón y Almacén
            if (haciaSlot === 'carreton') {
                const idx = juegoData.almacenEdificiosDisponibles?.findIndex(c => c.uuid === uuidCarta || c.id === uuidCarta);
                if (idx === -1) return socket.emit('carreton:error', 'La carta no está en el almacén.');

                const carta = juegoData.almacenEdificiosDisponibles[idx];
                if (carta.estaAnidado) return socket.emit('carreton:error', 'No puedes mover una carta construida.');

                const poseeNFT = Boolean(cachePartidas[username]?._poseeAldeaNFT);
                const maxSlots = poseeNFT ? 24 : 8;

                if (juegoData.carretonCartas.cartasCentral.length >= maxSlots) {
                    return socket.emit('carreton:error', 'El carretón ha alcanzado su capacidad máxima.');
                }

                juegoData.almacenEdificiosDisponibles.splice(idx, 1);
                juegoData.carretonCartas.cartasCentral.push(carta);

            } else if (haciaSlot === 'almacen') {
                const idx = juegoData.carretonCartas.cartasCentral.findIndex(c => c.uuid === uuidCarta || c.id === uuidCarta);
                if (idx === -1) return socket.emit('carreton:error', 'La carta no está en el carretón.');

                const carta = juegoData.carretonCartas.cartasCentral[idx];
                juegoData.carretonCartas.cartasCentral.splice(idx, 1);

                if (!Array.isArray(juegoData.almacenEdificiosDisponibles)) juegoData.almacenEdificiosDisponibles = [];
                juegoData.almacenEdificiosDisponibles.push(carta);
            }

            juegoData.markModified('carretonCartas');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();
            cachePartidas[username] = juegoData;

            await forzarEnvioEstadoCarreton(socket, username, juegoData);
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });

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
                cachePartidas[username] = juegoData;

                await forzarEnvioEstadoCarreton(socket, username, juegoData);
                socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
                socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });
            }
        } catch (err) {
            console.error('❌ Error al equipar ítem:', err);
        }
    });

    // ----------------------------------------------------------------------
    // 🌾 FINCA, CONSTRUCCIÓN Y DESMANTELAMIENTO
    // ----------------------------------------------------------------------
    socket.on('finca:construir', async (data = {}) => {
        const slotId = data.slotId;
        const cartaUuid = data.cartaUuid || data.uuidEdificio;
        const username = socket.username || data?.username;

        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');
        if (slotId === undefined || !cartaUuid) return socket.emit('finca:error', 'Datos de construcción incompletos.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);

            if (!juegoData.cimientosFinca) juegoData.cimientosFinca = [];
            const slotIndex = juegoData.cimientosFinca.findIndex(s => s.slotId === Number(slotId));
            if (slotIndex === -1) return socket.emit('finca:error', 'Cimiento de finca no válido.');

            const slot = juegoData.cimientosFinca[slotIndex];
            if (slot.estaOcupado) return socket.emit('finca:error', 'El cimiento ya está ocupado.');

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            const indexEdificio = juegoData.almacenEdificiosDisponibles.findIndex(e => e.uuid === cartaUuid || e.id === cartaUuid);
            if (indexEdificio === -1) return socket.emit('finca:error', 'Edificio no encontrado en el almacén.');

            const edificio = juegoData.almacenEdificiosDisponibles[indexEdificio];

            if (edificio.subtipo === 'casona') {
                const casonaExistente = juegoData.cimientosFinca.some(c => c.estaOcupado && c.subtipo === 'casona');
                if (casonaExistente) return socket.emit('finca:error', 'Ya posees una Casona Imperial construida.');
            }

            edificio.estaAnidado = true;
            edificio.slotAnidado = Number(slotId);

            slot.estaOcupado = true;
            slot.subtipo = edificio.subtipo;
            slot.nivel = edificio.nivel || 0;
            slot.nombre = edificio.nombre || edificio.subtipo;
            slot.uuid = edificio.uuid || edificio.id;
            slot.cartaUuid = edificio.uuid || edificio.id;

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();
            cachePartidas[username] = juegoData;

            socket.emit('finca:construccion-exitosa', { slotId, subtipo: edificio.subtipo, nivel: edificio.nivel, edificio: slot });
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

    socket.on('finca:desmantelar', async (data = {}) => {
        const slotId = data.slotId;
        const username = socket.username || data?.username;

        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');
        if (slotId === undefined) return socket.emit('finca:error', 'Slot no especificado.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            if (!juegoData?.cimientosFinca) return socket.emit('finca:error', 'Datos de juego no encontrados.');

            const slotIndex = juegoData.cimientosFinca.findIndex(s => s.slotId === Number(slotId));
            if (slotIndex === -1 || !juegoData.cimientosFinca[slotIndex].estaOcupado) {
                return socket.emit('finca:error', 'El slot no tiene ninguna estructura para desmantelar.');
            }

            const slot = juegoData.cimientosFinca[slotIndex];
            const uuidEvacuado = slot.cartaUuid || slot.uuid || crypto.randomUUID();

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];

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

            // Vaciar y volcar recursos pendientes anidados
            if (Array.isArray(slot.recursosAnidados) && slot.recursosAnidados.length > 0) {
                for (const item of slot.recursosAnidados) {
                    agregarRecursoAlmacen(juegoData.almacenEdificiosDisponibles, item.subtipo, item.cantidad, item.nombre);
                }
            }

            juegoData.cimientosFinca[slotIndex] = {
                slotId: Number(slotId),
                estaOcupado: false,
                subtipo: null,
                nivel: 0,
                nombre: null,
                uuid: null,
                cartaUuid: null,
                produccionPendiente: 0,
                recursosAnidados: []
            };

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();
            cachePartidas[username] = juegoData;

            socket.emit('finca:demolicion-exitosa', { slotId });
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

    // Alias para compatibilidad con evento `finca:demoler`
    socket.on('finca:demoler', (data) => socket.emit('finca:desmantelar', data));

    // ----------------------------------------------------------------------
    // 🪵 RECOLECCIÓN Y PRODUCCIÓN DE TERRENOS
    // ----------------------------------------------------------------------
    socket.on('finca:recolectar', async (data = {}) => {
        const slotId = data.slotId;
        const username = socket.username || data?.username;

        if (!username || slotId === undefined) return socket.emit('finca:error', 'Datos de recolección incompletos.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            const slotIndex = juegoData.cimientosFinca.findIndex(s => s.slotId === Number(slotId));

            if (slotIndex === -1 || !juegoData.cimientosFinca[slotIndex].estaOcupado) {
                return socket.emit('finca:error', 'El cimiento seleccionado está vacío.');
            }

            const slot = juegoData.cimientosFinca[slotIndex];

            // Producción directa basada en subtipo o producción acumulada pendiente
            const mapaProduccion = {
                granja: { recurso: 'trigo', cantidad: 10, nombre: '🌾 Trigo Imperial' },
                aserradero: { recurso: 'madera', cantidad: 8, nombre: '🪵 Madera Fina' },
                casona: { recurso: 'monedas', cantidad: 5, nombre: '🪙 Moneda de Oro' }
            };

            const prodConfig = mapaProduccion[slot.subtipo];
            let cantidadObtenida = 0;
            let recursoNombre = 'material';
            let tipoRecurso = 'material';

            if (slot.produccionPendiente && slot.produccionPendiente > 0) {
                cantidadObtenida = slot.produccionPendiente;
                tipoRecurso = slot.subtipo === 'granja' ? 'trigo' : (slot.subtipo === 'aserradero' ? 'madera' : 'monedas');
                slot.produccionPendiente = 0;
            } else if (prodConfig) {
                cantidadObtenida = prodConfig.cantidad;
                tipoRecurso = prodConfig.recurso;
                recursoNombre = prodConfig.nombre;
            } else {
                return socket.emit('finca:error', 'Esta estructura no tiene recursos disponibles.');
            }

            if (!Array.isArray(juegoData.almacenEdificiosDisponibles)) {
                juegoData.almacenEdificiosDisponibles = [];
            }

            agregarRecursoAlmacen(juegoData.almacenEdificiosDisponibles, tipoRecurso, cantidadObtenida, recursoNombre);

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();
            cachePartidas[username] = juegoData;

            socket.emit('finca:recoleccion-exitosa', {
                slotId,
                recurso: tipoRecurso,
                cantidad: cantidadObtenida,
                message: `¡Has recolectado +${cantidadObtenida} de ${tipoRecurso}!`
            });

            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });

        } catch (err) {
            console.error('❌ Error en recolección:', err);
            socket.emit('finca:error', 'Error interno al recolectar producción.');
        }
    });

    socket.on('finca:recolectar-produccion', (data) => socket.emit('finca:recolectar', data));

    // ----------------------------------------------------------------------
    // 🔌 DESCONEXIÓN
    // ----------------------------------------------------------------------
    socket.on('disconnect', () => {
        console.log(`🔌 Cliente desconectado: ${socket.id} (${socket.username || 'invitado'})`);
    });
});

// ==========================================================================
// 🚀 INICIALIZACIÓN DEL SERVIDOR Y ESCUCHA EN PUERTO (0.0.0.0)
// ==========================================================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(`🏛️  SERVIDOR XDPRO UNIFICADO Y DEFINITIVO ACTIVO   `);
    console.log(`🚀  Escuchando peticiones en: http://0.0.0.0:${PORT} `);
    console.log(`🏪  WebSockets enlazados al Motor 3D correctamente.`);
    console.log(`===================================================`);
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

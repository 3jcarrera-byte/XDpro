// ==========================================================================
// 🚀 SERVIDOR CENTRAL - ARENA Y GLORIA / XDPRO
// Express + Mongoose + Socket.io + Lógica de Juego
// ==========================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware base
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --------------------------------------------------------------------------
// 📦 CONFIGURACIÓN DE BASE DE DATOS Y ESQUEMAS MONGOOSE
// --------------------------------------------------------------------------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arena_gloria';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('🍃 Conexión exitosa a MongoDB.'))
    .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// Esquema de Usuario
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 1000 },
    poseeAldeaNFT: { type: Boolean, default: false }
}, { timestamps: true });

// Esquema de Juego / Partida
const JuegoDataSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    carretonCartas: {
        cartasCentral: { type: Array, default: [] }
    },
    almacenEdificiosDisponibles: { type: Array, default: [] },
    cimientosFinca: { type: Array, default: [] }
}, { timestamps: true });

function obtenerModeloUsuario() {
    return mongoose.models.User || mongoose.model('User', UserSchema);
}

function obtenerModeloJuegoData() {
    return mongoose.models.JuegoData || mongoose.model('JuegoData', JuegoDataSchema);
}

// --------------------------------------------------------------------------
// 🧠 CACHÉ EN MEMORIA Y TIENDA DEL SISTEMA
// --------------------------------------------------------------------------
const cachePartidas = {};

const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'casona', nombre: 'Casona Principal', precio: 200, rareza: 'epica' },
        { subtipo: 'granja', nombre: 'Granja Agricola', precio: 100, rareza: 'comun' },
        { subtipo: 'aserradero', nombre: 'Aserradero', precio: 120, rareza: 'comun' },
        { subtipo: 'mina', nombre: 'Mina de Material', precio: 150, rareza: 'rara' }
    ],
    aldeanos: [
        { subtipo: 'agricultor', nombre: 'Agricultor Experto', precio: 50, rareza: 'comun' },
        { subtipo: 'leñador', nombre: 'Leñador Robusto', precio: 60, rareza: 'comun' },
        { subtipo: 'minero', nombre: 'Minero Fuerte', precio: 75, rareza: 'rara' }
    ]
};

function crearCartaParaTienda(diseno, rubro) {
    return {
        tiendaItemId: crypto.randomUUID(),
        tipo: rubro,
        subtipo: diseno.subtipo,
        nombre: diseno.nombre,
        precio: diseno.precio,
        rareza: diseno.rareza
    };
}

const stockTiendaSistema = {
    edificios: CATALOGO_DISEÑOS.edificios.map(d => crearCartaParaTienda(d, 'edificios')),
    aldeanos: CATALOGO_DISEÑOS.aldeanos.map(d => crearCartaParaTienda(d, 'aldeanos'))
};

// --------------------------------------------------------------------------
// 🛠️ FUNCIONES AUXILIARES DE ESTADO Y SINCRONIZACIÓN
// --------------------------------------------------------------------------
async function obtenerOGenerarJuegoData(username) {
    const JuegoData = obtenerModeloJuegoData();
    let juegoData = await JuegoData.findOne({ username });

    if (!juegoData) {
        // Cimientos iniciales por defecto (8 slots de finca)
        const cimientosIniciales = Array.from({ length: 8 }, (_, i) => ({
            slotId: i + 1,
            estaOcupado: false,
            subtipo: null,
            nivel: 0,
            nombre: null,
            uuid: null,
            produccionPendiente: 0,
            recursosAnidados: []
        }));

        juegoData = new JuegoData({
            username,
            carretonCartas: { cartasCentral: [] },
            almacenEdificiosDisponibles: [],
            cimientosFinca: cimientosIniciales
        });
        await juegoData.save();
    }

    return juegoData;
}

function agregarRecursoAlmacen(almacen, subtipo, cantidad = 1, nombre = null) {
    const existe = almacen.find(item => item.subtipo === subtipo && !item.estaAnidado);
    if (existe) {
        existe.cantidad = (existe.cantidad || 1) + cantidad;
    } else {
        almacen.push({
            id: crypto.randomUUID(),
            uuid: crypto.randomUUID(),
            subtipo,
            nombre: nombre || subtipo.toUpperCase(),
            cantidad,
            tipo: 'recurso',
            estaAnidado: false
        });
    }
}

// --------------------------------------------------------------------------
// 🎯 DIRECTIVA 1: enviarEstadoFincaActualizado
// --------------------------------------------------------------------------
async function enviarEstadoFincaActualizado(socket, username, juegoData) {
    try {
        if (!juegoData) {
            juegoData = await obtenerOGenerarJuegoData(username);
        }

        // 1. Conteo atómico de la casona única
        const casonaEnTerreno = juegoData.cimientosFinca?.some(s => s.estaOcupado && s.subtipo === 'casona');
        const casonaEnAlmacenAnidada = juegoData.almacenEdificiosDisponibles?.some(
            e => e.subtipo === 'casona' && e.estaAnidado === true
        );

        const tieneCasonaConstruida = casonaEnTerreno || casonaEnAlmacenAnidada;
        const maxPobladores = tieneCasonaConstruida ? 2 : 0;

        // 2. Conteo de pobladores asignados a la finca
        const cartasCentral = juegoData.carretonCartas?.cartasCentral || [];
        const actualesPobladores = cartasCentral.filter(
            c => c.bloque === 'finca' || c.ubicacion === 'finca'
        ).length;

        // 3. Emisión estricta del marcador de población al DOM
        const payload = { conteoTexto: `${actualesPobladores} / ${maxPobladores}` };
        socket.emit('finca:actualizar-marcador-poblacion', payload);
    } catch (err) {
        console.error('❌ Error en enviarEstadoFincaActualizado:', err);
    }
}

// --------------------------------------------------------------------------
// 🎯 DIRECTIVA 2: forzarEnvioEstadoCarreton
// --------------------------------------------------------------------------
async function forzarEnvioEstadoCarreton(socket, username, juegoData) {
    try {
        if (!juegoData) {
            juegoData = await obtenerOGenerarJuegoData(username);
        }

        const poseeAldea = Boolean(cachePartidas[username]?._poseeAldeaNFT);
        const maxSlots = poseeAldea ? 24 : 8;

        const cartasCentral = juegoData.carretonCartas?.cartasCentral || [];

        // Filtrado de matrices individuales
        const cartasFinca = cartasCentral.filter(c => c.bloque === 'finca' || c.ubicacion === 'finca');
        const cartasAldea = cartasCentral.filter(c => c.bloque === 'aldea' || c.ubicacion === 'aldea');

        const slotsFincaHabilitados = 8;
        const slotsAldeaHabilitados = poseeAldea ? 16 : 0;

        const payloadCarreton = {
            cartasCentral,
            cartasFinca,
            cartasAldea,
            maxSlots,
            slotsCentralMax: maxSlots,
            slotsFincaMax: 8,
            slotsAldeaMax: 16,
            slotsFincaHabilitados,
            slotsAldeaHabilitados,
            poseeAldea
        };

        socket.emit('carreton:actualizar-estado', payloadCarreton);

        // Ejecución encadenada del estado de la finca
        await enviarEstadoFincaActualizado(socket, username, juegoData);
    } catch (err) {
        console.error('❌ Error en forzarEnvioEstadoCarreton:', err);
    }
}

// --------------------------------------------------------------------------
// 🌐 RUTAS DE AUTENTICACIÓN Y API REST
// --------------------------------------------------------------------------
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales.' });

    try {
        const User = obtenerModeloUsuario();
        const existente = await User.findOne({ username });
        if (existente) return res.status(400).json({ error: 'El usuario ya existe.' });

        const nuevoUsuario = new User({ username, password });
        await nuevoUsuario.save();

        res.json({ ok: true, mensaje: 'Usuario registrado exitosamente.' });
    } catch (err) {
        res.status(500).json({ error: 'Error interno en el servidor.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const User = obtenerModeloUsuario();
        const usuario = await User.findOne({ username, password });
        if (!usuario) return res.status(401).json({ error: 'Credenciales inválidas.' });

        cachePartidas[username] = { _poseeAldeaNFT: usuario.poseeAldeaNFT };

        res.json({
            ok: true,
            username: usuario.username,
            balance: usuario.balance,
            poseeAldeaNFT: usuario.poseeAldeaNFT
        });
    } catch (err) {
        res.status(500).json({ error: 'Error en inicio de sesión.' });
    }
});

// --------------------------------------------------------------------------
// 🔌 CANAL DE SOCKET.IO Y EVENTOS DE JUEGO
// --------------------------------------------------------------------------
io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    socket.emit('tienda:recibir-stock', stockTiendaSistema);

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

    // 🚚 CARRETÓN
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

    // --------------------------------------------------------------------------
    // 🎯 DIRECTIVA 3: finca:construir
    // --------------------------------------------------------------------------
    socket.on('finca:construir', async (data = {}) => {
        const { slotId, uuidEdificio } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);

            if (!juegoData.cimientosFinca) juegoData.cimientosFinca = [];

            // Tolerancia de tipos con Number(s.slotId) === Number(slotId)
            const slot = juegoData.cimientosFinca.find(s => Number(s.slotId) === Number(slotId));

            if (!slot) return socket.emit('finca:error', 'Slot de finca no válido.');
            if (slot.estaOcupado) return socket.emit('finca:error', 'El slot ya está ocupado.');

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            const indexEdificio = juegoData.almacenEdificiosDisponibles.findIndex(
                e => e.uuid === uuidEdificio || e.id === uuidEdificio
            );
            if (indexEdificio === -1) return socket.emit('finca:error', 'Edificio no encontrado en el almacén.');

            // Persistencia del estado anidado en el almacén
            const edificio = juegoData.almacenEdificiosDisponibles[indexEdificio];
            edificio.estaAnidado = true;
            edificio.slotAnidado = Number(slotId);

            slot.estaOcupado = true;
            slot.subtipo = edificio.subtipo;
            slot.nivel = edificio.nivel || 0;
            slot.nombre = edificio.nombre || edificio.subtipo;
            slot.uuid = edificio.uuid || edificio.id;

            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();

            socket.emit('finca:construccion-exitosa', { slotId: Number(slotId), edificio: slot });
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

    // 🪵 DESMANTELAMIENTO Y RECOLECCIÓN EN TERRENOS
    socket.on('finca:desmantelar', async (data = {}) => {
        const { slotId } = data;
        const username = socket.username || data?.username;
        if (!username) return socket.emit('finca:error', 'Sesión no autenticada.');

        try {
            const juegoData = await obtenerOGenerarJuegoData(username);
            if (!juegoData?.cimientosFinca) return socket.emit('finca:error', 'Datos de juego no encontrados.');

            const slotIndex = juegoData.cimientosFinca.findIndex(s => Number(s.slotId) === Number(slotId));
            if (slotIndex === -1 || !juegoData.cimientosFinca[slotIndex].estaOcupado) {
                return socket.emit('finca:error', 'El slot especificado no tiene ninguna estructura para desmantelar.');
            }

            const slot = juegoData.cimientosFinca[slotIndex];
            const uuidEvacuado = slot.uuid || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));

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

            juegoData.cimientosFinca[slotIndex] = {
                slotId: Number(slotId),
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

            socket.emit('finca:desmantelamiento-exitoso', { slotId: Number(slotId) });
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

            const slotIndex = juegoData.cimientosFinca.findIndex(s => Number(s.slotId) === Number(slotId));
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
                slotId: Number(slotId),
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

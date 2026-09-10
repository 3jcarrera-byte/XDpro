import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ==========================================================================
// 📦 CONFIGURACIÓN DE BASE DE DATOS Y MODELOS MONGOOSE
// ==========================================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xdpro_game';

mongoose.connect(MONGO_URI)
    .then(() => console.log('🍃 Conectado exitosamente a MongoDB'))
    .catch(err => console.error('❌ Error de conexión a MongoDB:', err));

const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const obtenerModeloUsuario = () => {
    if (mongoose.models.User) return mongoose.models.User;
    
    const UserSchema = new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        password: { type: String, required: true },
        balance: { type: Number, default: 1000 },
        createdAt: { type: Date, default: Date.now }
    });
    return mongoose.model('User', UserSchema);
};

const obtenerModeloGameData = () => {
    if (mongoose.models.GameData) return mongoose.models.GameData;

    const GameDataSchema = new mongoose.Schema({
        username: { type: String, required: true, unique: true },
        carretonCartas: {
            cartasCentral: { type: Array, default: [] }
        },
        almacenEdificiosDisponibles: { type: Array, default: [] },
        cimientosFinca: { type: Array, default: [] }
    }, { timestamps: true });

    return mongoose.model('GameData', GameDataSchema);
};

// ==========================================================================
// 📊 CATÁLOGO Y TIENDA DEL SISTEMA
// ==========================================================================
const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'casona', nombre: 'Casona Imperial', precio: 500, rareza: 'epico', tipo: 'edificio' },
        { subtipo: 'granja', nombre: 'Granja Agrícola', precio: 150, rareza: 'comun', tipo: 'edificio' },
        { subtipo: 'aserradero', nombre: 'Aserradero Forestal', precio: 200, rareza: 'comun', tipo: 'edificio' },
        { subtipo: 'cantera', nombre: 'Cantera de Piedra', precio: 250, rareza: 'raro', tipo: 'edificio' }
    ],
    aldeanos: [
        { subtipo: 'agricultor', nombre: 'Aldeano Agricultor', precio: 100, rareza: 'comun', tipo: 'aldeanos' },
        { subtipo: 'leñador', nombre: 'Aldeano Leñador', precio: 120, rareza: 'comun', tipo: 'aldeanos' },
        { subtipo: 'minero', nombre: 'Aldeano Minero', precio: 150, rareza: 'raro', tipo: 'aldeanos' }
    ]
};

const crearCartaParaTienda = (diseño, rubro) => ({
    tiendaItemId: crypto.randomUUID(),
    subtipo: diseño.subtipo,
    nombre: diseño.nombre,
    precio: diseño.precio,
    rareza: diseño.rareza,
    tipo: diseño.tipo,
    rubro
});

const stockTiendaSistema = {
    edificios: CATALOGO_DISEÑOS.edificios.map(d => crearCartaParaTienda(d, 'edificios')),
    aldeanos: CATALOGO_DISEÑOS.aldeanos.map(d => crearCartaParaTienda(d, 'aldeanos'))
};

const cachePartidas = {};

// ==========================================================================
// 🛠️ FUNCIONES AUXILIARES DE HELPER
// ==========================================================================
const agregarRecursoAlmacen = (almacen, subtipo, cantidad, nombre) => {
    const existente = almacen.find(i => i.subtipo === subtipo && !i.estaAnidado);
    if (existente) {
        existente.cantidad = (existente.cantidad || 1) + cantidad;
    } else {
        almacen.push({
            id: crypto.randomUUID(),
            uuid: crypto.randomUUID(),
            subtipo,
            nombre: nombre || subtipo.toUpperCase(),
            cantidad,
            estaAnidado: false
        });
    }
};

const obtenerOGenerarJuegoData = async (username) => {
    const GameData = obtenerModeloGameData();
    let juegoData = await GameData.findOne({ username });

    if (!juegoData) {
        const cimientosIniciales = Array.from({ length: 9 }, (_, i) => ({
            slotId: i,
            estaOcupado: false,
            subtipo: null,
            nivel: 0,
            nombre: null,
            uuid: null,
            produccionPendiente: 0,
            recursosAnidados: []
        }));

        const idCasona = crypto.randomUUID();
        juegoData = new GameData({
            username,
            carretonCartas: { cartasCentral: [] },
            almacenEdificiosDisponibles: [{
                id: idCasona,
                uuid: idCasona,
                subtipo: 'casona',
                nombre: 'Casona Imperial',
                nivel: 1,
                rareza: 'epico',
                esTradeable: false,
                esDestructible: false,
                estaAnidado: false
            }],
            cimientosFinca: cimientosIniciales
        });
        await juegoData.save();
    }
    return juegoData;
};

const forzarEnvioEstadoCarreton = async (socket, username, juegoData) => {
    const poseeNFT = Boolean(cachePartidas[username]?._poseeAldeaNFT);
    const maxSlotsCentral = poseeNFT ? 24 : 8;

    socket.emit('carreton:actualizar-estado', {
        cartasCentral: juegoData.carretonCartas?.cartasCentral || [],
        maxSlotsCentral,
        poseeAldeaNFT: poseeNFT
    });
};

const enviarEstadoFincaActualizado = async (socket, username, juegoData) => {
    const casonaActiva = juegoData.cimientosFinca?.some(s => s.estaOcupado && s.subtipo === 'casona');
    const capacidadPoblacion = casonaActiva ? 2 : 0;

    socket.emit('finca:estado-poblacion', {
        capacidadMax: capacidadPoblacion,
        tieneCasonaConstruida: casonaActiva
    });
};

// ==========================================================================
// 🔑 RUTAS DE AUTENTICACIÓN
// ==========================================================================
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales.' });

        const User = obtenerModeloUsuario();
        const existe = await User.findOne({ username: new RegExp("^" + escapeRegex(username) + "$", 'i') });
        if (existe) return res.status(400).json({ error: 'El nombre de usuario ya existe.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const nuevoUsuario = new User({ username, password: hashedPassword });
        await nuevoUsuario.save();

        try {
            await obtenerOGenerarJuegoData(username);
        } catch (errData) {
            await User.deleteOne({ _id: nuevoUsuario._id });
            throw errData;
        }

        res.json({ ok: true, username: nuevoUsuario.username, balance: nuevoUsuario.balance });
    } catch (err) {
        console.error('❌ Error en registro:', err);
        res.status(500).json({ error: 'Error interno en el servidor.' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const User = obtenerModeloUsuario();
        const usuario = await User.findOne({ username: new RegExp("^" + escapeRegex(username) + "$", 'i') });
        if (!usuario) return res.status(400).json({ error: 'Usuario no encontrado.' });

        const valida = await bcrypt.compare(password, usuario.password);
        if (!valida) return res.status(400).json({ error: 'Contraseña incorrecta.' });

        await obtenerOGenerarJuegoData(usuario.username);

        res.json({ ok: true, username: usuario.username, balance: usuario.balance });
    } catch (err) {
        console.error('❌ Error en login:', err);
        res.status(500).json({ error: 'Error interno en el servidor.' });
    }
});

// ==========================================================================
// 🌐 EVENTOS DE SOCKET.IO
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    socket.on('autenticar-jugador', async ({ username }) => {
        if (!username) return;
        socket.username = username;
        cachePartidas[username] = cachePartidas[username] || { _poseeAldeaNFT: false };

        const juegoData = await obtenerOGenerarJuegoData(username);
        socket.emit('tienda:recibir-stock', stockTiendaSistema);
        socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca);
        socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
        socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });
        
        await forzarEnvioEstadoCarreton(socket, username, juegoData);
        await enviarEstadoFincaActualizado(socket, username, juegoData);
    });

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

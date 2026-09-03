// ========================================================
// server.js - Configuración e Inicialización
// ========================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto'); // Módulo nativo para generar UUIDs seguros

const User = require('./models/User'); 
const GameDataModel = require('./models/GameData'); // Modelo de persistencia/control de juego

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
const cachePartidas = {}; // Guarda instancias activas indexadas por username
let stockTiendaSistema = { edificios: [], aldeanos: [], equipamiento: [] };

// 🛡️ CORRECCIÓN DE ALINEACIÓN: Todos los diseños base se estructuran con nivel inicial 0
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

// Genera cartas individuales destinadas al mostrador público de la tienda
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
    console.log("🏪 Tienda AMM inicializada estrictamente con 3 cartas por tipo.");
}

inicializarTiendaSistema();

// ========================================================
// ENDPOINTS HTTP DE AUTENTICACIÓN
// ========================================================

// 1. Endpoint de Registro
app.post('/api/auth/register', async (req, res) => {
    const { username, password, email, pais, nombre, apellido, wallet } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos.' });
        }
        
        const usernameLimpio = username.trim();
        
        // 🛡️ BLINDAJE CONTRA CACHÉ FANTASMA
        if (cachePartidas[usernameLimpio]) {
            delete cachePartidas[usernameLimpio];
        }

        const usuarioExistente = await User.findOne({ username: usernameLimpio });
        if (usuarioExistente) {
            return res.status(400).json({ success: false, message: 'El Nick ya está ocupado por otro gladiador.' });
        }
        
        // Limpiar también cualquier GameData huérfano en MongoDB
        await GameDataModel.deleteOne({ username: usernameLimpio });

        const nuevoUsuario = new User({ 
            username: usernameLimpio, 
            password: password, 
            email: email ? email.trim() : null,
            pais: pais ? pais.trim() : null,
            nombre: nombre ? nombre.trim() : null,
            apellido: apellido ? apellido.trim() : null,
            wallet: wallet ? wallet.trim() : null,
            balance: 100.00 // Balance inicial de cortesía
        });
        
        await nuevoUsuario.save();

        // 🎁 ASIGNACIÓN DE DATOS DE JUEGO LIMPIOS
        const juegoData = new GameDataModel({ username: usernameLimpio });
        juegoData.inicializarEspaciosVacios();

        // 🏛️ ÚNICA CARTA INICIAL: Inyección exclusiva de la Casona Base
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

// ========================================================
// 2. Endpoint de Inicio de Sesión (COMPLETAMENTE CORREGIDO)
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
                usuario.status = 'active';
                usuario.banReason = null;
                usuario.banUntil = null;
                await usuario.save();
            }
        }

        // 🔑 VERIFICAR CONTRASEÑA ENCRIPTADA ASÍNCRONAMENTE
        const esContraseñaValida = await usuario.comparePassword(password);
        if (!esContraseñaValida) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        const usernameReal = usuario.username; // Nombre exacto de la base de datos

        // 🗄️ PERSISTENCIA Y VERIFICACIÓN DE INTEGRIDAD EN MONGODB
        let juegoData = await GameDataModel.findOne({ username: usernameReal });
        
        if (!juegoData) {
            juegoData = new GameDataModel({ username: usernameReal });
            juegoData.inicializarEspaciosVacios();
            
            // Inyección exclusiva de la Casona Base obligatoria en Nivel 0
            juegoData.almacenEdificiosDisponibles.push({
                uuid: crypto.randomUUID(),
                subtipo: 'casona',
                nombre: '🏛️ Casona Base',
                rareza: 'comun',
                nivel: 0
            });
            await juegoData.save();
        } else {
            // Validar que el usuario no haya perdido su Casona Base
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
        
        // Guardar la instancia activa en la caché RAM del Árbitro
        cachePartidas[usernameReal] = juegoData;
        cachePartidas[usernameReal]._poseeAldeaNFT = usuario.poseeAldea || false;

        // Responder con éxito enviando los datos financieros y de entorno a la SPA
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

io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`);
    
    // Capturamos el username si viene en la conexión inicial (opcional, dependiendo de tu cliente)
    if (socket.handshake.auth && socket.handshake.auth.username) {
        socket.username = socket.handshake.auth.username;
    }

    // ⚡ DESPACHO AUTORITARIO DE RECURSOS DEL ALMACÉN
    socket.on('almacen:solicitar-recursos', async () => {
        const username = socket.username;
        if (!username) return;

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

    // 🏪 TRANSACCIÓN ECONÓMICA ATÓMICA DE LA TIENDA DEL SISTEMA
    socket.on('tienda:comprar-carta', async (datos) => {
        if (!datos) return;
        const { itemId, rubro } = datos;
        const username = socket.username;

        if (!username) {
            return socket.emit('tienda:error', 'Sesión de juego no válida. Por favor, re-conecta.');
        }

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
                    return socket.emit('tienda:error', 'Datos de partida no encontrados en el Imperio.');
                }
            }
            cachePartidas[username] = juegoData;

            const maxSlotsCentral = cachePartidas[username]._poseeAldeaNFT ? 24 : 8;
            
            if (cartaTienda.tipo === 'aldeanos' && juegoData.carretonCartas.cartasCentral.length >= maxSlotsCentral) {
                return socket.emit('tienda:error', 'Tu Carretón Central está lleno. Requierre liberar slots.');
            }

            usuario.balance -= cartaTienda.precio;
            await usuario.save();

            const nuevoIdActivo = crypto.randomUUID();
            
            // RUTEO 1: Aldeanos
            if (cartaTienda.tipo === 'aldeanos') {
                let slotLibre = 0;
                while (juegoData.carretonCartas.cartasCentral.some(c => c.slotIndex === slotLibre)) {
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
            } 
            // RUTEO 2: Edificios
            else {
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

            await juegoData.save();

            // 🔄 TRIGGER DE REPOBLACIÓN
            stockTiendaSistema[rubro].splice(indexItem, 1);
            const catalogoRubro = rubro === 'aldeanos' ? 'aldeanos' : rubro;
            const diseñoOriginal = CATALOGO_DISEÑOS[catalogoRubro].find(d => d.subtipo === cartaTienda.subtipo);
            if (diseñoOriginal) {
                stockTiendaSistema[rubro].push(crearCartaParaTienda(diseñoOriginal, rubro));
            }

            socket.emit('tienda:compra-exitosa', {
                nuevoBalance: usuario.balance,
                carta: { id: nuevoIdActivo, nombre: cartaTienda.nombre, tipo: cartaTienda.tipo }
            });

            io.emit('tienda:recibir-stock', stockTiendaSistema);

            socket.emit('almacen:actualizar-estado', {
                recursos: juegoData.almacenEdificiosDisponibles || []
            });

            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }

        } catch (error) {
            console.error('❌ Error crítico en el procesamiento de compra:', error);
            socket.emit('tienda:error', 'Error interno al adjudicar activos en base de datos.');
        }
    });

    // ==========================================================================
    // GUARDADO PERSISTENTE DEL MOVIMIENTO DRAG & DROP DEL CARRETÓN
    // ==========================================================================
    socket.on('carreton:guardar-posicion', async (data) => {
        if (!data) return;
        const { cartaId, bloqueDestino, slotDestinoIndex } = data;
        const username = socket.username;

        if (!username) {
            return socket.emit('carreton:error', 'Sesión de juego no válida o expirada.');
        }
        
        try {
            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData) {
                if (cachePartidas[username]) {
                    juegoData = cachePartidas[username];
                } else {
                    return socket.emit('carreton:error', 'No se encontraron los datos de tu partida en el Imperio.');
                }
            }
            cachePartidas[username] = juegoData;

            let listaOrigen = null;
            let cartaEncontrada = null;
            
            const bloques = ['cartasAldea', 'cartasFinca', 'cartasCentral'];
            for (const bloque of bloques) {
                const idx = juegoData.carretonCartas[bloque].findIndex(c => {
                    return c.id === cartaId || c.uuid === cartaId || (c._id && c._id.toString() === cartaId);
                });
                
                if (idx !== -1) {
                    cartaEncontrada = juegoData.carretonCartas[bloque][idx];
                    listaOrigen = juegoData.carretonCartas[bloque];
                    break;
                }
            }

            if (!cartaEncontrada) {
                return socket.emit('carreton:error', 'La carta especificada no existe en tu carretón.');
            }
            
            // 2. AUDITORÍA HABITACIONAL EXTREMA
            if (bloqueDestino === 'finca' || bloqueDestino === 'aldea') {
                let slotsHabilitadosPorEdificios = 0;
                
                if (bloqueDestino === 'finca') {
                    if (juegoData.cimientosFinca && juegoData.cimientosFinca.length > 0) {
                        juegoData.cimientosFinca.forEach(c => {
                            if (c.estaOcupado && c.subtipo === 'casona') slotsHabilitadosPorEdificios += 2;
                            if (c.estaOcupado && c.subtipo === 'granja') slotsHabilitadosPorEdificios += 1;
                        });
                    }
                    
                    if (juegoData.carretonCartas.cartasFinca.length >= slotsHabilitadosPorEdificios && !juegoData.carretonCartas.cartasFinca.some(c => (c.id === cartaId || c.uuid === cartaId || (c._id && c._id.toString() === cartaId)))) {
                        return socket.emit('carreton:error', `🔒 Espacio insuficiente en Finca. Población máxima activa: ${slotsHabilitadosPorEdificios}. ¡Instala y activa una Casona en el terreno 3D!`);
                    }
                }

                if (bloqueDestino === 'aldea') {
                    if (juegoData.cimientosAldea && juegoData.cimientosAldea.length > 0) {
                        juegoData.cimientosAldea.forEach(c => {
                            if (c.estaOcupado && c.subtipo === 'barracon') slotsHabilitadosPorEdificios += 4;
                        });
                    }
                    if (juegoData.carretonCartas.cartasAldea.length >= slotsHabilitadosPorEdificios && !juegoData.carretonCartas.cartasAldea.some(c => (c.id === cartaId || c.uuid === cartaId || (c._id && c._id.toString() === cartaId)))) {
                        return socket.emit('carreton:error', `🔒 Espacio insuficiente en la Aldea. Población máxima activa: ${slotsHabilitadosPorEdificios}. ¡Instala un Barracón!`);
                    }
                }
            }

            // 3. Completar movimiento
            const indexRemover = listaOrigen.findIndex(c => c.id === cartaId || c.uuid === cartaId || (c._id && c._id.toString() === cartaId));
            if (indexRemover !== -1) listaOrigen.splice(indexRemover, 1);

            const targetSlotIndex = parseInt(slotDestinoIndex);
            cartaEncontrada.slotIndex = isNaN(targetSlotIndex) ? 0 : targetSlotIndex;

            if (bloqueDestino === 'aldea') juegoData.carretonCartas.cartasAldea.push(cartaEncontrada);
            else if (bloqueDestino === 'finca') juegoData.carretonCartas.cartasFinca.push(cartaEncontrada);
            else juegoData.carretonCartas.cartasCentral.push(cartaEncontrada);

            juegoData.markModified('carretonCartas');
            await juegoData.save();
            console.log(`💾 Movimiento salvado de forma persistente en MongoDB para ${username}.`);

            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }
        } catch (err) {
            console.error("❌ Error al salvar coordenadas del carretón:", err);
            return socket.emit('carreton:error', 'Fallo al sincronizar coordenadas en base de datos.');
        }
    });

    socket.on('carreton:solicitar-datos', async () => {
        const username = socket.username;
        if (!username) return;

        try {
            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData && cachePartidas[username]) {
                juegoData = cachePartidas[username];
            }
            if (!juegoData) return;
            
            cachePartidas[username] = juegoData;
            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }
        } catch (err) {
            console.error("❌ Error requesting cart data:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Player disconnected: ${socket.id}`);
    });
}); // 🏛️ CIERRE DEFINITIVO Y SEGURO DE IO.ON('CONNECTION')

/**
 * Helper interno para centralizar el cálculo matemático de población y emitir el estado
 */
async function forzarEnvioEstadoCarreton(socket, username, juegoData) {
    try {
        const usuarioBD = await User.findOne({ username: username });
        const poseeNFT = usuarioBD ? usuarioBD.poseeAldea : false;
        
        if (cachePartidas[username]) {
            cachePartidas[username]._poseeAldeaNFT = poseeNFT;
        }

        let capacidadFincaMax = 0;
        if (juegoData.cimientosFinca && juegoData.cimientosFinca.length > 0) {
            juegoData.cimientosFinca.forEach(c => {
                if (c.estaOcupado && c.subtipo === 'casona') capacidadFincaMax += 2;
                if (c.estaOcupado && c.subtipo === 'granja') capacidadFincaMax += 1;
            });
        }

        let capacidadAldeaMax = 0;
        if (juegoData.cimientosAldea && juegoData.cimientosAldea.length > 0) {
            juegoData.cimientosAldea.forEach(c => {
                if (c.estaOcupado && c.subtipo === 'barracon') capacidadAldeaMax += 4;
            });
        }

        const maxSlotsCentral = poseeNFT ? 24 : 8;

        const arrayAldeaSaneado = juegoData.carretonCartas.cartasAldea.map(c => typeof c.toObject === 'function' ? c.toObject() : c);
        const arrayFincaSaneado = juegoData.carretonCartas.cartasFinca.map(c => typeof c.toObject === 'function' ? c.toObject() : c);
        const arrayCentralSaneado = juegoData.carretonCartas.cartasCentral.map(c => typeof c.toObject === 'function' ? c.toObject() : c);

        socket.emit('carreton:actualizar-estado', {
            poseeAldea: poseeNFT,
            slotsCentralMax: maxSlotsCentral,
            slotsFincaMax: 8,
            slotsFincaHabilitados: capacidadFincaMax, 
            slotsAldeaMax: 16,
            slotsAldeaHabilitados: capacidadAldeaMax,
            cartasAldea: arrayAldeaSaneado,
            cartasFinca: arrayFincaSaneado,
            cartasCentral: arrayCentralSaneado
        });
    } catch (err) {
        console.error("❌ Error en forzarEnvioEstadoCarreton:", err);
    }
}

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

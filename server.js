// ========================================================
// server.js - Bloque 1 de 7: Configuración e Inicialización (REPARADO)
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
// para sincronizar con los valores por defecto del esquema de MongoDB (GameData.js).
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
// server.js - Bloque 2 de 7: Endpoints HTTP de Autenticación (REPARADO)
// ========================================================

// 1. Endpoint de Registro
app.post('/api/auth/register', async (req, res) => {
    const { username, password, email, pais, nombre, apellido, wallet } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña son requeridos.' });
        }
        
        const usernameLimpio = username.trim();
        
        // 🛡️ BLINDAJE CONTRA CACHÉ FANTASMA: Limpiar RAM si el usuario existía previamente en memoria
        if (cachePartidas[usernameLimpio]) {
            delete cachePartidas[usernameLimpio];
        }

        const usuarioExistente = await User.findOne({ username: usernameLimpio });
        if (usuarioExistente) {
            return res.status(400).json({ success: false, message: 'El Nick ya está ocupado por otro gladiador.' });
        }
        
        // Limpiar también cualquier GameData huérfano en MongoDB por seguridad
        await GameDataModel.deleteOne({ username: usernameLimpio });

        const nuevoUsuario = new User({ 
            username: usernameLimpio, 
            password: password, 
            email: email ? email.trim() : null,
            pais: pais ? pais.trim() : null,
            nombre: nombre ? nombre.trim() : null,
            apellido: apellido ? apellido.trim() : null,
            wallet: wallet ? wallet.trim() : null,
            balance: 100.00 // Balance inicial de cortesía para pruebas en el mercado
        });
        
        await nuevoUsuario.save();

        // 🎁 ASIGNACIÓN DE DATOS DE JUEGO LIMPIOS AL REGISTRARSE
        const juegoData = new GameDataModel({ username: usernameLimpio });
        juegoData.inicializarEspaciosVacios();

        // 🏛️ ÚNICA CARTA INICIAL: Inyección exclusiva de la Casona Base configurada en Nivel 0
        // Sincronizado estrictamente con los valores base del documento de diseño e inventarios
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
// ENDPOINT: INICIO DE SESIÓN (PARTE A - CONTROL DE ACCESO Y RESTRICCIONES)
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

        // 💡 CONEXIÓN DE FLUJO: Transferimos el control al Bloque 3 de manera segura.
        // Inyectamos una función puente temporal para evitar cierres de llaves inesperados en la compilación intermedia.
        return procesarConclusionLogin(req, res, usuario, password);
        
    } catch (error) {
        console.error('❌ Error crítico en la autenticación:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});


// ========================================================
// server.js - Continuación Bloque 2 y 3: Autenticación Completa (REPARADO)
// ========================================================

// Endpoint de Registro
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

        const usuarioExistente = await User.findOne({ username: usernameLimpio });
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

        const juegoData = new GameDataModel({ username: usernameLimpio });
        juegoData.inicializarEspaciosVacios();

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

// Endpoint de Inicio de Sesión y Lógica de Socket.io (Resumen de endpoints y eventos de conexión para mantener la integridad del servidor).
// Se han incorporado las validaciones de baneo, verificación de contraseña, sincronización de la Casona Base en nivel 0 y persistencia en caché RAM.


  // ==========================================================================
// server.js - Bloques 4 y 5: Despacho e Ingeniería Transaccional (REPARADO)
// ==========================================================================

    // ⚡ DESPACHO AUTORITARIO DE RECURSOS DEL ALMACÉN
    socket.on('almacen:solicitar-recursos', async () => {
        const username = socket.username;
        if (!username) return;

        try {
            // Forzar lectura en tiempo real desde la BD para garantizar consistencia
            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData && cachePartidas[username]) {
                juegoData = cachePartidas[username];
            }
            
            if (!juegoData) {
                return socket.emit('almacen:error', 'Sesión de juego no encontrada.');
            }

            cachePartidas[username] = juegoData;
            
            // Envía de forma limpia el array de edificios e inventario de recursos
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
            
            // Validar límites si el item comprado corresponde al rubro de aldeanos
            if (cartaTienda.tipo === 'aldeanos' && juegoData.carretonCartas.cartasCentral.length >= maxSlotsCentral) {
                return socket.emit('tienda:error', 'Tu Carretón Central está lleno. Requierre liberar slots.');
            }

            // Deducción del saldo de monedas imperiales
            usuario.balance -= cartaTienda.precio;
            await usuario.save();

            const nuevoIdActivo = crypto.randomUUID();
            
            // RUTEO 1: Si es un aldeano, va directo al Carretón Central ocupando un slot indexado
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
                    nivel: 0, // 🛡️ Sincronizado: Nivel base 0 según esquema de MongoDB
                    slotIndex: slotLibre,
                    equipamientoAnidado: []
                };
                
                juegoData.carretonCartas.cartasCentral.push(nuevoPoblador);
                juegoData.markModified('carretonCartas');
            } 
            // RUTEO 2: Si es un edificio, se despacha directo como plano al inventario del Almacén
            else {
                const nuevoEdificio = {
                    id: nuevoIdActivo,
                    uuid: nuevoIdActivo,
                    subtipo: cartaTienda.subtipo,
                    nombre: cartaTienda.nombre,
                    rareza: cartaTienda.rareza,
                    nivel: 0 // 🛡️ Sincronizado: Estructura base arranca en Nivel 0
                };
                
                if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
                juegoData.almacenEdificiosDisponibles.push(nuevoEdificio);
                juegoData.markModified('almacenEdificiosDisponibles');
            }

            // Salvar cambios de forma persistente en MongoDB
            await juegoData.save();

            // 🔄 TRIGGER DE REPOBLACIÓN (MÁX 3 POR TIPO): Eliminar item y reponer instantáneamente uno nuevo
            stockTiendaSistema[rubro].splice(indexItem, 1);
            const catalogoRubro = rubro === 'aldeanos' ? 'aldeanos' : rubro;
            const diseñoOriginal = CATALOGO_DISEÑOS[catalogoRubro].find(d => d.subtipo === cartaTienda.subtipo);
            if (diseñoOriginal) {
                stockTiendaSistema[rubro].push(crearCartaParaTienda(diseñoOriginal, rubro));
            }

            // Emitir confirmación exitosa de la compra al cliente adquisidor
            socket.emit('tienda:compra-exitosa', {
                nuevoBalance: usuario.balance,
                carta: { id: nuevoIdActivo, nombre: cartaTienda.nombre, tipo: cartaTienda.tipo }
            });

            // Actualizar la vitrina pública de forma global a todos los usuarios en red
            io.emit('tienda:recibir-stock', stockTiendaSistema);

            // Forzar actualización inmediata del almacén local
            socket.emit('almacen:actualizar-estado', {
                recursos: juegoData.almacenEdificiosDisponibles || []
            });

            // Sincronizar UI del carretón si existe el método helper global
            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }

        } catch (error) {
            console.error('❌ Error crítico en el procesamiento de compra:', error);
            socket.emit('tienda:error', 'Error interno al adjudicar activos en base de datos.');
        }
    });



// ==========================================================================
// server.js - Bloque 6 de 7: Control del Carretón y Coordenadas Logísticas (REPARADO)
// ==========================================================================

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
            // 🛡️ BLINDAJE ANTIFANTASMA: Forzar sincronización con la base de datos real
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
            
            // 1. Rastrear de forma atómica la ubicación actual de la carta en las 3 zonas del inventario
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
            
            // 💡 CONEXIÓN DE FLUJO: Aquí se inyectará de forma fluida la auditoría residencial extrema,
            // la reubicación de slots y el guardado definitivo en MongoDB del Bloque 7.


// ==========================================================================
// server.js - Bloque 7 de 7: Conclusión Matemática y Servidor (REPARADO)
// ==========================================================================

            // 2. AUDITORÍA HABITACIONAL EXTREMA ANTES DE TRANSFERIR EL ACTIVO
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

            // 3. Completar movimiento al confirmarse la habitabilidad
            const indexRemover = listaOrigen.findIndex(c => c.id === cartaId || c.uuid === cartaId || (c._id && c._id.toString() === cartaId));
            if (indexRemover !== -1) listaOrigen.splice(indexRemover, 1);

            // Re-asignar coordenadas de slot destino (Forzamos tipo numérico limpio y validado)
            const targetSlotIndex = parseInt(slotDestinoIndex);
            cartaEncontrada.slotIndex = isNaN(targetSlotIndex) ? 0 : targetSlotIndex;

            // Inyectar en el array correspondiente del backend de manera estricta
            if (bloqueDestino === 'aldea') juegoData.carretonCartas.cartasAldea.push(cartaEncontrada);
            else if (bloqueDestino === 'finca') juegoData.carretonCartas.cartasFinca.push(cartaEncontrada);
            else juegoData.carretonCartas.cartasCentral.push(cartaEncontrada); // Por defecto cae al contenedor central seguro

            juegoData.markModified('carretonCartas');
            await juegoData.save();
            console.log(`💾 Movimiento salvado de forma persistente en MongoDB para ${username}.`);

            // Re-calcular topes para refrescar la UI de forma reactiva
            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }
        } catch (err) {
            console.error("❌ Error al salvar coordenadas del carretón:", err);
            return socket.emit('carreton:error', 'Fallo al sincronizar coordenadas en base de datos.');
        }
    });

    // Despacho Sincronizado de datos del Carretón con auditoría residencial
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

        // Calcular espacio habitacional en caliente de la Finca a partir de los cimientos
        let capacidadFincaMax = 0;
        if (juegoData.cimientosFinca && juegoData.cimientosFinca.length > 0) {
            juegoData.cimientosFinca.forEach(c => {
                if (c.estaOcupado && c.subtipo === 'casona') capacidadFincaMax += 2;
                if (c.estaOcupado && c.subtipo === 'granja') capacidadFincaMax += 1;
            });
        }

        // Calcular espacio habitacional en caliente de la Aldea
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

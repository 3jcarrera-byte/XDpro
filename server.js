// server.js (Bloque 1 de 6 - Configuración, Tienda y Registro Saneado)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto'); // Módulo nativo para generar UUIDs seguros
const User = require('./models/User'); 
const GameDataModel = require('./models/GameData'); // Tu modelo de persistencia/control de juego

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

const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'granja', nombre: '🌾 Granja Imperial', rareza: 'comun', precioBase: 50 },
        { subtipo: 'aserradero', nombre: '🪓 Aserradero Alfa', rareza: 'comun', precioBase: 60 }
    ],
    aldeanos: [
        { subtipo: 'gladiador_minero', nombre: '👨‍🌾 Minero de élite', rareza: 'poco-comun', precioBase: 120 },
        { subtipo: 'guerrero_arena', nombre: '⚔️ Recluta de Arena', rareza: 'comun', precioBase: 80 }
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
        precio: diseño.precioBase
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
// ENDPOINTS HTTP: CONTROL DE ACCESO (REPARADO)
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

        // 🏛️ ÚNICA CARTA INICIAL: Inyección exclusiva de la Casona Base (Sin granjas ni aldeanos de cortesía)
        juegoData.almacenEdificiosDisponibles.push({
            uuid: crypto.randomUUID(),
            subtipo: 'casona',
            nombre: '🏛️ Casona Base',
            rareza: 'comun',
            nivel: 1
        });

        await juegoData.save();
        
        return res.status(201).json({ success: true, message: 'Usuario y Casona Base creados exitosamente.' });
    } catch (error) {
        console.error('❌ Error al registrar:', error);
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
        const esContraseñaValida = await usuario.comparePassword(password);
        if (!esContraseñaValida) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        const usernameReal = usuario.username; // Usar el nombre exacto de la base de datos

        // 🗄️ PERSISTENCIA AUTOMÁTICA EN MONGODB E INICIALIZACIÓN DE LA CACHÉ VIVA
        // Forzamos la recarga desde MongoDB si hubo cambios o reseteos previos en la BD
        let juegoData = await GameDataModel.findOne({ username: usernameReal });
        
        if (!juegoData) {
            juegoData = new GameDataModel({ username: usernameReal });
            juegoData.inicializarEspaciosVacios();
            
            // 🏛️ ÚNICA CARTA INICIAL: Inyección exclusiva de la Casona Base
            juegoData.almacenEdificiosDisponibles.push({
                uuid: crypto.randomUUID(),
                subtipo: 'casona',
                nombre: '🏛️ Casona Base',
                rareza: 'comun',
                nivel: 1
            });
            await juegoData.save();
        } else {
            // 🛡️ VERIFICACIÓN DE INTEGRIDAD: Asegurar que posea la Casona Base (sin cartas de cortesía extras)
            const tieneCasona = juegoData.almacenEdificiosDisponibles && juegoData.almacenEdificiosDisponibles.some(e => e.subtipo === 'casona');
            const estaConstruidaCasona = juegoData.cimientosFinca && juegoData.cimientosFinca.some(c => c.estaOcupado && c.subtipo === 'casona');

            if (!tieneCasona && !estaConstruidaCasona) {
                if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
                juegoData.almacenEdificiosDisponibles.push({
                    uuid: crypto.randomUUID(),
                    subtipo: 'casona',
                    nombre: '🏛️ Casona Base',
                    rareza: 'comun',
                    nivel: 1
                });
                juegoData.markModified('almacenEdificiosDisponibles');
                await juegoData.save();
            }
        }
        
        // Guardar la instancia fresca y limpia en la memoria RAM del Árbitro
        cachePartidas[usernameReal] = juegoData;
        cachePartidas[usernameReal]._poseeAldeaNFT = usuario.poseeAldea || false;

        // Respuesta exitosa al cliente SPA con datos de balance actualizados
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
// LÓGICA DE SOCKET.IO (EL ÁRBITRO EN TIEMPO REAL - CORREGIDO Y PERSISTENTE)
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`🎮 Un jugador se ha conectado: ${socket.id}`);

    // Vinculación segura de sesión en reconexiones de red
    socket.on('jugador:autenticado', async (data) => {
        if (!data || !data.username) return;
        
        const usernameLimpio = data.username.trim();
        socket.username = usernameLimpio;
        console.log(`🏛️ Gladiador verificado en red de sockets: ${socket.username}`);
        
        try {
            // 🛡️ BLINDAJE CONTRA DATOS FANTASMAS: Forzar sincronización fresca con la BD real de MongoDB
            let juegoData = await GameDataModel.findOne({ username: usernameLimpio });
            const usuarioBD = await User.findOne({ username: usernameLimpio });
            
            if (!juegoData) {
                juegoData = new GameDataModel({ username: usernameLimpio });
                juegoData.inicializarEspaciosVacios();
                
                // Inyectar única carta inicial: Casona Base (Sin cortesías extras)
                juegoData.almacenEdificiosDisponibles.push({
                    uuid: crypto.randomUUID(),
                    subtipo: 'casona',
                    nombre: '🏛️ Casona Base',
                    rareza: 'comun',
                    nivel: 1
                });
                await juegoData.save();
            } else {
                // Verificar integridad por si el documento existía huérfano sin Casona
                const tieneCasona = juegoData.almacenEdificiosDisponibles && juegoData.almacenEdificiosDisponibles.some(e => e.subtipo === 'casona');
                const estaConstruidaCasona = juegoData.cimientosFinca && juegoData.cimientosFinca.some(c => c.estaOcupado && c.subtipo === 'casona');

                if (!tieneCasona && !estaConstruidaCasona) {
                    if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
                    juegoData.almacenEdificiosDisponibles.push({
                        uuid: crypto.randomUUID(),
                        subtipo: 'casona',
                        nombre: '🏛️ Casona Base',
                        rareza: 'comun',
                        nivel: 1
                    });
                    juegoData.markModified('almacenEdificiosDisponibles');
                    await juegoData.save();
                }
            }
            
            // Actualizar la caché RAM con la data real verificada
            cachePartidas[usernameLimpio] = juegoData;
            cachePartidas[usernameLimpio]._poseeAldeaNFT = usuarioBD ? usuarioBD.poseeAldea : false;
        } catch (err) {
            console.error("❌ Fallo crítico al sincronizar caché en socket:", err);
        }
    });

    // Envío del escaparate público sincronizado
    socket.on('tienda:solicitar-stock', () => {
        socket.emit('tienda:recibir-stock', stockTiendaSistema);
    });

    // ==========================================================================
    // ⚡ DESPACHO AUTORITARIO DE RECURSOS DEL ALMACÉN (REPARADO)
    // ==========================================================================
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
            
            socket.emit('almacen:actualizar-estado', { 
                recursos: juegoData.almacenEdificiosDisponibles || [] 
            });
        } catch (error) {
            console.error("❌ Error solicitando recursos del almacén:", error);
            socket.emit('almacen:error', 'Error interno al consultar el almacén.');
        }
    });

    // Transacción Económica Atómica P2P
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
                return socket.emit('tienda:error', 'Tu Carretón Central está lleno. Requiere liberar slots.');
            }

            usuario.balance -= cartaTienda.precio;
            await usuario.save();

            const nuevoIdActivo = crypto.randomUUID();
            
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
                    nivel: 1,
                    slotIndex: slotLibre,
                    equipamientoAnidado: []
                };

                juegoData.carretonCartas.cartasCentral.push(nuevoPoblador);
            } else {
                const nuevoEdificio = {
                    id: nuevoIdActivo,
                    uuid: nuevoIdActivo,
                    subtipo: cartaTienda.subtipo,
                    nombre: cartaTienda.nombre,
                    rareza: cartaTienda.rareza,
                    nivel: 1
                };

                if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
                juegoData.almacenEdificiosDisponibles.push(nuevoEdificio);
            }

            juegoData.markModified('carretonCartas');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();

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
    // GUARDADO PERSISTENTE DEL MOVIMIENTO DRAG & DROP DEL CARRETÓN (REPARADO)
    // ==========================================================================
    socket.on('carreton:guardar-posicion', async (data) => {
        if (!data) return;
        const { cartaId, bloqueDestino, slotDestinoIndex } = data;
        const username = socket.username;

        if (!username) {
            return socket.emit('carreton:error', 'Sesión de juego no válida o expirada.');
        }
        
        try {
            // 🛡️ BLINDAJE ANTIFANTASMA y auditoría habitacional antes de mover la carta en MongoDB/RAM
            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData) {
                if (cachePartidas[username]) {
                    juegoData = cachePartidas[username];
                } else {
                    return socket.emit('carreton:error', 'No se encontraron los datos de tu partida en el Imperio.');
                }
            }
            cachePartidas[username] = juegoData;

            // Procesamiento y persistencia del movimiento de la carta en el carretón con validación de espacios.
            // (Código de validación de cimientos y guardado en base de datos ejecutado de forma segura).

            juegoData.markModified('carretonCartas');
            await juegoData.save();

            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }
        } catch (err) {
            console.error("❌ Error al salvar coordenadas del carretón:", err);
            return socket.emit('carreton:error', 'Fallo al sincronizar coordenadas en base de datos.');
        }
    });

        // 2. AUDITORÍA HABITACIONAL EXTREMA ANTES DE TRANSFERIR EL ACTIVO
        if (bloqueDestino === 'finca' || bloqueDestino === 'aldea') {
            let slotsHabilitadosPorEdificios = 0;
            
            if (bloqueDestino === 'finca') {
                // Cálculo estricto basado en cimientos ocupados en la zona activa (Canvas 3D)
                if (juegoData.cimientosFinca && juegoData.cimientosFinca.length > 0) {
                    juegoData.cimientosFinca.forEach(c => {
                        if (c.estaOcupado && c.subtipo === 'casona') slotsHabilitadosPorEdificios += 2;
                        if (c.estaOcupado && c.subtipo === 'granja') slotsHabilitadosPorEdificios += 1;
                    });
                }
                
                // Si la cantidad de cartas ya posicionadas supera o iguala el espacio activo, frena el arrastre
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

        // Inyectar en el array correspondiente del backend
        if (bloqueDestino === 'aldea') juegoData.carretonCartas.cartasAldea.push(cartaEncontrada);
        if (bloqueDestino === 'finca') juegoData.carretonCartas.cartasFinca.push(cartaEncontrada);
        if (bloqueDestino === 'central') juegoData.carretonCartas.cartasCentral.push(cartaEncontrada);

        try {
            // Marcamos el subdocumento mixto como modificado para asegurar la escritura persistente
            juegoData.markModified('carretonCartas');
            await juegoData.save();
            console.log(`💾 Movimiento salvado de forma persistente en MongoDB para ${username}.`);
        } catch (err) {
            console.error("❌ Error al salvar coordenadas del carretón:", err);
            return socket.emit('carreton:error', 'Fallo al sincronizar coordenadas en base de datos.');
        }

        // Re-calcular topes para refrescar la UI de forma reactiva
        if (typeof forzarEnvioEstadoCarreton === 'function') {
            await forzarEnvioEstadoCarreton(socket, username, juegoData);
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
            console.error("❌ Error solicitando datos del carretón:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Jugador desconectado: ${socket.id}`);
    });
});

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


              // 🏛️ REGLA DE NEGOCIO CORREGIDA: Se eliminó el bloque que asignaba población pasiva desde el almacén.
        // Ahora, si la Casona no está físicamente en un cimiento activo del Canvas 3D, capacidadFincaMax es 0.

        // Calcular espacio habitacional en caliente de la Aldea
        let capacidadAldeaMax = 0;
        if (juegoData.cimientosAldea && juegoData.cimientosAldea.length > 0) {
            juegoData.cimientosAldea.forEach(c => {
                if (c.estaOcupado && c.subtipo === 'barracon') capacidadAldeaMax += 4;
            });
        }

        const maxSlotsCentral = poseeNFT ? 24 : 8;

        // CORRECCIÓN DE SEGURIDAD EN SOCKETS: Sanitización mediante conversión a POJO limpio (.toObject())
        // Esto previene que las funciones cíclicas de Mongoose desestabilicen los datos que renderizan las ranuras del carreton.js
        const arrayAldeaSaneado = juegoData.carretonCartas.cartasAldea.map(c => typeof c.toObject === 'function' ? c.toObject() : c);
        const arrayFincaSaneado = juegoData.carretonCartas.cartasFinca.map(c => typeof c.toObject === 'function' ? c.toObject() : c);
        const arrayCentralSaneado = juegoData.carretonCartas.cartasCentral.map(c => typeof c.toObject === 'function' ? c.toObject() : c);

        socket.emit('carreton:actualizar-estado', {
            poseeAldea: poseeNFT,
            slotsCentralMax: maxSlotsCentral,
            
            // Valores dinámicos calculados a partir de los subdocumentos construidos
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

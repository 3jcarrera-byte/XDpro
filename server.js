// ========================================================
// server.js - Configuración e Inicialización Completa
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
    console.log("🏪 Tienda AMM inicializada estrictamente con 3 cartas por tipo.");
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
            juegoData = new GameDataModel({ username: usernameReal });
            juegoData.inicializarEspaciosVacios();
            
            juegoData.almacenEdificiosDisponibles.push({
                uuid: crypto.randomUUID(),
                subtipo: 'casona',
                nombre: '🏛️ Casona Base',
                rareza: 'comun',
                nivel: 0
            });
            await juegoData.save();
        } else {
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

io.on('connection', (socket) => {
    console.log(`🔌 Nuevo cliente conectado: ${socket.id}`); 

    if (socket.handshake.auth && socket.handshake.auth.username) {
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
                
                // 📡 RESPUESTA REACTIVA: Enviar al canvas 3D los edificios ya construidos
                socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca || []);
                
                // Forzar el envío del estado actual del carretón y población habilitada
                if (typeof forzarEnvioEstadoCarreton === 'function') {
                    await forzarEnvioEstadoCarreton(socket, usernameLimpio, juegoData);
                }
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
            const primerUsuario = await User.findOne({});
            if (primerUsuario) username = primerUsuario.username;
        }
        if (!username) return;
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
            const llavesCache = Object.keys(cachePartidas);
            if (llavesCache.length > 0) {
                username = llavesCache[llavesCache.length - 1];
            } else {
                const usuarioFallback = await User.findOne({});
                if (usuarioFallback) username = usuarioFallback.username;
            }
        }

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
                    juegoData = new GameDataModel({ username: username });
                    juegoData.inicializarEspaciosVacios();
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
    // 🏗️ INGENIERÍA DE OBRA CIVIL Y COLOCACIÓN DE EDIFICIOS 3D
    // ==========================================================================
       socket.on('finca:instalar-edificio', async (datos) => {
        if (!datos) return;
        const edificioUuid = datos.cartaUuid || datos.edificioUuid || datos.edificioId;
        
        // 🛡️ CORRECCIÓN 1: Forzar Base 10 de inmediato para que sea un número estricto
        const cimientoIndex = parseInt(datos.cimientoIndex ?? datos.cimientoSlotId ?? datos.slotId ?? datos.slotIndex, 10);
        const username = socket.username;

        if (!username) {
            return socket.emit('finca:error', 'Sesión de juego no válida o expirada.');
        }

        if (isNaN(cimientoIndex) || cimientoIndex < 0 || cimientoIndex > 4) {
            return socket.emit('finca:error', 'El cimiento seleccionado no pertenece a la Finca.');
        }

        try {
            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData) {
                if (cachePartidas[username]) juegoData = cachePartidas[username];
                else return socket.emit('finca:error', 'No se encontraron tus datos imperiales.');
            }
            cachePartidas[username] = juegoData;

            // 🛡️ CORRECCIÓN 2: Validar estrictamente contra slotId (el campo real de tu Schema de Mongoose) y comparar como números
            const cimientoOcupado = juegoData.cimientosFinca.some(c => parseInt(c.slotId, 10) === cimientoIndex && c.estaOcupado);
            if (cimientoOcupado) {
                return socket.emit('finca:error', 'Esta parcela ya aloja una estructura civil.');
            }

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            const indexEdificio = juegoData.almacenEdificiosDisponibles.findIndex(e => e.uuid === edificioUuid || e.id === edificioUuid);
            
            if (indexEdificio === -1) {
                return socket.emit('finca:error', 'El plano de esta estructura no existe en tu Almacén.');
            }

            const planoEdificio = juegoData.almacenEdificiosDisponibles[indexEdificio];

            juegoData.almacenEdificiosDisponibles.splice(indexEdificio, 1);

            // 🛡️ CORRECCIÓN 3: Saneamiento del objeto con las propiedades reales de tu subdocumento
            const nuevoEdificioConstruido = {
                slotId: cimientoIndex, 
                estaOcupado: true,
                subtipo: planoEdificio.subtipo,
                nombre: planoEdificio.nombre,
                rareza: planoEdificio.rareza,
                nivel: planoEdificio.nivel || 0,
                durabilidadActual: 100,
                produccionGenerada: 0,
                pobladoresAsignados: []
            };

            // 🛡️ CORRECCIÓN 4: Búsqueda unificada en la base de datos usando únicamente slotId numérico
            const idxCimientoExistente = juegoData.cimientosFinca.findIndex(c => parseInt(c.slotId, 10) === cimientoIndex);
            if (idxCimientoExistente !== -1) {
                // Usamos .set() de Mongoose para asegurar una mutación limpia sin conflictos de subdocumentos
                juegoData.cimientosFinca[idxCimientoExistente].set(nuevoEdificioConstruido);
            } else {
                juegoData.cimientosFinca.push(nuevoEdificioConstruido);
            }

            juegoData.markModified('almacenEdificiosDisponibles');
            juegoData.markModified('cimientosFinca');
            await juegoData.save();

            console.log(`✅ Estructura '${planoEdificio.nombre}' instalada en slot ${cimientoIndex} para ${username}.`);

            socket.emit('finca:construccion-exitosa', {
                mensaje: `🏛️ ¡Tu ${planoEdificio.nombre} ha sido erigida con éxito en la Finca!`,
                slotId: cimientoIndex,
                cimientoIndex: cimientoIndex,
                subtipo: planoEdificio.subtipo,
                terreno: juegoData.cimientosFinca
            });

            socket.emit('almacen:actualizar-estado', { 
                recursos: juegoData.almacenEdificiosDisponibles || [] 
            });

            socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca || []);

            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }

        } catch (error) {
            console.error("❌ Error procesando obra civil en el servidor:", error);
            socket.emit('finca:error', 'El Árbitro experimentó un fallo interno al cimentar.');
        }
    });

// ========================================================
// INICIO DEL SERVIDOR HTTP
// ========================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});
        // ==========================================================================
    // 🏗️ INGENIERÍA DE RETIRO DE OBRA CIVIL (3D -> ALMACÉN) - CORREGIDO
    // ==========================================================================
         socket.on('finca:retirar-edificio', async (datos) => {
        if (!datos) return;
        
        const cimientoIndex = parseInt(datos.slotId ?? datos.cimientoIndex ?? datos.slotIndex, 10);
        const username = socket.username;

        if (!username) {
            return socket.emit('finca:error', 'Sesión de juego no válida.');
        }
        
        if (isNaN(cimientoIndex) || cimientoIndex < 0 || cimientoIndex > 4) {
             return socket.emit('finca:error', 'No se ha podido identificar un cimiento válido para retirar.');
        }

        try {
            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData && cachePartidas[username]) {
                juegoData = cachePartidas[username];
            }
            if (!juegoData) {
                return socket.emit('finca:error', 'Datos imperiales no encontrados.');
            }
            cachePartidas[username] = juegoData;

            const cimientoIdx = juegoData.cimientosFinca.findIndex(c => 
                parseInt(c.slotId, 10) === cimientoIndex && c.estaOcupado
            );
            
            if (cimientoIdx === -1) {
                return socket.emit('finca:error', 'No hay ninguna estructura activa en este cimiento.');
            }

            const edificioRetirado = juegoData.cimientosFinca[cimientoIdx];

            if (edificioRetirado.pobladoresAsignados && edificioRetirado.pobladoresAsignados.length > 0) {
                edificioRetirado.pobladoresAsignados.forEach(aldeano => {
                    let slotLibre = 0;
                    while (juegoData.carretonCartas.cartasCentral.some(c => c.slotIndex === slotLibre)) {
                        slotLibre++;
                    }
                    aldeano.slotIndex = slotLibre;
                    juegoData.carretonCartas.cartasCentral.push(aldeano);
                });
            }

            if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];
            
            juegoData.almacenEdificiosDisponibles.push({
                uuid: crypto.randomUUID(),
                subtipo: edificioRetirado.subtipo,
                nombre: edificioRetirado.nombre,
                rareza: edificioRetirado.rareza,
                nivel: edificioRetirado.nivel || 0
            });

            juegoData.cimientosFinca[cimientoIdx].set({
                slotId: cimientoIndex,
                estaOcupado: false,
                edificioUuid: null,
                subtipo: null,
                nombre: null,
                rareza: null,
                nivel: 0,
                durabilidadActual: 100,
                produccionGenerada: 0,
                pobladoresAsignados: []
            });

            juegoData.markModified('carretonCartas');
            juegoData.markModified('cimientosFinca');
            juegoData.markModified('almacenEdificiosDisponibles');
            await juegoData.save();

            socket.emit('finca:retiro-exitoso', { 
                slotIndex: cimientoIndex, 
                slotId: cimientoIndex,
                terreno: juegoData.cimientosFinca 
            });
            
            socket.emit('almacen:actualizar-estado', { 
                recursos: juegoData.almacenEdificiosDisponibles || [] 
            });

            socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca || []);

            if (typeof forzarEnvioEstadoCarreton === 'function') {
                await forzarEnvioEstadoCarreton(socket, username, juegoData);
            }

            console.log(`♻️ Estructura '${edificioRetirado.nombre}' retirada del cimiento ${cimientoIndex} para ${username}.`);
        } catch (error) {
            console.error("❌ Error al procesar retiro de edificio:", error);
            socket.emit('finca:error', 'Fallo interno al desinstalar la estructura.');
        }
    });

    // ==========================================================================
    // 🏗️ INGENIERÍA DE INTERCAMBIO Y MOVIMIENTO DE EDIFICIOS (3D <-> 3D)
    // ==========================================================================
     este es el tercer bloque a modificar?:  socket.on('finca:intercambiar-cimientos', async (datos) => {
        try {
            const username = socket.username;
            if (!username) {
                socket.emit('finca:error', 'Sesión de usuario no autenticada.');
                return;
            }

            const { origenSlotId, destinoSlotId } = datos;
            if (origenSlotId === undefined || destinoSlotId === undefined) {
                socket.emit('finca:error', 'Parámetros de intercambio incompletos.');
                return;
            }

            let juegoData = await GameDataModel.findOne({ username: username });
            if (!juegoData && cachePartidas[username]) {
                juegoData = cachePartidas[username];
            }
            if (!juegoData || !juegoData.cimientosFinca) {
                socket.emit('finca:error', 'No se encontró información de la finca del usuario.');
                return;
            }
            cachePartidas[username] = juegoData;

            const cimientos = juegoData.cimientosFinca;
            
            // 🛠️ CORRECCIÓN: Garantizamos que validará contra slotId, slotIndex o cimientoIndex
            const indexOrigen = cimientos.findIndex(c => 
    parseInt(c.slotId ?? c.slotIndex ?? c.cimientoIndex) === parseInt(origenSlotId)
);
           const indexDestino = cimientos.findIndex(c => 
    parseInt(c.slotId ?? c.slotIndex ?? c.cimientoIndex) === parseInt(destinoSlotId)
);
            if (indexOrigen === -1) {
                socket.emit('finca:error', 'No se encontró un edificio en el cimiento de origen.');
                return;
            }

            const origenData = cimientos[indexOrigen];
            let destinoData = indexDestino !== -1 ? cimientos[indexDestino] : null;

            if (!destinoData) {
                // 🛠️ CORRECCIÓN: Estructura por defecto con todos los IDs poblados para evitar problemas futuros
                destinoData = {
                    slotIndex: parseInt(destinoSlotId),
                    cimientoIndex: parseInt(destinoSlotId),
                    slotId: parseInt(destinoSlotId),
                    estaOcupado: false,
                    subtipo: null,
                    nombre: null,
                    rareza: null,
                    nivel: 0,
                    pobladoresAsignados: []
                };
                cimientos.push(destinoData);
            }

            // Intercambiar los datos de contenido entre origen y destino
            const tempSubtipo = origenData.subtipo;
            const tempNombre = origenData.nombre;
            const tempRareza = origenData.rareza;
            const tempNivel = origenData.nivel;
            const tempOcupado = origenData.estaOcupado;
            const tempPobladores = origenData.pobladoresAsignados;

            origenData.subtipo = destinoData.subtipo;
            origenData.nombre = destinoData.nombre;
            origenData.rareza = destinoData.rareza;
            origenData.nivel = destinoData.nivel;
            origenData.estaOcupado = destinoData.estaOcupado;
            origenData.pobladoresAsignados = destinoData.pobladoresAsignados;

            destinoData.subtipo = tempSubtipo;
            destinoData.nombre = tempNombre;
            destinoData.rareza = tempRareza;
            destinoData.nivel = tempNivel;
            destinoData.estaOcupado = tempOcupado;
            destinoData.pobladoresAsignados = tempPobladores;

            juegoData.markModified('cimientosFinca');
            await juegoData.save();

            socket.emit('finca:intercambio-exitoso', {
                mensaje: 'Intercambio de parcelas realizado con éxito.',
                terreno: juegoData.cimientosFinca
            });

            socket.emit('finca:actualizar-terreno', juegoData.cimientosFinca);

        } catch (error) {
            console.error('Error al procesar el intercambio en el servidor:', error);
            socket.emit('finca:error', 'Error interno al procesar el intercambio de cimientos.');
        }
    });

    // ==========================================================================
    // ==========================================================================
    
    socket.on('carreton:guardar-posicion', async (data = {}) => {
        if (!data) return;
        const { cartaId, bloqueDestino, slotDestinoIndex } = data;
        
        let username = socket.username || data.username;
        if (!username) {
            const llavesCache = Object.keys(cachePartidas);
            if (llavesCache.length > 0) {
                username = llavesCache[llavesCache.length - 1];
            } else {
                const usuarioFallback = await User.findOne({});
                if (usuarioFallback) username = usuarioFallback.username;
            }
        }

        if (!username) {
            return socket.emit('carreton:error', 'Sesión de juego no válida o expirada.');
        }
        socket.username = username;
        
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

            const indexRemover = listaOrigen.findIndex(c => c.id === cartaId || c.uuid === cartaId || (c._id && c._id.toString() === cartaId));
            if (indexRemover !== -1) listaOrigen.splice(indexRemover, 1);

            const targetSlotIndex = parseInt(slotDestinoIndex);
            cartaEncontrada.slotIndex = isNaN(targetSlotIndex) ? 0 : targetSlotIndex;

            if (bloqueDestino === 'aldea') juegoData.carretonCartas.cartasAldea.push(cartaEncontrada);
            else if (bloqueDestino === 'finca') juegoData.carretonCartas.cartasFinca.push(cartaEncontrada);
            else juegoData.carretonCartas.cartasCentral.push(cartaEncontrada);

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

    socket.on('carreton:solicitar-datos', async (data = {}) => {
        let username = socket.username || data.username;
        if (!username) {
            const llavesCache = Object.keys(cachePartidas);
            if (llavesCache.length > 0) {
                username = llavesCache[llavesCache.length - 1];
            } else {
                const usuarioFallback = await User.findOne({});
                if (usuarioFallback) username = usuarioFallback.username;
            }
        }
        if (!username) return;
        socket.username = username;

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
});

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
// ==========================================================================
// ⏳ MOTOR MAESTRO DE PRODUCCIÓN DE RECURSOS POR TICKS
// ==========================================================================
const INTERVALO_PRODUCCION_MS = 10000;

setInterval(async () => {
    const usuariosActivos = Object.keys(cachePartidas);
    if (usuariosActivos.length === 0) return;

    console.log(`⏳ [Árbitro] Procesando tick de producción para ${usuariosActivos.length} imperios activos...`);

    for (const username of usuariosActivos) {
        try {
            let juegoData = cachePartidas[username];
            if (!juegoData || !juegoData.cimientosFinca) continue;

            let huboCambios = false;
            let maderaProducida = 0;
            let oroProducido = 0;

            juegoData.cimientosFinca.forEach(cimiento => {
                if (cimiento.estaOcupado) {
                    const nivelEdificio = cimiento.nivel || 0;
                    
                    if (cimiento.subtipo === 'aserradero') {
                        maderaProducida += 2 + nivelEdificio;
                        huboCambios = true;
                    } 
                    else if (cimiento.subtipo === 'granja') {
                        oroProducido += 1 + nivelEdificio;
                        huboCambios = true;
                    }
                }
            });

            if (huboCambios) {
                if (!juegoData.almacenEdificiosDisponibles) juegoData.almacenEdificiosDisponibles = [];

                actualizarStackRecurso(juegoData.almacenEdificiosDisponibles, 'madera', '🪵 Madera Imperial', maderaProducida);
                actualizarStackRecurso(juegoData.almacenEdificiosDisponibles, 'oro', '🪙 Oro Acuñado', oroProducido);

                juegoData.markModified('almacenEdificiosDisponibles');
                await juegoData.save();

                const socketsEnPantalla = await io.fetchSockets();
                const socketJugador = socketsEnPantalla.find(s => s.username === username);
                
                if (socketJugador) {
                    socketJugador.emit('almacen:actualizar-estado', {
                        recursos: juegoData.almacenEdificiosDisponibles || []
                    });
                }
            }
        } catch (error) {
            console.error(`❌ Error en el tick de producción para el usuario ${username}:`, error);
        }
    }
}, INTERVALO_PRODUCCION_MS);

function actualizarStackRecurso(almacen, subtipo, nombre, cantidadASumar) {
    if (cantidadASumar <= 0) return;

    const itemExistente = almacen.find(i => i.subtipo === subtipo);

    if (itemExistente) {
        const cantidadActual = Number(itemExistente.nivel) || 0;
        itemExistente.nivel = cantidadActual + cantidadASumar;
    } else {
        almacen.push({
            id: crypto.randomUUID(),
            uuid: crypto.randomUUID(),
            subtipo: subtipo,
            nombre: nombre,
            rareza: 'comun',
            nivel: cantidadASumar
        });
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

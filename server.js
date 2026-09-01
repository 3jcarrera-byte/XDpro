// server.js
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
let stockTiendaSistema = { edificios: [], personajes: [], equipamiento: [] };

// CORRECCIÓN: Alineación de claves y rarezas en minúsculas para coincidir exactamente con mercado.js
const CATALOGO_DISEÑOS = {
    edificios: [
        { subtipo: 'granja', nombre: '🌾 Granja Imperial', rareza: 'comun', precioBase: 50 },
        { subtipo: 'aserradero', nombre: '🪓 Aserradero Alfa', rareza: 'comun', precioBase: 60 }
    ],
    // Cambiado de 'personajes' a 'aldeanos' para sincronizarse con los filtros de mercado.js
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
        tipo: rubro, // Mapea directamente el rubro de origen ('edificios', 'aldeanos', 'equipamiento')
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
        const usuarioExistente = await User.findOne({ username: usernameLimpio });
        if (usuarioExistente) {
            return res.status(400).json({ success: false, message: 'El Nick ya está ocupado por otro gladiador.' });
        }
        
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
        return res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (error) {
        console.error('❌ Error al registrar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

// 2. Endpoint de Login (Añadido para conectar con main.js)
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos.' });
        }

        const usuario = await User.findOne({ username: username.trim() });
        if (!usuario) {
            return res.status(400).json({ success: false, message: 'El gladiador no existe en los registros.' });
        }

        if (usuario.status !== 'active') {
            return res.status(403).json({ success: false, message: `Cuenta suspendida. Razón: ${usuario.banReason || 'No especificada'}` });
        }

        const contraseñaValida = await usuario.comparePassword(password);
        if (!contraseñaValida) {
            return res.status(400).json({ success: false, message: 'Contraseña incorrecta imperial.' });
        }

        return res.status(200).json({
            success: true,
            username: usuario.username,
            balance: usuario.balance
        });
    } catch (error) {
        console.error('❌ Error al iniciar sesión:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno en la autenticación.' });
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

        // 🗄️ PERSISTENCIA AUTOMÁTICA EN MONGODB E INICIALIZACIÓN DE LA CACHÉ VIVA
        if (!cachePartidas[usuario.username]) {
            let juegoData = await GameDataModel.findOne({ username: usuario.username });
            
            if (!juegoData) {
                juegoData = new GameDataModel({ username: usuario.username });
                juegoData.inicializarEspaciosVacios();
                await juegoData.save();
            }
            
            // CORRECCIÓN: Guardamos el documento activo de Mongoose en la caché en lugar del objeto plano (.toObject()).
            // Esto permite que el backend conserve los métodos internos de actualización del Carretón y guardado atómico.
            cachePartidas[usuario.username] = juegoData;
            
            // Inyectamos de forma temporal la metadata del NFT para agilizar los sockets comerciales
            cachePartidas[usuario.username]._poseeAldeaNFT = usuario.poseeAldea || false;
        } else {
            // Si ya existía la caché, nos aseguramos de refrescar el estado del NFT por si cambió en la base de datos
            cachePartidas[usuario.username]._poseeAldeaNFT = usuario.poseeAldea || false;
        }

        // Respuesta exitosa al cliente SPA con datos de balance actualizados
        return res.status(200).json({ 
            success: true, 
            userId: usuario._id,
            username: usuario.username,
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
        
        socket.username = data.username.trim();
        console.log(`🏛️ Gladiador verificado en red de sockets: ${socket.username}`);
        
        // CORRECCIÓN: Si el servidor se reinició o el usuario salta el login pero existe en BD,
        // restauramos la instancia completa de Mongoose en la caché en lugar de crear un POJO roto.
        if (!cachePartidas[socket.username]) {
            try {
                let juegoData = await GameDataModel.findOne({ username: socket.username });
                const usuarioBD = await User.findOne({ username: socket.username });
                
                if (!juegoData) {
                    juegoData = new GameDataModel({ username: socket.username });
                    juegoData.inicializarEspaciosVacios();
                    await juegoData.save();
                }
                cachePartidas[socket.username] = juegoData;
                cachePartidas[socket.username]._poseeAldeaNFT = usuarioBD ? usuarioBD.poseeAldea : false;
            } catch (err) {
                console.error("❌ Fallo crítico al reconstruir caché en socket:", err);
            }
        }
    });

    // Envío del escaparate público sincronizado
    socket.on('tienda:solicitar-stock', () => {
        socket.emit('tienda:recibir-stock', stockTiendaSistema);
    });

    // Transacción Económica Atómica P2P
    socket.on('tienda:comprar-carta', async (datos) => {
        if (!datos) return;
        const { itemId, rubro } = datos;
        const username = socket.username;

        if (!username || !cachePartidas[username]) {
            return socket.emit('tienda:error', 'Sesión de juego no válida o expirada. Por favor, reinicia.');
        }
        if (!stockTiendaSistema[rubro]) {
            return socket.emit('tienda:error', 'Categoría comercial no válida.');
        }

        const indexItem = stockTiendaSistema[rubro].findIndex(item => item.tiendaItemId === itemId);
        if (indexItem === -1) {
            return socket.emit('tienda:error', 'La carta ya fue adquirida por otro jugador.');
        }

        const cartaTienda = stockTiendaSistema[rubro][indexItem];

        try {
            // Verificar fondos reales en MongoDB
            const usuario = await User.findOne({ username: username });
            if (!usuario || usuario.balance < cartaTienda.precio) {
                return socket.emit('tienda:error', 'Monedas imperiales insuficientes en tus arcas.');
            }

            // Descontar saldo de forma autoritaria
            usuario.balance -= cartaTienda.precio;
            await usuario.save();

            // Extraer la instancia viva de Mongoose desde la caché del Árbitro
            const juegoData = cachePartidas[username];
            
            // Registrar físicamente la carta en el inventario del backend
            // Inyectamos el UUID mapeando el formato estricto del modelo
            const cartaRegistrada = juegoData.registrarNuevaCarta({
                id: crypto.randomUUID(), 
                tipo: cartaTienda.tipo,
                subtipo: cartaTienda.subtipo,
                rareza: cartaTienda.rareza,
                nivel: 1
            });
            
            // Forzar guardado atómico en MongoDB
            await juegoData.save();

            // Repoblación Automática Inmediata (Mantiene siempre 3 cartas por tipo)
            stockTiendaSistema[rubro].splice(indexItem, 1);
            
            // CORRECCIÓN: Mapeo limpio usando el rubro estandarizado para evitar caídas en 'aldeanos'
            const catalogoRubro = rubro === 'aldeanos' ? 'aldeanos' : rubro;
            const diseñoOriginal = CATALOGO_DISEÑOS[catalogoRubro].find(d => d.subtipo === cartaTienda.subtipo);
            
            if (diseñoOriginal) {
                stockTiendaSistema[rubro].push(crearCartaParaTienda(diseñoOriginal, rubro));
            }

            // Notificar éxito al comprador
            socket.emit('tienda:compra-exitosa', {
                nuevoBalance: usuario.balance,
                carta: cartaRegistrada
            });

            // Sincronizar la vitrina de forma global a todos los usuarios conectados
            io.emit('tienda:recibir-stock', stockTiendaSistema);

        } catch (error) {
            console.error('❌ Error en transacción de mercado:', error);
            socket.emit('tienda:error', 'Error interno al procesar la compra.');
        }
    });

    // Guardado Persistente del Movimiento Drag & Drop del Carretón
    socket.on('carreton:guardar-posicion', async (data) => {
        if (!data) return;
        const { cartaId, bloqueDestino, slotDestinoIndex } = data;
        const username = socket.username;

        if (!username || !cachePartidas[username]) return;
        const juegoData = cachePartidas[username];

        let listaOrigen = null;
        let cartaEncontrada = null;
        
        // Rastrear la ubicación actual de la carta en las 3 zonas
        const bloques = ['cartasAldea', 'cartasFinca', 'cartasCentral'];
        for (const bloque of bloques) {
            const idx = juegoData.carretonCartas[bloque].findIndex(c => c.id === cartaId);
            if (idx !== -1) {
                cartaEncontrada = juegoData.carretonCartas[bloque][idx];
                listaOrigen = juegoData.carretonCartas[bloque];
                listaOrigen.splice(idx, 1); // Remover de su posición antigua
                break;
            }
        }

        if (!cartaEncontrada) {
            return socket.emit('carreton:error', 'La carta especificada no existe en tu carretón.');
        }
        
        // Re-asignar coordenadas de slot destino
        cartaEncontrada.slotIndex = slotDestinoIndex;

        // Inyectar en el array correspondiente del backend
        if (bloqueDestino === 'aldea') juegoData.carretonCartas.cartasAldea.push(cartaEncontrada);
        if (bloqueDestino === 'finca') juegoData.carretonCartas.cartasFinca.push(cartaEncontrada);
        if (bloqueDestino === 'central') juegoData.carretonCartas.cartasCentral.push(cartaEncontrada);

        try {
            // CORRECCIÓN ESENCIAL: Forzar a Mongoose a impactar la base de datos de MongoDB de forma persistente.
            // Marcamos el subdocumento mixto como modificado para asegurar la escritura.
            juegoData.markModified('carretonCartas');
            await juegoData.save();
            console.log(`💾 Posición guardada de forma persistente en MongoDB para ${username}.`);
        } catch (err) {
            console.error("❌ Error al salvar coordenadas del carretón:", err);
            return socket.emit('carreton:error', 'Fallo al sincronizar coordenadas en base de datos.');
        }

        // Devolver respuesta reactiva al frontend
        const poseeNFT = cachePartidas[username]._poseeAldeaNFT || false;
        socket.emit('carreton:actualizar-estado', {
            poseeAldea: poseeNFT,
            slotsCentralMax: poseeNFT ? 24 : 8,
            cartasAldea: juegoData.carretonCartas.cartasAldea,
            cartasFinca: juegoData.carretonCartas.cartasFinca,
            cartasCentral: juegoData.carretonCartas.cartasCentral
        });
    });

    // Despacho Sincronizado de datos del Carretón
    socket.on('carreton:solicitar-datos', async () => {
        const username = socket.username;
        if (!username || !cachePartidas[username]) return;

        try {
            const usuarioBD = await User.findOne({ username: username });
            const juegoData = cachePartidas[username];
            if (!usuarioBD) return socket.emit('carreton:error', 'Usuario no encontrado.');

            // Sincronizar estado del NFT desde el documento de usuario
            cachePartidas[username]._poseeAldeaNFT = usuarioBD.poseeAldea || false;
            const slotsHabilitadosCentral = usuarioBD.poseeAldea ? 24 : 8;

            socket.emit('carreton:actualizar-estado', {
                poseeAldea: usuarioBD.poseeAldea,
                slotsCentralMax: slotsHabilitadosCentral,
                cartasAldea: juegoData.carretonCartas.cartasAldea,
                cartasFinca: juegoData.carretonCartas.cartasFinca,
                cartasCentral: juegoData.carretonCartas.cartasCentral
            });
        } catch (error) {
            console.error("❌ Error al consultar la base de datos para el Carretón:", error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Jugador desconectado: ${socket.id}`);
    });
});

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

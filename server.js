import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Configuración de CORS y Socket.io para Render y entornos de producción
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cache en memoria para partidas activas
const cachePartidas = {};

// ==========================================================================
// 🍃 ESQUEMAS DE MONGOOSE (MongoDB)
// ==========================================================================
const JuegoDataSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    almacenEdificiosDisponibles: { type: Array, default: [] },
    cimientosFinca: { type: Array, default: [] },
    carretonCartas: {
        cartasCentral: { type: Array, default: [] }
    }
}, { timestamps: true });

const UsuarioSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    monedas: { type: Number, default: 100 }
});

const JuegoData = mongoose.model('JuegoData', JuegoDataSchema);
const Usuario = mongoose.model('Usuario', UsuarioSchema);

// ==========================================================================
// 🛠️ FUNCIONES DE APOYO Y LOGÍSTICA
// ==========================================================================
async function obtenerOGenerarJuegoData(username) {
    let juego = await JuegoData.findOne({ username });
    if (!juego) {
        juego = await JuegoData.create({
            username,
            almacenEdificiosDisponibles: [
                { uuid: 'casona-1', subtipo: 'casona', nombre: 'Casona Imperial', tipo: 'edificio' }
            ],
            cimientosFinca: Array.from({ length: 8 }, (_, i) => ({ slotIndex: i, estaOcupado: false })),
            carretonCartas: { cartasCentral: [] }
        });
    }
    return juego;
}

// 🚚 REPARACIÓN LOGÍSTICA: DISTRIBUCIÓN DE POBLADORES IMPERIALES
async function forzarEnvioEstadoCarreton(socket, username, juegoData) {
    if (!juegoData) juegoData = await obtenerOGenerarJuegoData(username);

    const poseeNFT = Boolean(cachePartidas[username]?._poseeAldeaNFT);
    const maxSlotsCentral = poseeNFT ? 24 : 8;

    // Contar de manera dinámica cuántas Casonas imperiales activas tiene construidas el jugador
    const casonasFinca = (juegoData.cimientosFinca || []).filter(s => s.estaOcupado && s.subtipo === 'casona').length;
    const slotsFincaHabilitados = Math.min(8, Math.max(2, casonasFinca * 2)); // Abre 2 slots por Casona

    const cartasCentral = juegoData.carretonCartas?.cartasCentral || [];

    // Filtrar los pobladores según la propiedad de asignación para alimentar el espejo lateral 3D
    const cartasFinca = cartasCentral.filter(c => c.bloque === 'finca' || c.ubicacion === 'finca');
    const cartasAldea = cartasCentral.filter(c => c.bloque === 'aldea' || c.ubicacion === 'aldea');

    socket.emit('carreton:actualizar-estado', {
        cartasCentral: cartasCentral.filter(c => !c.bloque || c.bloque === 'central'),
        cartasFinca: cartasFinca,
        cartasAldea: cartasAldea,
        maxSlotsCentral: maxSlotsCentral,
        slotsCentralMax: maxSlotsCentral,
        slotsFincaMax: 8,
        slotsAldeaMax: 16,
        slotsFincaHabilitados: slotsFincaHabilitados,
        slotsAldeaHabilitados: poseeNFT ? 16 : 0,
        poseeAldeaNFT: poseeNFT
    });

    await enviarEstadoFincaActualizado(socket, username, juegoData);
}

async function enviarEstadoFincaActualizado(socket, username, juegoData) {
    if (!juegoData) juegoData = await obtenerOGenerarJuegoData(username);
    socket.emit('finca:actualizar-estado', { cimientos: juegoData.cimientosFinca });
}

// ==========================================================================
// 🔌 MANEJO DE CONEXIONES SOCKET.IO
// ==========================================================================
io.on('connection', (socket) => {
    let currentUsername = null;

    // 1. AUTENTICACIÓN Y SINCRONIZACIÓN INICIAL
    socket.on('autenticar-jugador', async (data) => {
        try {
            currentUsername = data?.username || 'jugador_demo';
            const juegoData = await obtenerOGenerarJuegoData(currentUsername);

            // Emisión dual para garantizar la actualización del Almacén en almacen.js
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });

            // Sincronización del Carretón y Finca
            await forzarEnvioEstadoCarreton(socket, currentUsername, juegoData);
        } catch (err) {
            console.error('Error en autenticar-jugador:', err);
        }
    });

    // 2. COMPRA DE CARTAS / EDIFICIOS
    socket.on('almacen:comprar-carta', async (data) => {
        if (!currentUsername) return;

        const session = await mongoose.startSession();
        try {
            session.startTransaction();

            const juegoData = await JuegoData.findOne({ username: currentUsername }).session(session);
            const usuario = await Usuario.findOne({ username: currentUsername }).session(session);

            const precio = data.precio || 50;
            if (usuario && usuario.monedas < precio) {
                await session.abortTransaction();
                return socket.emit('almacen:compra-error', { mensaje: 'Monedas insuficientes' });
            }

            if (usuario) usuario.monedas -= precio;

            const nuevaCarta = {
                uuid: `edificio-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                subtipo: data.subtipo || 'casona',
                nombre: data.nombre || 'Casona Imperial',
                tipo: 'edificio'
            };

            juegoData.almacenEdificiosDisponibles.push(nuevaCarta);

            if (usuario) await usuario.save({ session });
            await juegoData.save({ session });

            await session.commitTransaction();

            // Refresco atómico dual del Almacén
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });

        } catch (error) {
            await session.abortTransaction();
            console.error('Error procesando transacción de compra:', error);
            socket.emit('almacen:compra-error', { mensaje: 'Error interno en la transacción' });
        } finally {
            session.endSession();
        }
    });

    // 3. CONSTRUCCIÓN EN LA FINCA
    socket.on('finca:construir-edificio', async (data) => {
        if (!currentUsername) return;

        try {
            const uuidCarta = data.cartaUuid || data.uuidEdificio;
            const slotIndex = data.slotIndex;

            const juegoData = await JuegoData.findOne({ username: currentUsername });
            if (!juegoData) return;

            const indexCarta = juegoData.almacenEdificiosDisponibles.findIndex(c => c.uuid === uuidCarta);
            if (indexCarta === -1) return;

            const [cartaConstruida] = juegoData.almacenEdificiosDisponibles.splice(indexCarta, 1);

            const slot = juegoData.cimientosFinca.find(s => s.slotIndex === slotIndex);
            if (slot) {
                slot.estaOcupado = true;
                slot.subtipo = cartaConstruida.subtipo;
                slot.uuidEdificio = cartaConstruida.uuid;
            }

            await juegoData.save();

            // Refrescar almacén y estado del carretón/finca
            socket.emit('almacen:actualizar-estado', { recursos: juegoData.almacenEdificiosDisponibles });
            socket.emit('almacen:actualizar-cartas', { almacenEdificiosDisponibles: juegoData.almacenEdificiosDisponibles });
            await forzarEnvioEstadoCarreton(socket, currentUsername, juegoData);

        } catch (err) {
            console.error('Error al construir edificio:', err);
        }
    });

    // 4. MOVER / ASIGNAR POBLADORES EN EL CARRETÓN
    socket.on('carreton:mover-carta', async (data) => {
        if (!currentUsername) return;

        try {
            const uuidCarta = data.cartaUuid || data.uuidCarta;
            const destino = data.destino || data.haciaSlot; // Soporte de alias para compatibilidad

            const juegoData = await JuegoData.findOne({ username: currentUsername });
            if (!juegoData) return;

            const carta = (juegoData.carretonCartas?.cartasCentral || []).find(c => c.uuid === uuidCarta);
            if (carta) {
                carta.bloque = destino;
                carta.ubicacion = destino;
                await juegoData.save();
            }

            await forzarEnvioEstadoCarreton(socket, currentUsername, juegoData);

        } catch (err) {
            console.error('Error al mover carta en el carretón:', err);
        }
    });

    socket.on('disconnect', () => {
        if (currentUsername) {
            delete cachePartidas[currentUsername];
        }
    });
});

// ==========================================================================
// 🚀 CONEXIÓN A BASE DE DATOS Y CONEXIÓN EN BIND 0.0.0.0
// ==========================================================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xdpro';
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('🍃 Conectado exitosamente a MongoDB');
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Servidor ejecutándose en el puerto ${PORT} (0.0.0.0)`);
        });
    })
    .catch((err) => {
        console.error('❌ Error al conectar a MongoDB:', err);
    });

// ==========================================================================
// 🚀 SERVIDOR DE JUEGO MULTIJUGADOR (Express + Socket.io + Mongoose)
// ==========================================================================

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Middleware Express
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --------------------------------------------------------------------------
// 🍃 CONFIGURACIÓN Y CONEXIÓN MONGOOSE
// --------------------------------------------------------------------------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/juego3d_db';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Conexión a MongoDB exitosa.'))
    .catch((err) => console.error('❌ Error de conexión a MongoDB:', err));

// ==========================================================================
// 📦 ESQUEMA DE JUEGO CORREGIDO (CON SOPORTE DE ALDEA NFT Y MAPAS)
// ==========================================================================
const JuegoDataSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    almacenEdificiosDisponibles: { type: Array, default: [] },
    cimientosFinca: { type: Array, default: [] },
    cimientosAldea: { type: Array, default: [] }, // 🔥 Soporte para parcelas de Aldea NFT
    carretonCartas: {
        cartasCentral: { type: Array, default: [] },
        cartasFinca: { type: Array, default: [] },  // 🔥 Consistencia de red
        cartasAldea: { type: Array, default: [] }   // 🔥 Consistencia de red
    }
}, { 
    timestamps: true, 
    strict: false // 🔥 Permite guardar subdocumentos dinámicos y propiedades complejas sin que Mongoose las elimine
});

const JuegoData = mongoose.model('JuegoData', JuegoDataSchema);

// --------------------------------------------------------------------------
// 🛠️ FUNCIONES DE INICIALIZACIÓN POR DEFECTO
// --------------------------------------------------------------------------
function generarCimientosVacios(cantidad, prefijoId) {
    const cimientos = [];
    for (let i = 0; i < cantidad; i++) {
        cimientos.push({
            idParcela: `${prefijoId}_${i}`,
            index: i,
            ocupado: false,
            edificio: null,
            nivel: 0,
            pobladores: []
        });
    }
    return cimientos;
}

async function obtenerOCrearDatosUsuario(username) {
    let userGameData = await JuegoData.findOne({ username });

    if (!userGameData) {
        console.log(`✨ Creando datos iniciales para el usuario: ${username}`);
        userGameData = new JuegoData({
            username: username,
            almacenEdificiosDisponibles: [],
            cimientosFinca: generarCimientosVacios(12, 'finca'),
            cimientosAldea: generarCimientosVacios(12, 'aldea'), // 🔥 Inicialización de las 12 parcelas de la Aldea NFT
            carretonCartas: {
                cartasCentral: [],
                cartasFinca: [],
                cartasAldea: []
            }
        });

        await userGameData.save();
    } else {
        // Validación preventiva en caso de usuarios antiguos sin cimientosAldea
        let modificado = false;
        if (!userGameData.cimientosAldea || userGameData.cimientosAldea.length === 0) {
            userGameData.cimientosAldea = generarCimientosVacios(12, 'aldea');
            modificado = true;
        }
        if (!userGameData.cimientosFinca || userGameData.cimientosFinca.length === 0) {
            userGameData.cimientosFinca = generarCimientosVacios(12, 'finca');
            modificado = true;
        }
        
        if (modificado) {
            userGameData.markModified('cimientosAldea');
            userGameData.markModified('cimientosFinca');
            await userGameData.save();
        }
    }

    return userGameData;
}

// ==========================================================================
// 🔌 MANEJO DE EVENTOS EN TIEMPO REAL CON SOCKET.IO
// ==========================================================================
io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado: ${socket.id}`);

    // Cargar o iniciar partida
    socket.on('iniciar-juego', async (data) => {
        try {
            const username = data?.username || 'jugador_invitado';
            socket.username = username;
            
            const datosUsuario = await obtenerOCrearDatosUsuario(username);
            socket.emit('cargar-estado-inicial', datosUsuario);
        } catch (error) {
            console.error('❌ Error al iniciar juego:', error);
            socket.emit('error-servidor', { mensaje: 'No se pudo cargar el estado del juego.' });
        }
    });

    // Guardar actualización de estado
    socket.on('guardar-estado', async (nuevoEstado) => {
        try {
            if (!socket.username) return;

            const datosActualizados = await JuegoData.findOneAndUpdate(
                { username: socket.username },
                { $set: nuevoEstado },
                { new: true, runValidators: true, strict: false }
            );

            socket.emit('estado-guardado-exito', datosActualizados);
        } catch (error) {
            console.error('❌ Error al guardar estado:', error);
            socket.emit('error-servidor', { mensaje: 'Error al persistir cambios en MongoDB.' });
        }
    });

    // Evento específico: Mudanza o inyección de Pobladores en Cartas/Parcelas
    socket.on('actualizar-pobladores', async (payload) => {
        try {
            const { mapaTarget, cartas, cimientos } = payload; // mapaTarget: 'finca' | 'aldea' | 'central'
            const userGameData = await JuegoData.findOne({ username: socket.username });

            if (!userGameData) return;

            if (cartas) {
                userGameData.carretonCartas[mapaTarget === 'aldea' ? 'cartasAldea' : 'cartasCentral'] = cartas;
                // Instruct Mongoose on deep nested updates within elastic Schema arrays
                userGameData.markModified('carretonCartas');
            }

            if (cimientos) {
                if (mapaTarget === 'aldea') {
                    userGameData.cimientosAldea = cimientos;
                    userGameData.markModified('cimientosAldea');
                } else {
                    userGameData.cimientosFinca = cimientos;
                    userGameData.markModified('cimientosFinca');
                }
            }

            await userGameData.save();
            io.to(socket.id).emit('pobladores-actualizados-exito', userGameData);
        } catch (error) {
            console.error('❌ Error actualizando pobladores:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔴 Cliente desconectado: ${socket.id}`);
    });
});

// --------------------------------------------------------------------------
// 🚀 INICIO DEL SERVIDOR
// --------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo correctamente en http://localhost:${PORT}`);
});

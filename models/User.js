// ==========================================================================
// routes/auth.js - Controlador de Autenticación y Registro Defensivo
// ==========================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Importaciones de archivos de modelos (pueden ser objetos o clases)
const rawUser = require('../models/User');
const rawGameData = require('../models/GameData');

/**
 * 🛡️ RESOLUTORES DEFENSIVOS DE MODELOS
 * Garantizan extraer una instancia válida de Mongoose sin lanzar TypeError o MissingSchemaError.
 */
function obtenerModeloUsuario() {
    if (rawUser && typeof rawUser.findOne === 'function') return rawUser;
    if (rawUser && rawUser.User && typeof rawUser.User.findOne === 'function') return rawUser.User;
    if (mongoose.models && mongoose.models.User) return mongoose.models.User;
    return mongoose.model('User');
}

function obtenerModeloGameData() {
    if (rawGameData && typeof rawGameData.findOne === 'function') return rawGameData;
    if (rawGameData && rawGameData.GameData && typeof rawGameData.GameData.findOne === 'function') return rawGameData.GameData;
    if (rawGameData && rawGameData.GameDataModel && typeof rawGameData.GameDataModel.findOne === 'function') return rawGameData.GameDataModel;
    if (mongoose.models && mongoose.models.GameData) return mongoose.models.GameData;
    return mongoose.model('GameData');
}

/**
 * Auxiliar para escapar caracteres especiales en expresiones regulares
 */
function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

// ==========================================================================
// 📝 1. RUTA DE REGISTRO DE GLADIADORES
// ==========================================================================
router.post('/register', async (req, res) => {
    try {
        const { username, password, email, pais, nombre, apellido, wallet } = req.body;

        // Validar campos mínimos obligatorios
        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ 
                success: false, 
                message: 'El nombre de usuario y la contraseña son obligatorios y deben ser válidos.' 
            });
        }

        const usernameLimpio = username.trim();
        if (usernameLimpio.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'El nombre de usuario debe tener al menos 3 caracteres.'
            });
        }

        const User = obtenerModeloUsuario();
        const GameData = obtenerModeloGameData();

        // Búsqueda insensible a mayúsculas/minúsculas
        const usuarioExistente = await User.findOne({ 
            username: new RegExp(`^${escapeRegex(usernameLimpio)}$`, 'i') 
        });

        if (usuarioExistente) {
            return res.status(409).json({ 
                success: false, 
                message: 'El nombre de gladiador ya se encuentra registrado en el Imperio.' 
            });
        }

        // Determinar si el modelo hashes de forma automática o si debemos hashear explícitamente
        let passwordFinal = password;
        const dummyUser = new User({});
        // Si no tiene hook 'pre' o método para hashear y la contraseña no parece bcrypt, la encriptamos defensivamente
        if (typeof dummyUser.comparePassword !== 'function' && !password.startsWith('$2')) {
            const salt = await bcrypt.genSalt(10);
            passwordFinal = await bcrypt.hash(password, salt);
        }

        // Crear instancia del usuario
        const nuevoUsuario = new User({
            username: usernameLimpio,
            password: passwordFinal,
            email: email && typeof email === 'string' ? email.trim().toLowerCase() : null,
            pais: pais && typeof pais === 'string' ? pais.trim() : null,
            nombre: nombre && typeof nombre === 'string' ? nombre.trim() : null,
            apellido: apellido && typeof apellido === 'string' ? apellido.trim() : null,
            wallet: wallet && typeof wallet === 'string' ? wallet.trim() : null,
            balance: 100.00
        });

        await nuevoUsuario.save();

        // Inicializar documento GameData de forma defensiva
        try {
            let nuevoGameData = new GameData({
                username: nuevoUsuario.username,
                almacenEdificiosDisponibles: [],
                carretonCartas: { cartasCentral: [] }
            });

            if (typeof nuevoGameData.inicializarEspaciosVacios === 'function') {
                nuevoGameData.inicializarEspaciosVacios();
            }
            await nuevoGameData.save();
        } catch (gameDataError) {
            console.error('⚠️ Error al crear GameData en el registro:', gameDataError);
            // Si la inicialización de GameData falla, revertimos la creación del usuario si es posible
            await User.deleteOne({ _id: nuevoUsuario._id });
            throw new Error('Fallo en la inicialización de los datos del juego del gladiador.');
        }

        return res.status(201).json({
            success: true,
            message: 'Gladiador registrado y parcelas del Imperio inicializadas correctamente.',
            username: nuevoUsuario.username
        });

    } catch (error) {
        console.error('❌ Error crítico en ruta /register:', error);

        // Control del error de clave duplicada de MongoDB (Index constraint)
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'El nombre de gladiador o correo electrónico ya está registrado.'
            });
        }

        return res.status(500).json({ 
            success: false, 
            message: 'Error interno del servidor al procesar el registro imperial.' 
        });
    }
});

// ==========================================================================
// 🔑 2. RUTA DE INICIO DE SESIÓN (LOGIN ROBUSTO)
// ==========================================================================
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ 
                success: false, 
                message: 'Debe proveer un usuario y contraseña válidos.' 
            });
        }

        const usernameLimpio = username.trim();
        const User = obtenerModeloUsuario();
        const GameData = obtenerModeloGameData();

        // Buscar al usuario de manera insensible a mayúsculas/minúsculas
        const usuario = await User.findOne({ 
            username: new RegExp(`^${escapeRegex(usernameLimpio)}$`, 'i') 
        });

        if (!usuario) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas o gladiador no encontrado.' 
            });
        }

        // Validar si el usuario está baneado
        if (usuario.status && usuario.status !== 'active') {
            return res.status(403).json({ 
                success: false, 
                message: `Acceso restringido. Motivo: ${usuario.banReason || 'Sanción administrativa en curso.'}` 
            });
        }

        // 🛡️ Validación Jerárquica de Contraseña
        let esPasswordValida = false;

        if (typeof usuario.comparePassword === 'function') {
            esPasswordValida = await usuario.comparePassword(password);
        } else if (usuario.password && typeof usuario.password === 'string' && usuario.password.startsWith('$2')) {
            esPasswordValida = await bcrypt.compare(password, usuario.password);
        } else {
            esPasswordValida = (usuario.password === password);
        }

        if (!esPasswordValida) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas.' 
            });
        }

        // Auto-reparación o comprobación de GameData
        let gameData = await GameData.findOne({ username: usuario.username });
        if (!gameData) {
            gameData = new GameData({ 
                username: usuario.username,
                almacenEdificiosDisponibles: [],
                carretonCartas: { cartasCentral: [] }
            });
            if (typeof gameData.inicializarEspaciosVacios === 'function') {
                gameData.inicializarEspaciosVacios();
            }
            await gameData.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Sesión iniciada con éxito.',
            username: usuario.username,
            balance: usuario.balance,
            poseeAldea: usuario.poseeAldea || false
        });

    } catch (error) {
        console.error('❌ Error crítico en ruta /login:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error interno al intentar autenticar al gladiador.' 
        });
    }
});

module.exports = router;

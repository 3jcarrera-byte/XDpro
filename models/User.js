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

// ==========================================================================
// 📝 1. RUTA DE REGISTRO DE GLADIADORES
// ==========================================================================
router.post('/register', async (req, res) => {
    try {
        const { username, password, email, pais, nombre, apellido, wallet } = req.body;

        // Validar campos mínimos obligatorios
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'El nombre de usuario y la contraseña son obligatorios.' 
            });
        }

        const User = obtenerModeloUsuario();
        const GameData = obtenerModeloGameData();

        // Verificar si el usuario ya existe
        const usuarioExistente = await User.findOne({ username: username.trim() });
        if (usuarioExistente) {
            return res.status(409).json({ 
                success: false, 
                message: 'El nombre de gladiador ya se encuentra registrado en el Imperio.' 
            });
        }

        // Crear y guardar el nuevo usuario
        const nuevoUsuario = new User({
            username: username.trim(),
            password,
            email: email ? email.trim().toLowerCase() : null,
            pais: pais ? pais.trim() : null,
            nombre: nombre ? nombre.trim() : null,
            apellido: apellido ? apellido.trim() : null,
            wallet: wallet ? wallet.trim() : null,
            balance: 100.00
        });

        await nuevoUsuario.save();

        // Inicializar documento GameData de forma defensiva
        let nuevoGameData = new GameData({
            username: nuevoUsuario.username,
            almacenEdificiosDisponibles: [],
            carretonCartas: { cartasCentral: [] }
        });

        if (typeof nuevoGameData.inicializarEspaciosVacios === 'function') {
            nuevoGameData.inicializarEspaciosVacios();
        }
        await nuevoGameData.save();

        return res.status(201).json({
            success: true,
            message: 'Gladiador registrado y parcelas del Imperio inicializadas correctamente.',
            username: nuevoUsuario.username
        });

    } catch (error) {
        console.error('❌ Error crítico en ruta /register:', error);
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

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Debe proveer usuario y contraseña.' 
            });
        }

        const User = obtenerModeloUsuario();
        const GameData = obtenerModeloGameData();

        const usuario = await User.findOne({ username: username.trim() });
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

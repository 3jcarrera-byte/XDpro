// routes/auth.js (Controlador de Autenticación y Registro Sincronizado con GameData)

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const GameData = require('../models/GameData');

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

        // Verificar si el usuario ya existe en la base de datos
        const usuarioExistente = await User.findOne({ username: username.trim() });
        if (usuarioExistente) {
            return res.status(409).json({ 
                success: false, 
                message: 'El nombre de gladiador ya se encuentra registrado en el Imperio.' 
            });
        }

        // Crear y guardar el nuevo usuario en la colección User
        const nuevoUsuario = new User({
            username: username.trim(),
            password,
            email: email ? email.trim().toLowerCase() : null,
            pais: pais ? pais.trim() : null,
            nombre: nombre ? nombre.trim() : null,
            apellido: apellido ? apellido.trim() : null,
            wallet: wallet ? wallet.trim() : null,
            balance: 100.00 // Bono inicial de bienvenida opcional para el Imperio
        });

        await nuevoUsuario.save();

        // Inicializar de forma síncrona el documento GameData asociado al gladiador
        let nuevoGameData = new GameData({
            username: nuevoUsuario.username,
            cimientosFinca: [],
            cimientosAldea: [],
            inventarioRecursos: [
                { tipo: 'madera', cantidad: 50 },
                { tipo: 'oro', cantidad: 100 },
                { tipo: 'comida', cantidad: 30 }
            ]
        });

        // Ejecutar el método del esquema para poblar las parcelas 3D vacías (5 Finca, 12 Aldea)
        nuevoGameData.inicializarEspaciosVacios();
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
// 🔑 2. RUTA DE INICIO DE SESIÓN (LOGIN)
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

        // Buscar al usuario por su nombre exacto
        const usuario = await User.findOne({ username: username.trim() });
        if (!usuario) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas o gladiador no encontrado.' 
            });
        }

        // Validar si el usuario se encuentra baneado del sistema
        if (usuario.status !== 'active') {
            return res.status(403).json({ 
                success: false, 
                message: `Acceso restringido. Motivo: ${usuario.banReason || 'Sanción administrativa en curso.'}` 
            });
        }

        // Verificar la contraseña cifrada mediante el método del modelo
        const esPasswordValida = await usuario.comparePassword(password);
        if (!esPasswordValida) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciales inválidas.' 
            });
        }

        // Asegurar que el documento GameData exista al iniciar sesión (auto-reparación por seguridad)
        let gameData = await GameData.findOne({ username: usuario.username });
        if (!gameData) {
            gameData = new GameData({ username: usuario.username });
            gameData.inicializarEspaciosVacios();
            await gameData.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Sesión iniciada con éxito.',
            username: usuario.username,
            balance: usuario.balance,
            poseeAldea: usuario.poseeAldea
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

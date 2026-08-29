// server.js
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/User'); // Importamos el modelo de usuario corregido

const app = express();

// ========================================================
// MIDDLEWARES ESENCIALES (Para leer JSON y servir archivos)
// ========================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public')); // Esto sirve tu index.html y assets

// ========================================================
// CONEXIÓN A LA BASE DE DATOS MONGODB
// ========================================================
// Asegúrate de tener MongoDB ejecutándose localmente, o cambia la URI si usas Atlas
const MONGO_URI = 'mongodb://127.0.0.1:27017/xdpro'; 
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado a la base de datos MongoDB'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err));

// ========================================================
// ENDPOINT: REGISTRO DE NUEVOS GLADIADORES
// ========================================================
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Verificar si el usuario ya existe
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está tomado.' });
        }

        // Crear el usuario con balance en 0 por defecto (establecido en el modelo)
        const nuevoUsuario = new User({ username, password });
        await nuevoUsuario.save();

        return res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (error) {
        console.error('Error en base de datos al registrar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

// ========================================================
// ENDPOINT: INICIO DE SESIÓN (LOGIN) Y CONTROL DE FRAUDE
// ========================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // 1. Buscar al usuario
        const usuario = await User.findOne({ username });
        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // 2. SISTEMA ANTIFRAUDE: Verificar si la cuenta está baneada
        if (usuario.status === 'banned_perm') {
            return res.status(403).json({ 
                success: false, 
                message: 'Cuenta suspendida permanentemente. Razón: ' + (usuario.banReason || 'Violación de términos.') 
            });
        }

        if (usuario.status === 'banned_temp') {
            if (new Date() < usuario.banUntil) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Cuenta suspendida hasta ${usuario.banUntil}. Razón: ${usuario.banReason}` 
                });
            } else {
                // Si el tiempo de baneo ya pasó, le quitamos la suspensión
                usuario.status = 'active';
                usuario.banUntil = null;
                await usuario.save();
            }
        }

        // 3. Validar la contraseña encriptada
        const esValido = (typeof usuario.comparePassword === 'function') 
            ? await usuario.comparePassword(password) 
            : (usuario.password === password);

        if (!esValido) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // 4. Si todo está bien, conceder el acceso
        return res.status(200).json({ 
            success: true, 
            userId: usuario._id,
            username: usuario.username,
            balance: usuario.balance,
            token: "session_activa_gladiador" 
        });

    } catch (error) {
        console.error('Error en base de datos al autenticar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});

// ========================================================
// INICIAR EL SERVIDOR
// ========================================================
const PORT = process.env.PORT || 5173; 

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Arena y Gloria corriendo en el puerto ${PORT}`);
});

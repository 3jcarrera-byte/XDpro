// server.js
const express = require('express');
const mongoose = require('mongoose');
const path = require('path'); // <-- AGREGADO: Necesario para manejar rutas absolutas de archivos
const User = require('./models/User'); 

const app = express();

// ========================================================
// MIDDLEWARES ESENCIALES (Para leer JSON y servir archivos)
// ========================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORREGIDO: Usar path.join asegura que Render encuentre la carpeta public sin importar el sistema operativo
app.use(express.static(path.join(__dirname, 'public'))); 

// ========================================================
// CONEXIÓN A LA BASE DE DATOS MONGODB
// ========================================================
// CORREGIDO: En producción usará la variable de entorno de Render; localmente usará tu base de datos
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/xdpro'; 

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado a la base de datos MongoDB'))
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err);
    // IMPORTANTE: No rompe el servidor de inmediato para permitir que Render complete el Health Check si es necesario
  });

// ========================================================
// ENDPOINT: REGISTRO DE NUEVOS GLADIADORES
// ========================================================
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está tomado.' });
        }
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
        const usuario = await User.findOne({ username });
        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }
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
                usuario.status = 'active';
                usuario.banUntil = null;
                await usuario.save();
            }
        }
        const esValido = (typeof usuario.comparePassword === 'function') 
            ? await usuario.comparePassword(password) 
            : (usuario.password === password);

        if (!esValido) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }
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
// RUTA COMODÍN PARA EL FRONTEND (FALLBACK)
// ========================================================
// AGREGADO: Esto soluciona de raíz el error de JavaScript al asegurar que cualquier petición web devuelva tu HTML principal
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========================================================
// INICIAR EL SERVIDOR
// ========================================================
// CORREGIDO: Render asigna puertos aleatorios dinámicamente; process.env.PORT es obligatorio para producción
const PORT = process.env.PORT || 5173; 

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Arena y Gloria corriendo en el puerto ${PORT}`);
});

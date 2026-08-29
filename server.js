// server.js
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/User'); // Importamos tu modelo de usuario
const app = express();

// Middlewares esenciales para procesar datos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ========================================================
// ENDPOINT: REGISTRO DE NUEVOS GLADIADORES
// ========================================================
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Validar si el usuario ya existe en la colección de MongoDB
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está tomado.' });
        }

        // Crear una instancia del documento basado en tu modelo User.js
        const nuevoUsuario = new User({ username, password });
        await nuevoUsuario.save();

        return res.status(201).json({ success: true, message: 'Usuario creado exitosamente.' });
    } catch (error) {
        console.error('Error en base de datos al registrar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});


// ========================================================
// ENDPOINT: INICIO DE SESIÓN (LOGIN)
// ========================================================
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Buscar el usuario
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        // Verificar la contraseña (si usas bcrypt en tu modelo, invoca tu método de comparación)
        // Si aún guardas texto plano en pruebas, usa: const isMatch = (password === user.password);
       app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const usuario = await User.findOne({ username });
        if (!usuario) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // Validación de contraseña. 
        // Si usas bcrypt en tu User.js llama a su método, si no, compara texto plano temporalmente:
        const esValido = (typeof usuario.comparePassword === 'function') 
            ? await usuario.comparePassword(password) 
            : (usuario.password === password);

        if (!esValido) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña inválidos.' });
        }

        // Si es correcto, devolvemos el ID para asociar los datos del juego más tarde
        return res.status(200).json({ 
            success: true, 
            userId: usuario._id,
            token: "session_activa_gladiador" // Marcador de posición para control
        });

    } catch (error) {
        console.error('Error en base de datos al autenticar:', error);
        return res.status(500).json({ success: false, message: 'Fallo interno del servidor.' });
    }
});
const PORT = process.env.PORT || 5173; 

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de Arena y Gloria corriendo en el puerto ${PORT}`);
});

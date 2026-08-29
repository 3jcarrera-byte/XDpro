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
        // Verificar si el usuario ya está registrado en MongoDB
        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'El nombre de usuario ya está en uso.' });
        }

        // Crear y guardar el nuevo usuario
        const newUser = new User({ username, password });
        await newUser.save();

        res.status(201).json({ success: true, message: 'Usuario creado correctamente.' });
    } catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
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
        const isMatch = typeof user.comparePassword === 'function' 
            ? await user.comparePassword(password) 
            : (password === user.password);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Usuario o contraseña incorrectos.' });
        }

        // Responder con éxito si todo coincide
        res.status(200).json({ 
            success: true, 
            message: 'Autenticación exitosa', 
            userId: user._id 
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});
const PORT = process.env.PORT || 5173; 

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor de Arena y Gloria corriendo en el puerto ${PORT}`);
});

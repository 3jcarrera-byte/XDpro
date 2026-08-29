const express = require('express');
const path = require('path');
const app = express();

// Middleware para leer datos de formularios y JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos de forma limpia
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal para servir el login de inicio
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Enrutador para manejar las peticiones de Login / Registro de modelos/User.js
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // Tu lógica de autenticación con MongoDB (User.js) aquí
        // ...
        res.status(200).json({ success: true, message: "Acceso concedido" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5173; // Puerto según tu captura
app.listen(PORT, () => console.log(`Servidor de Arena y Gloria corriendo en puerto ${PORT}`));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor Árbitro de XDpro operativo en puerto ${PORT}`);
});

const mongoose = require('mongoose');

// El verdadero plano de datos para guardar Gladiadores en MongoDB Atlas
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    email: { type: String, default: null },
    pais: { type: String, default: null },
    nombre: { type: String, default: null },
    apellido: { type: String, default: null },
    wallet: { type: String, default: null },
    balance: { type: Number, default: 100.00 },
    poseeAldea: { type: Boolean, default: false },
    status: { type: String, default: 'active' },
    banReason: { type: String, default: null }
});

// Registrar y exportar el modelo global de Mongoose de forma directa
module.exports = mongoose.models.User || mongoose.model('User', UserSchema);

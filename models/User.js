// models/User.js - Con Middleware de Encriptación Inteligente
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true,
        index: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    email: { type: String, default: null, lowercase: true, trim: true },
    pais: { type: String, default: null, trim: true },
    nombre: { type: String, default: null, trim: true },
    apellido: { type: String, default: null, trim: true },
    wallet: { type: String, default: null, trim: true },
    balance: { type: Number, default: 100.00 },
    status: { type: String, default: 'active' },
    banReason: { type: String, default: null },
    poseeAldea: { type: Boolean, default: false }
}, { 
    timestamps: true 
});

// 🔒 Middleware pre-save para centralizar el cifrado de forma segura
UserSchema.pre('save', async function(next) {
    // Si la contraseña no ha sido modificada, continúa
    if (!this.isModified('password')) return next();

    // Si por alguna razón ya viene hasheada (empieza por $2a$ o $2b$), no la vuelve a tocar
    if (this.password.startsWith('$2a$') || this.password.startsWith('$2b$')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Método de instancia para comparar contraseñas en el login
UserSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);

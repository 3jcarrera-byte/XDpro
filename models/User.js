// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

const UserSchema = new mongoose.Schema({
  // ==========================================
  // DATOS BÁSICOS DEL JUGADOR
  // ==========================================
  username: {
    type: String,
    required: true,
    unique: true, 
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  
  // ==========================================
  // EXTENSIÓN DEL IMPERIO (NUEVOS CAMPOS FORMULARIO)
  // ==========================================
  email: {
    type: String,
    trim: true
  },
  pais: {
    type: String,
    trim: true
  },
  nombre: {
    type: String,
    trim: true
  },
  apellido: {
    type: String,
    trim: true
  },
  wallet: {
    type: String,
    trim: true
  },
  
  // ==========================================
  // ECONOMÍA Y CONTROL DE FRAUDE (ADMINISTRACIÓN)
  // ==========================================
  balance: {
    type: Number,
    default: 0 
  },
  status: { 
    type: String, 
    enum: ['active', 'banned_temp', 'banned_perm'], 
    default: 'active' 
  },
  banReason: { 
    type: String, 
    default: null 
  },
  banUntil: { 
    type: Date, 
    default: null 
  },

  // ==========================================
  // METADATOS
  // ==========================================
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// ==========================================
// MIDDLEWARE: ENCRIPTAR LA CONTRASEÑA AUTOMÁTICO
// ==========================================
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ==========================================
// MÉTODO: VERIFICAR LA CONTRASEÑA (LOGIN)
// ==========================================
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// EXPORTACIÓN EXCLUSIVA
module.exports = mongoose.model('User', UserSchema);

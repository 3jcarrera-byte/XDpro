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
    unique: true, // Evita que dos jugadores tengan el mismo nombre
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  
  // ==========================================
  // ECONOMÍA Y CONTROL DE FRAUDE (ADMINISTRACIÓN)
  // ==========================================
  balance: {
    type: Number,
    default: 0 // El dinero inicial con el que empieza un jugador
  },
  status: { 
    type: String, 
    enum: ['active', 'banned_temp', 'banned_perm'], 
    default: 'active' // Todos empiezan activos
  },
  banReason: { 
    type: String, 
    default: null // Razón del baneo (ej: "Duplicación de oro en el mercado")
  },
  banUntil: { 
    type: Date, 
    default: null // Fecha hasta la que dura el castigo (si es temporal)
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
// MIDDLEWARE: ENCRIPTAR LA CONTRASEÑA
// ==========================================
// Esto se ejecuta automáticamente antes de guardar un usuario en la Base de Datos
UserSchema.pre('save', async function(next) {
  // Si la contraseña no se ha modificado, continuamos
  if (!this.isModified('password')) return next();
  
  try {
    // Generamos el "salt" y encriptamos la contraseña por seguridad
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
// Compara la contraseña que escribe el usuario con la encriptada en la base de datos
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ==========================================
// EXPORTACIÓN (Solo debe exportarse UNA vez)
// ==========================================
module.exports = mongoose.model('User', UserSchema);

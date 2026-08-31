// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

const UserSchema = new mongoose.Schema({
  // ==========================================
  // DATOS BÁSICOS DEL JUGADOR
  // ==========================================
  username: {
    type: String,
    required: [true, 'El nombre de usuario es obligatorio.'],
    unique: true, 
    trim: true,
    index: true // ⚡ Índice para acelerar el proceso de Login e ignorar mayúsculas
  },
  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria.']
  },
  
  // ==========================================
  // EXTENSIÓN DEL IMPERIO (CAMPOS DEL FORMULARIO)
  // ==========================================
  email: {
    type: String,
    trim: true,
    lowercase: true, // Forzar minúsculas preventivas en correos
    default: null
  },
  pais: {
    type: String,
    trim: true,
    default: null
  },
  nombre: {
    type: String,
    trim: true,
    default: null
  },
  apellido: {
    type: String,
    trim: true,
    default: null
  },
  wallet: {
    type: String,
    trim: true,
    default: null
  },
  
  // ==========================================
  // ECONOMÍA, CONTROL DE FRAUDE Y PROPIEDADES NFT
  // ==========================================
  balance: {
    type: Number,
    default: 0,
    min: [0, 'El balance de monedas imperiales no puede ser negativo.']
  },
  poseeAldea: { 
    type: Boolean, 
    default: false 
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
}, {
  timestamps: false, // Controlado manualmente mediante createdAt
  versionKey: false  // Remueve el campo __v innecesario en documentos de juego
});

// ==========================================
// MIDDLEWARE: ENCRIPTAR LA CONTRASEÑA AUTOMÁTICO
// ==========================================
UserSchema.pre('save', async function(next) {
  // 🛡️ Blindaje crucial: Si la contraseña no ha cambiado (ej. solo cambió el balance), salir.
  // Sin esto, cada vez que el usuario ganaba monedas, su contraseña se volvía a encriptar, rompiendo el login.
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
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (err) {
    return false;
  }
};

// EXPORTACIÓN EXCLUSIVA DEL MODELO SANEADO
module.exports = mongoose.model('User', UserSchema);

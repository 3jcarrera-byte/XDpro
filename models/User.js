// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Nota: Asegúrate de usar 'bcryptjs' en tus componentes para evitar fallos de compilación nativa en Render

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
    default: 0 // El dinero inicial con el que empieza un jugador
  },
  status: { 
    type: String, 
    enum: ['active', 'banned_temp', 'banned_perm'], 
    default: 'active' // Todos empiezan activos
  },
  banReason: { 
    type: String, 
    default: null // Razón del baneo
  },
  banUntil: { 
    type: Date, 
    default: null // Fecha hasta la que dura el castigo
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

module.exports = mongoose.model('User', UserSchema);
/* BARRA SUPERIOR DE ESTADO EN EL MENÚ */
.player-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(30, 20, 10, 0.85);
  border: 2px solid #5c4033;
  border-radius: 12px;
  padding: 12px 25px;
  margin-bottom: 30px;
  box-shadow: 0 4px 8px rgba(0,0,0,0.4);
}

.player-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.player-resources {
  display: flex;
  gap: 15px;
}

.resource-item {
  background: #1a1a1a;
  border: 1px solid #ffd700;
  padding: 6px 14px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.resource-value {
  color: #ffd700;
  font-weight: bold;
}

/* Diferenciación sutil por colores de categoría */
.btn-categoria-gestion:hover { border-color: #4caf50; }
.btn-categoria-economia:hover { border-color: #ffeb3b; }
.btn-categoria-combate:hover { border-color: #f44336; }

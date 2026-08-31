const mongoose = require('mongoose');

// Esquema para recursos apilables en mazos independientes (Hasta 99 unidades)
const RecursoStackSchema = new mongoose.Schema({
  tipo: { type: String, required: true }, // 'madera', 'oro', 'comida', 'piedra'
  cantidad: { type: Number, default: 1, min: 0, max: 99 }
});

// Esquema de Equipamiento (Espadas, Escudos, etc.) con identificador único global
const EquipamientoSchema = new mongoose.Schema({
  uuid: { type: String, required: true },
  subtipo: { type: String, required: true }, // 'espada_bronce', 'escudo_hierro', etc.
  nombre: { type: String, required: true },
  rareza: { type: String, required: true },
  estado: { type: String, default: 'activo' } // 'activo', 'bloqueado_mercado'
});

// Esquema de Pobladores / Aldeanos
const PobladorSchema = new mongoose.Schema({
  uuid: { type: String, required: true },
  subtipo: { type: String, required: true }, // 'gladiador_minero', 'guerrero_arena'
  nombre: { type: String, required: true },
  rareza: { type: String, required: true },
  nivel: { type: Number, default: 0 },
  slotIndex: { type: Number, default: -1 }, // Posición lógica dentro del contenedor
  equipamientoAnidado: [EquipamientoSchema]  // Mecánica de Equipamiento ➡ Personaje
});

// Esquema de Cimientos para Estructuras 3D en Finca o Aldea
const CimientoEstructuraSchema = new mongoose.Schema({
  slotId: { type: Number, required: true }, // ID del cimiento en el canvas 3D
  estaOcupado: { type: Boolean, default: false },
  edificioUuid: { type: String, default: null },
  subtipo: { type: String, default: null },
  nombre: { type: String, default: null },
  rareza: { type: String, default: null },
  nivel: { type: Number, default: 0 },
  durabilidadActual: { type: Number, default: 100 },
  produccionGenerada: { type: Number, default: 0 },
  pobladoresAsignados: [PobladorSchema] // Mecánica de Personajes ➡ Edificios
});

const GameDataSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  
  // Áreas Geográficas del Imperio (Estructuras de Canvas)
  cimientosFinca: { type: [CimientoEstructuraSchema], default: () => [] },  // Máx 5
  cimientosAldea: { type: [CimientoEstructuraSchema], default: () => [] },  // Máx 12

  // El Carretón Logístico (3 Contenedores Persistentes)
  carretonCartas: {
    cartasAldea: { type: [PobladorSchema], default: [] },   // Máx 16
    cartasFinca: { type: [PobladorSchema], default: [] },    // Máx 8
    cartasCentral: { type: [PobladorSchema], default: [] }   // Almacenamiento dinámico variable
  },

  // Almacén Central (Inventarios en reposo y recursos)
  almacenCartas: { type: [PobladorSchema], default: [] },
  almacenEdificiosDisponibles: [{
    uuid: { type: String, required: true },
    subtipo: { type: String, required: true },
    nombre: { type: String, required: true },
    rareza: { type: String, required: true },
    nivel: { type: Number, default: 0 }
  }],
  inventarioRecursos: { type: [RecursoStackSchema], default: [] },

  updatedAt: { type: Date, default: Date.now }
});

// Inicializador automático para poblar los cimientos vacíos del mapa 3D por primera vez
GameDataSchema.methods.inicializarEspaciosVacios = function() {
  if (this.cimientosFinca.length === 0) {
    for (let i = 0; i < 5; i++) {
      this.cimientosFinca.push({ slotId: i, estaOcupado: false });
    }
  }
  if (this.cimientosAldea.length === 0) {
    for (let i = 0; i < 12; i++) {
      this.cimientosAldea.push({ slotId: i, estaOcupado: false });
    }
  }
};

module.exports = mongoose.model('GameData', GameDataSchema);

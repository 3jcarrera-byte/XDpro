// ==========================================================================
// models/GameData.js - Modelo de Estado del Juego y Persistencia Imperial
// ==========================================================================

const mongoose = require('mongoose');

// ==========================================================================
// 🌾 1. ESQUEMA DE RECURSOS APILABLES (Mazos de Máx. 99 Unidades)
// ==========================================================================
const RecursoStackSchema = new mongoose.Schema({
    tipo: { 
        type: String, 
        required: true, 
        enum: ['madera', 'oro', 'comida', 'piedra', 'hierro'] 
    },
    cantidad: { 
        type: Number, 
        default: 1, 
        min: 0, 
        max: 99,
        set: v => Math.floor(Number(v))
    }
}, { _id: false });

// ==========================================================================
// ⚔️ 2. ESQUEMA DE EQUIPAMIENTO (ADN único vía UUID)
// ==========================================================================
const EquipamientoSchema = new mongoose.Schema({
    uuid: { type: String, required: true },
    subtipo: { type: String, required: true }, // 'espada_bronce', 'escudo_hierro', etc.
    nombre: { type: String, required: true },
    rareza: { type: String, required: true, default: 'comun' },
    estado: { type: String, default: 'activo', enum: ['activo', 'bloqueado_mercado', 'destruido'] }
}, { _id: false });

// ==========================================================================
// 👨‍🌾 3. ESQUEMA DE POBLADORES / ALDEANOS (Anidación de Ítems)
// ==========================================================================
const PobladorSchema = new mongoose.Schema({
    uuid: { type: String, required: true },
    subtipo: { type: String, required: true }, // 'gladiador_minero', 'guerrero_arena'
    nombre: { type: String, required: true },
    rareza: { type: String, required: true, default: 'comun' },
    nivel: { type: Number, default: 0, min: 0 },
    slotIndex: { type: Number, default: -1 }, // Ranura física dentro del Carretón logístico
    equipamientoAnidado: { type: [EquipamientoSchema], default: [] } // Mecánica de Equipamiento ➡ Personaje
}, { _id: false });

// ==========================================================================
// 🏛️ 4. ESQUEMA DE CIMIENTOS PARA ESTRUCTURAS 3D (Blindaje de Tipos)
// ==========================================================================
const CimientoEstructuraSchema = new mongoose.Schema({
    slotId: { 
        type: Number, 
        required: true,
        set: v => (isNaN(v) ? 0 : Math.max(0, Math.floor(Number(v)))) // 🛡️ Cast autoritario: asegura enteros no negativos
    },
    estaOcupado: { type: Boolean, default: false },
    edificioUuid: { type: String, default: null },
    subtipo: { type: String, default: null },
    nombre: { type: String, default: null },
    rareza: { type: String, default: null },
    nivel: { type: Number, default: 0, min: 0 },
    durabilidadActual: { type: Number, default: 100, min: 0, max: 100 },
    produccionGenerada: { type: Number, default: 0, min: 0 },
    pobladoresAsignados: { type: [PobladorSchema], default: [] } // Mecánica de Personajes ➡ Edificios Civiles
}, { _id: false });

// ==========================================================================
// 🌍 5. ESQUEMA GLOBAL DE DATOS DE JUEGO (GameData)
// ==========================================================================
const GameDataSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true, 
        index: true 
    },
    
    // Áreas Geográficas del Imperio (Estructuras vinculadas al Canvas 3D de Three.js)
    cimientosFinca: { type: [CimientoEstructuraSchema], default: [] },  // Máx 5 parcelas
    cimientosAldea: { type: [CimientoEstructuraSchema], default: [] },  // Máx 12 parcelas

    // El Carretón Logístico (3 Contenedores Persistentes Regulados)
    carretonCartas: {
        cartasAldea: { type: [PobladorSchema], default: [] },   // Habilitación Máx 16
        cartasFinca: { type: [PobladorSchema], default: [] },    // Habilitación Máx 8
        cartasCentral: { type: [PobladorSchema], default: [] }   // Slots Elásticos (Máx 24 total)
    },

    // Almacén Central (Inventarios en reposo y cartas de obra civil)
    almacenCartas: { type: [PobladorSchema], default: [] },
    almacenEdificiosDisponibles: [{
        uuid: { type: String, required: true },
        subtipo: { type: String, required: true },
        nombre: { type: String, required: true },
        rareza: { type: String, required: true },
        nivel: { type: Number, default: 0, min: 0 }
    }],
    inventarioRecursos: { type: [RecursoStackSchema], default: [] },

    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: false, // Desactivado para controlar manualmente updatedAt sin metadatos duplicados
    versionKey: false  // Remueve __v para optimizar el peso de transmisión en sockets
});

// ==========================================================================
// 🛡️ MIDDLEWARE PRE-SAVE: Sanitización Atómica de Tipos
// ==========================================================================
GameDataSchema.pre('save', function(next) {
    this.updatedAt = new Date();

    // Forzar parseo numérico en Finca para evitar colisiones String-Number en los findIndex
    if (Array.isArray(this.cimientosFinca)) {
        this.cimientosFinca.forEach(cimiento => {
            if (cimiento && cimiento.slotId !== undefined && cimiento.slotId !== null) {
                cimiento.slotId = Math.max(0, Math.floor(Number(cimiento.slotId)));
            }
        });
    }

    // Forzar parseo numérico en Aldea
    if (Array.isArray(this.cimientosAldea)) {
        this.cimientosAldea.forEach(cimiento => {
            if (cimiento && cimiento.slotId !== undefined && cimiento.slotId !== null) {
                cimiento.slotId = Math.max(0, Math.floor(Number(cimiento.slotId)));
            }
        });
    }
    
    next();
});

// ==========================================================================
// 🛠️ MÉTODO: Inicializador Limpio de Parcelas Vacías (Lógica Pura)
// ==========================================================================
GameDataSchema.methods.inicializarEspaciosVacios = function() {
    // Inicialización controlada de la Finca Personal (5 Cimientos)
    if (!Array.isArray(this.cimientosFinca) || this.cimientosFinca.length === 0) {
        this.cimientosFinca = [];
        for (let i = 0; i < 5; i++) {
            this.cimientosFinca.push({ 
                slotId: i, 
                estaOcupado: false,
                edificioUuid: null,
                subtipo: null,
                nombre: null,
                rareza: null,
                nivel: 0,
                durabilidadActual: 100,
                produccionGenerada: 0,
                pobladoresAsignados: []
            });
        }
    }

    // Inicialización controlada de la Aldea Imperial (12 Cimientos)
    if (!Array.isArray(this.cimientosAldea) || this.cimientosAldea.length === 0) {
        this.cimientosAldea = [];
        for (let i = 0; i < 12; i++) {
            this.cimientosAldea.push({ 
                slotId: i, 
                estaOcupado: false,
                edificioUuid: null,
                subtipo: null,
                nombre: null,
                rareza: null,
                nivel: 0,
                durabilidadActual: 100,
                produccionGenerada: 0,
                pobladoresAsignados: []
            });
        }
    }
};

// ==========================================================================
// 📦 REGISTRO Y EXPORTACIÓN DEFENSIVA DEL MODELO
// ==========================================================================
const GameDataModel = mongoose.models.GameData || mongoose.model('GameData', GameDataSchema);

module.exports = GameDataModel;
module.exports.GameDataModel = GameDataModel;
module.exports.GameData = GameDataModel;

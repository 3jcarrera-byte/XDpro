// models/GameData.js - Esquema Mongoose de Datos de Juego del Gladiador (Corregido con soporte de mapas 3D)

const mongoose = require('mongoose');

// Esquema de Recurso Anidado / Ítem
const RecursoAnidadoSchema = new mongoose.Schema({
    uuid: { type: String },
    id: { type: String },
    subtipo: { type: String, required: true },
    nombre: { type: String },
    cantidad: { type: Number, default: 1 }
}, { _id: false });

// Esquema de Cimientos de la Finca (Terrenos / Slots)
const CimientoFincaSchema = new mongoose.Schema({
    slotId: { type: String, required: true },
    estaOcupado: { type: Boolean, default: false },
    subtipo: { type: String, default: null },
    nivel: { type: Number, default: 0 },
    nombre: { type: String, default: null },
    uuid: { type: String, default: null },
    produccionPendiente: { type: Number, default: 0 },
    recursosAnidados: [RecursoAnidadoSchema]
}, { _id: false });

// Esquema de Carta del Carretón (Aldeano / Ítem Equipado)
const CartaCarretonSchema = new mongoose.Schema({
    uuid: { type: String },
    id: { type: String },
    slotIndex: { type: Number, required: true },
    nombre: { type: String },
    subtipo: { type: String },
    rarity: { type: String, default: 'comun' },
    role: { type: String },
    lvl: { type: Number, default: 1 },
    stats: {
        fuerza: { type: Number, default: 0 },
        agilidad: { type: Number, default: 0 },
        vitalidad: { type: Number, default: 0 }
    },
    equipamientoAnidado: [RecursoAnidadoSchema]
}, { _id: false });

// Esquema del Almacén de Edificios / Recursos Disponibles
const AlmacenItemSchema = new mongoose.Schema({
    uuid: { type: String },
    id: { type: String },
    subtipo: { type: String, required: true },
    nombre: { type: String },
    nivel: { type: Number, default: 0 },
    rareza: { type: String, default: 'comun' },
    cantidad: { type: Number, default: 1 },
    estaAnidado: { type: Boolean, default: false }, // 🔥 Requerido para que MongoDB no borre la propiedad
    slotAnidado: { type: Number, default: null }    // 🔥 Requerido para el tracking del canvas 3D
}, { _id: false });

// Esquema Principal GameData
const GameDataSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    cimientosFinca: [CimientoFincaSchema],
    almacenEdificiosDisponibles: [AlmacenItemSchema],
    carretonCartas: {
        cartasCentral: [CartaCarretonSchema]
    }
}, { 
    timestamps: true 
});

/**
 * Método de instancia para inicializar los 12 espacios de la finca si están vacíos.
 */
GameDataSchema.methods.inicializarEspaciosVacios = function() {
    if (!this.cimientosFinca || this.cimientosFinca.length === 0) {
        this.cimientosFinca = Array.from({ length: 12 }, (_, i) => ({
            slotId: `slot-${i}`,
            estaOcupado: false,
            subtipo: null,
            nivel: 0,
            nombre: null,
            uuid: null,
            produccionPendiente: 0,
            recursosAnidados: []
        }));
    }
};

/**
 * Método de instancia para calcular el límite dinámico de cartas en el carretón
 */
GameDataSchema.methods.calcularCapacidadCarreton = function() {
    let capacidadBase = 3;
    if (Array.isArray(this.cimientosFinca)) {
        for (const slot of this.cimientosFinca) {
            if (slot.estaOcupado) {
                if (slot.subtipo === 'casona' || slot.subtipo === 'casa') {
                    capacidadBase += 1 + (slot.nivel || 0);
                }
            }
        }
    }
    return capacidadBase;
};

module.exports = mongoose.model('GameData', GameDataSchema);

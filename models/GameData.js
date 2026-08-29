/**
 * Modelo de Datos encargado de estructurar el progreso del juego
 * Sincroniza inventarios, ranuras del carretón y construcciones 3D.
 */
class GameDataModel {
    /**
     * @param {string} username - Propietario de este estado de juego
     */
    constructor(username) {
        this.username = username;

        // --- MAPEO DE CIMIENTOS 3D (Sincronizado con public/js/game3d.js) ---
        this.cimientosAldea = Array.from({ length: 12 }, (_, i) => ({ slotId: i, estaOcupado: false, tipoEdificio: null, nivel: 0 }));
        this.cimientosFinca = Array.from({ length: 5 }, (_, i) => ({ slotId: i, estaOcupado: false, tipoEdificio: null, nivel: 0 }));

        // --- INVENTARIO DE CARTAS (Sincronizado con public/js/almacen.js) ---
        this.almacenCartas = {
            producibles: [
                { id: "prod_01", nombre: "Madera Alfa", cantidad: 10, rareza: "Común" },
                { id: "prod_02", nombre: "Piedra Cantera", cantidad: 5, rareza: "Común" }
            ],
            consumibles: [
                { id: "cons_01", nombre: "Ración de Trigo", cantidad: 20, rareza: "Común" }
            ]
        };

        // --- RANURAS DINÁMICAS (Sincronizado con public/js/carreton.js) ---
        this.carretonCartas = {
            cartasAldea: [],  // Límite lógico de 16 slots si poseeAldea === true
            cartasFinca: [],   // Límite lógico de 8 slots
            cartasCentral: []  // Capacidad máxima de 24 slots variables
        };
    }

    /**
     * Registra una edificación sobre un cimiento 3D específico
     * @param {string} tipoMapa - 'aldea' o 'finca'
     * @param {number} slotId - Identificador de ranura (0-11 o 0-4)
     * @param {string} tipoEdificio - Nombre de la estructura a levantar
     */
    construirEnCimiento(tipoMapa, slotId, tipoEdificio) {
        const cimientos = tipoMapa === 'aldea' ? this.cimientosAldea : this.cimientosFinca;
        const cimiento = cimientos.find(c => c.slotId === slotId);

        if (!cimiento) return { error: true, mensaje: "El cimiento especificado no existe." };
        if (cimiento.estaOcupado) return { error: true, mensaje: "Esta ranura ya se encuentra construida." };

        cimiento.estaOcupado = true;
        cimiento.tipoEdificio = tipoEdificio;
        cimiento.nivel = 1;

        return { error: false, cimiento: cimiento };
    }
}

module.exports = GameDataModel;

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
        this.poseeAldea = false; // Control de activación permanente o NFT

        // --- MAPEO DE CIMIENTOS 3D (Sincronizado con public/js/game3d.js) ---
        // Se añade 'edificioUUID' para enlazar el cimiento con el ADN de la carta única
        this.cimientosAldea = Array.from({ length: 12 }, (_, i) => ({ slotId: i, estaOcupado: false, edificioUUID: null, tipoEdificio: null, nivel: 0 }));
        this.cimientosFinca = Array.from({ length: 5 }, (_, i) => ({ slotId: i, estaOcupado: false, edificioUUID: null, tipoEdificio: null, nivel: 0 }));

        // --- INVENTARIO CENTRALIZADO DE CARTAS CON UUID (Anti-falsificación) ---
        // Todas las cartas del jugador se indexan aquí para un control estricto de su estado
        this.cartasGlobales = {}; 

        // --- INVENTARIO DE RECURSOS APILABLES (Máx. 99 por mazo) ---
        this.almacenRecursos = []; // Contiene objetos: { tipo: "madera", cantidad: 45 }

        // --- RANURAS DINÁMICAS (Sincronizado con public/js/carreton.js) ---
        // Guardarán únicamente los UUIDs de las cartas de personajes para evitar duplicación física
        this.carretonCartas = {
            cartasAldea: [],   // Máx. 16 slots (Habilitado solo si poseeAldea === true)
            cartasFinca: [],   // Máx. 8 slots
            cartasCentral: []  // Mapeo dinámico de slots (Máx. 24)
        };
    }

    /**
     * Registra una carta nueva con UUID único en el sistema del jugador
     */
    registrarNuevaCarta(cartaData) {
        // El Árbitro debe proveer un UUID único (ej. desde el backend)
        if (!cartaData.uuid) return { error: true, mensaje: "La carta requiere un UUID de autenticidad." };
        
        this.cartasGlobales[cartaData.uuid] = {
            uuid: cartaData.uuid,
            tipo: cartaData.tipo,          // 'personaje', 'edificio', 'equipamiento'
            subtipo: cartaData.subtipo,    // Ej: 'gladiador_minero', 'aserradero'
            nivel: cartaData.nivel || 0,
            rareza: cartaData.rareza || "Común",
            estado: "activo",              // 'activo', 'bloqueado_mercado'
            anidadoEn: null,               // UUID de la carta contenedora
            inventarioAnidado: []          // Lista de UUIDs de cartas que contiene dentro
        };
        return this.cartasGlobales[cartaData.uuid];
    }

    /**
     * LÓGICA DE ANIDACIÓN ESTRICTA: Equipamiento dentro de Personaje o Personaje en Edificio
     */
    anidarCarta(cartaHijoUUID, cartaPadreUUID) {
        const hijo = this.cartasGlobales[cartaHijoUUID];
        const padre = this.cartasGlobales[cartaPadreUUID];

        if (!hijo || !padre) return { error: true, mensaje: "Una de las cartas no existe." };
        if (hijo.estado === "bloqueado_mercado" || padre.estado === "bloqueado_mercado") {
            return { error: true, mensaje: "No se pueden anidar cartas bloqueadas en el mercado." };
        }

        // REGLA 1: Equipamiento dentro de Personaje
        if (hijo.tipo === "equipamiento" && padre.tipo === "personaje") {
            hijo.anidadoEn = cartaPadreUUID;
            padre.inventarioAnidado.push(cartaHijoUUID);
            return { error: false, mensaje: "Equipamiento asignado al personaje." };
        }

        // REGLA 2: Personaje dentro de Edificio Activo
        if (hijo.tipo === "personaje" && padre.tipo === "edificio") {
            hijo.anidadoEn = cartaPadreUUID;
            padre.inventarioAnidado.push(cartaHijoUUID);
            return { error: false, mensaje: "Poblador asignado a las labores del edificio." };
        }

        return { error: true, mensaje: "Combinación de anidamiento no permitida por las reglas." };
    }

    /**
     * LÓGICA DE APILAMIENTO DE RECURSOS (Mazos de 99, Consumibles y Tradeables)
     */
    agregarRecurso(tipo, cantidadAgregar) {
        let cantidadRestante = cantidadAgregar;

        // 1. Intentar rellenar mazos existentes que tengan menos de 99 unidades
        for (let mazo of this.almacenRecursos) {
            if (mazo.tipo === tipo && mazo.cantidad < 99) {
                const espacioLibre = 99 - mazo.cantidad;
                if (cantidadRestante <= espacioLibre) {
                    mazo.cantidad += cantidadRestante;
                    cantidadRestante = 0;
                    break;
                } else {
                    mazo.cantidad = 99;
                    cantidadRestante -= espacioLibre;
                }
            }
        }

        // 2. Si sobra recurso, crear nuevos mazos de máximo 99
        while (cantidadRestante > 0) {
            const cantidadMazo = Math.min(cantidadRestante, 99);
            this.almacenRecursos.push({
                tipo: tipo,
                cantidad: cantidadMazo
            });
            cantidadRestante -= cantidadMazo;
        }

        return this.almacenRecursos;
    }

    /**
     * Sincroniza la colocación de un edificio 3D usando el UUID de su carta
     */
    construirEnCimiento(tipoMapa, slotId, edificioUUID) {
        const carta = this.cartasGlobales[edificioUUID];
        if (!carta || carta.tipo !== 'edificio') return { error: true, mensaje: "Carta de edificio no válida." };
        if (carta.estado === "bloqueado_mercado") return { error: true, mensaje: "Esta carta está en venta." };
        
        // Control de nivel máximo de Finca (Nivel 5)
        if (tipoMapa === 'finca' && carta.nivel > 5) {
            return { error: true, mensaje: "El nivel de la carta excede las restricciones de la finca." };
        }

        const cimientos = tipoMapa === 'aldea' ? this.cimientosAldea : this.cimientosFinca;
        const cimiento = cimientos.find(c => c.slotId === slotId);

        if (!imiento) return { error: true, mensaje: "El cimiento especificado no existe." };
        if (imiento.estaOcupado) return { error: true, mensaje: "Esta ranura ya se encuentra construida." };

        cimiento.estaOcupado = true;
        cimiento.edificioUUID = edificioUUID;
        cimiento.tipoEdificio = carta.subtipo;
        cimiento.nivel = carta.nivel;

        return { error: false, cimiento: cimiento };
    }
}

module.exports = GameDataModel;

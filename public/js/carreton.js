// public/js/carreton.js

// Estado lógico del Carretón y propiedad de instancias
let datosCarreton = {
    poseeAldea: true, // Cambiar a true para pruebas o mediante eventos del servidor (NFT)
    slotsAldeaMax: 16,
    slotsFincaMax: 8,
    slotsCentralMax: 24,
    
    // Listas de cartas de personajes depositadas con su ranura fija asignada (slotIndex)
    cartasAldea: [
        { id: "pj_a1", nombre: "Minero Ancestral", nivel: 2, icono: "⛏️", slotIndex: 0 }
    ],
    cartasFinca: [
        { id: "pj_f1", nombre: "Granjero Beta", nivel: 1, icono: "👨‍🌾", slotIndex: 0 },
        { id: "pj_f2", nombre: "Recolector Alfa", nivel: 3, icono: "🧺", slotIndex: 2 } // Slot 1 queda vacío
    ],
    cartasCentral: [
        { id: "pj_c1", nombre: "Guerrero Exiliado", nivel: 1, icono: "⚔️", slotIndex: 0 }
    ]
};

/**
 * Validador estricto de límite máximo de personajes permitidos en el Carretón Central
 * @returns {boolean} - true si el inventario tiene espacio disponible
 */
function puedeAgregarPersonajeCentral() {
    const limiteMaximo = datosCarreton.poseeAldea ? datosCarreton.slotsCentralMax : datosCarreton.slotsFincaMax; // 24 o 8
    
    if (datosCarreton.cartasCentral.length >= limiteMaximo) {
        console.warn(`⚠️ Límite alcanzado: El carretón central está lleno (${datosCarreton.cartasCentral.length}/${limiteMaximo}).`);
        alert(`¡El Carretón Central ha alcanzado su capacidad máxima de ${limiteMaximo} pobladores! No puedes añadir más cartas.`);
        return false;
    }
    return true;
}

/**
 * Inicializa y renderiza los tres bloques del Carretón en la interfaz
 */
function cargarCarreton() {
    const contAldea = document.getElementById('carreton-aldea-lista');
    const contCentral = document.getElementById('carreton-central-lista');
    const contFinca = document.getElementById('carreton-finca-lista');

    if (!contAldea || !contCentral || !contFinca) return;

    // 1. Renderizar Bloque Izquierdo: Aldea
    renderizarBloqueCarreton(
        contAldea, 
        datosCarreton.cartasAldea, 
        datosCarreton.slotsAldeaMax, 
        datosCarreton.poseeAldea, 
        "Contenedor Bloqueado: Requiere propiedad de Aldea"
    );

    // 2. Renderizar Bloque Central: Almacenamiento de Personajes (Estrictamente limitado a 8 o 24)
    const slotsHabilitadosCentral = datosCarreton.poseeAldea ? datosCarreton.slotsCentralMax : datosCarreton.slotsFincaMax;
    
    // Si por algún cambio del servidor el array excede el límite real, truncamos para evitar exploits visuales
    if (datosCarreton.cartasCentral.length > slotsHabilitadosCentral) {
        datosCarreton.cartasCentral = datosCarreton.cartasCentral.slice(0, slotsHabilitadosCentral);
    }

    renderizarBloqueCarreton(
        contCentral, 
        datosCarreton.cartasCentral, 
        slotsHabilitadosCentral, 
        true, 
        ""
    );

    // Actualizar indicador de capacidad del bloque central en la interfaz
    const txtCapacidad = document.getElementById('carreton-central-capacidad');
    if (txtCapacidad) {
        txtCapacidad.innerText = `Slots: ${datosCarreton.cartasCentral.length} / ${slotsHabilitadosCentral}`;
    }

    // 3. Renderizar Bloque Derecho: Finca
    renderizarBloqueCarreton(
        contFinca, 
        datosCarreton.cartasFinca, 
        datosCarreton.slotsFincaMax, 
        true, 
        ""
    );
}

/**
 * Helper para renderizar los slots de cartas o la interfaz de bloqueo (Optimizado para ranuras fijas)
 */
function renderizarBloqueCarreton(elementoDOM, listaCartas, maxSlots, estaHabilitado, mensajeBloqueo) {
    elementoDOM.innerHTML = '';

    if (!estaHabilitado) {
        elementoDOM.innerHTML = `<div class="carreton-bloqueado-msg">${mensajeBloqueo}</div>`;
        elementoDOM.parentElement.classList.add('bloqueado');
        return;
    }

    elementoDOM.parentElement.classList.remove('bloqueado');

    // Generar la cuadrícula fija basada en el número máximo de slots admitidos
    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'carreton-slot';

        // CORRECCIÓN DE ASIGNACIÓN: Buscamos si hay una carta asignada específicamente a ESTA ranura (i)
        const carta = listaCartas.find(c => c.slotIndex === i);

        if (carta) {
            slotDiv.className += ' ocupado';
            slotDiv.innerHTML = `
                <div class="pj-icono">${carta.icono}</div>
                <div class="pj-nombre">${carta.nombre}</div>
                <div class="pj-lvl">Nv. ${carta.nivel}</div>
                <button class="btn-pj-mover" onclick="moverPersonaje('${carta.id}')">Mover</button>
            `;
        } else {
            slotDiv.innerHTML = `<span class="slot-vacio-txt">Vacío</span>`;
        }
        elementoDOM.appendChild(slotDiv);
    }
}

/**
 * Gestión interactiva básica para retirar o reubicar personajes
 */
function moverPersonaje(idCarta) {
    console.log(`Solicitud para mover el personaje ID: ${idCarta}`);
    
    // Conexión segura con el Árbitro en Render
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:mover-personaje', { idCarta: idCarta });
    }
}

// Escuchador de Socket para actualizar el carretón cuando el Árbitro aprueba un cambio de inventario
if (typeof socket !== 'undefined' && socket) {
    socket.on('carreton:actualizar-estado', (nuevoEstadoCarreton) => {
        // El servidor nos envía el inventario verificado anti-fraude
        datosCarreton.poseeAldea = nuevoEstadoCarreton.poseeAldea;
        datosCarreton.cartasAldea = nuevoEstadoCarreton.cartasAldea;
        datosCarreton.cartasFinca = nuevoEstadoCarreton.cartasFinca;
        datosCarreton.cartasCentral = nuevoEstadoCarreton.cartasCentral;
        
        // Re-pintar la interfaz de forma reactiva
        cargarCarreton();
    });
}

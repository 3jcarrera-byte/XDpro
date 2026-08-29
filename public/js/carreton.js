// Estado lógico del Carretón y propiedad de instancias
let datosCarreton = {
    poseeAldea: false, // Cambiar a true para pruebas o mediante eventos del servidor
    slotsAldeaMax: 16,
    slotsFincaMax: 8,
    slotsCentralMax: 24,
    
    // Listas de cartas de personajes actualmente depositadas en cada contenedor
    cartasAldea: [
        { id: "pj_a1", nombre: "Minero Ancestral", nivel: 2, icono: "⛏️" }
    ],
    cartasFinca: [
        { id: "pj_f1", nombre: "Granjero Beta", nivel: 1, icono: "👨‍🌾" },
        { id: "pj_f2", nombre: "Recolector Alfa", nivel: 3, icono: "🧺" }
    ],
    cartasCentral: [
        { id: "pj_c1", nombre: "Guerrero Exiliado", nivel: 1, icono: "⚔️" }
    ]
};

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

    // 2. Renderizar Bloque Central: Almacenamiento General (Condicionado)
    // El límite total depende de si posee aldea (16+8=24) o solo finca (8)
    const slotsHabilitadosCentral = datosCarreton.poseeAldea ? 24 : 8;
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
 * Helper para renderizar los slots de cartas o la interfaz de bloqueo
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

        // Si existe una carta asignada a este índice de la lista, la dibuja
        if (listaCartas[i]) {
            const carta = listaCartas[i];
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
    // Aquí se procesarán los intercambios de slots mediante Socket.io en las siguientes fases
}

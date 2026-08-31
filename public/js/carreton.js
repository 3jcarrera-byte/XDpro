// public/js/carreton.js

// Estado lógico del Carretón (INICIA COMPLETAMENTE VACÍO SIN CARTAS DE EJEMPLO)
let datosCarreton = {
    poseeAldea: false, 
    slotsAldeaMax: 16,
    slotsFincaMax: 8,
    slotsCentralMax: 8, 
    cartasAldea: [],
    cartasFinca: [],
    cartasCentral: []
};

/**
 * Solicita los datos reales y limpios a la Base de Datos a través del Árbitro
 */
function cargarCarreton() {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:solicitar-datos');
    }
}

/**
 * Helper para renderizar los slots con soporte Drag & Drop nativo y funcional
 */
function renderizarBloqueCarreton(elementoDOM, listaCartas, maxSlots, estaHabilitado, mensajeBloqueo) {
    elementoDOM.innerHTML = '';

    if (!estaHabilitado) {
        elementoDOM.innerHTML = `<div class="carreton-bloqueado-msg">${mensajeBloqueo}</div>`;
        elementoDOM.parentElement.classList.add('bloqueado');
        return;
    }

    elementoDOM.parentElement.classList.remove('bloqueado');
    const bloqueTipo = elementoDOM.id.replace('carreton-', '').replace('-lista', '');

    // Generar la cuadrícula de ranuras vacías enmarcadas
    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'carreton-slot';
        slotDiv.dataset.bloque = bloqueTipo;
        slotDiv.dataset.slotIndex = i;

        // EVENTOS DEL SLOT CAPTADOR (ZONA DE SOLTAR)
        slotDiv.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            if (!slotDiv.classList.contains('ocupado')) {
                slotDiv.style.border = '1px solid #d4af37';
                slotDiv.style.background = 'rgba(212, 175, 55, 0.05)';
            }
        });

        slotDiv.addEventListener('dragleave', () => {
            slotDiv.style.border = '';
            slotDiv.style.background = '';
        });

        slotDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            slotDiv.style.border = '';
            slotDiv.style.background = '';
            
            const cartaId = e.dataTransfer.getData('text/plain');
            const bloqueDestino = slotDiv.dataset.bloque;
            const slotDestinoIndex = parseInt(slotDiv.dataset.slotIndex);

            if (slotDiv.classList.contains('ocupado')) return;

            ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex);
        });

        // Buscar si existe un personaje asignado por la base de datos a esta ranura específica
        const carta = listaCartas.find(c => c.slotIndex === i);

        if (carta) {
            slotDiv.className += ' ocupado';
            
            // Inyectamos la tarjeta del personaje y la hacemos explícitamente arrastrable
            slotDiv.innerHTML = `
                <div class="pj-carta-arrastrable" draggable="true" data-id="${carta.id}" style="width:100%; height:100%; cursor:grab;">
                    <div class="pj-icono">${carta.icono || '👤'}</div>
                    <div class="pj-nombre">${carta.nombre}</div>
                    <div class="pj-lvl">Nv. ${carta.nivel}</div>
                </div>
            `;

            const elementoArrastrable = slotDiv.querySelector('.pj-carta-arrastrable');

            // EVENTOS DE LA CARTA AL EMPEZAR A MOVER
            elementoArrastrable.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', carta.id);
                slotDiv.style.opacity = '0.3';
            });

            elementoArrastrable.addEventListener('dragend', () => {
                slotDiv.style.opacity = '1';
                cargarCarreton(); // Recargar para asegurar limpieza visual
            });
        } else {
            slotDiv.innerHTML = `<span class="slot-vacio-txt">Vacío</span>`;
        }
        elementoDOM.appendChild(slotDiv);
    }
}

function ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex) {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:guardar-posicion', {
            cartaId: cartaId,
            bloqueDestino: bloqueDestino,
            slotDestinoIndex: slotDestinoIndex
        });
    }
}

// Receptor del Árbitro en tiempo real
if (typeof socket !== 'undefined' && socket) {
    socket.on('carreton:actualizar-estado', (estadoBD) => {
        datosCarreton.poseeAldea = estadoBD.poseeAldea;
        datosCarreton.slotsCentralMax = estadoBD.slotsCentralMax;
        datosCarreton.cartasAldea = estadoBD.cartasAldea || [];
        datosCarreton.cartasFinca = estadoBD.cartasFinca || [];
        datosCarreton.cartasCentral = estadoBD.cartasCentral || [];

        const contAldea = document.getElementById('carreton-aldea-lista');
        const contCentral = document.getElementById('carreton-central-lista');
        const contFinca = document.getElementById('carreton-finca-lista');

        if (!contAldea || !contCentral || !contFinca) return;

        renderizarBloqueCarreton(contAldea, datosCarreton.cartasAldea, datosCarreton.slotsAldeaMax, datosCarreton.poseeAldea, "🔒 RESTRICCIÓN: Requiere la Aldea NFT");
        renderizarBloqueCarreton(contCentral, datosCarreton.cartasCentral, datosCarreton.slotsCentralMax, true, "");
        renderizarBloqueCarreton(contFinca, datosCarreton.cartasFinca, datosCarreton.slotsFincaMax, true, "");

        const txtCapacidad = document.getElementById('carreton-central-capacidad');
        if (txtCapacidad) {
            txtCapacidad.innerText = `Slots Centrales: ${datosCarreton.cartasCentral.length} / ${datosCarreton.slotsCentralMax}`;
        }
    });
}

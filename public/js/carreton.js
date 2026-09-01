// public/js/carreton.js

// Estado lógico de la Interfaz (Sincronizado dinámicamente desde MongoDB)
let datosCarreton = {
    poseeAldea: false, 
    slotsAldeaMax: 16,
    slotsFincaMax: 8,
    slotsCentralMax: 8, // Dinámico: protegido en 8 slots finca, escala a 24 con la Aldea NFT
    cartasAldea: [],
    cartasFinca: [],
    cartasCentral: []
};

/**
 * Solicita los datos de inventario autorizados por la Base de Datos a través del Árbitro
 */
function cargarCarreton() {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:solicitar-datos');
    }
}

/**
 * Helper para renderizar los slots con soporte Drag & Drop nativo y funcional
 * @param {HTMLElement} elementoDOM - Contenedor del grid destino
 * @param {Array} listaCartas - Arreglo de cartas asignadas a este bloque
 * @param {number} maxSlots - Cantidad reglamentaria de ranuras
 * @param {boolean} estaHabilitado - Flag de control NFT
 * @param {string} mensajeBloqueo - Cadena informativa de restricción imperial
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

    // Generar la cuadrícula reglamentaria de ranuras enmarcadas
    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'carreton-slot';
        slotDiv.dataset.bloque = bloqueTipo;
        slotDiv.dataset.slotIndex = i;

        // EVENTOS DEL SLOT CAPTADOR (Zona donde se suelta la carta)
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

            // Cancelar movimiento local si la ranura de destino ya está ocupada
            if (slotDiv.classList.contains('ocupado')) return;

            if (typeof ejecutarMovimientoDrag === 'function') {
                ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex);
            }
        });

        // Buscar si existe un personaje asignado por la base de datos a este índice de ranura (slotIndex)
        // BLINDAJE: Evalúa tanto la propiedad .id como .uuid por retrocompatibilidad del modelo mixto
        const carta = listaCartas.find(c => c.slotIndex === i);

        if (carta) {
            slotDiv.classList.add('ocupado');
            const cartaIdentificador = carta.id || carta.uuid;
            
            // Inyectamos la tarjeta del poblador y la hacemos explícitamente arrastrable
            slotDiv.innerHTML = `
                <div class="pj-carta-arrastrable" draggable="true" data-id="${cartaIdentificador}" style="width:100%; height:100%; cursor:grab; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <div class="pj-icono" style="font-size:24px; margin-bottom:4px;">${carta.icono || '👤'}</div>
                    <div class="pj-nombre" style="font-size:12px; color:#fff; font-weight:bold;">${carta.nombre}</div>
                    <div class="pj-lvl" style="font-size:10px; color:#a89276;">Nv. ${carta.nivel || 1}</div>
                </div>
            `;

            const elementoArrastrable = slotDiv.querySelector('.pj-carta-arrastrable');

            // EVENTOS DE SEGUIMIENTO DEL MOUSE AL LLEVARSE LA CARTA
            elementoArrastrable.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', cartaIdentificador);
                slotDiv.style.opacity = '0.3'; // Opacidad mientras flota el mouse en el canvas
            });

            elementoArrastrable.addEventListener('dragend', () => {
                slotDiv.style.opacity = '1';
                cargarCarreton(); // Forzar refresco para limpiar descolocaciones visuales en SPA
            });
        } else {
            slotDiv.innerHTML = `<span class="slot-vacio-txt">Vacío</span>`;
        }
        elementoDOM.appendChild(slotDiv);
    }
}
/**
 * Notifica al Árbitro de Render las nuevas coordenadas para salvar de forma persistente en MongoDB
 * @param {string} cartaId - Identificador único UUID de la carta arrastrada
 * @param {string} bloqueDestino - Bloque receptor ('aldea', 'finca', 'central')
 * @param {number} slotDestinoIndex - Índice de la ranura seleccionada
 */
function ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex) {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        // Blindaje defensivo local previo al envío de red
        if (!cartaId || !bloqueDestino || isNaN(slotDestinoIndex)) return;

        socket.emit('carreton:guardar-posicion', {
            cartaId: cartaId,
            bloqueDestino: bloqueDestino,
            slotDestinoIndex: slotDestinoIndex
        });
    } else {
        console.error("❌ Error logístico: Sin conexión con el Árbitro del servidor.");
        alert("Se ha perdido la conexión con el Coliseo. Reintentando...");
        cargarCarreton(); // Forzar intento de re-sincronización
    }
}

// Escuchador reactivo conectado al flujo de datos autorizado de la Base de Datos
if (typeof socket !== 'undefined' && socket) {
    socket.on('carreton:actualizar-estado', (estadoBD) => {
        if (!estadoBD) return;
        console.log("🏛️ Datos del Carretón validados por la Base de Datos recibidos:", estadoBD);
        
        // Sincronización atómica del estado reactivo global en memoria
        datosCarreton.poseeAldea = estadoBD.poseeAldea || false;
        datosCarreton.slotsCentralMax = estadoBD.slotsCentralMax || 8; 
        datosCarreton.cartasAldea = estadoBD.cartasAldea || [];
        datosCarreton.cartasFinca = estadoBD.cartasFinca || [];
        datosCarreton.cartasCentral = estadoBD.cartasCentral || [];

        // Rastrear nodos de inyección en el DOM de la SPA
        const contAldea = document.getElementById('carreton-aldea-lista');
        const contCentral = document.getElementById('carreton-central-lista');
        const contFinca = document.getElementById('carreton-finca-lista');

        if (!contAldea || !contCentral || !contFinca) {
            console.warn("⚠️ Los contenedores del carretón no se encuentran cargados en el DOM activo.");
            return;
        }

        // Render masivo aplicando restricciones estrictas de propiedad NFT
        renderizarBloqueCarreton(contAldea, datosCarreton.cartasAldea, datosCarreton.slotsAldeaMax, datosCarreton.poseeAldea, "🔒 RESTRICCIÓN: Requiere poseer la Aldea NFT");
        renderizarBloqueCarreton(contCentral, datosCarreton.cartasCentral, datosCarreton.slotsCentralMax, true, "");
        renderizarBloqueCarreton(contFinca, datosCarreton.cartasFinca, datosCarreton.slotsFincaMax, true, "");

        // Actualizar indicador de capacidad central dinámico en la UI
        const txtCapacidad = document.getElementById('carreton-central-capacidad');
        if (txtCapacidad) {
            txtCapacidad.innerText = `Slots Centrales: ${datosCarreton.cartasCentral.length} / ${datosCarreton.slotsCentralMax}`;
        }
    });
    
    // Escudo ante fallos de servidor: Capturar errores enviados por el Árbitro
    socket.on('carreton:error', (mensajeError) => {
        console.error("❌ Denegación autoritaria del servidor:", mensajeError);
        alert(`Movimiento inválido: ${mensajeError}`);
        cargarCarreton(); // Revertir el render local trayendo el estado real de MongoDB
    });
}

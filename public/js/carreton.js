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
 * @param {number} slotsHabilitados - Capacidad habitacional actual calculada por el servidor
 */
function renderizarBloqueCarreton(elementoDOM, listaCartas, maxSlots, estaHabilitado, mensajeBloqueo, slotsHabilitados = 0) {
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

        // Determinar si esta ranura individual está liberada por las construcciones activas
        // El carretón central siempre está disponible; aldea y finca dependen de los edificios
        const esSlotDisponible = (bloqueTipo === 'central') || (i < slotsHabilitados);

        // EVENTOS DEL SLOT CAPTADOR (Solo se configuran si el slot tiene cobertura de espacio)
        if (esSlotDisponible) {
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

                // Cancelar si la ranura de destino ya está ocupada
                if (slotDiv.classList.contains('ocupado')) return;

                if (typeof ejecutarMovimientoDrag === 'function') {
                    ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex);
                }
            });
        } else {
            // Aplicar estilo de bloqueo pasivo para ranuras sin soporte habitacional
            slotDiv.style.opacity = '0.4';
            slotDiv.style.border = '1px dashed #4a1212';
            slotDiv.style.background = 'rgba(15, 10, 10, 0.4)';
            slotDiv.style.cursor = 'not-allowed';
        }

        // Buscar si existe un personaje asignado por la base de datos a este índice de ranura
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
                slotDiv.style.opacity = '0.3'; // Opacidad mientras flota el mouse
            });

            elementoArrastrable.addEventListener('dragend', () => {
                slotDiv.style.opacity = '1';
                cargarCarreton(); // Forzar refresco para limpiar descolocaciones visuales en SPA
            });
        } else {
            // REGLA REACTIVA: Si el slot está bloqueado por falta de población, dice "No disponible"
            if (esSlotDisponible) {
                slotDiv.innerHTML = `<span class="slot-vacio-txt">Vacío</span>`;
            } else {
                slotDiv.innerHTML = `<span class="slot-vacio-txt" style="color: #663333; font-weight: bold; font-family: 'Cinzel', serif;">No disponible</span>`;
            }
        }
        elementoDOM.appendChild(slotDiv);
    }
}
// public/js/carreton.js - Continuación directa del Bloque 1

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

// Escuchador reactivo conectado al flujo de datos authorized de la Base de Datos
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

        // Forzar visibilidad general de las grillas pero delegando la restricción al slot individual interno
        const habilitadoFinca = true; 
        const habilitadoAldea = estadoBD.poseeAldea; 
        const msgAldea = "🔒 RESTRICCIÓN: Requiere poseer la Aldea NFT";

        // Render masivo pasando la capacidad de población autorizada en caliente por tus edificios
        renderizarBloqueCarreton(contAldea, datosCarreton.cartasAldea, estadoBD.slotsAldeaMax, habilitadoAldea, msgAldea, estadoBD.slotsAldeaHabilitados || 0);
        renderizarBloqueCarreton(contCentral, datosCarreton.cartasCentral, datosCarreton.slotsCentralMax, true, "", estadoBD.slotsCentralMax);
        renderizarBloqueCarreton(contFinca, datosCarreton.cartasFinca, estadoBD.slotsFincaMax, habilitadoFinca, "", estadoBD.slotsFincaHabilitados || 0);

        // Actualizar indicador de capacidad central dinámico en la UI
        const txtCapacidad = document.getElementById('carreton-central-capacidad');
        if (txtCapacidad) {
            txtCapacidad.innerText = `Slots Centrales: ${datosCarreton.cartasCentral.length} / ${datosCarreton.slotsCentralMax}`;
        }

        // SINCRO DE CONTADORES: Actualizar los títulos de los contenedores con sus medidores de población reales
        const tituloFinca = contFinca.parentElement.querySelector('h3');
        if (tituloFinca) {
            tituloFinca.innerText = `🏡 Contenedor Finca (${datosCarreton.cartasFinca.length} / ${estadoBD.slotsFincaHabilitados || 0})`;
        }

        const tituloAldea = contAldea.parentElement.querySelector('h3');
        if (tituloAldea) {
            tituloAldea.innerText = `🛡️ Contenedor Aldea (${datosCarreton.cartasAldea.length} / ${estadoBD.slotsAldeaHabilitados || 0})`;
        }
    });
    
    // Escudo ante fallos de servidor: Capturar errores enviados por el Árbitro
    socket.on('carreton:error', (mensajeError) => {
        console.error("❌ Denegación autoritaria del servidor:", mensajeError);
        alert(`Movimiento inválido: ${mensajeError}`);
        cargarCarreton(); // Revertir el render local trayendo el estado real de MongoDB
    });
}

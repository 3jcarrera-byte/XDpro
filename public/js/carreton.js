// ==========================================================================
// 🛒 MÓDULO DE GESTIÓN Y SINCRONIZACIÓN DEL CARRETÓN (CLIENTE)
// ==========================================================================

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
 * Solicita al Árbitro del servidor el estado actual de las cartas y contenedores.
 */
function cargarCarreton() {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:solicitar-datos');
    }
}

/**
 * Renderiza de forma dinámica las celdas (slots) y piezas de cualquier bloque del carretón.
 */
function renderizarBloqueCarreton(elementoDOM, listaCartas, maxSlots, estaHabilitado, mensajeBloqueo, slotsHabilitados = 0) {
    if (!elementoDOM) return;
    elementoDOM.innerHTML = '';

    if (!estaHabilitado) {
        elementoDOM.innerHTML = `<div class="carreton-bloqueado-msg">${mensajeBloqueo}</div>`;
        if (elementoDOM.parentElement) elementoDOM.parentElement.classList.add('bloqueado');
        return;
    }

    if (elementoDOM.parentElement) elementoDOM.parentElement.classList.remove('bloqueado');
    
    let bloqueTipo = elementoDOM.id.replace('carreton-', '').replace('-lista', '');
    
    // 🎯 REGLA DE ORO DE UNIFICACIÓN: Sincronizar el espejo lateral 3D con las colecciones del carretón
    if (elementoDOM.id === 'finca-pobladores-lista') {
        bloqueTipo = 'finca';
    }

    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'carreton-slot';
        slotDiv.dataset.bloque = bloqueTipo;
        slotDiv.dataset.slotIndex = i;

        // El bloque central siempre tiene todos sus slots disponibles; los demás dependen de los edificios construidos
        const esSlotDisponible = (bloqueTipo === 'central') || (i < slotsHabilitados);

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
                const slotDestinoIndex = parseInt(slotDiv.dataset.slotIndex, 10);

                if (slotDiv.classList.contains('ocupado')) return;

                if (typeof ejecutarMovimientoDrag === 'function') {
                    ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex);
                }
            });
        } else {
            slotDiv.style.opacity = '0.4';
            slotDiv.style.border = '1px dashed #4a1212';
            slotDiv.style.background = 'rgba(15, 10, 10, 0.4)';
            slotDiv.style.cursor = 'not-allowed';
        }

        const carta = listaCartas.find(c => parseInt(c.slotIndex, 10) === i);

        if (carta) {
            slotDiv.classList.add('ocupado');
            const cartaIdentificador = carta.uuid || carta.id || (carta._id ? carta._id.toString() : null);
            
            slotDiv.innerHTML = `
                <div class="pj-carta-arrastrable" draggable="true" data-id="${cartaIdentificador}" style="width:100%; height:100%; cursor:grab; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <div class="pj-icono" style="font-size:24px; margin-bottom:4px;">${carta.icono || '👤'}</div>
                    <div class="pj-nombre" style="font-size:12px; color:#fff; font-weight:bold;">${carta.nombre}</div>
                    <div class="pj-lvl" style="font-size:10px; color:#a89276;">Nv. ${carta.nivel || 1}</div>
                </div>
            `;

            const elementoArrastrable = slotDiv.querySelector('.pj-carta-arrastrable');

            elementoArrastrable.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', cartaIdentificador);
                slotDiv.style.opacity = '0.3';
            });

            elementoArrastrable.addEventListener('dragend', () => {
                slotDiv.style.opacity = '1';
                cargarCarreton();
            });
        } else {
            if (esSlotDisponible) {
                slotDiv.innerHTML = `<span class="slot-vacio-txt">Vacío</span>`;
            } else {
                slotDiv.innerHTML = `<span class="slot-vacio-txt" style="color: #663333; font-weight: bold; font-family: 'Cinzel', serif;">No disponible</span>`;
            }
        }

        elementoDOM.appendChild(slotDiv);
    }
}

/**
 * Notifica al Árbitro de Render las nuevas coordenadas para salvar de forma persistente en MongoDB.
 * Utiliza exactamente el evento receptor del servidor ('carreton:mover-carta').
 * @param {string} cartaId - Identificador único UUID de la carta arrastrada
 * @param {string} bloqueDestino - Bloque receptor ('aldea', 'finca', 'central')
 * @param {number} slotDestinoIndex - Índice de la ranura seleccionada
 */
function ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex) {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        if (!cartaId || !bloqueDestino || isNaN(slotDestinoIndex)) return;

        socket.emit('carreton:mover-carta', {
            cartaId: cartaId,
            bloqueDestino: bloqueDestino,
            slotDestinoIndex: slotDestinoIndex
        });
    } else {
        console.error("❌ Error logístico: Sin conexión con el Árbitro del servidor.");
        alert("Se ha perdido la conexión con el Coliseo. Reintentando...");
        cargarCarreton(); 
    }
}

// ========================================================
// RECEPTORES DE RED DE SOCKET.IO (SINCRONIZACIÓN DEL CARRETÓN)
// ========================================================
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

        // 1. Contenedores de la Pantalla General del Carretón
        const contAldea = document.getElementById('carreton-aldea-lista');
        const contCentral = document.getElementById('carreton-central-lista');
        const contFinca = document.getElementById('carreton-finca-lista');

        // 2. Contenedor Espejo (Barra Lateral 3D de la Finca)
        const contFincaEspejo = document.getElementById('finca-pobladores-lista');

        const habilitadoFinca = true; 
        const habilitadoAldea = estadoBD.poseeAldea; 
        const msgAldea = "🔒 RESTRICCIÓN: Requiere poseer la Aldea NFT";

        // Renderizado del Carretón General si el usuario se encuentra en esa vista
        if (contAldea && contCentral && contFinca) {
            renderizarBloqueCarreton(contAldea, datosCarreton.cartasAldea, estadoBD.slotsAldeaMax, habilitadoAldea, msgAldea, estadoBD.slotsAldeaHabilitados || 0);
            renderizarBloqueCarreton(contCentral, datosCarreton.cartasCentral, datosCarreton.slotsCentralMax, true, "", datosCarreton.slotsCentralMax);
            renderizarBloqueCarreton(contFinca, datosCarreton.cartasFinca, estadoBD.slotsFincaMax, habilitadoFinca, "", estadoBD.slotsFincaHabilitados || 0);

            // Actualización de títulos en el panel general
            const parentFinca = contFinca.parentElement;
            if (parentFinca) {
                const tituloFinca = parentFinca.querySelector('h3');
                if (tituloFinca) tituloFinca.innerText = `🏡 Contenedor Finca (${datosCarreton.cartasFinca.length} / ${estadoBD.slotsFincaHabilitados || 0})`;
            }

            const parentAldea = contAldea.parentElement;
            if (parentAldea) {
                const tituloAldea = parentAldea.querySelector('h3');
                if (tituloAldea) tituloAldea.innerText = `🛡️ Contenedor Aldea (${datosCarreton.cartasAldea.length} / ${estadoBD.slotsAldeaHabilitados || 0})`;
            }
        }

        // Sincronización automática de la barra lateral en la escena 3D de la Finca
        if (contFincaEspejo) {
            renderizarBloqueCarreton(contFincaEspejo, datosCarreton.cartasFinca, estadoBD.slotsFincaMax, habilitadoFinca, "", estadoBD.slotsFincaHabilitados || 0);
            
            const tituloFincaEspejo = document.getElementById('finca-poblacion-titulo');
            if (tituloFincaEspejo) {
                tituloFincaEspejo.innerText = `👨 Pobladores Finca (${datosCarreton.cartasFinca.length} / ${estadoBD.slotsFincaHabilitados || 0})`;
            }
        }

        // Indicador dinámico de capacidad central
        const txtCapacidad = document.getElementById('carreton-central-capacidad');
        if (txtCapacidad) {
            txtCapacidad.innerText = `Slots Centrales: ${datosCarreton.cartasCentral.length} / ${datosCarreton.slotsCentralMax}`;
        }
    });
    
    // Escudo ante denegaciones del servidor (ej. intentar meter cartas sin espacio o sin edificios activos)
    socket.on('carreton:error', (mensajeError) => {
        console.error("❌ Denegación autoritaria del servidor:", mensajeError);
        alert(`Movimiento inválido: ${mensajeError}`);
        cargarCarreton(); 
    });
}

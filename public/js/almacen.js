// public/js/almacen.js

// Estado reactivo global del Almacén (Sincronizado dinámicamente con MongoDB)
let datosAlmacen = {
    recursos: [] // Estructura física real: [{ id: UUID, uuid: UUID, nombre: string, cantidad: number, rareza: string }]
};

/**
 * Solicita los inventarios autorizados y actualizados directamente a las colecciones del servidor
 */
function cargarAlmacen() {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        console.log("🗄️ Solicitando estado del Almacén Imperial al Árbitro...");
        socket.emit('almacen:solicitar-recursos');
    }
}

/**
 * Renderiza la interfaz gráfica del inventario inyectando los nodos en la cuadrícula SPA correspondiente
 */
function renderizarAlmacen() {
    let contenedorGrid = null;
    
    // DETECCIÓN MULTI-PANTALLA EXCLUSIVA BASADA EN ELEMENTOS EXISTENTES EN EL DOM ACTIVO
    const contenedorFinca = document.getElementById('finca-edificios-lista');
    const contenedorAldea = document.getElementById('aldea-edificios-lista');

    // 1. Si el contenedor de la finca existe y está visible o el layout padre está activo, inyectar ahí
    if (contenedorFinca && (contenedorFinca.offsetParent !== null || document.getElementById('pantalla-finca').style.display === 'block')) {
        contenedorGrid = contenedorFinca;
    } 
    // 2. Si el contenedor de la aldea está activo, inyectar en su respectiva cinta
    else if (contenedorAldea && (contenedorAldea.offsetParent !== null || document.getElementById('pantalla-aldea').style.display === 'block')) {
        contenedorGrid = contenedorAldea;
    } 
    // 3. Fallback defensivo: Inyectar en el panel general del Almacén tradicional
    else {
        contenedorGrid = document.getElementById('grid-almacen-recursos');
    }
    
    if (!contenedorGrid) return;

    contenedorGrid.innerHTML = '';

    if (!datosAlmacen.recursos || datosAlmacen.recursos.length === 0) {
        contenedorGrid.innerHTML = `<div class="almacen-vacio-txt" style="color:#777; font-style:italic; padding:15px; text-align:center; width:100%;">No tienes cartas de estructuras en tu inventario logístico.</div>`;
        return;
    }

    // Recorrer e inyectar cada tarjeta de recurso/edificio de forma dinámica
    datosAlmacen.recursos.forEach(recurso => {
        const tarjeta = document.createElement('div');
        tarjeta.className = `almacen-card borde-rareza-${recurso.rareza.toLowerCase().trim()}`;
        
        // Habilitar la propiedad nativa de arrastre para el Canvas 3D de Blender
        tarjeta.setAttribute('draggable', 'true');
        
        const tokenUnico = recurso.uuid || recurso.id;
        tarjeta.dataset.uuid = tokenUnico;
        
        tarjeta.innerHTML = `
            <div class="almacen-item-info">
                <span class="almacen-item-nombre" style="font-weight:bold; color:#ffd700;">${recurso.nombre}</span>
                <span class="almacen-item-cantidad" style="display:block; font-size:11px; color:#a89276;">Nivel: ${recurso.nivel || 1}</span>
            </div>
            <button class="btn-almacen-gestionar" style="cursor: grab; margin-top:5px; width:100%; padding:3px; font-size:10px;">
                🏗️ Arrastrar al Mapa
            </button>
        `;

        // 🚀 MANEJO DE EVENTOS DRAG & DROP CRUZADOS (DOM HACIA CANVAS THREE.JS)
        tarjeta.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', tokenUnico);
            e.dataTransfer.effectAllowed = 'copy';
            tarjeta.style.opacity = '0.4';
            tarjeta.style.borderStyle = 'dashed';
        });

        tarjeta.addEventListener('dragend', () => {
            tarjeta.style.opacity = '1';
            tarjeta.style.borderStyle = 'solid';
        });

        contenedorGrid.appendChild(tarjeta);
    });
}

/**
 * BLINDAJE AUTORITARIO: Envía una orden de consumo al servidor en lugar de restar localmente
 */
function solicitarConsumoRecurso(recursoId) {
    if (!recursoId) return;

    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('almacen:consumir-recurso', { recursoId: recursoId });
    } else {
        alert("❌ Error de comunicación: Sin conexión con el servidor del Imperio.");
    }
}

// ========================================================
// RECEPTORES DE RED DE SOCKET.IO (SINCRONIZACIÓN DE RECURSOS)
// ========================================================
if (typeof socket !== 'undefined' && socket) {

    socket.on('almacen:actualizar-estado', (payload) => {
        console.log("🗃️ Datos del Almacén validados por el servidor recibidos:", payload);
        
        // Mapeo adaptativo tolerante a las llaves enviadas por server.js
        datosAlmacen.recursos = payload.recursos || payload.almacenEdificiosDisponibles || [];
        renderizarAlmacen();
    });

    socket.on('almacen:error', (mensajeError) => {
        console.error("❌ Operación denegada en Almacén:", mensajeError);
        alert(`Acción inválida: ${mensajeError}`);
        cargarAlmacen(); 
    });
}

// public/js/almacen.js

// Estado reactivo global del Almacén (Sincronizado dinámicamente con MongoDB)
let datosAlmacen = {
recursos: [] // Estructura física real: [{ id: UUID, uuid: UUID, nombre: string, cantidad: number, rareza: string, nivel: number }]
};

/

Solicita los inventarios autorizados y actualizados directamente a las colecciones del servidor
*/
function cargarAlmacen() {
if (typeof socket !== 'undefined' && socket && socket.connected) {
console.log("🗄️ Solicitando estado del Almacén Imperial al Árbitro...");
socket.emit('almacen:solicitar-recursos');
}
}

/

Renderiza la interfaz gráfica del inventario inyectando las tarjetas estilizadas en la cuadrícula SPA correspondiente
*/
function renderizarAlmacen() {
let contenedorGrid = null;

// DETECCIÓN MULTI-PANTALLA EXCLUSIVA BASADA EN ELEMENTOS EXISTENTES EN EL DOM ACTIVO
const contenedorFinca = document.getElementById('finca-edificios-lista');
const contenedorAldea = document.getElementById('aldea-edificios-lista');
const gridAlmacenGeneral = document.getElementById('grid-almacen-recursos');

if (contenedorFinca) {
contenedorGrid = contenedorFinca;
} else if (contenedorAldea) {
contenedorGrid = contenedorAldea;
} else {
contenedorGrid = gridAlmacenGeneral;
}

if (!contenedorGrid) return;

contenedorGrid.innerHTML = '';

if (!datosAlmacen.recursos || datosAlmacen.recursos.length === 0) {
contenedorGrid.innerHTML = <div class="almacen-vacio-txt" style="color:#a89276; font-style:italic; padding:20px; text-align:center; width:100%; font-family:serif;">No tienes cartas de estructuras en tu inventario logístico.</div>;
return;
}

// Recorrer e inyectar cada tarjeta de recurso/edificio con el diseño visual dorado y unificado
datosAlmacen.recursos.forEach(recurso => {
const tarjeta = document.createElement('div');

 const rarezaLimpia = recurso.rareza ? recurso.rareza.toLowerCase().trim() : 'comun';

 // Estilos limpios y robustos idénticos al estándar visual del Mercado y Carretón
 tarjeta.className = `almacen-card borde-rareza-${rarezaLimpia}`;
 tarjeta.style.cssText = `
     background: #181412;
     border: 2px solid #d4af37;
     border-radius: 8px;
     padding: 10px;
     width: 140px;
     text-align: center;
     box-shadow: 0 4px 8px rgba(0,0,0,0.6);
     transition: transform 0.2s ease, box-shadow 0.2s ease;
     cursor: grab;
     display: inline-block;
     margin: 6px;
     vertical-align: top;
 `;

 tarjeta.setAttribute('draggable', 'true');

 const tokenUnico = recurso.uuid || recurso.id || (recurso._id ? recurso._id.toString() : null);
 tarjeta.dataset.uuid = tokenUnico;

 tarjeta.innerHTML = `
     <div style="background: #251f1c; height: 75px; border-radius: 4px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; border: 1px solid #3d3228;">
         <span style="font-size: 26px;">🏛️</span>
     </div>
     <div class="almacen-item-info">
         <span class="almacen-item-nombre" style="font-weight:bold; color:#ffd700; font-size: 12px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${recurso.nombre}">${recurso.nombre}</span>
         <span class="almacen-item-cantidad" style="display:block; font-size:11px; color:#a89276; margin-top: 2px;">Nivel: ${recurso.nivel || 1}</span>
     </div>
     <button class="btn-almacen-gestionar" style="background: #8b4513; color: #fff; border: 1px solid #d4af37; border-radius: 4px; cursor: grab; margin-top:8px; width:100%; padding:5px; font-size:10px; font-weight: bold;">
         🏗️ Arrastrar al Mapa
     </button>
 `;

 // MANEJO DE EVENTOS DRAG & DROP CRUZADOS (DOM HACIA CANVAS THREE.JS)
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

/

BLINDAJE AUTORITARIO: Envía una orden de consumo al servidor en lugar de restar localmente
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
    
    if (payload && payload.recursos) {
        datosAlmacen.recursos = payload.recursos;
    } else if (payload && payload.almacenEdificiosDisponibles) {
        datosAlmacen.recursos = payload.almacenEdificiosDisponibles;
    } else if (payload && Array.isArray(payload)) {
        datosAlmacen.recursos = payload;
    } else {
        datosAlmacen.recursos = [];
    }
    
    // Forzar redibujado de la interfaz de inmediato
    renderizarAlmacen();
});

socket.on('almacen:error', (mensajeError) => {
    console.error("❌ Operación denegada en Almacén:", mensajeError);
    alert(`Acción inválida: ${mensajeError}`);
    cargarAlmacen(); 
});
}

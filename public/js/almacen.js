// public/js/almacen.js

// Estado reactivo global del Almacén (Sincronizado dinámicamente con MongoDB)
let datosAlmacen = {
    recursos: [] // Estructura física real: [{ id: UUID, nombre: string, cantidad: number, rareza: string }]
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
 * Renderiza la interfaz gráfica del inventario inyectando los nodos en la cuadrícula SPA
 */
function renderizarAlmacen() {
    const contenedorGrid = document.getElementById('grid-almacen-recursos');
    if (!contenedorGrid) return;

    contenedorGrid.innerHTML = '';

    if (!datosAlmacen.recursos || datosAlmacen.recursos.length === 0) {
        contenedorGrid.innerHTML = `<div class="almacen-vacio-txt">Tu almacén imperial se encuentra vacío. Produce recursos en tus cimientos.</div>`;
        return;
    }

    // Recorrer e inyectar cada tarjeta de recurso de forma dinámica
    datosAlmacen.recursos.forEach(recurso => {
        const tarjeta = document.createElement('div');
        // Estandarización de estilos basada en las clases de rareza imperial de style.css
        tarjeta.className = `almacen-card borde-rareza-${recurso.rareza.toLowerCase().trim()}`;
        
        tarjeta.innerHTML = `
            <div class="almacen-item-info">
                <span class="almacen-item-nombre">${recurso.nombre}</span>
                <span class="almacen-item-cantidad">Cantidad: <strong>${recurso.cantidad}</strong> / 99</span>
            </div>
            <button class="btn-almacen-gestionar" onclick="solicitarConsumoRecurso('${recurso.id}')">
                ⚔️ Consumir (1)
            </button>
        `;
        contenedorGrid.appendChild(tarjeta);
    });
}

/**
 * BLINDAJE AUTORITARIO: Envía una orden de consumo al servidor en lugar de restar localmente
 * @param {string} recursoId - Identificador único UUID del recurso a descontar
 */
function solicitarConsumoRecurso(recursoId) {
    if (!recursoId) return;

    if (typeof socket !== 'undefined' && socket && socket.connected) {
        // Enviar la petición al "Árbitro" de Node.js
        socket.emit('almacen:consumir-recurso', { recursoId: recursoId });
    } else {
        alert("❌ Error de comunicación: Sin conexión con el servidor del Imperio.");
    }
}

// ========================================================
// RECEPTORES DE RED DE SOCKET.IO (SINCRONIZACIÓN DE RECURSOS)
// ========================================================
if (typeof socket !== 'undefined' && socket) {

    // Escuchar la carga autorizada del almacén desde MongoDB
    socket.on('almacen:actualizar-estado', (payload) => {
        console.log("🗃️ Datos del Almacén validados por el servidor recibidos:", payload);
        
        datosAlmacen.recursos = payload.recursos || [];
        renderizarAlmacen();
    });

    // Capturar bloqueos del servidor (ej. si intenta consumir más de lo que tiene o inputs nulos)
    socket.on('almacen:error', (mensajeError) => {
        console.error("❌ Operación denegada en Almacén:", mensajeError);
        alert(`Acción inválida: ${mensajeError}`);
        cargarAlmacen(); // Revertir interfaz al estado real de la base de datos
    });
}

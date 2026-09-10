// ==========================================================================
// public/js/almacen.js - Gestor de Almacén e Inventario Visual Imperial
// ==========================================================================

// Estado reactivo global del Almacén (Sincronizado dinámicamente con MongoDB)
let datosAlmacen = {
    recursos: [] // Estructura física real: [{ id: UUID, uuid: UUID, nombre: string, cantidad: number, rareza: string, nivel: number, estaAnidado: boolean }]
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
 * Renderiza la interfaz gráfica del inventario inyectando las tarjetas estilizadas en la cuadrícula SPA correspondiente
 */
function renderizarAlmacen() {
    const contenedorFinca = document.getElementById('finca-edificios-lista');
    const contenedorAldea = document.getElementById('aldea-edificios-lista');
    const gridAlmacenGeneral = document.getElementById('grid-almacen-recursos');

    // Lista de todos los contenedores posibles para limpiar fantasmagorías o duplicidades de render en vistas cruzadas
    const todosLosContenedores = [contenedorFinca, contenedorAldea, gridAlmacenGeneral];

    todosLosContenedores.forEach(cont => {
        if (cont) cont.innerHTML = '';
    });

    // ==========================================================================
    // 🎯 DETECCIÓN DE PANTALLA ULTRA-ESTRICTA BASADA EN VISIBILIDAD (SOLUCIONADO)
    // ==========================================================================
    const seccionFinca = document.getElementById('pantalla-finca');
    const seccionAldea = document.getElementById('pantalla-aldea');
    let contenedorGrid = null;

    // Leer los estilos computados reales de visualización
    const fincaEstiloReal = seccionFinca ? window.getComputedStyle(seccionFinca).display : 'none';
    const aldeaEstiloReal = seccionAldea ? window.getComputedStyle(seccionAldea).display : 'none';

    // Validar si la pantalla contenedora está realmente visible ante los ojos del usuario
    if (fincaEstiloReal === 'block' || (seccionFinca && seccionFinca.style.display === 'block')) {
        contenedorGrid = document.getElementById('finca-edificios-lista');
    } else if (aldeaEstiloReal === 'block' || (seccionAldea && seccionAldea.style.display === 'block')) {
        contenedorGrid = document.getElementById('aldea-edificios-lista');
    } else {
        contenedorGrid = document.getElementById('grid-almacen-recursos');
    }

    // Fallback de contingencia por si se ejecuta en medio de la transición asíncrona de main.js
    if (!contenedorGrid) {
        contenedorGrid = document.getElementById('finca-edificios-lista') || document.getElementById('grid-almacen-recursos');
    }

    if (!contenedorGrid) return;

    if (!datosAlmacen.recursos || datosAlmacen.recursos.length === 0) {
        contenedorGrid.innerHTML = '<div class="almacen-vacio-txt" style="color:#a89276; font-style:italic; padding:20px; text-align:center; width:100%; font-family:serif;">No tienes cartas de estructuras en tu inventario logístico.</div>';
        return;
    }

    // ==========================================================================
    // 🔥 FILTRADO IMPERIAL NORMALIZADO (TOLERANCIA CASE-INSENSITIVE + PARCHE MAESTRO)
    // ==========================================================================
    const cartasMostrables = datosAlmacen.recursos.filter(recurso => {
        // Regla 1: Descartar si el plano ya está físicamente anidado en el terreno 3D
        if (recurso.estaAnidado === true || recurso.estaAnidado === "true") return false;
        
        // Normalización case-insensitive de strings para evitar fallos tipo/subtipo
        const tipoLimpio = recurso.tipo ? recurso.tipo.toLowerCase().trim() : '';
        const subtipoLimpio = recurso.subtipo ? recurso.subtipo.toLowerCase().trim() : '';
        const nombreLimpio = recurso.nombre ? recurso.nombre.toLowerCase().trim() : '';

        // Regla 2: Si estamos en la pantalla de la Finca o de la Aldea, forzar la inclusión de estructuras normalizadas
        if (contenedorGrid.id === 'finca-edificios-lista' || contenedorGrid.id === 'aldea-edificios-lista') {
            return tipoLimpio === 'estructura' || 
                   subtipoLimpio === 'casona' || 
                   subtipoLimpio === 'granja' || 
                   subtipoLimpio === 'aserradero' ||
                   nombreLimpio.includes('casona') ||
                   nombreLimpio.includes('granja') ||
                   nombreLimpio.includes('aserradero') ||
                   !recurso.tipo; // ⚡ PARCHE MAESTRO: Permitir elementos huérfanos o sin tipado directo si están en la Finca
        }
        
        // Regla 3: Si estamos en el Almacén General, mostrar todo lo que no esté construido
        return true;
    });

    if (cartasMostrables.length === 0) {
        contenedorGrid.innerHTML = '<div class="almacen-vacio-txt" style="color:#a89276; font-style:italic; padding:20px; text-align:center; width:100%; font-family:serif;">No tienes cartas disponibles en este sector.</div>';
        return;
    }

    // Recorrer e inyectar cada tarjeta de recurso/edificio con el diseño visual dorado y unificado
    cartasMostrables.forEach(recurso => {
        const tarjeta = document.createElement('div');

        const rarezaLimpia = recurso.rareza ? recurso.rareza.toLowerCase().trim() : 'comun';

        // Estilos corregidos para evitar que Flexbox aplaste la tarjeta a 0px (SOLUCIONADO COLISEO)
        tarjeta.className = `almacen-card borde-rareza-${rarezaLimpia}`;
        tarjeta.style.cssText = `
            background: #181412;
            border: 2px solid #d4af37;
            border-radius: 8px;
            padding: 10px;
            width: 140px;
            min-width: 140px; /* 🔥 Fuerza a que Flexbox respete los 140px */
            text-align: center;
            box-shadow: 0 4px 8px rgba(0,0,0,0.6);
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            cursor: grab;
            display: block; /* 🔥 Cambiado de inline-block a block para compatibilidad flex */
            margin: 6px;
            flex-shrink: 0; /* 🔥 Impide que el contenedor reduzca la escala del plano */
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

// ==========================================================================
// 🛡️ RECEPTOR OMNICANAL DE FUERZA BRUTA VISUAL (SOLUCIONADO DEFINITIVO)
// ==========================================================================
if (typeof socket !== 'undefined' && socket) {
    socket.on('almacen:actualizar-estado', (payload) => {
        console.log("🗃️ Datos del Almacén Imperial recibidos en crudo:", payload);
        
        let poolCartas = [];

        // 🎯 UNIFICACIÓN AGRESIVA: Extraer y amalgamar todas las fuentes de datos posibles en un array plano
        if (payload) {
            if (Array.isArray(payload)) {
                poolCartas = payload;
            } else {
                if (payload.almacenEdificiosDisponibles && Array.isArray(payload.almacenEdificiosDisponibles)) {
                    poolCartas = poolCartas.concat(payload.almacenEdificiosDisponibles);
                }
                if (payload.recursos && Array.isArray(payload.recursos)) {
                    // Evitar duplicaciones de objetos que compartan el mismo UUID exacto
                    payload.recursos.forEach(rec => {
                        if (!poolCartas.some(p => (p.uuid === rec.uuid || p.id === rec.id))) {
                            poolCartas.push(rec);
                        }
                    });
                }
                if (payload.cartas && Array.isArray(payload.cartas)) {
                    payload.cartas.forEach(car => {
                        if (!poolCartas.some(p => (p.uuid === car.uuid || p.id === car.id))) {
                            poolCartas.push(car);
                        }
                    });
                }
            }
        }

        // Asignar el pool unificado libre de fugas asíncronas
        // 🔥 REPARACIÓN EN CALIENTE: Forzar propiedades de tipado para subdocumentos de Mongoose y evitar omisiones por nomenclatura
        datosAlmacen.recursos = poolCartas.map(recurso => {
            const subtipoStr = recurso.subtipo ? recurso.subtipo.toLowerCase().trim() : '';
            const nombreStr = recurso.nombre ? recurso.nombre.toLowerCase().trim() : '';
            
            if (subtipoStr === 'casona' || subtipoStr === 'granja' || subtipoStr === 'aserradero' || 
                nombreStr.includes('casona') || nombreStr.includes('granja') || nombreStr.includes('aserradero')) {
                recurso.tipo = 'estructura';
            }
            return recurso;
        });

        // Forzar redibujado geométrico inmediato en la barra inferior activa de la SPA
        renderizarAlmacen();
    });

    socket.on('almacen:error', (mensajeError) => {
        console.error("❌ Operación denegada en Almacén:", mensajeError);
        alert(`Acción inválida: ${mensajeError}`);
        cargarAlmacen(); 
    });
}

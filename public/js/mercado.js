// public/js/mercado.js

// Estado global de los filtros del mercado activo en memoria (Estructura lógica estricta)
let filtroMercado = {
    modo: 'tienda', // 'tienda' (AMM del sistema) o 'p2p' (Venta entre jugadores)
    rubro: 'edificios', // 'edificios', 'aldeanos', 'equipamiento'
    rareza: 'todas'
};

// Control de fugas de memoria RAM para Three.js
let animacionesCartasActivas = [];

/**
 * Escuchador de Socket: Recibe el escaparate comercial desde el servidor y redibuja la vitrina
 */
if (typeof socket !== 'undefined' && socket) {
    socket.on('tienda:recibir-stock', (stockServidor) => {
        console.log("🏪 Vitrina autorizada por el Árbitro recibida:", stockServidor);
        renderizarCatalogoMercado(stockServidor);
    });

    socket.on('tienda:compra-exitosa', (data) => {
        alert("🏛️ Transacción autorizada: ¡Carta añadida a tu inventario logístico!");
        
        // Actualizar el saldo en caliente en todas las barras imperiales del juego
        const idsBalances = ['menu-player-balance', 'carreton-player-balance', 'mercado-player-balance'];
        idsBalances.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = parseFloat(data.nuevoBalance || 0).toFixed(2);
        });

        // Sincronizar memoria volátil financiera
        if (typeof datosFinanzas !== 'undefined') {
            datosFinanzas.saldoDisponible = parseFloat(data.nuevoBalance || 0);
        }
    });

    socket.on('tienda:error', (mensaje) => {
        alert(`❌ Operación comercial rechazada: ${mensaje}`);
    });
}

/**
 * Filtra y renderiza los nodos en la cuadrícula comercial SPA
 */
function renderizarCatalogoMercado(stock) {
    const gridCartas = document.getElementById('grid-cartas-3d');
    if (!gridCartas) return;

    // 1. Matar hilos de animación anteriores para liberar la GPU
    animacionesCartasActivas.forEach(idAnim => cancelAnimationFrame(idAnim));
    animacionesCartasActivas = [];
    gridCartas.innerHTML = '';

    // Forzar la actualización visual del balance del Mercado tomando el del Menú Principal
    const balanceRealNode = document.getElementById('menu-player-balance');
    const balanceMercadoNode = document.getElementById('mercado-player-balance');
    if (balanceRealNode && balanceMercadoNode) {
        balanceMercadoNode.textContent = balanceRealNode.textContent;
    }

    // 2. Extraer el catálogo según el rubro seleccionado
    const rubroActivo = filtroMercado.rubro;
    const catalogoFiltrado = stock[rubroActivo] || [];

    if (catalogoFiltrado.length === 0) {
        gridCartas.innerHTML = `<p class="market-empty-msg">No hay cartas disponibles en esta sección del Imperio.</p>`;
        return;
    }

    // 3. Iterar y renderizar aplicando discriminadores de tipo
    catalogoFiltrado.forEach(item => {
        const tipoLimpio = item.tipo.toLowerCase().trim();
        const rubroLimpio = rubroActivo.toLowerCase().trim();
        
        const mapeaCorrecto = (tipoLimpio === rubroLimpio) || (tipoLimpio === 'personaje' && rubroLimpio === 'aldeanos');
        if (!mapeaCorrecto) return;

        // Filtro estricto por rarezas
        if (filtroMercado.rareza !== 'todas' && item.rareza.toLowerCase().trim() !== filtroMercado.rareza.toLowerCase().trim()) {
            return;
        }

        const cardBox = document.createElement('div');
        cardBox.className = `carta-mercado-3d-box borde-rareza-${item.rareza.toLowerCase().trim()}`;
        const canvasId = `canvas-item-${item.tiendaItemId}`;

        cardBox.innerHTML = `
            <div class="canvas-carta-container" id="${canvasId}" style="width: 100%; height: 180px; background: #000; border-radius: 8px;"></div>
            <div class="info-carta-mercado">
                <h3 class="nombre-item-mercado">${item.nombre}</h3>
                <p class="precio-item-mercado">💰 ${parseFloat(item.precio).toFixed(2)} Monedas</p>
                <button class="btn-comprar-market" onclick="window.ejecutarCompraCarta('${item.tiendaItemId}', '${rubroActivo}')">
                    🛡️ Adquirir Carta
                </button>
            </div>
        `;

        gridCartas.appendChild(cardBox);

        setTimeout(() => {
            if (typeof construirMiniEscena3D === 'function') {
                construirMiniEscena3D(canvasId, item.subtipo);
            }
        }, 20);
    });
}
// ==========================================================================
// EXPOSICIÓN ESTRICTA AL ENTORNO GLOBAL WINDOW (EVITA ERRORES ONCLICK)
// ==========================================================================

/**
 * Conmutador de pestañas de modo comercial (Mercado General vs Ubicar Aldeas)
 */
window.cambiarModoMercado = function(modo) {
    console.log(`🔄 Conmutando modo de mercado a: ${modo}`);
    
    // Cambiar clases activas en los botones de pestañas superiores
    document.querySelectorAll('.tab-market').forEach(btn => btn.classList.remove('active'));
    
    const panelAldeas = document.getElementById('subpantalla-buscador-aldeas');
    const panelProductos = document.getElementById('subpantalla-filtros-productos');

    if (modo === 'general') {
        const btnGen = document.getElementById('btn-mercado-general');
        if (btnGen) btnGen.classList.add('active');
        if (panelAldeas) panelAldeas.style.display = 'none';
        if (panelProductos) panelProductos.style.display = 'block';
        filtroMercado.modo = 'tienda';
    } else {
        const btnInt = document.getElementById('btn-mercado-interno');
        if (btnInt) btnInt.classList.add('active');
        if (panelAldeas) panelAldeas.style.display = 'block';
        if (panelProductos) panelProductos.style.display = 'none';
        filtroMercado.modo = 'p2p';
    }
};

/**
 * Conmutador de rubros comerciales (Edificios, Aldeanos, Equipamiento...)
 */
window.cambiarRubroMercado = function(elementoBtn, nuevoRubro) {
    console.log(`🏷️ Cambiando rubro comercial a: ${nuevoRubro}`);
    document.querySelectorAll('.btn-filter-rubro').forEach(btn => btn.classList.remove('active'));
    if (elementoBtn) elementoBtn.classList.add('active');

    filtroMercado.rubro = nuevoRubro;
    
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('tienda:solicitar-stock');
    }
};

/**
 * Conmutador reactivo de filtros de rarezas
 */
window.cambiarRareza = function(nuevaRareza) {
    console.log(`💎 Filtrando vitrina por rareza: ${nuevaRareza}`);
    
    // Cambiar clase activa visualmente en la fila de rarezas
    document.querySelectorAll('.btn-filter-rareza').forEach(btn => btn.classList.remove('active'));
    
    // CORRECCIÓN DE SELECTOR: Mapeo exacto para encender el brillo CSS sin importar herencias
    const selectorClase = nuevaRareza === 'todas' ? '.grid-rarezas button:first-child' : `.rareza-${nuevaRareza}`;
    const btnActivo = document.querySelector(selectorClase);
    if (btnActivo) btnActivo.classList.add('active');

    filtroMercado.rareza = nuevaRareza;
    
    // Forzar redibujado local mediante la solicitud del stock filtrado al Árbitro
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('tienda:solicitar-stock');
    }
};

/**
 * Envía la orden de compra segura hacia los sockets de Render
 */
window.ejecutarCompraCarta = function(itemId, rubro) {
    if (!itemId || !rubro) return;
    
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        console.log(`💸 Emitiendo compra de item ${itemId} en rubro ${rubro}...`);
        socket.emit('tienda:comprar-carta', { itemId, rubro });
    } else {
        alert("❌ Error de comunicación: Sin conexión con el Árbitro del servidor.");
    }
};

/**
 * Motor gráfico miniatura encargado de renderizar las cartas 3D de Blender
 */
function construirMiniEscena3D(canvasId, subtipo) {
    const contenedor = document.getElementById(canvasId);
    if (!contenedor || contenedor.clientWidth === 0) return;

    const escenaMini = new THREE.Scene();
    escenaMini.background = new THREE.Color(0x0a0a0f);

    const camaraMini = new THREE.PerspectiveCamera(45, contenedor.clientWidth / contenedor.clientHeight, 0.01, 10);
    camaraMini.position.set(0, 0, 0.2);

    const renderMini = new THREE.WebGLRenderer({ antialias: true });
    renderMini.setSize(contenedor.clientWidth, contenedor.clientHeight);
    contenedor.appendChild(renderMini.domElement);

    const luzMini = new THREE.AmbientLight(0xffffff, 0.85);
    escenaMini.add(luzMini);

    const geometry = new THREE.BoxGeometry(0.06, 0.08, 0.005);
    let colorTarjeta = 0x5c4033; // Madera base
    if (subtipo.includes('minero')) colorTarjeta = 0x1e3e66; // Azul minero
    if (subtipo.includes('espada')) colorTarjeta = 0x8b0000;  // Rojo guerrero

    const material = new THREE.MeshStandardMaterial({ color: colorTarjeta, roughness: 0.3 });
    const mallaCarta = new THREE.Mesh(geometry, material);
    escenaMini.add(mallaCarta);

    function animarCarta() {
        if (!document.getElementById(canvasId)) return; 
        const idAnim = requestAnimationFrame(animarCarta);
        animacionesCartasActivas.push(idAnim);

        mallaCarta.rotation.y += 0.015;
        renderMini.render(escenaMini, camaraMini);
    }
    animarCarta();
}

// ==========================================================================
// DISPARADOR DE SINCRONIZACIÓN INICIAL AL CARGAR EL SCRIPT
// ==========================================================================
if (typeof socket !== 'undefined' && socket) {
    if (socket.connected) {
        console.log("⚡ Túnel activo: Solicitando stock inicial al Árbitro...");
        socket.emit('tienda:solicitar-stock');
    } else {
        socket.on('connect', () => {
            console.log("⚡ Conexión establecida: Sincronizando vitrina del mercado...");
            socket.emit('tienda:solicitar-stock');
        });
    }
}


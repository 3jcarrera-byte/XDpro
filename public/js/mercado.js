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
        
        // Actualizar el saldo en caliente en las barras imperiales
        const idsBalances = ['menu-player-balance', 'carreton-player-balance', 'mercado-player-balance'];
        idsBalances.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = parseFloat(data.nuevoBalance || 0).toFixed(2);
        });

        // Actualizar memoria volátil financiera
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
 * @param {Object} stock - Payload de inventarios de la tienda del sistema
 */
function renderizarCatalogoMercado(stock) {
    const gridCartas = document.getElementById('grid-cartas-3d');
    if (!gridCartas) return;

    // 1. Matar hilos de animación anteriores para liberar la GPU
    animacionesCartasActivas.forEach(idAnim => cancelAnimationFrame(idAnim));
    animacionesCartasActivas = [];
    gridCartas.innerHTML = '';

    // Sincronizar fondos visuales inyectando el valor actual del menú principal si hiciera falta
    inyectarBarraFondosMercado();

    // 2. Extraer el catálogo según el rubro seleccionado ('edificios', 'aldeanos', 'equipamiento')
    const rubroActivo = filtroMercado.rubro;
    const catalogoFiltrado = stock[rubroActivo] || [];

    if (catalogoFiltrado.length === 0) {
        gridCartas.innerHTML = `<p class="market-empty-msg">No hay cartas disponibles en esta sección del Imperio.</p>`;
        return;
    }

    // 3. Iterar y renderizar de forma segura aplicando discriminadores de tipo
    catalogoFiltrado.forEach(item => {
        // CORRECCIÓN BARRACÓN DUPLICADO: Validar estrictamente que el item pertenezca al tipo filtrado
        const tipoLimpio = item.tipo.toLowerCase().trim();
        const rubroLimpio = rubroActivo.toLowerCase().trim();
        
        // Parche de compatibilidad por si el backend usa 'aldeanos' y la carta dice 'personaje'
        const mapeaCorrecto = (tipoLimpio === rubroLimpio) || (tipoLimpio === 'personaje' && rubroLimpio === 'aldeanos');
        if (!mapeaCorrecto) return;

        // Validar filtro secundario de rarezas
        if (filtroMercado.rareza !== 'todas' && item.rareza.toLowerCase().trim() !== filtroMercado.rareza.toLowerCase().trim()) {
            return;
        }

        const cardBox = document.createElement('div');
        cardBox.className = `carta-mercado-3d-box borde-rareza-${item.rareza.toLowerCase().trim()}`;

        // Contenedor del canvas con ID único por UUID para inyección de Three.js
        const canvasId = `canvas-item-${item.tiendaItemId}`;

        cardBox.innerHTML = `
            <div class="canvas-carta-container" id="${canvasId}" style="width: 100%; height: 180px; background: #000; border-radius: 8px;"></div>
            <div class="info-carta-mercado">
                <h3 class="nombre-item-mercado">${item.nombre}</h3>
                <p class="precio-item-mercado">💰 ${parseFloat(item.precio).toFixed(2)} Monedas</p>
                <!-- CORRECCIÓN BOTÓN: Sincronizado exactamente con la función autoritaria ejecutarCompra -->
                <button class="btn-comprar-market" onclick="ejecutarCompraCarta('${item.tiendaItemId}', '${rubroActivo}')">
                    🛡️ Adquirir Carta
                </button>
            </div>
        `;

        gridCartas.appendChild(cardBox);

        // 🚀 DISPARADOR GRÁFICO 3D: Construir la mini-escena en cuanto el contenedor está vivo en el DOM
        setTimeout(() => {
            construirMiniEscena3D(canvasId, item.subtipo);
        }, 20);
    });
}

/**
 * Emana la orden de compra autoritaria hacia los sockets del servidor
 */
function ejecutarCompraCarta(itemId, rubro) {
    if (!itemId || !rubro) return;
    
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        console.log(`💸 Solicitando compra de item ${itemId} en rubro ${rubro}...`);
        socket.emit('tienda:comprar-carta', { itemId, rubro });
    } else {
        alert("❌ Error logístico: Sin conexión con el Árbitro del servidor.");
    }
}

/**
 * Conmutador de filtros superiores del mercado
 */
window.cambiarRubroMercado = function(elementoBtn, nuevoRubro) {
    // Remover clases activas de los botones de la barra
    document.querySelectorAll('.btn-filter-rubro').forEach(btn => btn.classList.remove('active'));
    elementoBtn.classList.add('active');

    filtroMercado.rubro = nuevoRubro;
    
    // Solicitar de nuevo los datos limpios al servidor para redibujar
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('tienda:solicitar-stock');
    }
};

/**
 * Parche visual para garantizar la visualización de saldos en la cabecera del mercado
 */
function inyectarBarraFondosMercado() {
    let indicadorSaldo = document.getElementById('mercado-player-balance');
    if (!indicadorSaldo) {
        const contenedorMercado = document.getElementById('pantalla-mercado');
        const barraPrincipal = document.querySelector('.player-top-bar');
        
        if (contenedorMercado && barraPrincipal && !contenedorMercado.querySelector('.player-top-bar')) {
            // Clonar la barra superior de fondos de forma limpia al inicio del mercado
            const barraClonada = barraPrincipal.cloneNode(true);
            // Re-asignar ID para evitar colisiones lógicas
            const saldoClonado = barraClonada.querySelector('#menu-player-balance');
            if (saldoClonado) saldoClonado.id = 'mercado-player-balance';
            
            contenedorMercado.insertBefore(barraClonada, contenedorMercado.firstChild);
        }
    }
}

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

    // Iluminación de vitrina
    const luzMini = new THREE.AmbientLight(0xffffff, 0.8);
    escenaMini.add(luzMini);

    // Geometría representativa temporal (Reemplazar por tus mallas GLB de Blender en el futuro)
    const geometry = new THREE.BoxGeometry(0.06, 0.08, 0.005);
    let colorTarjeta = 0x5c4033; // Por defecto madera
    if (subtipo.includes('minero')) colorTarjeta = 0x1e3e66; // Azul minero
    if (subtipo.includes('espada')) colorTarjeta = 0x8b0000;  // Rojo guerrero

    const material = new THREE.MeshStandardMaterial({ color: colorTarjeta, roughness: 0.3 });
    const mallaCarta = new THREE.Mesh(geometry, material);
    escenaMini.add(mallaCarta);

    // Ciclo de animación local rotativo de la carta
    function animarCarta() {
        const idAnim = requestAnimationFrame(animarCarta);
        animacionesCartasActivas.push(idAnim);

        mallaCarta.rotation.y += 0.015;
        renderMini.render(escenaMini, camaraMini);
    }
    animarCarta();
}
// ==========================================================================
// DISPARADOR DE EMERGENCIA: CARGA AUTORITARIA AL DETECTAR ENTRADA EN TIENDA
// ==========================================================================
function inicializarEscuchadoresMercadoLocales() {
    // Si el socket se conecta o ya está conectado, pedir el stock real a MongoDB de inmediato
    if (typeof socket !== 'undefined' && socket) {
        if (socket.connected) {
            console.log("🏪 Conexión activa: Forzando sincronización de stock con el Árbitro...");
            socket.emit('tienda:solicitar-stock');
        } else {
            socket.on('connect', () => {
                console.log("⚡ Sockets restablecidos: Cargando vitrina imperial...");
                socket.emit('tienda:solicitar-stock');
            });
        }
    }
}

// Ejecutar la comprobación de red al cargar el script en el navegador
inicializarEscuchadoresMercadoLocales();

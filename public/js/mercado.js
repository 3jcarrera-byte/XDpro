// public/js/mercado.js

// Estado global de los filtros del mercado activo en memoria
let filtroMercado = {
    modo: 'general',       // 'general' o 'interno'
    rubro: 'edificios',    // 'edificios', 'aldeanos', 'equipamiento', 'recursos', 'especiales'
    subrubro: 'todos',     // 'todos', 'armas', 'escudos', 'joyas', 'armadura'
    rareza: 'todas'        // 'todas', 'comun', 'poco-comun', 'raro', etc.
};

// Arreglo global para almacenar los identificadores de animación de Three.js y liberar memoria RAM
let animacionesCartasActivas = [];

// Base de Datos de prueba con los ítems y sus respectivos archivos de Blender (.glb)
const baseDatosItems3D = [
    { id: 1, nombre: "Barracón del Imperio", rubro: "edificios", subrubro: "todos", rareza: "comun", precio: 45.00, archivo: "barracas.glb" },
    { id: 2, nombre: "Herrero Real", rubro: "aldeanos", subrubro: "todos", rareza: "poco-comun", precio: 12.50, archivo: "herrero.glb" },
    { id: 3, nombre: "Gladius de Acero", rubro: "equipamiento", subrubro: "armas", rareza: "raro", precio: 25.00, archivo: "gladius.glb" },
    { id: 4, nombre: "Escudo Centurión", rubro: "equipamiento", subrubro: "escudos", rareza: "muy-raro", precio: 60.00, archivo: "escudo_centurion.glb" },
    { id: 5, nombre: "Amuleto de Marte", rubro: "equipamiento", subrubro: "joyas", rareza: "mitico", precio: 150.00, archivo: "amuleto_marte.glb" },
    { id: 6, nombre: "Armadura Pretoriana", rubro: "equipamiento", subrubro: "armadura", rareza: "legendario", precio: 350.00, archivo: "armadura_pretoriana.glb" }
];

// 1. Conmutador principal: Mercado General vs Búsqueda de Aldeas
function cambiarModoMercado(modoSeleccionado) {
    filtroMercado.modo = modoSeleccionado;
    
    // UI de las pestañas superiores
    document.getElementById('btn-mercado-general').classList.toggle('active', modoSeleccionado === 'general');
    document.getElementById('btn-mercado-interno').classList.toggle('active', modoSeleccionado === 'interno');
    
    // Contenedores de sub-pantallas
    const panelBuscador = document.getElementById('subpantalla-buscador-aldeas');
    const panelProductos = document.getElementById('subpantalla-filtros-productos');
    
    if (modoSeleccionado === 'interno') {
        if (panelBuscador) panelBuscador.style.display = 'block';
        if (panelProductos) panelProductos.style.display = 'none'; 
    } else {
        if (panelBuscador) panelBuscador.style.display = 'none';
        if (panelProductos) panelProductos.style.display = 'block';
        
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            socket.emit('tienda:solicitar-stock');
        } else {
            refrescarCatalogoMercado();
        }
    }
}

// 2. Controlador de Rubros (Limpia las clases duplicadas de forma estricta)
function cambiarRubro(rubroSeleccionado) {
    filtroMercado.rubro = rubroSeleccionado;
    
    // 1. Limpiar el estado de TODOS los botones de rubros eliminando la clase active
    const botones = document.querySelectorAll('.btn-filter-rubro');
    botones.forEach(btn => btn.classList.remove('active'));

    // 2. Buscar únicamente el botón al que se le hizo clic y encenderlo
    // Filtramos buscando exactamente cuál botón tiene el string del rubro en su atributo onclick
    const botonActivo = Array.from(botones).find(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        return onclickAttr.includes(`'${rubroSeleccionado}'`);
    });
    
    if (botonActivo) {
        botonActivo.classList.add('active');
    }

    // Control de la caja de sub-rubros de equipamiento
    const cajaSubRubros = document.getElementById('grupo-subfiltro-equipamiento');
    if (cajaSubRubros) {
        cajaSubRubros.style.display = (rubroSeleccionado === 'equipamiento') ? 'flex' : 'none';
        if (rubroSeleccionado !== 'equipamiento') filtroMercado.subrubro = 'todos';
    }

    // Solicitar el stock limpio al Árbitro en tiempo real
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('tienda:solicitar-stock');
    } else {
        refrescarCatalogoMercado();
    }
}
// 3. Controlador de Sub-Rubros para el Equipamiento
function cambiarSubRubro(subrubroSeleccionado) {
    filtroMercado.subrubro = subrubroSeleccionado;
    
    const botones = document.querySelectorAll('.btn-filter-subrubro');
    botones.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        btn.classList.toggle('active', onclickAttr.includes(`'${subrubroSeleccionado}'`));
    });
}

// 4. Controlador de Rarezas
function cambiarRareza(rarezaSeleccionada) {
    filtroMercado.rareza = rarezaSeleccionada;
    
    const botones = document.querySelectorAll('.btn-filter-rareza');
    botones.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        btn.classList.toggle('active', onclickAttr.includes(`'${rarezaSeleccionada}'`));
    });

    refrescarCatalogoMercado();
}

// 5. Simulación de búsqueda de Aldeas locales
function ejecutarBusquedaAldea() {
    const input = document.getElementById('input-buscar-aldea').value.trim();
    if (!input) {
        alert('Por favor introduce un nombre o ID de aldea válido.');
        return;
    }
    
    const resultadoContenedor = document.getElementById('lista-aldeas-resultado');
    resultadoContenedor.innerHTML = `
        <div class="village-search-card" style="background:#221a15; border:1px solid #d4af37; padding:15px; border-radius:8px; margin-top:15px; display:flex; justify-content:space-between; align-items:center; width:100%;">
            <div>
                <h4 style="color:#ffd700;">🏘️ Aldea: ${input}</h4>
                <p style="color:#888; font-size:12px;">Propietario: Gladiador_Pro</p>
            </div>
            <button class="btn-sidebar" onclick="entrarMercadoInternoAldea('${input}')" style="width:auto; padding:8px 15px;">Entrar a su Mercado</button>
        </div>
    `;
}

function entrarMercadoInternoAldea(nombreAldea) {
    document.getElementById('subpantalla-buscador-aldeas').style.display = 'none';
    document.getElementById('subpantalla-filtros-productos').style.display = 'block';
    console.log(`Operando en el mercado local de la aldea: ${nombreAldea}`);
    refrescarCatalogoMercado();
}

// 6. RENDERIZADOR 3D AVANZADO: Filtra y dibuja el escaparate
function refrescarCatalogoMercado() {
    const grid = document.getElementById('grid-cartas-3d');
    if (!grid) return;

    animacionesCartasActivas.forEach(idAnim => cancelAnimationFrame(idAnim));
    animacionesCartasActivas = [];
    grid.innerHTML = '';

    // CORRECCIÓN DE BÚSQUEDA: Comparación insensible a mayúsculas (.toLowerCase())
    const itemsFiltrados = baseDatosItems3D.filter(item => {
        const coincideRubro = item.rubro === filtroMercado.rubro;
        const coincideSubRubro = filtroMercado.rubro !== 'equipamiento' || filtroMercado.subrubro === 'todos' || item.subrubro === filtroMercado.subrubro;
        
        const rarezaItemLimpia = (item.rareza || '').toLowerCase();
        const coincideRareza = filtroMercado.rareza === 'todas' || rarezaItemLimpia === filtroMercado.rareza.toLowerCase();
        
        return coincideRubro && coincideSubRubro && coincideRareza;
    });

    if (itemsFiltrados.length === 0) {
        grid.innerHTML = `<div class="market-empty-msg" style="grid-column: 1/-1; padding: 40px; text-align:center; color:#888;">No hay cartas tridimensionales con esta rareza a la venta.</div>`;
        return;
    }

    itemsFiltrados.forEach(item => {
        const cardBox = document.createElement('div');
        cardBox.className = `carta-mercado-3d-box borde-rareza-${item.rareza.toLowerCase()}`;

        const containerId = `canvas-container-item-${item.id}`;

        cardBox.innerHTML = `
            <div id="${containerId}" class="canvas-carta-container"></div>
            <div class="info-carta-mercado">
                <div class="nombre-item-mercado">${item.nombre}</div>
                <div class="precio-item-mercado">🪙 ${item.precio.toFixed(2)}</div>
                <button class="btn-comprar-market" onclick="procesarCompraItem('${item.id}')">Adquirir Objeto</button>
            </div>
        `;

        grid.appendChild(cardBox);
        construirMiniEscena3D(containerId, item.archivo, item.rareza.toLowerCase());
    });
}

// 7. Mini motor de renderizado individual por ranura
function construirMiniEscena3D(containerId, nombreArchivoGLB, rareza) {
    const contenedor = document.getElementById(containerId);
    if (!contenedor) return;

    const escena = new THREE.Scene();
    escena.background = new THREE.Color('#050507');

    const camara = new THREE.PerspectiveCamera(45, contenedor.clientWidth / contenedor.clientHeight, 0.1, 100);
    camara.position.set(0, 0, 3.2);

    const render = new THREE.WebGLRenderer({ antialias: true });
    render.setSize(contenedor.clientWidth, contenedor.clientHeight);
    render.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    contenedor.appendChild(render.domElement);

    escena.add(new THREE.AmbientLight(0xffffff, 0.6));
    const luzDireccional = new THREE.DirectionalLight(0xffffff, 1.2);
    luzDireccional.position.set(3, 4, 5);
    escena.add(luzDireccional);

    // CORRECCIÓN DE SINTAXIS: Prefijo 0x para colores hexadecimales de Three.js
    let colorAura = 0xffffff;
    if (rareza === 'legendario') colorAura = 0xffd700;
    if (rareza === 'mitico') colorAura = 0xe91e63;
    if (rareza === 'epico') colorAura = 0xff9800;
    if (rareza === 'raro') colorAura = 0x2196f3;

    const luzAura = new THREE.PointLight(colorAura, 1.8, 8);
    luzAura.position.set(0, 0, -1);
    escena.add(luzAura);

    let modeloMalla = null;

    if (typeof THREE.GLTFLoader !== 'undefined') {
        const loader = new THREE.GLTFLoader();
        loader.load(
            `/models3d/${nombreArchivoGLB}`,
            (gltf) => {
                modeloMalla = gltf.scene;
                const box = new THREE.Box3().setFromObject(modeloMalla);
                const center = box.getCenter(new THREE.Vector3());
                modeloMalla.position.x += (modeloMalla.position.x - center.x);
                modeloMalla.position.y += (modeloMalla.position.y - center.y);
                modeloMalla.position.z += (modeloMalla.position.z - center.z);
                escena.add(modeloMalla);
            },
            undefined,() => { cargarMallaRespaldo(escena, rareza, (malla) => { modeloMalla = malla; }); });} else {cargarMallaRespaldo(escena, rareza, (malla) => { modeloMalla = malla; });}function animarMiniCarta() {const idAnimacion = requestAnimationFrame(animarMiniCarta);animacionesCartasActivas.push(idAnimacion);if (modeloMalla) {modeloMalla.rotation.y += 0.015;}render.render(escena, camara);}animarMiniCarta();}function cargarMallaRespaldo(escena, rareza, callback) {let colorMaterial = 0x555555;if (rareza === 'legendario') colorMaterial = 0xffd700;if (rareza === 'epico') colorMaterial = 0xff9800;if (rareza === 'raro') colorMaterial = 0x2196f3;const geometria = new THREE.TorusKnotGeometry(0.38, 0.12, 64, 8);const material = new THREE.MeshStandardMaterial({color: colorMaterial,metalness: 0.8,roughness: 0.2});const malla = new THREE.Mesh(geometria, material);escena.add(malla);callback(malla);}// 8. Procesador de Compras conectado al Árbitrofunction procesarCompraItem(idItem) {console.log(Enviando evento de compra al árbitro para el ítem: ${idItem});if (typeof socket !== 'undefined' && socket && socket.connected) {socket.emit('tienda:comprar-carta', {itemId: idItem,rubro: filtroMercado.rubro});}}// ========================================================// ESCUCHADORES DE SOCKETS PARA TRANSACCIONES REALES ANTI-FRAUDE// ========================================================if (typeof socket !== 'undefined' && socket) {socket.on('connect', () => {socket.emit('tienda:solicitar-stock');});socket.on('tienda:recibir-stock', (stockServidor) => {console.log("Vitrina autorizada por el Árbitro recibida:", stockServidor);const rubroActual = filtroMercado.rubro;if (stockServidor[rubroActual]) {baseDatosItems3D.length = 0;stockServidor[rubroActual].forEach((item, index) => {baseDatosItems3D.push({id: item.tiendaItemId,nombre: item.nombre,rubro: rubroActual,subrubro: 'todos',rareza: item.rareza,precio: item.precio,archivo: rubroActual === 'edificios' ? (index % 2 === 0 ? "barracas.glb" : "aserradero.glb") : "gladius.glb"});});refrescarCatalogoMercado();}});socket.on('tienda:compra-exitosa', (data) => {alert(¡Transacción confirmada por el Árbitro! Nueva carta añadida a tu inventario. Balance: 🪙 ${data.newBalance || data.nuevoBalance});const txtBalance = document.getElementById('menu-player-balance');if (txtBalance) txtBalance.textContent = parseFloat(data.newBalance || data.nuevoBalance || 0).toFixed(2);});socket.on('tienda:error', (mensaje) => {alert(❌ Transacción Denegada: ${mensaje});});}

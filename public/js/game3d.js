// public/js/game3d.js

// ==========================================================================
// 1. ESTRUCTURA GLOBAL Y OPTIMIZACIÓN DE GPU PARA EL MOTOR TRIDIMENSIONAL
// ==========================================================================

// Bandera global conectada de forma directa con el ruteo SPA de main.js
window.estadoMotor3D = {
    activo: false,
    maxCimientosActivos: 8 // Fallback seguro de slots iniciales
};

// Variables de control de las instancias 3D
let scene, camera, renderer;
let cimientos = [];
let raycaster, mouse;

/**
 * Inicializa el entorno gráfico 3D dentro de un contenedor HTML específico
 * @param {string} containerId - ID del elemento div contenedor
 * @param {number} maxCimientos - Cantidad de cimientos a generar (16 para Aldea, 8 para Finca)
 */
function init3D(containerId, maxCimientos) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Limpieza preventiva total del contenedor para mitigar canvas duplicados
    container.innerHTML = '';
    cimientos = [];
    window.estadoMotor3D.maxCimientosActivos = maxCimientos;

    // 2. Creación y configuración de la Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120c09); // Fondo terráqueo imperial oscuro

    // 3. Configuración de la Cámara Perspectiva
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
    camera.position.set(0, 14, 18);
    camera.lookAt(0, 0, 0);

    // 4. Configuración del Renderizador WebGL con perfil de alto rendimiento
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // 5. Configuración de Sistemas de Iluminación Calibrada
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff2e6, 0.95);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 6. Terreno / Rejilla Base de Construcción Estética
    const gridHelper = new THREE.GridHelper(24, 24, 0xd4af37, 0x2c2c35);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // 7. Configuración de Raycaster para detectar clics en los cimientos
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Remover escuchadores anteriores para evitar fugas de memoria RAM
    container.removeEventListener('click', onCanvasClick);
    container.addEventListener('click', onCanvasClick);

    // 8. Distribución y renderizado de los Cimientos lógicos
    generarCimientos(maxCimientos);

    // 9. Encender el motor e iniciar el ciclo de animación inteligente
    window.estadoMotor3D.activo = true;
    animate();
}

/**
 * Distribuye espacialmente los cimientos geométricos translúcidos en el plano
 * @param {number} cantidad - Total de cimientos a inyectar (16 o 8)
 */
function generarCimientos(cantidad) {
    cimientos = []; // Resetear arreglo local

    // Algoritmo adaptativo de columnas según distribución reglamentaria
    const columnas = cantidad === 16 ? 4 : 3; 
    const distancia = 4.5; 

    for (let i = 0; i < cantidad; i++) {
        // Geometría cúbica aplanada representativa del bloque cimiento
        const geometry = new THREE.BoxGeometry(2.5, 0.4, 2.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xd4af37, // Oro imperial translúcido para hacer juego con el carretón
            transparent: true, 
            opacity: 0.25,
            roughness: 0.5
        });
        const cimientoMesh = new THREE.Mesh(geometry, material);

        // Algoritmo matemático para posicionamiento en grilla simétrica
        const fila = Math.floor(i / columnas);
        const col = i % columnas;

        cimientoMesh.position.x = (col - (columnas - 1) / 2) * distance = (col - (columnas - 1) / 2) * distancia;
        cimientoMesh.position.y = 0.2; 
        cimientoMesh.position.z = (fila - 1) * distancia;

        // Metadatos cruciales adjuntados al objeto 3D para sincronizar con MongoDB
        cimientoMesh.userData = { 
            slotId: i, 
            estaOcupado: false,
            tipoEdificio: null 
        };

        scene.add(cimientoMesh);
        cimientos.push(cimientoMesh);
    }
}

/**
 * Evento interceptor de selección por ratón (Raycasting autoritario)
 */
function onCanvasClick(event) {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    
    // Convertir coordenadas del puntero a espacio normalizado (-1 a +1)
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cimientos);

    if (intersects.length > 0) {
        const objetoSeleccionado = intersects[0].object;
        console.log("🏛️ Cimiento presionado. Sincronizando ranura:", objetoSeleccionado.userData);
        
        // Feedback visual táctico imperial
        objetoSeleccionado.material.color.setHex(0xff0055); // Alerta rojo carmesí al tocar
        
        setTimeout(() => {
            if (objetoSeleccionado && objetoSeleccionado.material) {
                objetoSeleccionado.material.color.setHex(0xd4af37); // Retorna a Oro imperial
            }
        }, 300);
        
        // Lanzador global por si el script carreton o mercado requiere engancharse al clic
        if (typeof window.alPresionarCimientoReal === 'function') {
            window.alPresionarCimientoReal(objetoSeleccionado.userData);
        }
    }
}

/**
 * Ciclo principal de renderizado gráfico inteligente (Control absoluto de GPU)
 */
function animate() {
    // BLINDAJE CRÍTICO DE HILO: Si la bandera pasa a false desde main.js, congela el render
    if (!window.estadoMotor3D.activo) {
        console.log("⏸️ Motor 3D en pausa: Renderizador e hilos de GPU liberados.");
        return;
    }

    requestAnimationFrame(animate);

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

/**
 * Expone un disparador global seguro para reanudar el hilo al volver al Mapa SPA
 */
window.reanudarAnimacion3D = function() {
    if (!window.estadoMotor3D.activo) {
        window.estadoMotor3D.activo = true;
        animate();
    }
};

// public/js/game3d.js (Versión Definitiva con Calibración Geométrica de Raycasting y GPU)

// Configuración global de optimización de GPU conectada con el ruteo SPA de main.js
window.estadoMotor3D = {
    activo: false,
    maxCimientosActivos: 5
};

// Variables de control de las instancias de Three.js
let scene, camera, renderer;
let listaCimientos3D = []; // Array unificado para el Raycasting del Drag & Drop
let raycaster, mouse;

/**
 * Inicializa el entorno gráfico 3D dentro de un contenedor HTML específico
 * @param {string} containerId - ID del elemento div contenedor del canvas
 * @param {number} maxCimientos - Cantidad de cimientos a generar (12 para Aldea, 5 para Finca)
 */
function init3D(containerId, maxCimientos) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Limpieza preventiva total del contenedor para mitigar canvas duplicados
    container.innerHTML = '';
    listaCimientos3D = [];
    window.estadoMotor3D.maxCimientosActivos = maxCimientos;

    // 2. Creación y configuración de la Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120c09); // Fondo terráqueo imperial oscuro

    // 3. Configuración de la Cámara Perspectiva y exposición global segura
    const aspect = container.clientWidth / (container.clientHeight || 1);
    camera = new THREE.PerspectiveCamera(45, aspect, 1, 1000);
    camera.position.set(0, 14, 18);
    camera.lookAt(0, 0, 0);
    window.cameraGlobalFinca = camera;

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

    // 7. Inicialización de herramientas de Raycasting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 8. Distribución y renderizado de los Cimientos lógicos
    generarCimientos(containerId, maxCimientos);

    // 🚀 9. CONFIGURACIÓN DEL RECEPTOR DRAG & DROP NATIVO PARA EL CANVAS 3D
    configurarDragAndDropCanvas(container);

    // 10. Encender el motor e iniciar el ciclo de animación inteligente
    window.estadoMotor3D.activo = true;
    animate();
}

/**
 * Configura los eventos de arrastre y soltado directamente sobre el contenedor y canvas tridimensional
 */
function configurarDragAndDropCanvas(contenedorCanvas) {
    if (!contenedorCanvas) return;

    // 1. Permitir que elementos externos sobrevuelen la rejilla tridimensional
    contenedorCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    contenedorCanvas.addEventListener('dragenter', (e) => {
        e.preventDefault();
    });

    // 2. Procesar el drop de la carta con calibración geométrica y compensación de offsets
    contenedorCanvas.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const cartaUuid = e.dataTransfer.getData('text/plain');
        if (!cartaUuid) return;

        console.log(`🏗️ Carta detectada sobre el terreno 3D. UUID: ${cartaUuid}`);

        const activeCamera = window.cameraGlobalFinca || camera;
        if (!renderer || !activeCamera) return;

        // 📐 Compensación milimétrica absoluta de offsets y barras de menú del layout imperial
        const rect = contenedorCanvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        mouse.x = (clientX / rect.width) * 2 - 1;
        mouse.y = -(clientY / rect.height) * 2 + 1;

        // 🔄 Actualización obligatoria de la matriz de proyección para evitar desfases de profundidad
        activeCamera.updateProjectionMatrix();
        raycaster.setFromCamera(mouse, activeCamera);

        if (listaCimientos3D && listaCimientos3D.length > 0) {
            // 🎯 Parámetro 'true' incorporado para registrar colisiones exactas en mallas translúcidas
            const intersecciones = raycaster.intersectObjects(listaCimientos3D, true);

            if (intersecciones.length > 0) {
                const cimientoGolpeado = intersecciones[0].object;
                const cimientoIndex = cimientoGolpeado.userData.index;

                if (cimientoGolpeado.userData.estaOcupado) {
                    alert("❌ Este cimiento ya se encuentra ocupado por otra estructura imperial.");
                    return;
                }

                console.log(`🎯 Cimiento detectado: Slot Index ${cimientoIndex}. Solicitando autorización al servidor...`);

                if (typeof socket !== 'undefined' && socket && socket.connected) {
                    socket.emit('finca:instalar-edificio', {
                        edificioUuid: cartaUuid,
                        cartaUuid: cartaUuid,
                        edificioId: cartaUuid,
                        cimientoSlotId: cimientoIndex,
                        cimientoIndex: cimientoIndex
                    });
                } else {
                    alert("❌ Error de red: No hay conexión activa con el servidor del Imperio.");
                }
            } else {
                console.warn("⚠️ La carta se soltó fuera de los cimientos dorados habilitados.");
            }
        }
    });
}

/**
 * Distribuye espacialmente los cimientos geométricos translúcidos en el plano (Exactamente 5 para Finca)
 */
function generarCimientos(containerId, cantidad) {
    listaCimientos3D = []; 

    if (containerId === 'canvas-finca-container') {
        const posicionesCimientosFinca = [
            { x: -9.0, z:  6.0 }, // Cimiento 0: Izquierdo
            { x: -6.0, z:  0.0 }, // Cimiento 1: Central izquierdo
            { x:  6.0, z:  0.0 }, // Cimiento 2: Central derecho
            { x:  0.0, z: -2.0 }, // Cimiento 3: Superior
            { x:  9.0, z:  6.0 }  // Cimiento 4: Inferior derecho externo
        ];

        posicionesCimientosFinca.forEach((pos, i) => {
            const geometry = new THREE.BoxGeometry(2.5, 0.4, 2.5);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0xd4af37, // Oro imperial translúcido
                transparent: true, 
                opacity: 0.35,
                roughness: 0.4
            });
            const cimientoMesh = new THREE.Mesh(geometry, material);

            cimientoMesh.position.x = pos.x;
            cimientoMesh.position.y = 0.2; 
            cimientoMesh.position.z = pos.z;

            cimientoMesh.userData = { 
                index: i, 
                slotId: i, 
                estaOcupado: false,
                tipoEdificio: null 
            };

            scene.add(cimientoMesh);
            listaCimientos3D.push(cimientoMesh);
        });
    } else {
        const columnas = cantidad === 16 ? 4 : 3; 
        const distancia = 4.5; 

        for (let i = 0; i < cantidad; i++) {
            const geometry = new THREE.BoxGeometry(2.5, 0.4, 2.5);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0xd4af37, 
                transparent: true, 
                opacity: 0.25,
                roughness: 0.5
            });
            const cimientoMesh = new THREE.Mesh(geometry, material);

            const fila = Math.floor(i / columnas);
            const col = i % columnas;

            cimientoMesh.position.x = (col - (columnas - 1) / 2) * distancia;
            cimientoMesh.position.y = 0.2; 
            cimientoMesh.position.z = (fila - 1) * distancia;

            cimientoMesh.userData = { 
                index: i, 
                slotId: i, 
                estaOcupado: false,
                tipoEdificio: null 
            };

            scene.add(cimientoMesh);
            listaCimientos3D.push(cimientoMesh);
        }
    }
}

/**
 * Bucle infinito inteligente controlado por bandera de optimización de GPU
 */
function animate() {
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

// ==========================================================================
// RECEPTORES DE RED DE SOCKET.IO PARA LA INGENIERÍA DE CONSTRUCCIÓN
// ==========================================================================
if (typeof socket !== 'undefined' && socket) {
    // Receptor unificado para construcción exitosa en tiempo real
    socket.on('finca:construccion-exitosa', (data) => {
        if (data.mensaje) alert(data.mensaje);
        
        if (listaCimientos3D && listaCimientos3D.length > 0) {
            const slotObjetivo = parseInt(data.slotId !== undefined ? data.slotId : data.cimientoIndex);
            const malla3D = listaCimientos3D.find(c => c.userData.index === slotObjetivo);
            
            if (malla3D) {
                malla3D.userData.estaOcupado = true;
                malla3D.userData.tipoEdificio = data.subtipo;
                
                if (data.subtipo === 'casona') {
                    malla3D.material.color.setHex(0x8b4513); 
                    malla3D.material.opacity = 0.95;
                } else {
                    malla3D.material.color.setHex(0x4a5d4e);
                    malla3D.material.opacity = 0.90;
                }

                // 🚀 DISPARADOR DE GPU: Fuerza al renderizador a refrescar el material inmediatamente
                malla3D.material.needsUpdate = true;
            }
        }

        if (typeof cargarAlmacen === 'function') cargarAlmacen();
        if (typeof cargarCarreton === 'function') cargarCarreton();
    });

    // Receptor para sincronizar edificios ya construidos al iniciar sesión o recargar la vista
    socket.on('finca:actualizar-terreno', (edificiosConstruidos) => {
        if (!edificiosConstruidos || !Array.isArray(edificiosConstruidos)) return;

        edificiosConstruidos.forEach(edificio => {
            const slotId = parseInt(edificio.slotId !== undefined ? edificio.slotId : edificio.cimientoIndex);
            const malla3D = listaCimientos3D.find(c => c.userData.index === slotId);

            if (malla3D) {
                malla3D.userData.estaOcupado = true;
                malla3D.userData.tipoEdificio = edificio.subtipo;

                if (edificio.subtipo === 'casona') {
                    malla3D.material.color.setHex(0x8b4513);
                    malla3D.material.opacity = 0.95;
                } else {
                    malla3D.material.color.setHex(0x4a5d4e);
                    malla3D.material.opacity = 0.90;
                }

                // 🚀 DISPARADOR DE GPU: Garantiza la sincronización visual al iniciar sesión
                malla3D.material.needsUpdate = true;
            }
        });
    });

    socket.on('finca:error', (msgError) => {
        alert(`❌ Obra civil rechazada: ${msgError}`);
    });
}

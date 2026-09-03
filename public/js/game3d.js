// public/js/game3d.js (Versión Completa Definitiva - Corrección de Posiciones, Canvas y Eventos de Arrastre)

// Configuración global de optimización de GPU conectada con el ruteo SPA de main.js
window.estadoMotor3D = {
    activo: false,
    maxCimientosActivos: 5
};

// Variables de control de las instancias de Three.js
let scene, camera, renderer;
let cimientos = [];
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
    cimientos = [];
    window.estadoMotor3D.maxCimientosActivos = maxCimientos;

    // 2. Creación y configuración de la Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120c09); // Fondo terráqueo imperial oscuro

    // 3. Configuración de la Cámara Perspectiva
    const aspect = container.clientWidth / (container.clientHeight || 1);
    camera = new THREE.PerspectiveCamera(45, aspect, 1, 1000);
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

    // 7. Inicialización de herramientas de Raycasting
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 🚀 ENLACE DRAG & DROP NATIVO PARA EL LIENZO CANVAS 3D Y EL CONTENEDOR
    configurarDragAndDropCanvas(container);

    // 8. Distribución y renderizado de los Cimientos lógicos
    generarCimientos(containerId, maxCimientos);

    // 9. Encender el motor e iniciar el ciclo de animación inteligente
    window.estadoMotor3D.activo = true;
    animate();
}

/**
 * Configura los eventos nativos de Drag and Drop vinculados directamente al canvas y contenedor
 */
function configurarDragAndDropCanvas(container) {
    // Permitir el evento dragover de manera estricta tanto en el contenedor como en el canvas
    const permitirArrastre = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };

    container.addEventListener('dragover', permitirArrastre);
    if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('dragover', permitirArrastre);
    }

    // Función unificada para procesar el soltado (drop) de las cartas de planos
    const procesarSoltadoPlano = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!renderer || !camera) return;

        const edificioUuid = e.dataTransfer.getData('text/plain');
        if (!edificioUuid) return;

        // Calcular la posición exacta del cursor respecto al rectángulo del lienzo WebGL
        const rect = renderer.domElement.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        mouse.x = (clientX / rect.width) * 2 - 1;
        mouse.y = -(clientY / rect.height) * 2 + 1;

        // Lanzar el rayo a través de la cámara hacia la escena completa
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        // Filtrar el objeto intersectado que pertenezca al arreglo de cimientos
        const cimientoIntersectado = intersects.find(hit => cimientos.includes(hit.object));

        if (cimientoIntersectado) {
            const cimientoMalla = cimientoIntersectado.object;
            const datosCimiento = cimientoMalla.userData;

            if (datosCimiento.estaOcupado) {
                alert("❌ Este cimiento ya se encuentra ocupado por otra estructura imperial.");
                return;
            }

            console.log(`🏗️ Intentando instalar plano ${edificioUuid} en cimiento 3D [Slot ${datosCimiento.slotId}]`);

            if (typeof socket !== 'undefined' && socket && socket.connected) {
                socket.emit('finca:instalar-edificio', {
                    cimientoSlotId: datosCimiento.slotId,
                    edificioUuid: edificioUuid
                });
            }
        } else {
            console.warn("⚠️ El plano fue soltado fuera de un cimiento 3D válido.");
        }
    };

    container.addEventListener('drop', procesarSoltadoPlano);
    if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('drop', procesarSoltadoPlano);
    }
}

/**
 * Distribuye espacialmente los cimientos geométricos translúcidos en el plano (5 Cimientos corregidos para Finca)
 */
function generarCimientos(containerId, cantidad) {
    cimientos = []; 

    // Posiciones de los 5 cimientos corregidas milimétricamente acorde a la interfaz visual de la Finca
    if (containerId === 'canvas-finca-container') {
        const posicionesCimientosFinca = [
            { x: 0, z:  0.5 }, // 1. Cimiento izquierdo (alineado con la marca izquierda)
            { x:  0.0, z:  1.5 }, // 2. Cimiento central izquierdo (círculo rojo izquierdo)
            { x:  2.5, z:  1.5 }, // 3. Cimiento central derecho (círculo rojo derecho)
            { x:  0.0, z: -2.5 }, // 4. Cimiento superior (alineado con la flecha superior)
            { x:  4.5, z:  3.5 }  // 5. Cimiento inferior derecho externo
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
                slotId: i, 
                estaOcupado: false,
                tipoEdificio: null 
            };

            scene.add(cimientoMesh);
            cimientos.push(cimientoMesh);
        });
    } else {
        // Distribución predeterminada para la Aldea (12 cimientos)
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
                slotId: i, 
                estaOcupado: false,
                tipoEdificio: null 
            };

            scene.add(cimientoMesh);
            cimientos.push(cimientoMesh);
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
    socket.on('finca:construccion-exitosa', (data) => {
        alert(data.mensaje);
        
        // Localizar de forma atómica la malla 3D correspondiente en la escena para redibujarla de forma fija
        if (cimientos && cimientos.length > 0) {
            const malla3D = cimientos.find(c => c.userData.slotId === parseInt(data.slotId));
            if (malla3D) {
                malla3D.userData.estaOcupado = true;
                malla3D.userData.tipoEdificio = data.subtipo;
                
                // Si es la Casona residencial, cambia su color a terracota romano para dar feedback visual y fijarlo
                if (data.subtipo === 'casona') {
                    malla3D.material.color.setHex(0x8b4513); 
                    malla3D.material.opacity = 0.95;
                } else {
                    malla3D.material.color.setHex(0x4a5d4e); // Color piedra base
                    malla3D.material.opacity = 0.90;
                }
            }
        }

        // 🚀 DISPARADOR DE ACTUALIZACIÓN EN VIVO DE HABITABILIDAD:
        // Una vez levantada la obra civil en Three.js, forzamos de forma autoritaria al backend
        // a actualizar las mallas del almacén (para restar la carta) y del carretón (para liberar los slots de población).
        if (typeof cargarAlmacen === 'function') cargarAlmacen();
        if (typeof cargarCarreton === 'function') cargarCarreton();
    });

    socket.on('finca:error', (msgError) => {
        alert(`❌ Obra civil rechazada: ${msgError}`);
    });
}

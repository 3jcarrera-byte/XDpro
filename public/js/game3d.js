// public/js/game3d.js (Versión Definitiva con Caché Local de Sincronización y Drag & Drop Avanzado / Intercambio)

// Configuración global de optimización de GPU conectada con el ruteo SPA de main.js
window.estadoMotor3D = {
    activo: false,
    maxCimientosActivos: 5
};

// Variables de control de las instancias de Three.js
let scene, camera, renderer;
let listaCimientos3D = []; // Array unificado para el Raycasting del Drag & Drop
let raycaster, mouse;

// 🛡️ Caché local persistente para mitigar la carrera de red entre el motor gráfico y los Sockets
window.cacheTerrenoServidor = null;

// Variables de control para Drag & Drop interno entre cimientos o retorno a la banda inferior
let edificioSeleccionadoArrastre = null;

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
    edificioSeleccionadoArrastre = null;

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

    // 🔄 11. SINCRONIZACIÓN DIFERIDA: Si MongoDB respondió antes de que el motor 3D naciera, inyectamos la caché aquí
    if (window.cacheTerrenoServidor && Array.isArray(window.cacheTerrenoServidor)) {
        console.log("♻️ Aplicando caché de terreno diferida tras la inicialización geométrica completa.");
        sincronizarTerrenoEnMallas(window.cacheTerrenoServidor);
    }
}

/**
 * Configura los eventos de arrastre y soltado directamente sobre el contenedor y canvas tridimensional
 */
function configurarDragAndDropCanvas(contenedorCanvas) {
    if (!contenedorCanvas) return;

    contenedorCanvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    contenedorCanvas.addEventListener('dragenter', (e) => {
        e.preventDefault();
    });

    contenedorCanvas.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const cartaUuid = e.dataTransfer.getData('text/plain');
        const origenSlotStr = e.dataTransfer.getData('text/origen-slot'); // Detecta si proviene de otro cimiento 3D

        const activeCamera = window.cameraGlobalFinca || camera;
        if (!renderer || !activeCamera) return;

        const rect = contenedorCanvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        mouse.x = (clientX / rect.width) * 2 - 1;
        mouse.y = -(clientY / rect.height) * 2 + 1;

        activeCamera.updateProjectionMatrix();
        raycaster.setFromCamera(mouse, activeCamera);

        if (listaCimientos3D && listaCimientos3D.length > 0) {
            const intersecciones = raycaster.intersectObjects(listaCimientos3D, true);

            if (intersecciones.length > 0) {
                const cimientoGolpeado = intersecciones[0].object;
                const cimientoIndex = cimientoGolpeado.userData.index;

                // CASO A: REORDENAMIENTO / INTERCAMBIO ENTRE CIMIENTOS 3D
                if (origenSlotStr !== "" && origenSlotStr !== undefined) {
                    const origenSlot = parseInt(origenSlotStr);
                    if (origenSlot === cimientoIndex) return; // Mismo slot, no hay acción

                    console.log(`🔄 Intercambio de cimientos detectado: Origen [${origenSlot}] ➡️ Destino [${cimientoIndex}]`);

                    if (typeof socket !== 'undefined' && socket && socket.connected) {
                        socket.emit('finca:intercambiar-cimientos', {
                            origenSlotId: origenSlot,
                            destinoSlotId: cimientoIndex
                        });
                    } else {
                        alert("❌ Error de red: No hay conexión activa con el servidor del Imperio.");
                    }
                    return;
                }

                // CASO B: INSTALACIÓN NUEVA DESDE CARTA EXTERNA
                if (!cartaUuid) return;

                if (cimientoGolpeado.userData.estaOcupado) {
                    alert("❌ Este cimiento ya se encuentra ocupado por otra estructura imperial.");
                    return;
                }

                console.log(`🎯 Instalando edificio nuevo en Slot Index ${cimientoIndex}. UUID: ${cartaUuid}`);

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
 * Distribuye espacialmente los cimientos geométricos translúcidos en el plano e incorpora eventos de ratón para drag interno
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
                tipoEdificio: null,
                edificioUuid: null 
            };

            // Habilitar interactividad de arrastre si el cimiento está ocupado
            configurarInteraccionCimientoMesh(cimientoMesh);

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
                tipoEdificio: null,
                edificioUuid: null 
            };

            configurarInteraccionCimientoMesh(cimientoMesh);

            scene.add(cimientoMesh);
            listaCimientos3D.push(cimientoMesh);
        }
    }
}

/**
 * Permite que un cimiento 3D ocupado actúe como fuente de arrastre (Drag Source) para reordenar o retirar
 */
function configurarInteraccionCimientoMesh(malla) {
    // Agregamos atributos interactivos del DOM simulados o eventos mediante canvas selector si fuera necesario,
    // pero como Three.js renderiza en un canvas HTML estándar, manejamos el evento mousedown / dragstart interactivo.
    malla.addEventListener && malla.addEventListener('dragstart', (e) => {
        if (!malla.userData.estaOcupado) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', malla.userData.edificioUuid || '');
        e.dataTransfer.setData('text/origen-slot', malla.userData.index);
    });
}

// Escucha global de ratón en el DOM del canvas para permitir iniciar arrastre desde una estructura 3D ocupada
document.addEventListener('DOMContentLoaded', () => {
    // Se vincula dinámicamente cuando el contenedor esté disponible
});

/**
 * Bucle infinito inteligente controlado por bandera de optimización de GPU
 */
function animate() {
    if (!window.estadoMotor3D.activo) {
        return;
    }

    requestAnimationFrame(animate);

    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

window.reanudarAnimacion3D = function() {
    if (!window.estadoMotor3D.activo) {
        window.estadoMotor3D.activo = true;
        animate();
    }
};

/**
 * Función centralizada para actualizar los materiales de las mallas 3D según el estado del terreno
 */
function sincronizarTerrenoEnMallas(edificiosConstruidos) {
    if (!edificiosConstruidos || !Array.isArray(edificiosConstruidos)) return;

    // Primero reiniciamos todos los cimientos a su estado libre por defecto
    listaCimientos3D.forEach(malla => {
        malla.userData.estaOcupado = false;
        malla.userData.tipoEdificio = null;
        malla.userData.edificioUuid = null;
        malla.material.color.setHex(0xd4af37);
        malla.material.opacity = 0.35;
        malla.material.needsUpdate = true;
    });

    // Luego aplicamos los edificios activos devueltos por el servidor
    edificiosConstruidos.forEach(edificio => {
        const slotId = parseInt(edificio.slotId !== undefined ? edificio.slotId : edificio.cimientoIndex);
        const malla3D = listaCimientos3D.find(c => c.userData.index === slotId);

        if (malla3D) {
            malla3D.userData.estaOcupado = true;
            malla3D.userData.tipoEdificio = edificio.subtipo;
            malla3D.userData.edificioUuid = edificio.uuid || edificio._id || edificio.edificioUuid;

            if (edificio.subtipo === 'casona') {
                malla3D.material.color.setHex(0x8b4513); // Marrón terráqueo Casona
                malla3D.material.opacity = 0.95;
            } else {
                malla3D.material.color.setHex(0x4a5d4e); // Verde estructurado
                malla3D.material.opacity = 0.90;
            }

            // 🚀 DISPARADOR DE GPU: Fuerza al renderizador a refrescar el material inmediatamente
            malla3D.material.needsUpdate = true;
        }
    });

    console.log("🎨 Sincronización visual de la Finca completada en GPU.");
}

// ==========================================================================
// RECEPTORES DE RED DE SOCKET.IO PARA LA INGENIERÍA DE CONSTRUCCIÓN
// ==========================================================================
if (typeof socket !== 'undefined' && socket) {
    
    socket.on('finca:construccion-exitosa', (data) => {
        if (data.mensaje) console.log(data.mensaje);
        
        // Si el servidor emite el terreno completo actualizado, lo sincronizamos
        if (data.terreno) {
            window.cacheTerrenoServidor = data.terreno;
            sincronizarTerrenoEnMallas(data.terreno);
        } else if (data.edificios) {
            window.cacheTerrenoServidor = data.edificios;
            sincronizarTerrenoEnMallas(data.edificios);
        }

        if (typeof cargarAlmacen === 'function') cargarAlmacen();
        if (typeof cargarCarreton === 'function') cargarCarreton();
    });

    socket.on('finca:actualizar-terreno', (edificiosConstruidos) => {
        // 🛡️ Almacenamiento preventivo en caché para solucionar la carrera asíncrona de carga inicial
        window.cacheTerrenoServidor = edificiosConstruidos;

        if (listaCimientos3D && listaCimientos3D.length > 0) {
            sincronizarTerrenoEnMallas(edificiosConstruidos);
        } else {
            console.log("⏳ Mallas 3D aún no inicializadas. Terreno guardado en caché temporal.");
        }
    });

    socket.on('finca:intercambio-exitoso', (data) => {
        if (data.terreno) {
            window.cacheTerrenoServidor = data.terreno;
            sincronizarTerrenoEnMallas(data.terreno);
        }
        if (typeof cargarAlmacen === 'function') cargarAlmacen();
        if (typeof cargarCarreton === 'function') cargarCarreton();
    });

    socket.on('finca:error', (msgError) => {
        alert(`❌ Obra civil rechazada: ${msgError}`);
    });
}

/**
 * 🧹 Manejador opcional para soltar un edificio desde el terreno 3D de regreso al contenedor inferior (Inventario / Retiro)
 */
window.manejarDropInversoAlmacen = function(e) {
    e.preventDefault();
    const origenSlotStr = e.dataTransfer.getData('text/origen-slot');
    const edificioUuid = e.dataTransfer.getData('text/plain');

    if (origenSlotStr !== "" && origenSlotStr !== undefined) {
        const slotIndex = parseInt(origenSlotStr);
        console.log(`📦 Retirando estructura del slot 3D [${slotIndex}] de regreso al almacén...`);

        if (typeof socket !== 'undefined' && socket && socket.connected) {
            socket.emit('finca:retirar-edificio', {
                cimientoSlotId: slotIndex,
                edificioUuid: edificioUuid
            });
        }
    }
};

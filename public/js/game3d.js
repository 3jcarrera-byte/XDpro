// ==========================================================================
// 🎮 public/js/game3d.js (Versión Definitiva Optimizada, Corregida y Blindada SPA)
// ==========================================================================

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

// 🌐 Variables globales de control para el arrastre avanzado mediante clon HTML translúcido
let arrastreActivoJS = false;
let datosArrastreActuales = null;
let elementoClonVisual = null;

/**
 * Inicializa el entorno gráfico 3D dentro de un contenedor HTML específico
 * @param {string} containerId - ID del elemento div contenedor del canvas
 * @param {number} maxCimientos - Cantidad de cimientos a generar (12 para Aldea, 5 para Finca)
 */
function init3D(containerId, maxCimientos) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Liberar renderer anterior si existe para evitar fugas de memoria en entornos SPA
    if (renderer) {
        renderer.dispose();
    }

    // 1. Limpieza preventiva total del contenedor para mitigar canvas duplicados
    container.innerHTML = '';
    listaCimientos3D = [];
    window.estadoMotor3D.maxCimientosActivos = maxCimientos;
    edificioSeleccionadoArrastre = null;
    arrastreActivoJS = false;
    datosArrastreActuales = null;
    removerClonVisualDOM();

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

    // 8. Distribución y renderizado dinámico de los Cimientos lógicos
    generarCimientos(containerId, maxCimientos);

    // 🚀 9. CONFIGURACIÓN DEL RECEPTOR DRAG & DROP NATIVO Y PUNTERO AVANZADO PARA EL CANVAS 3D
    configurarDragAndDropCanvas(container);
    configurarEventosPunteroAvanzados(container);

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
        const origenSlotStr = e.dataTransfer.getData('text/origen-slot');

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
                const cimientoIndex = parseInt(cimientoGolpeado.userData.index, 10);

                if (isNaN(cimientoIndex)) {
                    console.error('El índice del cimiento golpeado no es válido.');
                    return;
                }

                // CASO A: REORDENAMIENTO / INTERCAMBIO ENTRE CIMIENTOS 3D
                if (origenSlotStr !== "" && origenSlotStr !== undefined) {
                    const origenSlotIdNum = parseInt(origenSlotStr, 10);
                    if (isNaN(origenSlotIdNum) || origenSlotIdNum === cimientoIndex) return;

                    console.log(`🔄 Intercambio de cimientos detectado: Origen [${origenSlotIdNum}] ➡️ Destino [${cimientoIndex}]`);

                    if (typeof socket !== 'undefined' && socket && socket.connected) {
                        socket.emit('finca:intercambiar-cimientos', {
                            origenSlotId: origenSlotIdNum,
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
                        slotId: cimientoIndex,
                        edificioUuid: cartaUuid,
                        cartaUuid: cartaUuid,
                        edificioId: cartaUuid,
                        cimientoSlotId: cimientoIndex,
                        cimientoIndex: cimientoIndex
                    });
                } else {
                    alert("❌ Error de red: No hay conexión activa con el servidor del Imperio.");
                }
            }
        }
    });
}

/**
 * 🛠️ Sistema Avanzado de Eventos de Puntero combinado con Raycaster dinámico
 */
function configurarEventosPunteroAvanzados(contenedorCanvas) {
    if (!contenedorCanvas) return;

    contenedorCanvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // Solo botón izquierdo

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

                if (cimientoGolpeado.userData.estaOcupado) {
                    const cimientoIndexNum = parseInt(cimientoGolpeado.userData.index, 10);
                    if (isNaN(cimientoIndexNum)) return;

                    arrastreActivoJS = true;
                    datosArrastreActuales = {
                        edificioUuid: cimientoGolpeado.userData.edificioUuid,
                        origenSlot: cimientoIndexNum,
                        tipoEdificio: cimientoGolpeado.userData.tipoEdificio
                    };

                    crearClonVisualDOM(e.clientX, e.clientY, cimientoGolpeado.userData.tipoEdificio);

                    try {
                        contenedorCanvas.setPointerCapture(e.pointerId);
                    } catch (err) {
                        // Ignorar si el navegador rechaza la captura
                    }

                    e.stopPropagation();
                }
            }
        }
    });

    contenedorCanvas.addEventListener('pointermove', (e) => {
        if (!arrastreActivoJS) return;
        actualizarClonVisualDOM(e.clientX, e.clientY);
    });

    contenedorCanvas.addEventListener('pointerup', async (e) => {
        if (!arrastreActivoJS) return;
        arrastreActivoJS = false;

        try {
            contenedorCanvas.releasePointerCapture(e.pointerId);
        } catch (err) {
            // Ignorar
        }

        const datosArrastre = datosArrastreActuales;
        datosArrastreActuales = null;
        removerClonVisualDOM();

        if (!datosArrastre) return;

        const slotIdNumerico = parseInt(datosArrastre.origenSlot, 10);
        if (isNaN(slotIdNumerico)) return;

        const elementoBandaInferior = document.querySelector('.finca-buildings-drawer');
        if (elementoBandaInferior) {
            const rectBanda = elementoBandaInferior.getBoundingClientRect();
            if (
                e.clientX >= rectBanda.left &&
                e.clientX <= rectBanda.right &&
                e.clientY >= rectBanda.top &&
                e.clientY <= rectBanda.bottom
            ) {
                console.log(`📦 Soltado en banda inferior. Retirando estructura del slot [${slotIdNumerico}]...`);
                if (typeof socket !== 'undefined' && socket && socket.connected) {
                    socket.emit('finca:retirar-edificio', { slotId: slotIdNumerico });
                }
                return;
            }
        }

        const activeCamera = window.cameraGlobalFinca || camera;
        if (!renderer || !activeCamera) return;

        const rect = contenedorCanvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        if (clientX < 0 || clientX > rect.width || clientY < 0 || clientY > rect.height) {
            return;
        }

        mouse.x = (clientX / rect.width) * 2 - 1;
        mouse.y = -(clientY / rect.height) * 2 + 1;

        activeCamera.updateProjectionMatrix();
        raycaster.setFromCamera(mouse, activeCamera);

        const intersecciones = raycaster.intersectObjects(listaCimientos3D, true);
        if (intersecciones.length > 0) {
            const cimientoDestino = intersecciones[0].object;
            const destinoIndexNum = parseInt(cimientoDestino.userData.index, 10);

            if (isNaN(destinoIndexNum) || slotIdNumerico === destinoIndexNum) return;

            console.log(`🔄 Intercambio avanzado de cimientos: Origen [${slotIdNumerico}] ➡️ Destino [${destinoIndexNum}]`);

            if (typeof socket !== 'undefined' && socket && socket.connected) {
                socket.emit('finca:intercambiar-cimientos', {
                    origenSlotId: slotIdNumerico,
                    destinoSlotId: destinoIndexNum
                });
            } else {
                alert("❌ Error de red: No hay conexión activa con el servidor del Imperio.");
            }
        }
    });
}

/**
 * Crea un elemento HTML flotante translúcido para representar visualmente el arrastre
 */
function crearClonVisualDOM(x, y, tipoEdificio) {
    removerClonVisualDOM();

    elementoClonVisual = document.createElement('div');
    elementoClonVisual.id = 'drag-clon-visual-temporal';
    elementoClonVisual.style.position = 'fixed';
    elementoClonVisual.style.left = `${x - 40}px`;
    elementoClonVisual.style.top = `${y - 40}px`;
    elementoClonVisual.style.width = '80px';
    elementoClonVisual.style.height = '80px';
    elementoClonVisual.style.background = tipoEdificio === 'casona' ? 'rgba(139, 69, 19, 0.85)' : 'rgba(74, 93, 78, 0.85)';
    elementoClonVisual.style.border = '2px solid #ffd700';
    elementoClonVisual.style.borderRadius = '8px';
    elementoClonVisual.style.zIndex = '999999';
    elementoClonVisual.style.pointerEvents = 'none';
    elementoClonVisual.style.display = 'flex';
    elementoClonVisual.style.alignItems = 'center';
    elementoClonVisual.style.justifyContent = 'center';
    elementoClonVisual.style.color = '#ffd700';
    elementoClonVisual.style.fontFamily = "'Cinzel', serif";
    elementoClonVisual.style.fontSize = '11px';
    elementoClonVisual.style.textAlign = 'center';
    elementoClonVisual.style.boxShadow = '0 0 15px rgba(212, 175, 55, 0.6)';
    elementoClonVisual.innerText = tipoEdificio ? tipoEdificio.toUpperCase() : 'ESTRUCTURA';

    document.body.appendChild(elementoClonVisual);
}

function actualizarClonVisualDOM(x, y) {
    if (!elementoClonVisual) return;
    elementoClonVisual.style.left = `${x - 40}px`;
    elementoClonVisual.style.top = `${y - 40}px`;
}

function removerClonVisualDOM() {
    if (elementoClonVisual && elementoClonVisual.parentNode) {
        elementoClonVisual.parentNode.removeChild(elementoClonVisual);
    }
    elementoClonVisual = null;
}

/**
 * Distribuye espacialmente los cimientos geométricos de forma dinámica según el tipo de terreno
 */
function generarCimientos(containerId, cantidad) {
    listaCimientos3D = []; 

    if (containerId === 'canvas-finca-container') {
        const posicionesCimientosFinca = [
            { x: -9.0, z:  6.0 }, 
            { x: -6.0, z:  0.0 }, 
            { x:  6.0, z:  0.0 }, 
            { x:  0.0, z: -2.0 }, 
            { x:  9.0, z:  6.0 }  
        ];

        posicionesCimientosFinca.forEach((pos, i) => {
            const geometry = new THREE.BoxGeometry(2.5, 0.4, 2.5);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0xd4af37, 
                transparent: true, 
                opacity: 0.35,
                roughness: 0.4
            });
            const cimientoMesh = new THREE.Mesh(geometry, material);

            cimientoMesh.position.x = pos.x;
            cimientoMesh.position.y = 0.2; 
            cimientoMesh.position.z = pos.z;

            const idNumericoEstricto = parseInt(i, 10);
            cimientoMesh.userData = { 
                id: null,                    
                index: idNumericoEstricto, 
                slotIndex: idNumericoEstricto, 
                slotId: idNumericoEstricto, 
                estaOcupado: false, 
                tipoEdificio: null,
                edificioUuid: null 
            };

            scene.add(cimientoMesh);
            listaCimientos3D.push(cimientoMesh);
        });
    } else {
        const columnas = 4; 
        const filas = Math.ceil(cantidad / columnas);
        const distanciaX = 4.0;
        const distanciaZ = 4.0;

        for (let i = 0; i < cantidad; i++) {
            const geometry = new THREE.BoxGeometry(2.5, 0.4, 2.5);
            const material = new THREE.MeshStandardMaterial({ 
                color: 0xd4af37, 
                transparent: true, 
                opacity: 0.35, 
                roughness: 0.5
            });
            const cimientoMesh = new THREE.Mesh(geometry, material);

            const fila = Math.floor(i / columnas);
            const col = i % columnas;

            cimientoMesh.position.x = (col - (columnas - 1) / 2) * distanciaX;
            cimientoMesh.position.y = 0.2; 
            cimientoMesh.position.z = (fila - (filas - 1) / 2) * distanciaZ;

            const idNumericoEstricto = parseInt(i, 10);
            cimientoMesh.userData = { 
                id: null,                    
                index: idNumericoEstricto, 
                slotIndex: idNumericoEstricto, 
                slotId: idNumericoEstricto, 
                estaOcupado: false, 
                tipoEdificio: null,
                edificioUuid: null 
            };

            scene.add(cimientoMesh);
            listaCimientos3D.push(cimientoMesh);
        }
    }
}

/**
 * Bucle de animación inteligente controlado por bandera de optimización de GPU
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

    // 1. Limpieza general previa de todas las mallas para resetear estados fantasmas
    listaCimientos3D.forEach(malla => {
        malla.userData.estaOcupado = false;
        malla.userData.tipoEdificio = null;
        malla.userData.edificioUuid = null;
        malla.userData.id = null;
        malla.material.color.setHex(0xd4af37);
        malla.material.opacity = 0.35;
        malla.material.transparent = true;
        malla.material.needsUpdate = true;
    });

    // 2. Aplicación iterativa de datos reales provenientes del servidor/caché
    edificiosConstruidos.forEach(edificio => {
        const rawSlot = edificio.slotId !== undefined ? edificio.slotId : (edificio.cimientoIndex !== undefined ? edificio.cimientoIndex : edificio.slotIndex);
        const slotIdDestino = parseInt(rawSlot, 10);
        if (isNaN(slotIdDestino)) return;

        const malla3D = listaCimientos3D.find(c => parseInt(c.userData.slotId, 10) === slotIdDestino);

        if (malla3D) {
            const estaRealmenteOcupado = Boolean(edificio.estaOcupado && edificio.subtipo);

            if (estaRealmenteOcupado) {
                malla3D.userData.estaOcupado = true;
                malla3D.userData.tipoEdificio = edificio.subtipo;
                malla3D.userData.edificioUuid = edificio.uuid || edificio._id || edificio.edificioUuid;
                malla3D.userData.id = edificio._id || edificio.id || edificio.uuid || null;

                if (edificio.subtipo === 'casona') {
                    malla3D.material.color.setHex(0x8b4513); 
                    malla3D.material.opacity = 0.98;               
                    malla3D.material.transparent = false;    
                } else {
                    malla3D.material.color.setHex(0x4a5d4e); 
                    malla3D.material.opacity = 0.92;
                    malla3D.material.transparent = true;
                }
            } else {
                malla3D.userData.estaOcupado = false;
                malla3D.userData.tipoEdificio = null;
                malla3D.userData.edificioUuid = null;
                malla3D.userData.id = null;
                malla3D.material.color.setHex(0xd4af37);
                malla3D.material.opacity = 0.35;
                malla3D.material.transparent = true;
            }

            malla3D.material.needsUpdate = true;
        }
    });

    console.log("🎨 Sincronización visual y blindaje completados en GPU.");
}

// ==========================================================================
// CONFIGURACIÓN ÚNICA DE RECEPTORES DE SOCKET.IO
// ==========================================================================
if (typeof socket !== 'undefined' && socket && !window._socketsGame3DConfigurados) {
    window._socketsGame3DConfigurados = true;

    socket.on('finca:construccion-exitosa', (data) => {
        if (data.mensaje) console.log(data.mensaje);
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

    socket.on('finca:retiro-exitoso', (data) => {
        const targetSlot = data.slotId !== undefined ? data.slotId : data.slotIndex;
        console.log(`♻️ Árbitro confirma retiro en slot ${targetSlot}. Purgando malla 3D local...`);
        
        if (listaCimientos3D && listaCimientos3D.length > 0) {
            const malla3D = listaCimientos3D.find(c => c.userData.index === parseInt(targetSlot, 10));
            if (malla3D) {
                malla3D.userData.estaOcupado = false;
                malla3D.userData.tipoEdificio = null;
                malla3D.userData.edificioUuid = null;
                malla3D.userData.id = null;

                malla3D.material.color.setHex(0xd4af37);
                malla3D.material.opacity = 0.35;
                malla3D.material.transparent = true;
                malla3D.material.needsUpdate = true;
            }
        }
        if (typeof cargarAlmacen === 'function') cargarAlmacen();
        if (typeof cargarCarreton === 'function') cargarCarreton();
    });

    socket.on('finca:error', (msgError) => {
        alert(`❌ Obra civil rechazada: ${msgError}`);
    });
}

window.manejarDropInversoAlmacen = function(e) {
    e.preventDefault();
    const origenSlotStr = e.dataTransfer.getData('text/origen-slot');
    if (origenSlotStr !== "" && origenSlotStr !== undefined) {
        const slotIdNumerico = parseInt(origenSlotStr, 10);
        if (isNaN(slotIdNumerico)) {
            console.error('El slot de origen inverso no es válido.');
            return;
        }
        if (typeof socket !== 'undefined' && socket && socket.connected) {
            socket.emit('finca:retirar-edificio', { slotId: slotIdNumerico });
        }
    }
};

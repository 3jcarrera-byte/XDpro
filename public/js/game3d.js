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

// 🌐 Variables globales de control para el arrastre avanzado mediante clon HTML translúcido (pointer/mouse events)
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

    // 8. Distribución y renderizado de los Cimientos lógicos
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
                const cimientoIndex = parseInt(cimientoGolpeado.userData.index, 10);
                const cimientoDbId = cimientoGolpeado.userData.id;

                if (isNaN(cimientoIndex)) {
                    console.error('El índice del cimiento golpeado no es válido.');
                    return;
                }

                // CASO A: REORDENAMIENTO / INTERCAMBIO ENTRE CIMIENTOS 3D
                if (origenSlotStr !== "" && origenSlotStr !== undefined) {
                    const origenSlotIdNum = parseInt(origenSlotStr, 10);
                    if (isNaN(origenSlotIdNum)) {
                        console.error('El slot de origen no es un número válido:', origenSlotStr);
                        return;
                    }
                    if (origenSlotIdNum === cimientoIndex) return; // Mismo slot, no hay acción

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

                // 🔍 INSPECCIÓN PROFUNDA PARA DEPURACIÓN DEL BLOQUEO DE CIMIENTO
                console.log("🔍 INSPECCIONANDO CIMIENTO:", {
                    index: cimientoIndex,
                    dbId: cimientoDbId,
                    ocupadoReal: cimientoGolpeado.userData.estaOcupado,
                    tipo: cimientoGolpeado.userData.tipoEdificio,
                    uuidAsignado: cimientoGolpeado.userData.edificioUuid
                });

                if (cimientoGolpeado.userData.estaOcupado) {
                    alert("❌ Este cimiento ya se encuentra ocupado por otra estructura imperial.");
                    return;
                }

                console.log(`🎯 Instalando edificio nuevo en Slot Index ${cimientoIndex} (ID: ${cimientoDbId}). UUID: ${cartaUuid}`);

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
            } else {
                console.warn("⚠️ La carta se soltó fuera de los cimientos dorados habilitados.");
            }
        }
    });
}

/**
 * 🛠️ Sistema Avanzado de Eventos de Puntero (Pointer/Mouse Events) combinado con Raycaster dinámico
 * Permite arrastrar estructuras desde los cimientos 3D incluso cuando Three.js bloquea los eventos nativos del DOM.
 */
function configurarEventosPunteroAvanzados(contenedorCanvas) {
    if (!contenedorCanvas) return;

    contenedorCanvas.addEventListener('pointerdown', (e) => {
        // Solo botón izquierdo del ratón
        if (e.button !== 0) return;

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

                // Si el cimiento está ocupado, iniciamos el arrastre interno 3D
                if (cimientoGolpeado.userData.estaOcupado) {
                    const cimientoIndexNum = parseInt(cimientoGolpeado.userData.index, 10);
                    if (isNaN(cimientoIndexNum)) return;

                    arrastreActivoJS = true;
                    datosArrastreActuales = {
                        edificioUuid: cimientoGolpeado.userData.edificioUuid,
                        origenSlot: cimientoIndexNum,
                        tipoEdificio: cimientoGolpeado.userData.tipoEdificio
                    };

                    // Crear e inyectar un clon HTML translúcido temporal en el DOM
                    crearClonVisualDOM(e.clientX, e.clientY, cimientoGolpeado.userData.tipoEdificio);

                    // Capturar el puntero para mantener la fluidez global
                    try {
                        contenedorCanvas.setPointerCapture(e.pointerId);
                    } catch (err) {
                        // Ignorar si el navegador no lo soporta
                    }

                    e.stopPropagation();
                }
            }
        }
    });

    contenedorCanvas.addEventListener('pointermove', (e) => {
        if (!arrastreActivoJS) return;

        // Actualizar la posición del clon translúcido flotando con el cursor
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
        if (isNaN(slotIdNumerico)) {
            console.error('El slot de origen extraído no es válido.');
            return;
        }

        // Verificar si el cursor se soltó sobre la banda inferior del almacén (zona de retiro)
        const elementoBandaInferior = document.querySelector('.finca-buildings-drawer');
        if (elementoBandaInferior) {
            const rectBanda = elementoBandaInferior.getBoundingClientRect();
            if (
                e.clientX >= rectBanda.left &&
                e.clientX <= rectBanda.right &&
                e.clientY >= rectBanda.top &&
                e.clientY <= rectBanda.bottom
            ) {
                console.log(`📦 Soltado en banda inferior. Retirando estructura del slot [${slotIdNumerico}] al almacén...`);
                if (typeof socket !== 'undefined' && socket && socket.connected) {
                    socket.emit('finca:retirar-edificio', {
                        slotId: slotIdNumerico
                    });
                }
                return;
            }
        }

        // De lo contrario, verificar si se soltó sobre otro cimiento 3D mediante Raycaster
        const activeCamera = window.cameraGlobalFinca || camera;
        if (!renderer || !activeCamera) return;

        const rect = contenedorCanvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        if (clientX < 0 || clientX > rect.width || clientY < 0 || clientY > rect.height) {
            return; // Soltado fuera del canvas
        }

        mouse.x = (clientX / rect.width) * 2 - 1;
        mouse.y = -(clientY / rect.height) * 2 + 1;

        activeCamera.updateProjectionMatrix();
        raycaster.setFromCamera(mouse, activeCamera);

        const intersecciones = raycaster.intersectObjects(listaCimientos3D, true);
        if (intersecciones.length > 0) {
            const cimientoDestino = intersecciones[0].object;
            const destinoIndexNum = parseInt(cimientoDestino.userData.index, 10);

            if (isNaN(destinoIndexNum)) return;
            if (slotIdNumerico === destinoIndexNum) return;

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

/**
 * Actualiza la posición del clon flotante con el movimiento del ratón
 */
function actualizarClonVisualDOM(x, y) {
    if (!elementoClonVisual) return;
    elementoClonVisual.style.left = `${x - 40}px`;
    elementoClonVisual.style.top = `${y - 40}px`;
}

/**
 * Remueve el clon visual temporal del DOM
 */
function removerClonVisualDOM() {
    if (elementoClonVisual && elementoClonVisual.parentNode) {
        elementoClonVisual.parentNode.removeChild(elementoClonVisual);
    }
    elementoClonVisual = null;
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

            // 🛡️ CORRECCIÓN CLAVE: Forzar identificador numérico estricto en Base 10
            const idNumericoEstricto = parseInt(i, 10);

            cimientoMesh.userData = { 
                id: null,              // ID de MongoDB sincronizado dinámicamente
                index: idNumericoEstricto, 
                slotIndex: idNumericoEstricto, // Compatibilidad estricta con ranuras
                slotId: idNumericoEstricto, 
                estaOcupado: false,
                tipoEdificio: null,
                edificioUuid: null 
            };

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

            // 🛡️ CORRECCIÓN CLAVE: Forzar identificador numérico estricto en Base 10 para la Aldea también
            const idNumericoEstricto = parseInt(i, 10);

            cimientoMesh.userData = { 
                id: null,              // ID de MongoDB sincronizado dinámicamente
                index: idNumericoEstricto, 
                slotIndex: idNumericoEstricto, // Compatibilidad estricta con ranuras
                slotId: idNumericoEstricto, 
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
 * 🛡️ CORRECCIÓN DEFINITIVA DE VISIBILIDAD AL REINGRESAR:
 * Forzamos la asignación estricta de opacidad y color según el subtipo ('casona' u otros),
 * evitando que la casona o estructuras adyacentes queden transparentes o invisibles tras recargar vistas SPA.
 */
function sincronizarTerrenoEnMallas(edificiosConstruidos) {
    if (!edificiosConstruidos || !Array.isArray(edificiosConstruidos)) return;

    // Primero reiniciamos todos los cimientos a su estado libre por defecto
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

    // Luego aplicamos los edificios activos devueltos por el servidor con blindaje visual absoluto
    edificiosConstruidos.forEach(edificio => {
        const rawSlot = edificio.slotId !== undefined ? edificio.slotId : (edificio.cimientoIndex !== undefined ? edificio.cimientoIndex : edificio.slotIndex);
        const slotIdDestino = parseInt(rawSlot, 10);
        if (isNaN(slotIdDestino)) return;

        // 🛡️ CORRECCIÓN CLAVE: Buscar la malla tridimensional utilizando estrictamente slotId en Base 10
        const malla3D = listaCimientos3D.find(c => parseInt(c.userData.slotId, 10) === slotIdDestino);

        if (malla3D) {
            malla3D.userData.estaOcupado = true;
            malla3D.userData.tipoEdificio = edificio.subtipo;
            malla3D.userData.edificioUuid = edificio.uuid || edificio._id || edificio.edificioUuid;
            malla3D.userData.id = edificio._id || edificio.id || edificio.uuid || null;

            if (edificio.subtipo === 'casona') {
                malla3D.material.color.setHex(0x8b4513); // Marrón terráqueo Casona
                malla3D.material.opacity = 0.98;         // Opacidad alta para evitar invisibilidad al reingresar
                malla3D.material.transparent = false;    // Sólido para prevenir fallos de renderizado WebGL Depth
            } else {
                malla3D.material.color.setHex(0x4a5d4e); // Verde estructurado
                malla3D.material.opacity = 0.92;
                malla3D.material.transparent = true;
            }

            // 🚀 DISPARADOR DE GPU: Fuerza al renderizador a refrescar el material inmediatamente
            malla3D.material.needsUpdate = true;
        }
    });

    console.log("🎨 Sincronización visual y blindaje de la Finca completada en GPU sin fallos de invisibilidad.");
}

// ==========================================================================
// RECEPTORES DE RED DE SOCKET.IO PARA LA INGENIERÍA DE CONSTRUCCIÓN
// ==========================================================================
if (typeof socket !== 'undefined' && socket) {
    
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

    // 🚀 RECEPTOR PARA LIBERAR LA GPU AL RETIRAR
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

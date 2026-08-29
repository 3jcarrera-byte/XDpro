// Variables de control de las instancias 3D
let scene, camera, renderer;
let cimientos = [];
let raycaster, mouse;

/**
 * Inicializa el entorno gráfico 3D dentro de un contenedor HTML específico
 * @param {string} containerId - ID del elemento div contenedor
 * @param {number} maxCimientos - Cantidad de cimientos a generar (12 o 5)
 */
function init3D(containerId, maxCimientos) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Limpieza preventiva del contenedor
    container.innerHTML = '';

    // 2. Creación y configuración de la Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e24); // Gris oscuro tecnológico

    // 3. Configuración de la Cámara Perspectiva
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 1000);
    camera.position.set(0, 14, 18);
    camera.lookAt(0, 0, 0);

    // 4. Configuración del Renderizador WebGL
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 5. Configuración de Sistemas de Iluminación
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 6. Terreno / Rejilla Base de Construcción
    const gridHelper = new THREE.GridHelper(24, 24, 0x444444, 0x2c2c35);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // 7. Configuración de Raycaster para detectar clics en los cimientos
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    container.addEventListener('click', onCanvasClick);

    // 8. Distribución y renderizado de los Cimientos lógicos
    generarCimientos(maxCimientos);

    // 9. Inicio del ciclo infinito de animación
    animate();
}

/**
 * Distribuye espacialmente los cimientos geométricos translúcidos en el plano
 * @param {number} cantidad - Total de cimientos a inyectar (12 o 5)
 */
function generarCimientos(cantidad) {
    cimientos = []; // Resetear arreglo local

    // Parámetros de organización matricial
    const columnas = cantidad === 12 ? 4 : 3; 
    const distancia = 4.5; 

    for (let i = 0; i < cantidad; i++) {
        // Geometría cúbica aplanada representativa del bloque cimiento
        const geometry = new THREE.BoxGeometry(2.5, 0.4, 2.5);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x39ff14, // Verde neón translúcido
            transparent: true, 
            opacity: 0.35,
            roughness: 0.4
        });
        const cimientoMesh = new THREE.Mesh(geometry, material);

        // Algoritmo matemático para posicionamiento en grilla (Fila / Columna)
        const fila = Math.floor(i / columnas);
        const col = i % columnas;

        cimientoMesh.position.x = (col - (columnas - 1) / 2) * distancia;
        cimientoMesh.position.y = 0.2; 
        cimientoMesh.position.z = (fila - 1) * distancia;

        // Metadatos cruciales adjuntados al objeto 3D para sincronizar con la base de datos futura
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
 * Evento interceptor de selección por ratón (Raycasting)
 */
function onCanvasClick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    
    // Convertir coordenadas del puntero a espacio normalizado (-1 a +1)
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cimientos);

    if (intersects.length > 0) {
        const objetoSeleccionado = intersects[0].object;
        console.log("Cimiento presionado. Datos de ranura:", objetoSeleccionado.userData);
        
        // Acción de respuesta visual temporal (Feedback de selección)
        objetoSeleccionado.material.color.setHex(0xff0055);
        setTimeout(() => {
            objetoSeleccionado.material.color.setHex(0x39ff14);
        }, 300);
    }
}

/**
 * Ciclo principal de renderizado gráfico de la GPU
 */
function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

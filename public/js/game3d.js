// Variables globales para las instancias 3D
let scene, camera, renderer;
let activeCanvasContainer = null;

/**
 * Inicializa el entorno Three.js en un contenedor específico
 * @param {string} containerId - ID del elemento HTML contenedor (div)
 * @param {number} maxCimientos - Cantidad de cimientos a generar (5 o 12)
 */
function init3DSpace(containerId, maxCimientos) {
    // Evitar duplicados limpiando el contenedor previo si existe
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = ''; 

    // 1. Crear la Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222); // Fondo gris oscuro

    // 2. Configurar la Cámara
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    // Posición elevada y en ángulo para una perspectiva isométrica/estratégica
    camera.position.set(0, 15, 20);
    camera.lookAt(0, 0, 0);

    // 3. Configurar el Renderizador
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // 4. Iluminación básica
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // 5. Añadir terreno plano de referencia (Tierra)
    const terrenoGeo = new THREE.PlaneGeometry(30, 30);
    const terrenoMat = new THREE.MeshLambertMaterial({ color: 0x3e5c32 }); // Verde apagado
    const terreno = new THREE.Mesh(terrenoGeo, terrenoMat);
    terreno.rotation.x = -Math.PI / 2; // Colocar en horizontal
    scene.add(terreno);

    // 6. Generar Cimientos según la configuración solicitada
    generarCimientos(maxCimientos);

    // 7. Iniciar ciclo de animación estático (sin rotaciones continuas de cámara)
    animate();

    // Ajustar tamaño del canvas si la ventana cambia
    window.addEventListener('resize', () => onWindowResize(container));
}

/**
 * Distribuye los cimientos (slots de construcción) en una cuadrícula proporcional
 */
function generarCimientos(cantidad) {
    const cimientoGeo = new THREE.BoxGeometry(2, 0.2, 2); // Cubo aplanado
    const cimientoMat = new THREE.MeshLambertMaterial({ color: 0x8b8b8b }); // Color piedra/gris

    // Configuración de distribución espacial
    let columnas = cantidad === 5 ? 3 : 4; // Finca (3x2 aprox), Aldea (4x3)
    let espaciado = 4;

    for (let i = 0; i < cantidad; i++) {
        const cimiento = new THREE.Mesh(cimientoGeo, cimientoMat);
        
        // Calcular filas y columnas
        let x = (i % columnas) * espaciado - ((columnas - 1) * espaciado) / 2;
        let z = Math.floor(i / columnas) * espaciado - (Math.floor(cantidad / columnas) * espaciado) / 2;

        cimiento.position.set(x, 0.1, z); // Ligeramente elevado sobre el suelo verde
        cimiento.name = `cimiento_${i}`;
        scene.add(cimiento);

        // Añadir una línea de borde (wireframe) para resaltar los límites del cimiento
        const edges = new THREE.EdgesGeometry(cimientoGeo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
        line.position.set(x, 0.1, z);
        scene.add(line);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function onWindowResize(container) {
    if (!camera || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Conexión inicial al Servidor Árbitro mediante WebSocket
const socket = io(window.location.origin.replace(/^http/, 'ws'));

// Variable global para almacenar los datos del jugador una vez autenticado
let cuentaJugador = null;

/**
 * Enrutador principal de la Single Page Application (SPA)
 * Maneja la visibilidad de pantallas y dispara la renderización lógica de cada script
 * @param {string} screenId - El ID de la sección HTML a activar
 */
function navigate(screenId) {
    // 1. Ocultar de manera absoluta todas las pantallas de la interfaz
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // 2. Localizar y activar la pantalla de destino solicitada
    const target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    // 3. Enrutamiento lógico: Invocar los inicializadores gráficos y de datos
    if (screenId === 'screen-aldea') {
        init3D('canvas-aldea-container', 12);
    } else if (screenId === 'screen-finca') {
        init3D('canvas-finca-container', 5);
    } else if (screenId === 'screen-almacen') {
        if (typeof cargarAlmacen === 'function') cargarAlmacen();
    } else if (screenId === 'screen-carreton') {
        if (typeof cargarCarreton === 'function') cargarCarreton();
    } else if (screenId === 'screen-mercado') {
        if (typeof cargarMercado === 'function') cargarMercado();
    } else if (screenId === 'screen-arena') {
        if (typeof cargarArena === 'function') cargarArena();
    } else if (screenId === 'screen-retiros') {
        if (typeof cargarFinanzas === 'function') cargarFinanzas();
    }
}

/**
 * Envía las credenciales de inicio de sesión al servidor
 */
function login() {
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;

    if (user.trim() !== "" && pass.trim() !== "") {
        socket.emit('auth:login', { user: user, password: pass });
    } else {
        alert("Por favor rellena todos los campos.");
    }
}

/**
 * Recopila y envía los datos para crear una nueva cuenta en el Servidor
 */
function registrarCuenta() {
    const user = document.getElementById('reg-username').value;
    const pass = document.getElementById('reg-password').value;

    if (user.trim() !== "" && pass.trim() !== "") {
        socket.emit('auth:register', { user: user, password: pass });
    } else {
        alert("Por favor introduce un usuario y contraseña válidos.");
    }
}

// --- ESCUCHAS DE EVENTOS DE RED (SOCKET.IO) ---

// Registro exitoso en el servidor
socket.on('auth:register_success', (data) => {
    alert(data.mensaje);
    navigate('screen-auth'); // Redirigir al login para que ingrese
});

// Autenticación correcta
socket.on('auth:success', (data) => {
    cuentaJugador = data; // Almacenar datos globales de sesión
    alert(`¡Bienvenido de vuelta, ${data.user}!`);
    navigate('screen-menu');
});

// Captura de errores devueltos por el backend
socket.on('auth:error', (data) => {
    alert(`Error: ${data.mensaje}`);
});

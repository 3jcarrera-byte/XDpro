// Conexión inicial al Servidor Árbitro mediante WebSocket
const socket = io();

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
 * Evento de envío de autenticación al servidor árbitro
 */
function login() {
    const user = document.getElementById('username').value;
    if (user.trim() !== "") {
        socket.emit('auth:login', { user: user });
    }
}

// Escuchas globales de eventos Socket.io enviados por el Servidor
socket.on('auth:success', (data) => {
    alert(`Autenticado con éxito como: ${data.user}`);
    navigate('screen-menu');
});

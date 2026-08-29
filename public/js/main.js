const socket = io();

// Función básica para alternar pantallas
function navigate(screenId) {
    // Ocultar todas las pantallas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    // Mostrar la pantalla seleccionada
    const target = document.getElementById(screenId);
    if(target) target.classList.add('active');
}

// Envío de autenticación al servidor árbitro
function login() {
    const user = document.getElementById('username').value;
    if(user.trim() !== "") {
        socket.emit('auth:login', { user: user });
    }
}

// Escuchar respuesta del servidor
socket.on('auth:success', (data) => {
    alert(`Conectado como: ${data.user}`);
    navigate('screen-menu');
});

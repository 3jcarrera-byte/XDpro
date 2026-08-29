// public/js/main.js
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (data.success) {
            // Redirigir al juego 3D o al lobby del coliseo
            window.location.href = '/lobby.html'; 
        } else {
            alert('Error en las credenciales: ' + data.message);
        }
    } catch (err) {
        console.error('Error al conectar con el servidor de la arena:', err);
    }
});
// Captura de errores devueltos por el backend
socket.on('auth:error', (data) => {
    alert(`Error: ${data.mensaje}`);
});

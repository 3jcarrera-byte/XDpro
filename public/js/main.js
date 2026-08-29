document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const btnRegister = document.getElementById('btnRegister');

    // 1. CONTROLADOR DE REGISTRO (URGENTE)
    if (btnRegister) {
        btnRegister.addEventListener('click', async (e) => {
            e.preventDefault(); // Detiene recargas de página accidentales

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();

            if (!username || !password) {
                alert('Por favor, introduce un usuario y una contraseña.');
                return;
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    alert('¡Gladiador registrado! Ahora puedes pulsar "Entrar".');
                } else {
                    alert('Error: ' + (data.message || 'El usuario ya existe.'));
                }
            } catch (error) {
                console.error('Error en la red de la arena:', error);
                alert('No se pudo conectar con el servidor en Render.');
            }
        });
    }

    // 2. CONTROLADOR DE INICIO DE SESIÓN / ENTRAR (URGENTE)
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    // Almacenamos las credenciales localmente para que las use almacen.js
                    localStorage.setItem('gladiador_token', data.token);
                    localStorage.setItem('gladiador_id', data.userId);
                    
                    alert('¡Acceso concedido! Entrando al Coliseo...');
                    
                    // Redirección definitiva al panel de juego
                    window.location.href = '/juego.html'; 
                } else {
                    alert('Acceso denegado: ' + (data.message || 'Datos incorrectos.'));
                }
            } catch (error) {
                console.error('Error en el login:', error);
                alert('Error al autenticar en el servidor.');
            }
        });
    }
});

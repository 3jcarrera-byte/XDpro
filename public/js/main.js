// public/js/main.js

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const btnRegister = document.getElementById('btnRegister');

    // ==========================================
    // PASO 1: HABILITAR BOTÓN DE REGISTRO
    // ==========================================
    if (btnRegister) {
        btnRegister.addEventListener('click', async (e) => {
            e.preventDefault(); // Evita que la página se recargue

            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();

            // Validar que los campos no estén vacíos
            if (!username || !password) {
                alert('Por favor, ingresa un usuario y contraseña para registrarte.');
                return;
            }

            try {
                // Petición al backend para crear el usuario
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    alert('¡Registro exitoso! Ya puedes presionar "Entrar" para iniciar sesión.');
                } else {
                    alert('Error en el registro: ' + (data.message || 'El usuario ya existe.'));
                }
            } catch (error) {
                console.error('Error al conectar con el servidor:', error);
                alert('No se pudo conectar con el servidor de la arena.');
            }
        });
    }

    // ==========================================
    // PASO 2: ENTRAR AL JUEGO (LOGIN)
    // ==========================================
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
                    // Guardamos el token o el estado en localStorage para identificar al jugador
                    localStorage.setItem('game_username', username);
                    localStorage.setItem('game_user_id', data.userId);

                    alert('¡Acceso concedido! Bienvenido al imperio.');
                    
                    // Cambia 'juego.html' por la ruta real de tu vista de juego (o game3d)
                    window.location.href = '/juego.html'; 
                } else {
                    alert('Error de acceso: ' + (data.message || 'Credenciales incorrectas.'));
                }
            } catch (error) {
                console.error('Error al iniciar sesión:', error);
                alert('Error al conectar con la arena.');
            }
        });
    }
});

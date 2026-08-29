// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
    // 🔌 Conexión automática en tiempo real con el servidor (Árbitro) de Render o Vercel
    const socket = io(); 

    // Referencias a los elementos del HTML
    const loginForm = document.getElementById('loginForm');
    const btnRegister = document.getElementById('btnRegister');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // Escuchar confirmación de conexión con el Árbitro
    socket.on('connect', () => {
        console.log('⚡ Conectado al Árbitro en tiempo real (Socket ID):', socket.id);
    });

    // ==========================================
    // 1. SOLUCIÓN PASO URGENTE: LÓGICA DE REGISTRO
    // ==========================================
    btnRegister.addEventListener('click', async (e) => {
        e.preventDefault(); 

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            return alert('Para registrarte, escribe un usuario y contraseña en los campos de arriba y presiona "Registrarse".');
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert('¡Gladiador registrado exitosamente! Ahora puedes presionar "Entrar" para iniciar sesión.');
                // Limpiamos la contraseña por seguridad, listos para que presione Entrar
                passwordInput.value = '';
            } else {
                alert('Error al registrar: ' + data.message);
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            alert('Error al conectar con el servidor para el registro.');
        }
    });

    // ==========================================
    // 2. SOLUCIÓN PASO URGENTE: INICIO DE SESIÓN
    // ==========================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 

        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            return alert('Por favor, ingresa tu usuario y contraseña.');
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // ¡Login exitoso! Guardamos los datos de la sesión en el navegador
                localStorage.setItem('userId', data.userId);
                localStorage.setItem('username', data.username);
                localStorage.setItem('balance', data.balance);
                localStorage.setItem('token', data.token);

                alert(`¡Bienvenido a la Arena, ${data.username}!`);
                
                // Redirigir al flujo de pantallas SPA: Ocultamos login y mostramos menú
                document.querySelector('.login-card').style.display = 'none';
                
                // Avisamos al Árbitro por sockets que el gladiador ingresó al ecosistema de juego
                socket.emit('join_arena', { username: data.username });

                // Cambiar la vista de la SPA al Menú Principal de forma segura
                cambiarPantalla('pantalla-menu-principal');
                
            } else {
                alert('Fallo al entrar: ' + data.message);
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            alert('Error al conectar con el servidor. Verifica que tu base de datos y backend en Render estén activos.');
        }
    });

    // ==========================================
    // SISTEMA DE NAVEGACIÓN ENTRE SECCIONES (SPA)
    // ==========================================
    // Función global para mover al usuario entre Aldea, Finca, Mercado, etc.
    window.cambiarPantalla = function(idPantallaTarget) {
        // Buscamos todas las secciones/divs del juego que compartan la clase 'seccion-juego'
        const pantallas = document.querySelectorAll('.seccion-juego');
        
        pantallas.forEach(pantalla => {
            if (pantalla.id === idPantallaTarget) {
                pantalla.style.display = 'block'; // Muestra la pantalla destino
            } else {
                pantalla.style.display = 'none';  // Oculta las demás
            }
        });
    };
});

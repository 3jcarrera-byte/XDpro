// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
    // 🔌 Conexión automática en tiempo real con el servidor (Árbitro) de Render o Vercel
    const socket = io(); 

    // ========================================================
    // REFERENCIAS A LOS ELEMENTOS DEL HTML
    // ========================================================
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const btnToggleAuth = document.getElementById('btnToggleAuth');
    
    // Inputs de Inicio de Sesión
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    // Inputs de Registro
    const regUsernameInput = document.getElementById('reg-username');
    const regPasswordInput = document.getElementById('reg-password');

    // Estado local para alternar la vista de autenticación
    let modoRegistro = false;

    // Escuchar confirmación de conexión con el Árbitro
    socket.on('connect', () => {
        console.log('⚡ Conectado al Árbitro en tiempo real (Socket ID):', socket.id);
    });

    // ========================================================
    // CONTROL DEL FORMULARIO INTERCAMBIABLE (Login <-> Registro)
    // ========================================================
    if (btnToggleAuth) {
        btnToggleAuth.addEventListener('click', (e) => {
            e.preventDefault();
            modoRegistro = !modoRegistro;

            if (modoRegistro) {
                loginForm.style.display = 'none';
                registerForm.style.display = 'block';
                btnToggleAuth.innerText = 'Volver al Login';
            } else {
                loginForm.style.display = 'block';
                registerForm.style.display = 'none';
                btnToggleAuth.innerText = 'Registrarse';
            }
        });
    }

    // ========================================================
    // 1. SOLUCIÓN PASO URGENTE: LÓGICA DE REGISTRO
    // ========================================================
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault(); 

            const username = regUsernameInput.value.trim();
            const password = regPasswordInput.value.trim();

            if (!username || !password) {
                return alert('Por favor, completa todos los campos para registrarte.');
            }

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    alert('¡Gladiador registrado exitosamente! Redirigiendo al ingreso...');
                    // Limpiamos los campos por seguridad
                    regUsernameInput.value = '';
                    regPasswordInput.value = '';
                    // Forzamos el click para regresar automáticamente a la vista de login
                    btnToggleAuth.click(); 
                } else {
                    alert('Error al registrar: ' + data.message);
                }
            } catch (error) {
                console.error('Error de conexión en registro:', error);
                alert('Error al conectar con el servidor para el registro.');
            }
        });
    }

    // ========================================================
    // 2. SOLUCIÓN PASO URGENTE: INICIO DE SESIÓN
    // ========================================================
    if (loginForm) {
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
                    
                    // Ocultamos de forma definitiva la pantalla entera de Login/Registro
                    const authScreen = document.querySelector('.auth-screen');
                    if (authScreen) authScreen.style.display = 'none';
                    
                    // Activamos el botón flotante de menú
                    const floatingMenu = document.getElementById('btnFloatingMenu');
                    if (floatingMenu) floatingMenu.style.display = 'block';
                    
                    // Avisamos al Árbitro por sockets que el gladiador ingresó al ecosistema de juego
                    socket.emit('join_arena', { username: data.username });

                    // Cambiar la vista de la SPA al Menú Principal de forma segura
                    cambiarPantalla('pantalla-menu-principal');
                    
                } else {
                    alert('Fallo al entrar: ' + data.message);
                }
            } catch (error) {
                console.error('Error de conexión en login:', error);
                alert('Error al conectar con el servidor. Verifica que tu base de datos y backend en Render estén activos.');
            }
        });
    }

    // ========================================================
    // SISTEMA DE NAVEGACIÓN ENTRE SECCIONES (SPA)
    // ========================================================
    // Función global para mover al usuario entre Aldea, Finca, Mercado, etc.
    window.cambiarPantalla = function(idPantallaTarget) {
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

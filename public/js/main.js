document.addEventListener('DOMContentLoaded', () => {
    // Referencias a los elementos del HTML
    const loginForm = document.getElementById('loginForm');
    const btnRegister = document.getElementById('btnRegister');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    // ==========================================
    // LÓGICA DE INICIO DE SESIÓN
    // ==========================================
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Evita que la página se recargue al enviar el formulario

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
                
                // Redirigir al menú principal o ocultar el login
                // OPCIÓN A: Si tienes un archivo menu.html separado, usa esta línea:
                // window.location.href = '/menu.html';
                
                // OPCIÓN B: Si el juego ocurre en este mismo index.html, ocultamos el login y mostramos el juego
                document.querySelector('.login-card').style.display = 'none';
                document.getElementById('btnFloatingMenu').style.display = 'block'; 
                // Aquí llamarías a la función que inicia el entorno 3D o el menú
                
            } else {
                // Si el usuario está baneado o la clave es incorrecta, mostramos el error
                alert('Fallo al entrar: ' + data.message);
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            alert('Error al conectar con el servidor. Verifica que esté encendido.');
        }
    });

    // ==========================================
    // LÓGICA DE REGISTRO
    // ==========================================
    btnRegister.addEventListener('click', async (e) => {
        e.preventDefault(); // Evita recargas inesperadas

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
                // Opcional: limpiar los campos o dejarlos listos para entrar
            } else {
                alert('Error al registrar: ' + data.message);
            }
        } catch (error) {
            console.error('Error de conexión:', error);
            alert('Error al conectar con el servidor para el registro.');
        }
    });
});

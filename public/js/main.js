// ========================================================
// 1. INICIALIZACIÓN SEGURO DE SOCKETS (Evita caídas en Render)
// ========================================================
const socket = window.io ? window.io({ transports: ['websocket'], upgrade: false }) : null;

// ========================================================
// 2. ELEMENTOS DE INTERFAZ Y NAVEGACIÓN SPA
// ========================================================
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authScreen = document.querySelector('.auth-screen');
const btnToggleAuth = document.getElementById('btnToggleAuth');
const btnFloatingMenu = document.getElementById('btnFloatingMenu');

// Intercambiador Dinámico entre Login y Registro
if (btnToggleAuth && loginForm && registerForm) {
    btnToggleAuth.addEventListener('click', () => {
        if (registerForm.style.display === 'none') {
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex'; // Flex mapea con el diseño CSS implementado
            btnToggleAuth.textContent = 'Volver al Login';
        } else {
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
            btnToggleAuth.textContent = 'Registrarse';
        }
    });
}

// Función Global para alternar módulos del Imperio
window.cambiarPantalla = function(pantallaId) {
    // Ocultar todas las pantallas de juego
    const secciones = document.querySelectorAll('.seccion-juego');
    secciones.forEach(seccion => seccion.style.display = 'none');
    
    // Visibilizar la pantalla seleccionada
    const destino = document.getElementById(pantallaId);
    if (destino) {
        destino.style.display = 'block';
        
        // Control inteligente del botón flotante
        if (btnFloatingMenu) {
            // Si está en el menú principal o deslogueado, se oculta el botón flotante
            if (pantallaId === 'pantalla-menu-principal') {
                btnFloatingMenu.style.display = 'none';
            } else {
                btnFloatingMenu.style.display = 'block';
            }
        }
    } else {
        console.warn(`La vista con ID '${pantallaId}' no existe en el DOM.`);
    }
};

// ========================================================
// 3. LÓGICA DE REGISTRO EXTENDIDO (ESTILO VUE REACTIVO)
// ========================================================
const btnEnviarRegistro = document.getElementById('btnEnviarRegistro');
const regEmail = document.getElementById('reg-email');
const regPais = document.getElementById('reg-pais');
const regNombre = document.getElementById('reg-nombre');
const regApellido = document.getElementById('reg-apellido');
const regNick = document.getElementById('reg-nick');
const regWallet = document.getElementById('reg-wallet');
const regPassword = document.getElementById('reg-password');
const regRepetirPassword = document.getElementById('reg-repetirPassword');
const regAceptaTerminos = document.getElementById('reg-aceptaTerminos');
const regNoRobot = document.getElementById('reg-noRobot');

const camposRegistro = [
    regEmail, regPais, regNombre, regApellido, regNick, 
    regWallet, regPassword, regRepetirPassword, regAceptaTerminos, regNoRobot
].filter(Boolean);

const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function verificarFormularioValido() {
    if (!btnEnviarRegistro) return;
    const esValido = (
        regEmail && regexEmail.test(regEmail.value.trim()) &&
        regPais && regPais.value.trim() !== "" &&
        regNombre && regNombre.value.trim() !== "" &&
        regApellido && regApellido.value.trim() !== "" &&
        regNick && regNick.value.trim() !== "" &&
        regWallet && regWallet.value.trim() !== "" &&
        regPassword && regPassword.value !== "" &&
        regRepetirPassword && regRepetirPassword.value !== "" &&
        regPassword.value === regRepetirPassword.value &&
        regAceptaTerminos && regAceptaTerminos.checked &&
        regNoRobot && regNoRobot.checked
    );
    btnEnviarRegistro.disabled = !esValido;
}

camposRegistro.forEach(elemento => {
    elemento.addEventListener('input', verificarFormularioValido);
    elemento.addEventListener('change', verificarFormularioValido);
});

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (regPassword.value !== regRepetirPassword.value) {
            alert('Las contraseñas no coinciden.');
            return;
        }

        const username = regNick.value.trim();
        const password = regPassword.value;
        const textoOriginalBtn = btnEnviarRegistro.innerHTML;
        
        btnEnviarRegistro.disabled = true;
        btnEnviarRegistro.innerHTML = '⚙️ Registrando Gladiador...';

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, password,
                    email: regEmail.value.trim(),
                    pais: regPais.value.trim(),
                    nombre: regNombre.value.trim(),
                    apellido: regApellido.value.trim(),
                    wallet: regWallet.value.trim()
                })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                alert(`¡Gladiador registrado! Correo enviado a ${regEmail.value.trim()}`);
                registerForm.reset();
                verificarFormularioValido();
                if (btnToggleAuth) btnToggleAuth.click();
            } else {
                alert('Error al registrar: ' + (data.message || 'Error del servidor.'));
                btnEnviarRegistro.disabled = false;
            }
        } catch (error) {
            console.error('Error en registro:', error);
            alert('Error al conectar con el servidor.');
            btnEnviarRegistro.disabled = false;
        } finally {
            btnEnviarRegistro.innerHTML = textoOriginalBtn;
        }
    });
}

// ========================================================
// 4. LÓGICA DE INICIO DE SESIÓN (LOGIN)
// ========================================================
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        
        if (!usernameInput || !passwordInput) return;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: usernameInput.value.trim(),
                    password: passwordInput.value
                })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                // 1. Ocultar landing de autenticación
                if (authScreen) authScreen.style.display = 'none';
                
                // 2. INYECCIÓN DINÁMICA: Mostrar el perfil real del Gladiador en la Barra del Menú
                const txtNick = document.getElementById('menu-player-nick');
                const txtBalance = document.getElementById('menu-player-balance');
                
                if (txtNick) txtNick.textContent = data.username;
                if (txtBalance) txtBalance.textContent = parseFloat(data.balance || 0).toFixed(2);
                
                // 3. Entrar al Panel del Imperio
                cambiarPantalla('pantalla-menu-principal');
                
                // 4. Conectar sesión al WebSocket en tiempo real
                if (socket && socket.connected) {
                    socket.emit('jugador:autenticado', { username: data.username });
                }
            } else {
                alert('Acceso denegado: ' + (data.message || 'Credenciales erróneas.'));
            }
        } catch (error) {
            console.error('Error en login:', error);
            alert('Error de red al intentar acceder al Dominio.');
        }
    });
}

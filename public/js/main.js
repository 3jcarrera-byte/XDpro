// public/js/main.js

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
    // Asegurar estado inicial para que el primer click no falle
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';

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

/**
 * Cambia la vista activa de la SPA y gestiona la detención/activación de hilos
 * @param {string} pantallaId - ID del contenedor HTML a visibilizar
 */
window.cambiarPantalla = function(pantallaId) {
    // Ocultar todas las pantallas de juego
    const secciones = document.querySelectorAll('.seccion-juego');
    secciones.forEach(seccion => {
        seccion.style.display = 'none';
    });
    
    // Visibilizar la pantalla seleccionada
    const destino = document.getElementById(pantallaId);
    if (destino) {
        destino.style.display = 'block';
        
        // 🚀 CONTROL DE OPTIMIZACIÓN GPU PARA THREE.JS
        // Si el usuario sale del mapa, activamos la bandera de congelación en game3d
        if (typeof window.estadoMotor3D !== 'undefined') {
            if (pantallaId === 'pantalla-menu-principal') {
                window.estadoMotor3D.activo = true;
                if (typeof window.reanudarAnimacion3D === 'function') window.reanudarAnimacion3D();
            } else {
                window.estadoMotor3D.activo = false;
            }
        }

        // 🚀 DISPARADOR EXCLUSIVO DEL MERCADO MUNDIAL SANEADO
        if (pantallaId === 'pantalla-mercado') {
            if (socket && socket.connected) {
                console.log("🏪 Solicitando stock de vitrina imperial al servidor...");
                socket.emit('tienda:solicitar-stock');
            } else if (typeof refrescarCatalogoMercado === 'function') {
                refrescarCatalogoMercado(); // Respaldo local
            }
        }

        // 🚀 SOLICITUD DE DATOS DE INVENTARIO LOGÍSTICO (CARRETÓN)
        if (pantallaId === 'pantalla-carreton') {
            if (socket && socket.connected) {
                console.log("📦 Solicitando datos actualizados del Carretón al Árbitro...");
                socket.emit('carreton:solicitar-datos');
            }
        }
        
        // Control inteligente del botón flotante de emergencia
        if (btnFloatingMenu) {
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

// Inyectar escuchadores reactivos en cascada
camposRegistro.forEach(elemento => {
    elemento.addEventListener('input', verificarFormularioValido);
    elemento.addEventListener('change', verificarFormularioValido);
});

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Blindaje básico de seguridad local
        if (regPassword.value !== regRepetirPassword.value) {
            alert('Las contraseñas no coinciden.');
            return;
        }

        const username = regNick.value.trim();
        const password = regPassword.value;
        const textoOriginalBtn = btnEnviarRegistro.innerHTML;
        
        // Bloqueo UI preventivo contra clicks dobles
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
                alert(`¡Gladiador registrado con éxito! Bienvenido al Imperio.`);
                registerForm.reset();
                if (typeof verificarFormularioValido === 'function') verificarFormularioValido();
                if (btnToggleAuth) btnToggleAuth.click();
            } else {
                alert('Error al registrar: ' + (data.message || 'Error interno del Coliseo.'));
                btnEnviarRegistro.disabled = false;
            }
        } catch (error) {
            console.error('❌ Fallo de red en registro:', error);
            alert('Error al conectar con el servidor central.');
            btnEnviarRegistro.disabled = false;
        } finally {
            btnEnviarRegistro.innerHTML = textoOriginalBtn;
        }
    });
}

// ========================================================
// 4. LÓGICA DE INICIO DE SESIÓN (AUTENTICACIÓN PERSISTENTE)
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
                if (authScreen) authScreen.style.display = 'none';
                
                // Guardado preventivo en SessionStorage para mitigar reconexiones y recargas rápidas
                sessionStorage.setItem('gladiador_nick', data.username);
                sessionStorage.setItem('gladiador_poseeAldea', data.poseeAldea);
                
                // SINCRO GENERAL DE LOGUEO: Nick y Balance actualizados en todas las interfaces
                const idsNicks = ['menu-player-nick', 'carreton-player-nick'];
                const idsBalances = ['menu-player-balance', 'carreton-player-balance', 'finanzas-saldo-txt'];
                
                idsNicks.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = data.username;
                });
                
                idsBalances.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        // Si es el input/texto financiero, inyectamos el símbolo monetario de forma limpia
                        if (id === 'finanzas-saldo-txt') {
                            el.textContent = `$${parseFloat(data.balance || 0).toFixed(2)}`;
                        } else {
                            el.textContent = parseFloat(data.balance || 0).toFixed(2);
                        }
                    }
                });
                
                // Actualizar la memoria volátil del módulo financiero si estuviera cargado
                if (typeof datosFinanzas !== 'undefined') {
                    datosFinanzas.saldoDisponible = parseFloat(data.balance || 0);
                }
                
                // 1. Saltamos a la pantalla del menú principal
                cambiarPantalla('pantalla-menu-principal');
                
                // 2. DISPARADOR 3D: Inicialización segura del motor gráfico
                if (typeof inicializarMundo3D === 'function') {
                    setTimeout(inicializarMundo3D, 50);
                }
                
                // 3. VINCULACIÓN AUTORITARIA DE RED EN TIEMPO REAL
                if (socket) {
                    if (socket.connected) {
                        socket.emit('jugador:autenticado', { username: data.username });
                    }
                    
                    // Escudo protector: si el túnel cae, re-autenticar automáticamente al levantar
                    socket.on('connect', () => {
                        const nickActivo = sessionStorage.getItem('gladiador_nick');
                        if (nickActivo) {
                            socket.emit('jugador:autenticado', { username: nickActivo });
                        }
                    });
                }
            } else {
                alert('Acceso denegado: ' + (data.message || 'Credenciales erróneas imperial.'));
            }
        } catch (error) {
            console.error('❌ Fallo de red en login:', error);
            alert('Error de red al intentar acceder al dominio del Imperio.');
        }
    });
}

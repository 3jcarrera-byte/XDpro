// public/js/main.js (Versión Definitiva Unificada - SPA, Autenticación y Control 3D)

// ========================================================
// 1. INICIALIZACIÓN SEGURA DE SOCKETS (Evita caídas en Render)
// ========================================================
const socket = window.io ? window.io({ transports: ['websocket'], upgrade: false }) : null;

// Escucha global de reconexión WebSocket (Evita acumulación de listeners)
if (socket) {
    socket.on('connect', () => {
        const nickActivo = sessionStorage.getItem('gladiador_nick');
        if (nickActivo) {
            console.log('🔄 Re-autenticando socket para:', nickActivo);
            socket.emit('jugador:autenticado', { username: nickActivo });
        }
    });
}

// ========================================================
// 2. FUNCIONES AUXILIARES DE INTERFAZ Y DATOS
// ========================================================

/**
 * Actualiza los elementos DOM que muestran el Nickname y el Saldo en todas las pantallas.
 * @param {string} nick - Nombre de usuario
 * @param {number|string} balance - Saldo del jugador
 */
window.actualizarInterfazUsuario = function(nick, balance) {
    const valBalance = parseFloat(balance || 0);
    const idsNicks = ['menu-player-nick', 'carreton-player-nick', 'mercado-player-nick', 'finca-player-nick', 'aldea-player-nick'];
    const idsBalances = ['menu-player-balance', 'carreton-player-balance', 'mercado-player-balance', 'finca-player-balance', 'aldea-player-balance', 'finanzas-saldo-txt'];

    idsNicks.forEach(id => {
        const el = document.getElementById(id);
        if (el && nick) el.textContent = nick;
    });

    idsBalances.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (id === 'finanzas-saldo-txt') {
                el.textContent = `$${valBalance.toFixed(2)}`;
            } else {
                el.textContent = valBalance.toFixed(2);
            }
        }
    });

    if (typeof window.datosFinanzas !== 'undefined') {
        window.datosFinanzas.saldoDisponible = valBalance;
    }
};

// ========================================================
// 3. ELEMENTOS DE INTERFAZ Y NAVEGACIÓN SPA
// ========================================================
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authScreen = document.querySelector('.auth-screen');
const btnToggleAuth = document.getElementById('btnToggleAuth');
const btnFloatingMenu = document.getElementById('btnFloatingMenu');

// Intercambiador Dinámico entre Login y Registro
if (btnToggleAuth && loginForm && registerForm) {
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';

    btnToggleAuth.addEventListener('click', () => {
        if (registerForm.style.display === 'none') {
            loginForm.style.display = 'none';
            registerForm.style.display = 'flex';
            btnToggleAuth.textContent = 'Volver al Login';
        } else {
            registerForm.style.display = 'none';
            loginForm.style.display = 'block';
            btnToggleAuth.textContent = 'Registrarse';
        }
        
        // Recalcular validación al alternar vistas
        if (typeof verificarFormularioValido === 'function') {
            verificarFormularioValido();
        }
    });
}

/**
 * Cambia la vista activa de la SPA y gestiona la detención/activación de hilos 3D
 * @param {string} pantallaId - ID del contenedor HTML a visibilizar
 */
window.cambiarPantalla = function(pantallaId) {
    const secciones = document.querySelectorAll('.seccion-juego');
    secciones.forEach(seccion => {
        seccion.style.display = 'none';
    });
    
    const destino = document.getElementById(pantallaId);
    if (destino) {
        destino.style.display = 'block';
        
        // CONTROL DE OPTIMIZACIÓN GPU PARA THREE.JS (MENÚ PRINCIPAL Y ESCENARIOS)
        if (typeof window.estadoMotor3D !== 'undefined') {
            if (pantallaId === 'pantalla-menu-principal') {
                window.estadoMotor3D.activo = true;
                if (typeof window.reanudarAnimacion3D === 'function') window.reanudarAnimacion3D();
            } else if (pantallaId !== 'pantalla-finca' && pantallaId !== 'pantalla-aldea') {
                window.estadoMotor3D.activo = false;
            }
        }

        // DISPARADOR AUTOMÁTICO MOTOR 3D: FINCA PERSONAL (5 CIMIENTOS)
        if (pantallaId === 'pantalla-finca') {
            if (typeof init3D === 'function') {
                console.log("🏗️ Inicializando terreno 3D de la Finca...");
                init3D('canvas-finca-container', 5);
            }
            
            setTimeout(() => {
                if (typeof cargarCarreton === 'function') cargarCarreton();
                if (typeof cargarAlmacen === 'function') cargarAlmacen();
            }, 50);
        }

        // DISPARADOR AUTOMÁTICO MOTOR 3D: ALDEA IMPERIAL (12 CIMIENTOS)
        if (pantallaId === 'pantalla-aldea') {
            if (typeof init3D === 'function') {
                console.log("🏛️ Inicializando terreno 3D de la Aldea (12 Cimientos)...");
                init3D('canvas-aldea-container', 12);
            }
            setTimeout(() => {
                if (typeof cargarCarreton === 'function') cargarCarreton();
            }, 50);
        }

        // HERENCIA CONTINUA DE FONDOS REALES AL ENTRAR AL MERCADO
        if (pantallaId === 'pantalla-mercado') {
            const nickReal = sessionStorage.getItem('gladiador_nick') || document.getElementById('menu-player-nick')?.textContent;
            const balanceReal = document.getElementById('menu-player-balance')?.textContent;
            
            if (nickReal) {
                window.actualizarInterfazUsuario(nickReal, balanceReal);
            }

            if (socket && socket.connected) {
                console.log("🏪 Conexión activa: Solicitando stock de vitrina imperial...");
                socket.emit('tienda:solicitar-stock');
            }
        }

        // SOLICITUD DE DATOS DE INVENTARIO LOGÍSTICO (CARRETÓN)
        if (pantallaId === 'pantalla-carreton') {
            if (typeof cargarCarreton === 'function') {
                console.log("📦 Solicitando datos actualizados del Carretón al Árbitro...");
                cargarCarreton();
            }
        }

        // Control inteligente del botón flotante de emergencia
        if (btnFloatingMenu) {
            btnFloatingMenu.style.display = (pantallaId === 'pantalla-menu-principal') ? 'none' : 'block';
        }
    } else {
        console.warn(`La vista con ID '${pantallaId}' no existe en el DOM.`);
    }
};

// ========================================================
// 4. LÓGICA DE REGISTRO EXTENDIDO (DEFENSIVA Y REACTIVA)
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

    // Validación defensiva comprobando existencia previa de elementos
    const esValido = (
        regEmail && regEmail.value.trim() !== "" && regexEmail.test(regEmail.value.trim()) &&
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

// Vinculación de eventos de escucha sin duplicaciones
camposRegistro.forEach(elemento => {
    elemento.addEventListener('input', verificarFormularioValido);
    elemento.addEventListener('change', verificarFormularioValido);
});

// Comprobación inicial al cargar el script
verificarFormularioValido();

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!regPassword || !regRepetirPassword || !regNick || !regEmail) {
            alert('Error: No se encontraron los campos del formulario en el DOM.');
            return;
        }

        if (regPassword.value !== regRepetirPassword.value) {
            alert('Las contraseñas no coinciden.');
            return;
        }

        const username = regNick.value.trim();
        const password = regPassword.value;
        const textoOriginalBtn = btnEnviarRegistro ? btnEnviarRegistro.innerHTML : 'Registrarse';

        if (btnEnviarRegistro) {
            btnEnviarRegistro.disabled = true;
            btnEnviarRegistro.innerHTML = '⚙️ Registrando Gladiador...';
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    password,
                    email: regEmail ? regEmail.value.trim() : '',
                    pais: regPais ? regPais.value.trim() : '',
                    nombre: regNombre ? regNombre.value.trim() : '',
                    apellido: regApellido ? regApellido.value.trim() : '',
                    wallet: regWallet ? regWallet.value.trim() : ''
                })
            });
            
            const data = await response.json();

            if (response.ok && data.success) {
                alert('¡Gladiador registrado con éxito! Bienvenido al Imperio.');
                registerForm.reset();
                verificarFormularioValido();
                if (btnToggleAuth) btnToggleAuth.click();
            } else {
                alert('Error al registrar: ' + (data.message || 'Error interno del Coliseo.'));
                if (btnEnviarRegistro) btnEnviarRegistro.disabled = false;
            }
        } catch (error) {
            console.error('❌ Fallo de red en registro:', error);
            alert('Error al conectar con el servidor central.');
            if (btnEnviarRegistro) btnEnviarRegistro.disabled = false;
        } finally {
            if (btnEnviarRegistro) btnEnviarRegistro.innerHTML = textoOriginalBtn;
        }
    });
}

// ========================================================
// 5. LÓGICA DE INICIO DE SESIÓN (AUTENTICACIÓN PERSISTENTE)
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
                
                sessionStorage.setItem('gladiador_nick', data.username);
                sessionStorage.setItem('gladiador_poseeAldea', data.poseeAldea || false);
                
                // Actualiza la interfaz globalmente
                window.actualizarInterfazUsuario(data.username, data.balance);
                
                cambiarPantalla('pantalla-menu-principal');
                
                if (typeof inicializarMundo3D === 'function') {
                    setTimeout(inicializarMundo3D, 50);
                }
                
                // Emite el evento directo tras verificar el login
                if (socket && socket.connected) {
                    socket.emit('jugador:autenticado', { username: data.username });
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

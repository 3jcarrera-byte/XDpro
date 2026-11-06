// ==========================================================================
// public/js/main.js - Versión Definitiva Unificada (SPA, Autenticación y Control 3D)
// ==========================================================================

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

/**
 * Gestiona de forma precisa la visibilidad de los accesos a la Aldea y su pestaña en el mercado.
 * @param {boolean|string} poseeAldea - Estado de la aldea del gladiador
 */
window.gestionarVisibilidadAldea = function(poseeAldea) {
    const esValido = poseeAldea === true || poseeAldea === "true";
    
    // Seleccionamos ÚNICAMENTE el botón de navegación principal y la pestaña específica de Ubicar Aldeas
    const elementosAldea = document.querySelectorAll('.btn-ir-aldea, #btn-menu-aldea, [data-tab="ubicar-aldeas"], .tab-ubicar-aldeas');

    elementosAldea.forEach(el => {
        if (!esValido) {
            el.style.display = 'none';
            el.style.pointerEvents = 'none';
            el.disabled = true;
        } else {
            el.style.display = ''; // Restaura su visualización original por CSS
            el.style.pointerEvents = 'auto';
            el.disabled = false;
        }
    });
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
        
        // Aplicar estado de visibilidad de Aldea en cada cambio de pantalla
        const poseeAldeaReal = sessionStorage.getItem('gladiador_poseeAldea');
        window.gestionarVisibilidadAldea(poseeAldeaReal);

        // CONTROL DE OPTIMIZACIÓN GPU PARA THREE.JS (MENÚ PRINCIPAL Y ESCENARIOS)
        if (typeof window.estadoMotor3D !== 'undefined') {
            if (pantallaId === 'pantalla-menu-principal') {
                window.estadoMotor3D.activo = true;
                if (typeof window.reanudarAnimacion3D === 'function') window.reanudarAnimacion3D();
            } else if (pantallaId !== 'pantalla-finca' && pantallaId !== 'pantalla-aldea') {
                window.estadoMotor3D.activo = false;
            }
        }

        // ==========================================================================
        // 🏗️ DISPARADOR LOGÍSTICO COMPENSADO: FINCA IMPERIAL (SINCRONIZACIÓN FÍSICA)
        // ==========================================================================
        if (pantallaId === 'pantalla-finca') {
            if (typeof init3D === 'function') {
                init3D('canvas-finca-container', 5);
            }
            
            // Autenticación de socket y solicitud de recursos diferida estrictamente al entrar a la Finca
            if (socket && socket.connected) {
                const nickActivo = sessionStorage.getItem('gladiador_nick');
                if (nickActivo) {
                    console.log('🔄 Vinculando socket y solicitando inventario arquitectónico para:', nickActivo);
                    socket.emit('jugador:autenticado', { username: nickActivo });
                }
            }

            setTimeout(() => {
                if (typeof cargarAlmacen === 'function') {
                    cargarAlmacen();
                } else if (typeof renderizarAlmacen === 'function') {
                    renderizarAlmacen();
                }
                if (typeof cargarCarreton === 'function') cargarCarreton();
            }, 120);
        } else if (pantallaId === 'pantalla-aldea') {
            if (typeof init3D === 'function' && document.getElementById('canvas-aldea-container')) {
                init3D('canvas-aldea-container', 12);
            }
            setTimeout(() => {
                if (typeof renderizarAlmacen === 'function') renderizarAlmacen();
                if (typeof cargarCarreton === 'function') cargarCarreton();
            }, 100);
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
                
                // Actualiza la interfaz globalmente y gestiona la aldea
                window.actualizarInterfazUsuario(data.username, data.balance);
                window.gestionarVisibilidadAldea(data.poseeAldea);
                
                cambiarPantalla('pantalla-menu-principal');
                
                if (typeof inicializarMundo3D === 'function') {
                    setTimeout(inicializarMundo3D, 50);
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

// ========================================================
// 6. GESTIÓN DE CARTAS (CIUDADELA Y CASONA COLONIAL) Y MERCADO
// ========================================================
window.cargarAlmacen = function() {
    console.log("🏛️ Cargando inventario del almacén de la Finca...");
    
    // Definición obligatoria de cartas base para evitar contenedor vacío
    const cartasBaseFinca = [
        {
            id: "edificio_supremo_unico",
            nombre: "Ciudadela Ancestral",
            descripcion: "Edificación primigenia del dominio. Totalmente indestructible e intradeable.",
            indestructible: true,
            intradeable: true,
            rareza: "mitica"
        },
        {
            id: "carta_casona",
            nombre: "Casona Colonial",
            descripcion: "Plano principal de la Casona para la Finca.",
            indestructible: false,
            intradeable: false,
            rareza: "rara"
        }
    ];

    let inventarioActual = window.inventarioJugador || [];
    
    // Fusionar de forma segura asegurando que existan en el almacén
    cartasBaseFinca.forEach(cartaBase => {
        if (!inventarioActual.some(c => c.id === cartaBase.id)) {
            inventarioActual.unshift(cartaBase);
        }
    });

    window.inventarioJugador = inventarioActual;
    window.renderizarAlmacen();
};

window.renderizarAlmacen = function() {
    const zonaPlanos = document.querySelector('footer') || document.querySelector('#almacen-edificios, .almacen-planos, [data-almacen]');
    if (!zonaPlanos) return;

    let gridCartas = document.getElementById('grid-cartas-almacen');
    if (!gridCartas) {
        gridCartas = document.createElement('div');
        gridCartas.id = 'grid-cartas-almacen';
        gridCartas.style.display = 'flex';
        gridCartas.style.gap = '10px';
        gridCartas.style.flexWrap = 'wrap';
        gridCartas.style.marginTop = '10px';
        zonaPlanos.appendChild(gridCartas);
    }

    gridCartas.innerHTML = '';

    (window.inventarioJugador || []).forEach(carta => {
        const tarjetaEl = document.createElement('div');
        tarjetaEl.className = `carta-item-inventario ${carta.indestructible ? 'carta-protegida-suprema' : ''}`;
        tarjetaEl.setAttribute('draggable', 'true');
        tarjetaEl.dataset.id = carta.id;
        tarjetaEl.dataset.indestructible = carta.indestructible ? 'true' : 'false';
        tarjetaEl.dataset.intradeable = carta.intradeable ? 'true' : 'false';

        tarjetaEl.style.background = '#2a2416';
        tarjetaEl.style.border = '1px solid #d4af37';
        tarjetaEl.style.padding = '8px 12px';
        tarjetaEl.style.borderRadius = '6px';
        tarjetaEl.style.cursor = 'grab';
        tarjetaEl.style.color = '#f3e5ab';
        tarjetaEl.style.minWidth = '140px';

        tarjetaEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <strong>🏛️ ${carta.nombre}</strong>
                ${carta.indestructible ? '<span title="Indestructible e Intradeable">🔒✨</span>' : ''}
            </div>
            <p style="font-size: 11px; margin: 0; opacity: 0.85;">${carta.descripcion}</p>
        `;

        // Evento de arrastre (Drag & Drop) hacia el cimiento 3D
        tarjetaEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', JSON.stringify(carta));
        });

        gridCartas.appendChild(tarjetaEl);
    });
};

/**
 * Función sincronizada para comprar artículos en el Mercado Comercial con verificación de usuario y saldo
 * @param {string} idItem - Identificador del ítem en la tienda
 * @param {number} precioItem - Costo en monedas del ítem
 */
window.comprarCartaMercado = function(idItem, precioItem) {
    const nickActivo = sessionStorage.getItem('gladiador_nick');
    const balanceActual = parseFloat(document.getElementById('mercado-player-balance')?.textContent || 0);

    if (!nickActivo) {
        alert('⚠️ Error de sesión: Debe iniciar sesión para adquirir bienes en el mercado.');
        return;
    }

    if (balanceActual < precioItem) {
        alert('🪙 Saldo insuficiente en el cofre imperial para adquirir esta carta.');
        return;
    }

    if (socket && socket.connected) {
        console.log(`🛒 Solicitando compra de ${idItem} para el gladiador ${nickActivo}...`);
        socket.emit('tienda:comprar-item', {
            username: nickActivo,
            itemId: idItem,
            precio: precioItem
        });
    } else {
        alert('❌ Error de conexión: No hay enlace activo con el Árbitro del servidor.');
    }
};

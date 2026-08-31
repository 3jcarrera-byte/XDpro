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
        
        // 🚀 DISPARADOR EXCLUSIVO DEL MERCADO MUNDIAL SANEADO
        // Al viajar al mercado, forzamos al Árbitro a despachar la vitrina oficial
        if (pantallaId === 'pantalla-mercado') {
            if (typeof socket !== 'undefined' && socket && socket.connected) {
                console.log("🏪 Solicitando stock de vitrina imperial al servidor...");
                socket.emit('tienda:solicitar-stock');
            } else if (typeof refrescarCatalogoMercado === 'function') {
                refrescarCatalogoMercado(); // Respaldo local
            }
        }
        
        // Control inteligente del botón flotante
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
// 4. LÓGICA DE INICIO DE SESIÓN (LOGIN TOTALMENTE COMPLETO)
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
                
                // SINCRO GENERAL DE LOGUEO: Nick y Balance actualizados en todas las interfaces
                const idsNicks = ['menu-player-nick', 'carreton-player-nick'];
                const idsBalances = ['menu-player-balance', 'carreton-player-balance'];
                
                idsNicks.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = data.username;
                });
                
                idsBalances.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = parseFloat(data.balance || 0).toFixed(2);
                });
                
                // 1. Saltamos a la pantalla del menú
                cambiarPantalla('pantalla-menu-principal');
                
                // 2. DISPARADOR 3D: Inicialización del motor tridimensional del Menú
                if (typeof inicializarMundo3D === 'function') {
                    setTimeout(inicializarMundo3D, 50);
                }
                
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
// public/js/carreton.js

// Estado lógico de la Interfaz (Sincronizado dinámicamente desde MongoDB)
let datosCarreton = {
    poseeAldea: false, 
    slotsAldeaMax: 16,
    slotsFincaMax: 8,
    slotsCentralMax: 8, // Por defecto inicia protegido en 8 slots finca
    cartasAldea: [],
    cartasFinca: [],
    cartasCentral: []
};

/**
 * Solicita las coordenadas y activos autorizados por la Base de Datos al Árbitro
 */
function cargarCarreton() {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:solicitar-datos');
    }
}

/**
 * Helper para renderizar los slots con soporte Drag & Drop nativo y funcional
 */
function renderizarBloqueCarreton(elementoDOM, listaCartas, maxSlots, estaHabilitado, mensajeBloqueo) {
    elementoDOM.innerHTML = '';

    if (!estaHabilitado) {
        elementoDOM.innerHTML = `<div class="carreton-bloqueado-msg">${mensajeBloqueo}</div>`;
        elementoDOM.parentElement.classList.add('bloqueado');
        return;
    }

    elementoDOM.parentElement.classList.remove('bloqueado');
    const bloqueTipo = elementoDOM.id.replace('carreton-', '').replace('-lista', '');

    // Generar la cuadrícula reglamentaria de ranuras enmarcadas
    for (let i = 0; i < maxSlots; i++) {
        const slotDiv = document.createElement('div');
        slotDiv.className = 'carreton-slot';
        slotDiv.dataset.bloque = bloqueTipo;
        slotDiv.dataset.slotIndex = i;

        // EVENTOS DEL SLOT CAPTADOR (Zona donde se suelta la carta)
        slotDiv.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            if (!slotDiv.classList.contains('ocupado')) {
                slotDiv.style.border = '1px solid #d4af37';
                slotDiv.style.background = 'rgba(212, 175, 55, 0.05)';
            }
        });

        slotDiv.addEventListener('dragleave', () => {
            slotDiv.style.border = '';
            slotDiv.style.background = '';
        });

        slotDiv.addEventListener('drop', (e) => {
            e.preventDefault();
            slotDiv.style.border = '';
            slotDiv.style.background = '';
            
            const cartaId = e.dataTransfer.getData('text/plain');
            const bloqueDestino = slotDiv.dataset.bloque;
            const slotDestinoIndex = parseInt(slotDiv.dataset.slotIndex);

            // Cancelar movimiento si la ranura de destino ya está ocupada
            if (slotDiv.classList.contains('ocupado')) return;

            ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex);
        });

        // Buscar si existe un personaje asignado por la base de datos a este índice de ranura (slotIndex)
        const carta = listaCartas.find(c => c.slotIndex === i);

        if (carta) {
            slotDiv.className += ' ocupado';
            
            // Inyectamos la tarjeta del poblador y la hacemos explícitamente arrastrable
            slotDiv.innerHTML = `
                <div class="pj-carta-arrastrable" draggable="true" data-id="${carta.id}" style="width:100%; height:100%; cursor:grab; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <div class="pj-icono" style="font-size:24px; margin-bottom:4px;">${carta.icono || '👤'}</div>
                    <div class="pj-nombre" style="font-size:12px; color:#fff; font-weight:bold;">${carta.nombre}</div>
                    <div class="pj-lvl" style="font-size:10px; color:#a89276;">Nv. ${carta.nivel}</div>
                </div>
            `;

            const elementoArrastrable = slotDiv.querySelector('.pj-carta-arrastrable');

            // EVENTOS DE SEGUIMIENTO DEL MOUSE AL LLEVARSE LA CARTA
            elementoArrastrable.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', carta.id);
                slotDiv.style.opacity = '0.3'; // Opacidad mientras flota el mouse
            });

            elementoArrastrable.addEventListener('dragend', () => {
                slotDiv.style.opacity = '1';
                cargarCarreton(); // Forzar refresco para limpiar descolocaciones visuales
            });
        } else {
            slotDiv.innerHTML = `<span class="slot-vacio-txt">Vacío</span>`;
        }
        elementoDOM.appendChild(slotDiv);
    }
}

/**
 * Notifica al Árbitro de Render las nuevas coordenadas para salvar de forma persistente en MongoDB
 */
function ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex) {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:guardar-posicion', {
            cartaId: cartaId,
            bloqueDestino: bloqueDestino,
            slotDestinoIndex: slotDestinoIndex
        });
    }
}

// Escuchador reactivo conectado al flujo de datos autorizado de la Base de Datos
if (typeof socket !== 'undefined' && socket) {
    socket.on('carreton:actualizar-estado', (estadoBD) => {
        console.log("Datos del Carretón autorizados por la Base de Datos recibidos:", estadoBD);
        
        datosCarreton.poseeAldea = estadoBD.poseeAldea;
        datosCarreton.slotsCentralMax = estadoBD.slotsCentralMax; // Recibe 8 o 24 desde el servidor
        datosCarreton.cartasAldea = estadoBD.cartasAldea || [];
        datosCarreton.cartasFinca = estadoBD.cartasFinca || [];
        datosCarreton.cartasCentral = estadoBD.cartasCentral || [];

        const contAldea = document.getElementById('carreton-aldea-lista');
        const contCentral = document.getElementById('carreton-central-lista');
        const contFinca = document.getElementById('carreton-finca-lista');

        if (!contAldea || !contCentral || !contFinca) return;

        // Render masivo aplicando restricciones estrictas de herencia de estilos
        renderizarBloqueCarreton(contAldea, datosCarreton.cartasAldea, datosCarreton.slotsAldeaMax, datosCarreton.poseeAldea, "🔒 RESTRICCIÓN: Requiere poseer la Aldea NFT");
        renderizarBloqueCarreton(contCentral, datosCarreton.cartasCentral, datosCarreton.slotsCentralMax, true, "");
        renderizarBloqueCarreton(contFinca, datosCarreton.cartasFinca, datosCarreton.slotsFincaMax, true, "");

        // Actualizar indicador de capacidad central
        const txtCapacidad = document.getElementById('carreton-central-capacidad');
        if (txtCapacidad) {
            txtCapacidad.innerText = `Slots Centrales: ${datosCarreton.cartasCentral.length} / ${datosCarreton.slotsCentralMax}`;
        }
    });
}

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
// public/js/carreton.js

// Estado lógico de la Interfaz (Sincronizado dinámicamente desde MongoDB)
let datosCarreton = {
    poseeAldea: false, 
    slotsAldeaMax: 16,
    slotsFincaMax: 8,
    slotsCentralMax: 8, // Dinámico: protegido en 8 slots finca, escala a 24 con la Aldea NFT
    cartasAldea: [],
    cartasFinca: [],
    cartasCentral: []
};

/**
 * Solicita los datos de inventario autorizados por la Base de Datos a través del Árbitro
 */
function cargarCarreton() {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('carreton:solicitar-datos');
    }
}

/**
 * Helper para renderizar los slots con soporte Drag & Drop nativo y funcional
 * @param {HTMLElement} elementoDOM - Contenedor del grid destino
 * @param {Array} listaCartas - Arreglo de cartas asignadas a este bloque
 * @param {number} maxSlots - Cantidad reglamentaria de ranuras
 * @param {boolean} estaHabilitado - Flag de control NFT
 * @param {string} mensajeBloqueo - Cadena informativa de restricción imperial
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

            // Cancelar movimiento local si la ranura de destino ya está ocupada
            if (slotDiv.classList.contains('ocupado')) return;

            if (typeof ejecutarMovimientoDrag === 'function') {
                ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex);
            }
        });

        // Buscar si existe un personaje asignado por la base de datos a este índice de ranura (slotIndex)
        // BLINDAJE: Evalúa tanto la propiedad .id como .uuid por retrocompatibilidad del modelo mixto
        const carta = listaCartas.find(c => c.slotIndex === i);

        if (carta) {
            slotDiv.classList.add('ocupado');
            const cartaIdentificador = carta.id || carta.uuid;
            
            // Inyectamos la tarjeta del poblador y la hacemos explícitamente arrastrable
            slotDiv.innerHTML = `
                <div class="pj-carta-arrastrable" draggable="true" data-id="${cartaIdentificador}" style="width:100%; height:100%; cursor:grab; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                    <div class="pj-icono" style="font-size:24px; margin-bottom:4px;">${carta.icono || '👤'}</div>
                    <div class="pj-nombre" style="font-size:12px; color:#fff; font-weight:bold;">${carta.nombre}</div>
                    <div class="pj-lvl" style="font-size:10px; color:#a89276;">Nv. ${carta.nivel || 1}</div>
                </div>
            `;

            const elementoArrastrable = slotDiv.querySelector('.pj-carta-arrastrable');

            // EVENTOS DE SEGUIMIENTO DEL MOUSE AL LLEVARSE LA CARTA
            elementoArrastrable.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', cartaIdentificador);
                slotDiv.style.opacity = '0.3'; // Opacidad mientras flota el mouse en el canvas
            });

            elementoArrastrable.addEventListener('dragend', () => {
                slotDiv.style.opacity = '1';
                cargarCarreton(); // Forzar refresco para limpiar descolocaciones visuales en SPA
            });
        } else {
            slotDiv.innerHTML = `<span class="slot-vacio-txt">Vacío</span>`;
        }
        elementoDOM.appendChild(slotDiv);
    }
}
/**
 * Notifica al Árbitro de Render las nuevas coordenadas para salvar de forma persistente en MongoDB
 * @param {string} cartaId - Identificador único UUID de la carta arrastrada
 * @param {string} bloqueDestino - Bloque receptor ('aldea', 'finca', 'central')
 * @param {number} slotDestinoIndex - Índice de la ranura seleccionada
 */
function ejecutarMovimientoDrag(cartaId, bloqueDestino, slotDestinoIndex) {
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        // Blindaje defensivo local previo al envío de red
        if (!cartaId || !bloqueDestino || isNaN(slotDestinoIndex)) return;

        socket.emit('carreton:guardar-posicion', {
            cartaId: cartaId,
            bloqueDestino: bloqueDestino,
            slotDestinoIndex: slotDestinoIndex
        });
    } else {
        console.error("❌ Error logístico: Sin conexión con el Árbitro del servidor.");
        alert("Se ha perdido la conexión con el Coliseo. Reintentando...");
        cargarCarreton(); // Forzar intento de re-sincronización
    }
}

// Escuchador reactivo conectado al flujo de datos autorizado de la Base de Datos
if (typeof socket !== 'undefined' && socket) {
    socket.on('carreton:actualizar-estado', (estadoBD) => {
        if (!estadoBD) return;
        console.log("🏛️ Datos del Carretón validados por la Base de Datos recibidos:", estadoBD);
        
        // Sincronización atómica del estado reactivo global en memoria
        datosCarreton.poseeAldea = estadoBD.poseeAldea || false;
        datosCarreton.slotsCentralMax = estadoBD.slotsCentralMax || 8; 
        datosCarreton.cartasAldea = estadoBD.cartasAldea || [];
        datosCarreton.cartasFinca = estadoBD.cartasFinca || [];
        datosCarreton.cartasCentral = estadoBD.cartasCentral || [];

        // Rastrear nodos de inyección en el DOM de la SPA
        const contAldea = document.getElementById('carreton-aldea-lista');
        const contCentral = document.getElementById('carreton-central-lista');
        const contFinca = document.getElementById('carreton-finca-lista');

        if (!contAldea || !contCentral || !contFinca) {
            console.warn("⚠️ Los contenedores del carretón no se encuentran cargados en el DOM activo.");
            return;
        }

        // Render masivo aplicando restricciones estrictas de propiedad NFT
        renderizarBloqueCarreton(contAldea, datosCarreton.cartasAldea, datosCarreton.slotsAldeaMax, datosCarreton.poseeAldea, "🔒 RESTRICCIÓN: Requiere poseer la Aldea NFT");
        renderizarBloqueCarreton(contCentral, datosCarreton.cartasCentral, datosCarreton.slotsCentralMax, true, "");
        renderizarBloqueCarreton(contFinca, datosCarreton.cartasFinca, datosCarreton.slotsFincaMax, true, "");

        // Actualizar indicador de capacidad central dinámico en la UI
        const txtCapacidad = document.getElementById('carreton-central-capacidad');
        if (txtCapacidad) {
            txtCapacidad.innerText = `Slots Centrales: ${datosCarreton.cartasCentral.length} / ${datosCarreton.slotsCentralMax}`;
        }
    });
    
    // Escudo ante fallos de servidor: Capturar errores enviados por el Árbitro
    socket.on('carreton:error', (mensajeError) => {
        console.error("❌ Denegación autoritaria del servidor:", mensajeError);
        alert(`Movimiento inválido: ${mensajeError}`);
        cargarCarreton(); // Revertir el render local trayendo el estado real de MongoDB
    });
}

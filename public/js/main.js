// ========================================================
// INITIALIZACIÓN SEGURO DE SOCKETS (Para evitar caídas en Render)
// ========================================================
// Nota: Si ya declaraste 'socket' en otra parte superior de main.js, puedes omitir esta línea.
const socket = window.io ? window.io({ transports: ['websocket'], upgrade: false }) : null;

// ========================================================
// LÓGICA DE REGISTRO EXTENDIDO (ESTILO VUE REACTIVO)
// ========================================================
const registerForm = document.getElementById('registerForm');
const btnEnviarRegistro = document.getElementById('btnEnviarRegistro');
const btnToggleAuth = document.getElementById('btnToggleAuth');

// Captura segura de todos los nuevos campos del formulario
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

// Agrupamos los elementos existentes para evitar evaluar nulls
const camposRegistro = [
    regEmail, regPais, regNombre, regApellido, regNick, 
    regWallet, regPassword, regRepetirPassword, regAceptaTerminos, regNoRobot
].filter(Boolean);

// Expresión regular estándar para validar correos electrónicos
const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Función para validar el formulario completo en tiempo real
function verificarFormularioValido() {
    if (!btnEnviarRegistro) return;

    // Evaluamos que todos los campos cumplan con las reglas de negocio
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

    // Activa o desactiva el botón emulando la propiedad computada de Vue
    btnEnviarRegistro.disabled = !esValido;
}

// Escuchar cambios en cada elemento para refrescar el estado del botón
camposRegistro.forEach(elemento => {
    elemento.addEventListener('input', verificarFormularioValido);
    elemento.addEventListener('change', verificarFormularioValido);
});

// Envío de datos al Árbitro en Render
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Doble verificación de seguridad antes de disparar la red
        if (regPassword.value !== regRepetirPassword.value) {
            alert('Las contraseñas no coinciden.');
            return;
        }

        // Mapeamos el campo 'nick' al 'username' que espera tu base de datos actual
        const username = regNick.value.trim();
        const password = regPassword.value;

        // Feedback visual de carga y bloqueo de re-envíos
        const textoOriginalBtn = btnEnviarRegistro.innerHTML;
        btnEnviarRegistro.disabled = true;
        btnEnviarRegistro.innerHTML = '⚙️ Registrando Gladiador...';

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    password,
                    email: regEmail.value.trim(),
                    pais: regPais.value.trim(),
                    nombre: regNombre.value.trim(),
                    apellido: regApellido.value.trim(),
                    wallet: regWallet.value.trim()
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert(`¡Gladiador registrado exitosamente! Se ha enviado un correo de verificación simulado a ${regEmail.value.trim()}`);
                
                // Limpieza total y segura de los campos
                registerForm.reset();
                
                // Forzar actualización del estado del botón
                verificarFormularioValido();
                
                // Regresar a la vista de login de forma automática
                if (btnToggleAuth) btnToggleAuth.click();
            } else {
                alert('Error al registrar: ' + (data.message || 'Error desconocido del servidor.'));
                btnEnviarRegistro.disabled = false;
            }
        } catch (error) {
            console.error('Error de conexión en registro:', error);
            alert('Error al conectar con el servidor para procesar el Imperio.');
            btnEnviarRegistro.disabled = false;
        } finally {
            // Restaurar el texto del botón pase lo que pase
            btnEnviarRegistro.innerHTML = textoOriginalBtn;
        }
    });
}

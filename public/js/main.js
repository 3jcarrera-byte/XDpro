    // ========================================================
    // LÓGICA DE REGISTRO EXTENDIDO (ESTILO VUE REACTIVO)
    // ========================================================
    const btnEnviarRegistro = document.getElementById('btnEnviarRegistro');
    
    // Captura de todos los nuevos campos del formulario
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

    // Función para validar el formulario completo en tiempo real
    function verificarFormularioValido() {
        const esValido = (
            regEmail.value.trim() !== "" &&
            regPais.value.trim() !== "" &&
            regNombre.value.trim() !== "" &&
            regApellido.value.trim() !== "" &&
            regNick.value.trim() !== "" &&
            regWallet.value.trim() !== "" &&
            regPassword.value !== "" &&
            regRepetirPassword.value !== "" &&
            regPassword.value === regRepetirPassword.value &&
            regAceptaTerminos.checked &&
            regNoRobot.checked
        );

        // Activa o desactiva el botón emulando la propiedad computada de Vue
        btnEnviarRegistro.disabled = !esValido;
    }

    // Escuchar cambios en cada elemento para refrescar el estado del botón
    const camposRegistro = [regEmail, regPais, regNombre, regApellido, regNick, regWallet, regPassword, regRepetirPassword, regAceptaTerminos, regNoRobot];
    camposRegistro.forEach(elemento => {
        if(elemento) {
            elemento.addEventListener('input', verificarFormularioValido);
            elemento.addEventListener('change', verificarFormularioValido);
        }
    });

    // Envío de datos al Árbitro en Render
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Mapeamos el campo 'nick' al 'username' que espera tu base de datos actual
            const username = regNick.value.trim();
            const password = regPassword.value;

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
                    
                    // Limpieza total de los campos
                    camposRegistro.forEach(c => {
                        if(c.type === 'checkbox') c.checked = false;
                        else c.value = '';
                    });
                    
                    // Regresar a la vista de login
                    btnToggleAuth.click();
                } else {
                    alert('Error al registrar: ' + data.message);
                }
            } catch (error) {
                console.error('Error de conexión en registro:', error);
                alert('Error al conectar con el servidor para procesar el Imperio.');
            }
        });
    }

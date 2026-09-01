// public/js/finanzas.js

// Estado lógico del módulo financiero del jugador (Sincronizado dinámicamente con MongoDB)
let datosFinanzas = {
    saldoDisponible: 0.00, // Se actualiza mediante main.js y respuestas del servidor
    historialTransacciones: [],
    retirosPendientes: []
};

/**
 * Inicializa y renderiza los paneles del módulo de retiros y finanzas
 */
function cargarFinanzas() {
    const txtSaldo = document.getElementById('finanzas-saldo-txt');
    const contenedorHistorial = document.getElementById('finanzas-historial-lista');
    const contenedorPendientes = document.getElementById('finanzas-pendientes-lista');

    // Sincronizar UI con el estado en memoria de forma reactiva
    if (txtSaldo) txtSaldo.innerText = `$${datosFinanzas.saldoDisponible.toFixed(2)}`;

    // 1. Renderizar Historial de Transacciones
    if (contenedorHistorial) {
        contenedorHistorial.innerHTML = datosFinanzas.historialTransacciones.length === 0 
            ? '<p class="finanzas-vacio">No hay transacciones registradas.</p>' 
            : datosFinanzas.historialTransacciones.map(tx => `
                <div class="finanzas-item tx-${tx.tipo.toLowerCase()}">
                    <span>${tx.fecha} - ${tx.tipo}</span>
                    <span class="tx-monto">${tx.tipo === 'Retiro' ? '-' : '+'}$${tx.cantidad.toFixed(2)}</span>
                    <span class="tx-estado status-${tx.estado.toLowerCase()}">${tx.estado}</span>
                </div>
            `).join('');
    }

    // 2. Renderizar Bloque de Retiros Pendientes
    if (contenedorPendientes) {
        contenedorPendientes.innerHTML = datosFinanzas.retirosPendientes.length === 0 
            ? '<p class="finanzas-vacio">No tienes retiros en proceso de auditoría.</p>' 
            : datosFinanzas.retirosPendientes.map(ret => {
                const walletLimpia = ret.billetera ? `${ret.billetera.substring(0, 6)}...${ret.billetera.substring(ret.billetera.length - 4)}` : 'Desconocida';
                return `
                    <div class="finanzas-item tx-retiro">
                        <span>Billetera: ${walletLimpia}</span>
                        <span class="tx-monto">-$${ret.cantidad.toFixed(2)}</span>
                        <span class="tx-estado status-pendiente">Pendiente</span>
                    </div>
                `;
            }).join('');
    }
}

/**
 * Procesa la solicitud de retiro notificando de forma autoritaria al Servidor
 */
function solicitarRetiro() {
    const inputMonto = document.getElementById('retiro-monto-input');
    const inputBilletera = document.getElementById('retiro-billetera-input');

    if (!inputMonto || !inputBilletera) return;

    const monto = parseFloat(inputMonto.value);
    const billetera = inputBilletera.value.trim();

    // Validaciones del protocolo financiero en cliente (Primera capa)
    if (isNaN(monto) || monto <= 0) {
        alert("Por favor, introduce un monto válido para el retiro.");
        return;
    }
    if (billetera === "") {
        alert("Debes especificar una dirección de billetera de destino.");
        return;
    }
    if (monto > datosFinanzas.saldoDisponible) {
        alert("Fondos insuficientes para procesar este retiro.");
        return;
    }

    // BLINDAJE REAL: Emitir evento de red al Árbitro en lugar de descontar localmente
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        btnFloatingMenu.disabled = true; // Bloqueo de UI temporal
        
        socket.emit('finanzas:solicitar-retiro', {
            monto: monto,
            billetera: billetera
        });

        // Limpiar campos preventivamente
        inputMonto.value = '';
        inputBilletera.value = '';
    } else {
        alert("❌ Error de red: Sin conexión con el servidor del Imperio.");
    }
}

/**
 * Protocolo seguro de pasarela para inyección y sincronización de fondos
 */
function procesarRecarga() {
    const monto = prompt("Introduce el monto a depositar en tus arcas imperiales:");
    const valor = parseFloat(monto);

    if (isNaN(valor) || valor <= 0) {
        alert("Monto de recarga inválido.");
        return;
    }

    // BLINDAJE REAL: El dinero se notifica al servidor para impactar MongoDB de verdad
    if (typeof socket !== 'undefined' && socket && socket.connected) {
        socket.emit('finanzas:procesar-recarga', { monto: valor });
    } else {
        alert("❌ Error de red: No se pudo contactar al Árbitro.");
    }
}

// ========================================================
// RECEPTORES DE RED DE SOCKET.IO (SINCRONIZACIÓN DE FONDOS)
// ========================================================
if (typeof socket !== 'undefined' && socket) {
    
    // Escuchar actualizaciones de saldo e historial autorizados
    socket.on('finanzas:actualizar-estado', (estadoFinanciero) => {
        console.log("📈 Estado financiero validado por MongoDB recibido:", estadoFinanciero);
        
        datosFinanzas.saldoDisponible = estadoFinanciero.balance || 0;
        datosFinanzas.historialTransacciones = estadoFinanciero.historial || [];
        datosFinanzas.retirosPendientes = estadoFinanciero.pendientes || [];

        // Mantener sincronizadas las barras superiores del menú de main.js
        const idsBalances = ['menu-player-balance', 'carreton-player-balance'];
        idsBalances.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = datosFinanzas.saldoDisponible.toFixed(2);
        });

        cargarFinanzas();
    });

    // Escuchar alertas de éxito transaccional
    socket.on('finanzas:operacion-exitosa', (msg) => {
        alert(msg);
    });

    // Capturar bloqueos y denegaciones financieras
    socket.on('finanzas:error', (mensajeError) => {
        console.error("❌ Denegación financiera del servidor:", mensajeError);
        alert(`Operación rechazada: ${mensajeError}`);
        // Volver a solicitar datos limpios para corregir la UI
        if (socket.connected) socket.emit('finanzas:solicitar-datos');
    });
}

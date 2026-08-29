// Estado lógico del módulo financiero del jugador
let datosFinanzas = {
    saldoDisponible: 250.50, // Representación en la moneda del juego o USD
    historialTransacciones: [
        { id: "tx_01", tipo: "Recarga", cantidad: 100.00, fecha: "2026-08-25", estado: "Completado" },
        { id: "tx_02", tipo: "Retiro", cantidad: 50.00, fecha: "2026-08-28", estado: "Completado" }
    ],
    retirosPendientes: []
};

/**
 * Inicializa y renderiza los paneles del módulo de retiros y finanzas
 */
function cargarFinanzas() {
    const txtSaldo = document.getElementById('finanzas-saldo-txt');
    const contenedorHistorial = document.getElementById('finanzas-historial-lista');
    const contenedorPendientes = document.getElementById('finanzas-pendientes-lista');

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
            : datosFinanzas.retirosPendientes.map(ret => `
                <div class="finanzas-item tx-retiro">
                    <span>Billetera: ${ret.billetera.substring(0,6)}...${ret.billetera.substring(ret.billetera.length - 4)}</span>
                    <span class="tx-monto">-$${ret.cantidad.toFixed(2)}</span>
                    <span class="tx-estado status-pendiente">Pendiente</span>
                </div>
            `).join('');
    }
}

/**
 * Procesa la solicitud de retiro validando los fondos disponibles
 */
function solicitarRetiro() {
    const inputMonto = document.getElementById('retiro-monto-input');
    const inputBilletera = document.getElementById('retiro-billetera-input');

    if (!inputMonto || !inputBilletera) return;

    const monto = parseFloat(inputMonto.value);
    const billetera = inputBilletera.value.trim();

    // Validaciones del protocolo financiero
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

    // Aplicar descuento de saldo y mover al flujo pendiente
    datosFinanzas.saldoDisponible -= monto;
    
    const nuevoRetiro = {
        id: "ret_" + Date.now(),
        tipo: "Retiro",
        cantidad: monto,
        billetera: billetera,
        fecha: new Date().toISOString().split('T')[0],
        estado: "Pendiente"
    };

    datosFinanzas.retirosPendientes.push(nuevoRetiro);
    alert("Solicitud registrada. Tu retiro ha entrado en cola de revisión técnica.");

    // Limpiar campos y refrescar interfaz
    inputMonto.value = '';
    inputBilletera.value = '';
    cargarFinanzas();
}

/**
 * Simulación del protocolo de pasarela para inyección de fondos
 */
function procesarRecarga() {
    const monto = prompt("Introduce el monto a simular para la recarga:");
    const valor = parseFloat(monto);

    if (!isNaN(valor) && valor > 0) {
        datosFinanzas.saldoDisponible += valor;
        datosFinanzas.historialTransacciones.unshift({
            id: "tx_" + Date.now(),
            tipo: "Recarga",
            cantidad: valor,
            fecha: new Date().toISOString().split('T')[0],
            estado: "Completado"
        });
        cargarFinanzas();
        alert(`¡Recarga exitosa! Se han acreditado $${valor.toFixed(2)} a tu balance.`);
    }
}

/**
 * Modelo de Datos estructurado para la persistencia del Jugador
 * Controla credenciales, estados de cuenta y billetera financiera.
 */
class UserModel {
    /**
     * @param {string} username - Nombre único de cuenta
     * @param {string} password - Contraseña cifrada o en texto plano para testing
     */
    constructor(username, password) {
        this.username = username;
        this.password = password; // En producción, siempre usar hashes como bcrypt
        
        // --- PROPIEDADES FINANCIERAS (Vinculadas a public/js/finanzas.js) ---
        this.saldoDisponible = 250.50; // Saldo inicial por defecto
        this.billeteraVinculada = null; // Dirección de wallet asociada
        this.historialTransacciones = [
            { id: "tx_init", tipo: "Registro", cantidad: 0.00, fecha: new Date().toISOString().split('T')[0], estado: "Completado" }
        ];
        this.retirosPendientes = [];

        // --- FLAGS DE PROGRESO DE JUEGO (Vinculadas a carretón y mapas) ---
        this.poseeAldea = false; // Define si tiene habilitados los 16 slots del carretón izquierdo
        this.nivelFinca = 1;
    }

    /**
     * Inserta una nueva solicitud de retiro bajo los protocolos técnicos establecidos
     * @param {number} monto - Cantidad a retirar
     * @param {string} direccionBilletera - Wallet de destino
     * @returns {object} Resultado lógico de la operación
     */
    registrarSolicitudRetiro(monto, direccionBilletera) {
        if (monto <= 0 || isNaN(monto)) {
            return { error: true, mensaje: "Monto inválido para el procesamiento." };
        }
        if (monto > this.saldoDisponible) {
            return { error: true, mensaje: "Fondos insuficientes en la cuenta." };
        }

        // Aplicar cobro al balance y mover a cola de auditoría
        this.saldoDisponible -= monto;
        this.billeteraVinculada = direccionBilletera;

        const nuevoRetiro = {
            id: "ret_" + Date.now(),
            tipo: "Retiro",
            cantidad: monto,
            billetera: direccionBilletera,
            fecha: new Date().toISOString().split('T')[0],
            estado: "Pendiente"
        };

        this.retirosPendientes.push(nuevoRetiro);
        return { error: false, datos: nuevoRetiro, nuevoSaldo: this.saldoDisponible };
    }

    /**
     * Aplica fondos a la cuenta a través del simulador de pasarela
     * @param {number} monto - Cantidad a ingresar
     */
    inyectarFondosRecarga(monto) {
        if (monto > 0) {
            this.saldoDisponible += monto;
            this.historialTransacciones.unshift({
                id: "tx_" + Date.now(),
                tipo: "Recarga",
                cantidad: monto,
                fecha: new Date().toISOString().split('T')[0],
                estado: "Completado"
            });
            return true;
        }
        return false;
    }
}

// Exportar el módulo para su consumo en el servidor Árbitro
module.exports = UserModel;

// Estado lógico simulado del Mercado Mundial P2P y Sistema
let datosMercado = {
    ofertasSistema: [
        { id: "sis_01", nombre: "Sobre de Personaje", precio: 150, tipo: "Sistema", icono: "🃏" },
        { id: "sis_02", nombre: "Poción de Energía x5", precio: 50, tipo: "Sistema", icono: "🧪" }
    ],
    ofertasP2P: [
        { id: "p2p_01", nombre: "Minero Experto", precio: 320, vendedor: "User_402", tipo: "Carta", icono: "⛏️" },
        { id: "p2p_02", nombre: "Madera Alfa x100", precio: 80, vendedor: "CryptoFarmer", tipo: "Recurso", icono: "🪵" }
    ],
    aldeasDisponibles: ["Aldea Origen", "Aldea de la Jungla", "Aldea del Valle"]
};

/**
 * Inicializa y renderiza los componentes de la interfaz de Mercado Mundial
 */
function cargarMercado() {
    const contenedorSistema = document.getElementById('mercado-sistema-lista');
    const contenedorP2P = document.getElementById('mercado-p2p-lista');
    const selectorAldeas = document.getElementById('mercado-aldeas-select');

    if (!contenedorSistema || !contenedorP2P || !selectorAldeas) return;

    // 1. Renderizar Ofertas del Sistema
    contenedorSistema.innerHTML = '';
    datosMercado.ofertasSistema.forEach(oferta => {
        contenedorSistema.appendChild(crearTarjetaMercado(oferta, true));
    });

    // 2. Renderizar Ofertas P2P (Jugadores)
    contenedorP2P.innerHTML = '';
    datosMercado.ofertasP2P.forEach(oferta => {
        contenedorP2P.appendChild(crearTarjetaMercado(oferta, false));
    });

    // 3. Rellenar Selector de Mercados Locales de Aldeas
    selectorAldeas.innerHTML = '<option value="general">-- Buscar Mercado de Aldea --</option>';
    datosMercado.aldeasDisponibles.forEach(aldea => {
        const opt = document.createElement('option');
        opt.value = aldea.toLowerCase().replace(/ /g, "_");
        opt.innerText = aldea;
        selectorAldeas.appendChild(opt);
    });
}

/**
 * Genera de forma dinámica la tarjeta visual de un producto en venta
 */
function crearTarjetaMercado(item, esSistema) {
    const card = document.createElement('div');
    card.className = 'mercado-item-card';
    card.innerHTML = `
        <div class="mercado-item-icono">${item.icono}</div>
        <div class="mercado-item-detalles">
            <span class="mercado-item-nombre">${item.nombre}</span>
            <span class="mercado-item-origen">${esSistema ? 'Tienda del Sistema' : 'Vendedor: ' + item.vendedor}</span>
        </div>
        <div class="mercado-item-compra">
            <span class="mercado-item-precio">💰 ${item.precio}</span>
            <button class="btn-mercado-comprar" onclick="procesarCompraItem('${item.id}')">Comprar</button>
        </div>
    `;
    return card;
}

function filtrarPorAldea() {
    const seleccion = document.getElementById('mercado-aldeas-select').value;
    console.log(`Filtrando catálogo para el mercado de: ${seleccion}`);
}

function procesarCompraItem(idItem) {
    console.log(`Enviando evento de compra al árbitro para el ítem: ${idItem}`);
    alert(`Solicitud de transacción enviada al servidor para el objeto ID: ${idItem}`);
}

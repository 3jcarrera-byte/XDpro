// Estado local del inventario del Almacén
let inventarioAlmacen = {
    producibles: [
        { id: "prod_01", nombre: "Madera Alfa", cantidad: 15, rareza: "Común", icono: "🪵" },
        { id: "prod_02", nombre: "Piedra Cantera", cantidad: 8, rareza: "Común", icono: "🪨" },
        { id: "prod_03", nombre: "Lingote de Hierro", cantidad: 3, rareza: "Raro", icono: "🪙" }
    ],
    consumibles: [
        { id: "cons_01", nombre: "Ración de Trigo", cantidad: 50, rareza: "Común", icono: "🌾" },
        { id: "cons_02", nombre: "Poción de Energía", cantidad: 5, rareza: "Épico", icono: "🧪" }
    ]
};

/**
 * Inicializa y renderiza la interfaz visual del Almacén de cartas
 */
function cargarAlmacen() {
    const contenedor = document.getElementById('almacen-cartas-container');
    if (!contenedor) return;

    // Limpiar contenido previo de la interfaz
    contenedor.innerHTML = '';

    // 1. Renderizar sección de Recursos Producibles
    const seccionProd = crearSeccionCartas("Cartas de Recursos Producibles", inventarioAlmacen.producibles);
    contenedor.appendChild(seccionProd);

    // 2. Renderizar sección de Recursos Consumibles
    const seccionCons = crearSeccionCartas("Cartas de Recursos Consumibles", inventarioAlmacen.consumibles);
    contenedor.appendChild(seccionCons);
}

/**
 * Helper para estructurar los bloques contenedores de cartas
 */
function crearSeccionCartas(titulo, listaCartas) {
    const wrapper = document.createElement('div');
    wrapper.className = 'almacen-seccion';

    const h4 = document.createElement('h4');
    h4.innerText = titulo;
    h4.className = 'almacen-titulo-seccion';
    wrapper.appendChild(h4);

    const grid = document.createElement('div');
    grid.className = 'almacen-grid-cartas';

    listaCartas.forEach(carta => {
        const cartaDiv = document.createElement('div');
        cartaDiv.className = `carta-item rareza-${carta.rareza.toLowerCase()}`;
        cartaDiv.innerHTML = `
            <div class="carta-icono">${carta.icono}</div>
            <div class="carta-info">
                <span class="carta-nombre">${carta.nombre}</span>
                <span class="carta-rareza">${carta.rareza}</span>
                <span class="carta-cantidad">Cant: ${carta.cantidad}</span>
            </div>
            <button class="btn-carta-accion" onclick="usarCartaRecurso('${carta.id}')">Gestionar</button>
        `;
        grid.appendChild(cartaDiv);
    });

    wrapper.appendChild(grid);
    return wrapper;
}

/**
 * Handler interactivo para el uso o consumo de cartas
 */
function usarCartaRecurso(idCarta) {
    // Buscar la carta dentro de ambas categorías del estado local
    let carta = inventarioAlmacen.producibles.find(c => c.id === idCarta) || 
                inventarioAlmacen.consumibles.find(c => c.id === idCarta);

    if (carta) {
        console.log(`Acción ejecutada sobre la carta: ${carta.nombre}`);
        // Interacción temporal: simular consumo reduciendo la cantidad
        if (carta.cantidad > 0) {
            carta.cantidad--;
            cargarAlmacen(); // Refrescar vista
        } else {
            alert(`No te quedan unidades de ${carta.nombre}`);
        }
    }
}

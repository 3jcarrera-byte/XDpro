// Estado local del mazo, personaje seleccionado y equipamiento de la Arena
let datosArena = {
    personajeSeleccionado: { nombre: "Guerrero Alfa", nivel: 5, icono: "🛡️", equipado: "Espada de Bronce" },
    mazoCombate: [
        { id: "c_01", nombre: "Golpe Crítico", tipo: "Ataque", valor: 25, icono: "⚔️" },
        { id: "c_02", nombre: "Barrera Total", tipo: "Defensa", valor: 30, icono: "🔮" },
        { id: "c_03", nombre: "Inyección de Vida", tipo: "Curación", valor: 15, icono: "🧪" }
    ],
    inventarioEquipamiento: ["Espada de Bronce", "Escudo de Hierro", "Amuleto de Suerte"]
};

/**
 * Inicializa y renderiza los componentes interactivos de la Arena de combate
 */
function cargarArena() {
    const contenedorHeroe = document.getElementById('arena-heroe-box');
    const contenedorMazo = document.getElementById('arena-mazo-grid');

    if (!contenedorHeroe || !contenedorMazo) return;

    // 1. Renderizar Bloque del Personaje y Equipamiento
    contenedorHeroe.innerHTML = `
        <div class="heroe-card-visual">
            <div class="heroe-avatar">${datosArena.personajeSeleccionado.icono}</div>
            <h4>${datosArena.personajeSeleccionado.nombre} (Nv. ${datosArena.personajeSeleccionado.nivel})</h4>
            <p>Objeto: <strong id="item-equipado-txt">${datosArena.personajeSeleccionado.equipado}</strong></p>
            <select id="arena-equipamiento-select" onchange="cambiarEquipamiento()">
                ${datosArena.inventarioEquipamiento.map(item => 
                    `<option value="${item}" ${item === datosArena.personajeSeleccionado.equipado ? 'selected' : ''}>${item}</option>`
                ).join('')}
            </select>
        </div>
    `;

    // 2. Renderizar Bloque del Mazo de Cartas
    contenedorMazo.innerHTML = '';
    datosArena.mazoCombate.forEach(carta => {
        const itemMazo = document.createElement('div');
        itemMazo.className = `arena-carta-item tipo-${carta.tipo.toLowerCase()}`;
        itemMazo.innerHTML = `
            <div class="card-top"><span>${carta.icono}</span> <span>${carta.tipo}</span></div>
            <h5>${carta.nombre}</h5>
            <div class="card-value">Efecto: +${carta.valor}</div>
        `;
        contenedorMazo.appendChild(itemMazo);
    });
}

/**
 * Maneja el cambio de equipamiento del héroe en tiempo real
 */
function cambiarEquipamiento() {
    const nuevoObjeto = document.getElementById('arena-equipamiento-select').value;
    datosArena.personajeSeleccionado.equipado = nuevoObjeto;
    console.log(`Nuevo equipamiento asignado: ${nuevoObjeto}`);
    document.getElementById('item-equipado-txt').innerText = nuevoObjeto;
}

/**
 * Simulación de emparejamiento para batalla de 3 jugadores
 */
function buscarPartida() {
    const btn = document.getElementById('btn-buscar-pelea');
    if (!btn) return;

    btn.innerText = "Buscando oponentes (0/3)...";
    btn.disabled = true;

    // Simular retraso de red buscando 2 usuarios adicionales mediante Socket.io
    setTimeout(() => { btn.innerText = "Oponentes encontrados (2/3)..."; }, 1500);
    setTimeout(() => { 
        btn.innerText = "¡Pelea Iniciada!"; 
        alert("Conectando con el servidor Árbitro para iniciar combate de 3 jugadores.");
        btn.innerText = "Buscar Pelea";
        btn.disabled = false;
    }, 3000);
}

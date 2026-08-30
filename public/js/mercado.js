// public/js/mercado.js

// Estado global de los filtros del mercado activo en memoria
let filtroMercado = {
    modo: 'general',       // 'general' o 'interno'
    rubro: 'edificios',    // 'edificios', 'aldeanos', 'equipamiento', 'recursos', 'especiales'
    subrubro: 'todos',     // 'todos', 'armas', 'escudos', 'joyas', 'armadura'
    rareza: 'todas'        // 'todas', 'comun', 'poco-comun', 'raro', etc.
};

// 1. Conmutador principal: Mercado General vs Búsqueda de Aldeas
function cambiarModoMercado(modoSeleccionado) {
    filtroMercado.modo = modoSeleccionado;
    
    // UI de las pestañas superiores
    document.getElementById('btn-mercado-general').classList.toggle('active', modoSeleccionado === 'general');
    document.getElementById('btn-mercado-interno').classList.toggle('active', modoSeleccionado === 'interno');
    
    // Contenedores de sub-pantallas
    const panelBuscador = document.getElementById('subpantalla-buscador-aldeas');
    const panelProductos = document.getElementById('subpantalla-filtros-productos');
    
    if (modoSeleccionado === 'interno') {
        panelBuscador.style.display = 'block';
        panelProductos.style.display = 'none'; // Se oculta hasta que elijan una aldea válida
    } else {
        panelBuscador.style.display = 'none';
        panelProductos.style.display = 'block';
        refrescarCatalogoMercado();
    }
}

// 2. Controlador de Rubros (Muestra/Oculta sub-filtros de equipamiento)
function cambiarRubro(rubroSeleccionado) {
    filtroMercado.rubro = rubroSeleccionado;
    
    // Actualizar estados visuales de los botones del rubro
    const botones = document.querySelectorAll('.btn-filter-rubro');
    botones.forEach(btn => {
        const texto = btn.textContent.toLowerCase();
        btn.classList.toggle('active', texto.includes(rubroSeleccionado));
    });

    // Control reactivo del sub-filtro de equipamientos (Armas, escudos, etc.)
    const cajaSubRubros = document.getElementById('grupo-subfiltro-equipamiento');
    if (rubroSeleccionado === 'equipamiento') {
        cajaSubRubros.style.display = 'flex';
    } else {
        cajaSubRubros.style.display = 'none';
        filtroMercado.subrubro = 'todos'; // Resetear
    }

    refrescarCatalogoMercado();
}

// 3. Controlador de Sub-Rubros para el Equipamiento
function cambiarSubRubro(subrubroSeleccionado) {
    filtroMercado.subrubro = subrubroSeleccionado;
    
    const botones = document.querySelectorAll('.btn-filter-subrubro');
    botones.forEach(btn => {
        const texto = btn.textContent.toLowerCase();
        if (subrubroSeleccionado === 'todos') {
            btn.classList.toggle('active', texto === 'todos');
        } else {
            btn.classList.toggle('active', texto.includes(subrubroSeleccionado));
        }
    });

    refrescarCatalogoMercado();
}

// 4. Controlador de Rarezas
function cambiarRareza(rarezaSeleccionada) {
    filtroMercado.rareza = rarezaSeleccionada;
    
    const botones = document.querySelectorAll('.btn-filter-rareza');
    botones.forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick');
        btn.classList.toggle('active', onclickAttr.includes(`'${rarezaSeleccionada}'`));
    });

    refrescarCatalogoMercado();
}

// 5. Simulación de búsqueda de Aldeas locales
function ejecutarBusquedaAldea() {
    const input = document.getElementById('input-buscar-aldea').value.trim();
    if (!input) {
        alert('Por favor introduce un nombre o ID de aldea válido.');
        return;
    }
    
    // Simulamos respuesta exitosa inyectando un botón de acceso a la aldea encontrada
    const resultadoContenedor = document.getElementById('lista-aldeas-resultado');
    resultadoContenedor.innerHTML = `
        <div class="village-search-card" style="background:#221a15; border:1px solid #d4af37; padding:15px; border-radius:8px; margin-top:15px; display:flex; justify-content:space-between; align-items:center; width:100%;">
            <div>
                <h4 style="color:#ffd700;">🏘️ Aldea: ${input}</h4>
                <p style="color:#888; font-size:12px;">Propietario: Gladiador_Pro</p>
            </div>
            <button class="btn-sidebar" onclick="entrarMercadoInternoAldea('${input}')" style="width:auto; padding:8px 15px;">Entrar a su Mercado</button>
        </div>
    `;
}

function entrarMercadoInternoAldea(nombreAldea) {
    // Una vez elegida la aldea, abrimos sus filtros específicos
    document.getElementById('subpantalla-buscador-aldeas').style.display = 'none';
    document.getElementById('subpantalla-filtros-productos').style.display = 'block';
    
    console.log(`Operando en el mercado local de la aldea: ${nombreAldea}`);
    refrescarCatalogoMercado();
}

// 6. Refrescar contenedor visual de items en base a filtros combinados
function refrescarCatalogoMercado() {
    const escaparate = document.getElementById('contenedor-items-mercado');
    console.log("Filtros aplicados en red:", filtroMercado);
    
    // Renderizado informativo temporal mientras se conecta al socket de ofertas
    escaparate.innerHTML = `
        <div style="text-align:center; color:#ebdcb9;">
            <p>🔍 Filtrando catálogo por:</p>
            <strong style="color:#ffd700;">Modo:</strong> ${filtroMercado.modo.toUpperCase()} | 
            <strong style="color:#ffd700;">Rubro:</strong> ${filtroMercado.rubro} 
            ${filtroMercado.rubro === 'equipamiento' ? `(${filtroMercado.subrubro})` : ''} | 
            <strong style="color:#ffd700;">Rareza:</strong> ${filtroMercado.rareza}
        </div>
    `;
}
function procesarCompraItem(idItem) {
    console.log(`Enviando evento de compra al árbitro para el ítem: ${idItem}`);
    alert(`Solicitud de transacción enviada al servidor para el objeto ID: ${idItem}`);
}

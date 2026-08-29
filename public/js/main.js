function navigate(screenId) {
    // Ocultar todas las pantallas del juego
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        } else if (screenId === 'screen-almacen') {
    cargarAlmacen();
} else if (screenId === 'screen-carreton') {
    cargarCarreton(); // <-- NUEVO: Inicializa el carretón al entrar
}
    });
    
    // Activar sección de destino
    const target = document.getElementById(screenId);
    if(target) target.classList.add('active');

    // Despacho de inicializadores 3D según el destino
    if (screenId === 'screen-aldea') {
        init3D('canvas-aldea-container', 12); // Genera los 12 bloques solicitados
    } else if (screenId === 'screen-finca') {
        init3D('canvas-finca-container', 5);   // Genera los 5 bloques solicitados
    }
}

function navigate(screenId) {
    // Ocultar todas las pantallas del juego
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Activar sección de destino
    const target = document.getElementById(screenId);
    if(target) target.classList.add('active');

    // Despacho de inicializadores según el destino
    if (screenId === 'screen-aldea') {
        init3D('canvas-aldea-container', 12);
    } else if (screenId === 'screen-finca') {
        init3D('canvas-finca-container', 5);
    } else if (screenId === 'screen-almacen') {
        cargarAlmacen(); // <-- Inyectar esta línea
    } else if (screenId === 'screen-carreton') {
        cargarCarreton(); // <-- Inyectar esta línea
    }
}
    
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

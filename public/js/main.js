const socket = io();

function navigate(screenId) {
    // Ocultar todas las pantallas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Mostrar la pantalla seleccionada
    const target = document.getElementById(screenId);
    if(target) target.classList.add('active');

    // DISPARADORES 3D SEGÚN LA PANTALLA SELECCIONADA
    if (screenId === 'screen-aldea') {
        // Inicializa 12 cimientos en el contenedor de la Aldea
        setTimeout(() => init3DSpace('canvas-aldea-container', 12), 50);
    } else if (screenId === 'screen-finca') {
        // Inicializa 5 cimientos en el contenedor de la Finca
        setTimeout(() => init3DSpace('canvas-finca-container', 5), 50);
    }
}

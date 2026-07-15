// Accesibilidad de teclado en modales: antes ningún modal se podía cerrar
// con Escape ni atrapaba el foco, así que un usuario navegando solo con
// teclado podía "salirse" del modal con Tab hacia botones de detrás que ni
// siquiera deberían ser alcanzables mientras el modal está abierto.
const ALL_MODALS = [updateModal, modsModal, accountsModal, consoleModal, importModal];
let lastFocusedBeforeModal = null;

function getFocusableElements(container) {
    return Array.from(container.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.offsetParent !== null);
}

function getActiveModal() {
    return ALL_MODALS.find((m) => m.classList.contains('active')) || null;
}

// Escape antes cerraba el modal quitándole la clase "active" directamente,
// saltándose el botón de cerrar real de cada uno — que en el caso de
// modsModal, por ejemplo, también recarga la lista de modpacks (y con ella
// la barra de uso de almacenamiento). El resultado era que cerrar con
// Escape dejaba esos datos desactualizados hasta la próxima vez que se
// abriera la lista a mano.
const MODAL_CLOSE_BUTTONS = new Map([
    [updateModal, updateLaterBtn],
    [modsModal, closeModsModalBtn],
    [accountsModal, closeAccountsModalBtn],
    [consoleModal, closeConsoleModalBtn],
    [importModal, closeImportModalBtn]
]);

ALL_MODALS.forEach((modal) => {
    new MutationObserver(() => {
        if (modal.classList.contains('active')) {
            lastFocusedBeforeModal = document.activeElement;
            const focusable = getFocusableElements(modal);
            (focusable[0] || modal).focus();
        } else if (lastFocusedBeforeModal) {
            lastFocusedBeforeModal.focus();
            lastFocusedBeforeModal = null;
        }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
});

document.addEventListener('keydown', (e) => {
    const modal = getActiveModal();
    if (!modal) return;

    if (e.key === 'Escape') {
        const closeBtn = MODAL_CLOSE_BUTTONS.get(modal);
        if (closeBtn) {
            closeBtn.click();
        } else {
            modal.classList.remove('active');
        }
        return;
    }

    if (e.key === 'Tab') {
        const focusable = getFocusableElements(modal);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
});

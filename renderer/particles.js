// --- Fondo de chispas/ascuas ---
// Puramente decorativo: unas cuantas motas subiendo lentamente de fondo, a
// juego con el nombre "Ember Launcher". Solo transform/opacity (acelerado
// por GPU) y respeta prefers-reduced-motion vía CSS.
(function initEmberParticles() {
    const container = document.getElementById('emberParticles');
    const COUNT = 22;
    for (let i = 0; i < COUNT; i++) {
        const particle = document.createElement('span');
        particle.className = 'ember-particle';
        const size = 3 + Math.random() * 5;
        particle.style.left = Math.random() * 100 + '%';
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.setProperty('--ember-drift', (Math.random() * 80 - 40) + 'px');
        particle.style.animationDuration = (9 + Math.random() * 10) + 's';
        particle.style.animationDelay = (Math.random() * -20) + 's';
        container.appendChild(particle);
    }
})();

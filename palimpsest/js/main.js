// PALIMPSEST — boot. ?folio=<name> jumps straight to a folio (with a mock
// profile if there is no save), ?fast=1 shortens every folio for testing.

(function () {
  const params = new URLSearchParams(location.search);
  P.FAST = params.get('fast') === '1';

  function boot() {
    P.app.init();
    const jump = params.get('folio');
    const valid = jump && (P.app.FOLIOS.some(f => f.key === jump) || jump === 'prologue');
    if (valid && jump !== 'prologue') {
      if (!P.profile.load()) P.profile.mock();
      P.app.goto(jump);
    } else {
      P.app.goto('prologue', { card: false });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

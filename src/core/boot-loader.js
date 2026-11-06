// Runs before external libraries: recovery remains available if a CDN stalls.
(function () {
 const root = document.documentElement;
 const loader = document.getElementById('app-loader');
 if (!loader) return;
 const hint = document.getElementById('app-loader-hint');
 const recovery = document.getElementById('app-loader-recovery');
 const retry = document.getElementById('app-loader-retry');
 let finished = false, removalTimer;

 function setMessage(message) {
  if (!finished && !loader.classList.contains('is-stalled')) hint.textContent = message;
 }
 function showRecovery(message) {
  if (finished) return;
  loader.classList.add('is-stalled');
  loader.setAttribute('aria-label', '工作台启动未完成');
  hint.textContent = message;
  recovery.hidden = false;
 }
 function onStartupError(event) {
  if (root.classList.contains('booting') && (event.error || event.message)) {
   showRecovery('启动未能完成，请重新加载。本机数据不会被清除。');
  }
 }
 function onStartupRejection() {
  if (root.classList.contains('booting')) showRecovery('启动未能完成，请重新加载。本机数据不会被清除。');
 }
 function onTransitionEnd(event) {
  if (event.target === loader && event.propertyName === 'opacity') remove();
 }
 function remove() {
  clearTimeout(removalTimer);
  loader.removeEventListener('transitionend', onTransitionEnd);
  retry.removeEventListener('click', reload);
  loader.remove();
 }
 function reload() { window.location.reload(); }
 function finish() {
  if (finished) return;
  finished = true;
  clearTimeout(watchdog);
  window.removeEventListener('error', onStartupError);
  window.removeEventListener('unhandledrejection', onStartupRejection);
  root.classList.remove('booting');
  loader.setAttribute('aria-hidden', 'true');
  // Reduced motion and missing transition events must never leave a shield behind.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { remove(); return; }
  loader.addEventListener('transitionend', onTransitionEnd);
  loader.classList.add('is-hidden');
  removalTimer = setTimeout(remove, 650);
 }
 const watchdog = setTimeout(function () {
  // Keep the account/data shield in place until normal initialization settles.
  showRecovery('启动耗时较长，请检查网络后重新加载。本机数据不会被清除。');
 }, 15000);
 retry.addEventListener('click', reload);
 window.addEventListener('error', onStartupError);
 window.addEventListener('unhandledrejection', onStartupRejection);
 window.WorkbenchLoader = Object.freeze({ setMessage, finish });
})();

(function(){
  // Simple modal system: showConfirm, showInfo
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  const titleEl = document.getElementById('modal-title');
  const messageEl = document.getElementById('modal-message');
  const okBtn = document.getElementById('modal-ok');
  const cancelBtn = document.getElementById('modal-cancel');

  function showModal(options) {
    return new Promise((resolve) => {
      if (!modal || !overlay) {
        // fallback to native confirm/alert
        if (options.type === 'confirm') {
          const ok = window.confirm(options.message);
          if (ok && typeof options.onOk === 'function') options.onOk();
          if (!ok && typeof options.onCancel === 'function') options.onCancel();
          resolve(ok);
        } else {
          window.alert(options.message);
          if (typeof options.onOk === 'function') options.onOk();
          resolve(true);
        }
        return;
      }

      titleEl.textContent = options.title || '';
      messageEl.textContent = options.message || '';

      const okLabel = options.okText || (options.type === 'confirm' ? 'OK' : 'Fermer');
      const cancelLabel = options.cancelText || 'Annuler';
      okBtn.textContent = okLabel;
      cancelBtn.textContent = cancelLabel;

      if (options.type === 'info') cancelBtn.hidden = true;
      else cancelBtn.hidden = false;

      overlay.hidden = false;
      modal.hidden = false;
      document.getElementById('modal-root').setAttribute('aria-hidden', 'false');

      function cleanup() {
        try {
          overlay.hidden = true;
          modal.hidden = true;
          document.getElementById('modal-root').setAttribute('aria-hidden', 'true');
          okBtn.removeEventListener('click', onOk);
          cancelBtn.removeEventListener('click', onCancel);
          document.removeEventListener('keydown', onKey);
          if (typeof overlayHandler === 'function') overlay.removeEventListener('click', overlayHandler);
        } catch (err) {
          // ensure cleanup never throws
          console.warn('modal cleanup error', err);
        }
      }

      async function onOk() {
        cleanup();
        // dispatch event
        document.dispatchEvent(new CustomEvent('modal:ok', { detail: options.detail || null }));
        try {
          if (typeof options.onOk === 'function') {
            const r = options.onOk();
            if (r && typeof r.then === 'function') await r;
          }
        } catch (err) {
          // ignore callback errors
          console.error('modal onOk callback error', err);
        }
        resolve(true);
      }

      async function onCancel() {
        cleanup();
        document.dispatchEvent(new CustomEvent('modal:cancel', { detail: options.detail || null }));
        try {
          if (typeof options.onCancel === 'function') {
            const r = options.onCancel();
            if (r && typeof r.then === 'function') await r;
          }
        } catch (err) {
          console.error('modal onCancel callback error', err);
        }
        resolve(false);
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          onCancel();
        } else if (e.key === 'Enter') {
          onOk();
        }
      }

      // attach listeners and keep overlay handler reference so we can remove it on cleanup
      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);

      const overlayHandler = function () {
        onCancel();
      };
      overlay.addEventListener('click', overlayHandler);
    });
  }

  window.showConfirm = function(title, message, opts) {
    return showModal(Object.assign({ type: 'confirm', title, message }, opts || {}));
  };

  window.showInfo = function(title, message, opts) {
    return showModal(Object.assign({ type: 'info', title, message }, opts || {}));
  };

})();

(function () {
  const currentScript = document.currentScript;
  const chatId = currentScript && currentScript.getAttribute('data-chat-id');
  if (!chatId) return;

  const origin = window.location.origin;
  const storageKey = 'ai-agent-builder-widget:' + chatId;
  const isMobile = window.matchMedia('(max-width: 640px)').matches;

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Open chat');
  button.innerHTML = '💬';
  button.style.cssText = [
    'position:fixed',
    'right:24px',
    'bottom:24px',
    'width:60px',
    'height:60px',
    'border:none',
    'border-radius:999px',
    'background:linear-gradient(135deg,#0ea5e9,#2563eb)',
    'color:#fff',
    'font-size:24px',
    'cursor:pointer',
    'z-index:9999',
    'box-shadow:0 18px 48px rgba(14,165,233,0.35)',
    'transition:transform .2s ease, box-shadow .2s ease'
  ].join(';');

  const card = document.createElement('div');
  card.style.cssText = [
    'position:fixed',
    isMobile ? 'left:0;right:0;bottom:0;width:100vw;height:100vh;border-radius:0' : 'right:24px;bottom:96px;width:380px;height:640px;border-radius:24px',
    'overflow:hidden',
    'background:#020617',
    'z-index:9998',
    'box-shadow:0 30px 80px rgba(2,6,23,0.45)',
    'border:1px solid rgba(255,255,255,0.08)',
    'transform:translateY(24px) scale(.96)',
    'transform-origin:bottom right',
    'opacity:0',
    'pointer-events:none',
    'transition:transform .28s cubic-bezier(.34,1.56,.64,1), opacity .2s ease'
  ].join(';');

  const close = document.createElement('button');
  close.type = 'button';
  close.innerHTML = '✕';
  close.style.cssText = 'position:absolute;top:14px;right:14px;width:32px;height:32px;border:none;border-radius:999px;background:rgba(15,23,42,.78);color:#fff;cursor:pointer;z-index:2';

  const iframe = document.createElement('iframe');
  iframe.src = origin + '/chat/' + encodeURIComponent(chatId) + '?embedded=true';
  iframe.title = 'AI chat widget';
  iframe.allow = 'clipboard-write';
  iframe.style.cssText = 'width:100%;height:100%;border:none;background:#020617';

  card.appendChild(close);
  card.appendChild(iframe);
  document.body.appendChild(button);
  document.body.appendChild(card);

  function setOpen(nextOpen) {
    localStorage.setItem(storageKey, String(nextOpen));
    button.innerHTML = nextOpen ? '✕' : '💬';
    button.style.transform = nextOpen ? 'scale(1.04)' : 'scale(1)';
    card.style.opacity = nextOpen ? '1' : '0';
    card.style.pointerEvents = nextOpen ? 'auto' : 'none';
    card.style.transform = nextOpen ? 'translateY(0) scale(1)' : 'translateY(24px) scale(.96)';
  }

  const initialState = localStorage.getItem(storageKey) === 'true';
  setOpen(initialState);

  button.addEventListener('mouseenter', function () {
    button.style.transform = 'scale(1.05)';
  });

  button.addEventListener('mouseleave', function () {
    if (localStorage.getItem(storageKey) !== 'true') {
      button.style.transform = 'scale(1)';
    }
  });

  button.addEventListener('click', function () {
    setOpen(localStorage.getItem(storageKey) !== 'true');
  });

  close.addEventListener('click', function () {
    setOpen(false);
  });
})();

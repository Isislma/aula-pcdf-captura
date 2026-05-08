const form = document.querySelector('[data-form="pcdf-aula-captura"]');
const statusEl = document.querySelector('.form-status');
const submitBtn = form?.querySelector('button[type="submit"]');

function getTrackingPayload() {
  const params = new URLSearchParams(window.location.search);
  return {
    origem: 'aula-pcdf-captura',
    pagina: window.location.href,
    referrer: document.referrer || '',
    utm_source: params.get('utm_source') || '',
    utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '',
    utm_content: params.get('utm_content') || '',
    utm_term: params.get('utm_term') || ''
  };
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  const missing = ['nome', 'email', 'whatsapp'].filter((field) => !String(data[field] || '').trim());

  if (missing.length) {
    statusEl.textContent = 'Preencha nome, e-mail e WhatsApp para entrar na lista.';
    return;
  }

  statusEl.textContent = 'Enviando sua inscrição...';
  submitBtn.disabled = true;

  try {
    const response = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, ...getTrackingPayload() })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Não consegui salvar sua inscrição agora.');
    }

    statusEl.textContent = 'Redirecionando...';
    form.dataset.submitted = 'true';
    form.reset();

    // O evento Lead do Meta Pixel dispara somente na página de obrigado.
    window.location.href = '/obrigado';
  } catch (error) {
    statusEl.textContent = error.message || 'Não consegui salvar sua inscrição agora. Tente novamente em instantes.';
  } finally {
    submitBtn.disabled = false;
  }
});

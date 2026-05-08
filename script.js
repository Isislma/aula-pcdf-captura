const form = document.querySelector('[data-form="pcdf-aula-captura"]');
const statusEl = document.querySelector('.form-status');
const submitBtn = form?.querySelector('button[type="submit"]');

function inferUtmFromReferrer(referrer) {
  if (!referrer) return { utm_source: 'direto', utm_medium: 'none' };
  let host = '';
  try { host = new URL(referrer).hostname.toLowerCase(); } catch (e) { return { utm_source: 'direto', utm_medium: 'none' }; }

  const rules = [
    { match: ['facebook.com', 'fb.com', 'm.facebook.com', 'l.facebook.com'], source: 'facebook',  medium: 'organic' },
    { match: ['instagram.com', 'l.instagram.com'],                            source: 'instagram', medium: 'organic' },
    { match: ['google.com', 'google.com.br'],                                 source: 'google',    medium: 'organic' },
    { match: ['youtube.com', 'youtu.be', 'm.youtube.com'],                    source: 'youtube',   medium: 'organic' },
    { match: ['whatsapp.com', 'wa.me', 'chat.whatsapp.com'],                  source: 'whatsapp',  medium: 'referral' },
    { match: ['t.co', 'twitter.com', 'x.com'],                                source: 'twitter',   medium: 'referral' }
  ];
  for (const r of rules) {
    if (r.match.some((d) => host === d || host.endsWith('.' + d))) {
      return { utm_source: r.source, utm_medium: r.medium };
    }
  }
  return { utm_source: host, utm_medium: 'referral' };
}

function getTrackingPayload() {
  const params = new URLSearchParams(window.location.search);
  const referrer = document.referrer || '';
  const fallback = inferUtmFromReferrer(referrer);

  return {
    origem: 'aula-pcdf-captura',
    pagina: window.location.href,
    referrer: referrer,
    utm_source:    params.get('utm_source')    || fallback.utm_source,
    utm_medium:    params.get('utm_medium')    || fallback.utm_medium,
    utm_campaign:  params.get('utm_campaign')  || '',
    utm_content:   params.get('utm_content')   || '',
    utm_term:      params.get('utm_term')      || '',
    utm_placement: params.get('utm_placement') || '',
    sck:           params.get('sck')           || ''
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

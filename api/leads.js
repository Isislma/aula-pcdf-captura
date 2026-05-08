const DEFAULT_TABLE = 'pcdf_aula_leads';
const DEFAULT_AC_LIST_NAME = 'Aula PCDF - Captura';
const DEFAULT_AC_LIST_SLUG = 'aula-pcdf-captura';
const DEFAULT_AC_TAG_NAME = 'Aula PCDF - Captura';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function clean(value) {
  return String(value || '').trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function activeCampaignBaseUrl() {
  const raw = process.env.ACTIVECAMPAIGN_API_URL || process.env.ACTIVECAMPAIGN_URL;
  return raw ? raw.replace(/\/$/, '') : '';
}

async function activeCampaignRequest(path, options = {}) {
  const baseUrl = activeCampaignBaseUrl();
  const apiKey = process.env.ACTIVECAMPAIGN_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('ActiveCampaign não configurado.');
  }

  const response = await fetch(`${baseUrl}/api/3${path}`, {
    ...options,
    headers: {
      'Api-Token': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (_) {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const error = new Error(`ActiveCampaign ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function findOrCreateActiveCampaignList() {
  if (process.env.ACTIVECAMPAIGN_LIST_ID) return String(process.env.ACTIVECAMPAIGN_LIST_ID);

  const listName = process.env.ACTIVECAMPAIGN_LIST_NAME || DEFAULT_AC_LIST_NAME;
  const listSlug = process.env.ACTIVECAMPAIGN_LIST_SLUG || DEFAULT_AC_LIST_SLUG;

  const existing = await activeCampaignRequest(`/lists?search=${encodeURIComponent(listName)}`);
  const found = (existing.lists || []).find((list) =>
    clean(list.name).toLowerCase() === listName.toLowerCase() || clean(list.stringid) === listSlug
  );

  if (found?.id) return String(found.id);

  const created = await activeCampaignRequest('/lists', {
    method: 'POST',
    body: JSON.stringify({
      list: {
        name: listName,
        stringid: listSlug,
        sender_url: 'https://www.profpedrocoelho.com.br',
        sender_reminder: 'Você está recebendo este contato porque se inscreveu em uma aula gratuita do Prof. Pedro Coelho.'
      }
    })
  });

  return String(created.list.id);
}

async function findOrCreateActiveCampaignTag() {
  if (process.env.ACTIVECAMPAIGN_TAG_ID) return String(process.env.ACTIVECAMPAIGN_TAG_ID);

  const tagName = process.env.ACTIVECAMPAIGN_TAG_NAME || DEFAULT_AC_TAG_NAME;
  const existing = await activeCampaignRequest(`/tags?search=${encodeURIComponent(tagName)}`);
  const found = (existing.tags || []).find((tag) => clean(tag.tag).toLowerCase() === tagName.toLowerCase());

  if (found?.id) return String(found.id);

  const created = await activeCampaignRequest('/tags', {
    method: 'POST',
    body: JSON.stringify({
      tag: {
        tag: tagName,
        tagType: 'contact',
        description: 'Lead capturado na landing da aula PCDF.'
      }
    })
  });

  return String(created.tag.id);
}

async function sendLeadToActiveCampaign(lead) {
  if (!activeCampaignBaseUrl() || !process.env.ACTIVECAMPAIGN_API_KEY) {
    return { skipped: true, reason: 'not_configured' };
  }

  const [listId, tagId] = await Promise.all([
    findOrCreateActiveCampaignList(),
    findOrCreateActiveCampaignTag()
  ]);

  const synced = await activeCampaignRequest('/contact/sync', {
    method: 'POST',
    body: JSON.stringify({
      contact: {
        email: lead.email,
        firstName: lead.nome,
        phone: lead.whatsapp
      }
    })
  });

  const contactId = String(synced.contact.id);

  await activeCampaignRequest('/contactLists', {
    method: 'POST',
    body: JSON.stringify({
      contactList: {
        list: listId,
        contact: contactId,
        status: 1
      }
    })
  });

  await activeCampaignRequest('/contactTags', {
    method: 'POST',
    body: JSON.stringify({
      contactTag: {
        contact: contactId,
        tag: tagId
      }
    })
  });

  return { ok: true, contactId, listId, tagId };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_LEADS_TABLE || DEFAULT_TABLE;

  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, {
      ok: false,
      error: 'Integração pendente: configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.'
    });
  }

  let body = {};
  try {
    body = req.body || {};
    if (typeof body === 'string') body = JSON.parse(body);
  } catch (_) {
    return json(res, 400, { ok: false, error: 'JSON inválido.' });
  }

  const nome = clean(body.nome);
  const email = clean(body.email).toLowerCase();
  const whatsapp = clean(body.whatsapp);

  if (!nome || !email || !whatsapp) {
    return json(res, 400, { ok: false, error: 'Preencha nome, e-mail e WhatsApp.' });
  }

  if (!isEmail(email)) {
    return json(res, 400, { ok: false, error: 'Informe um e-mail válido.' });
  }

  const lead = {
    nome,
    email,
    whatsapp,
    origem: clean(body.origem) || 'aula-pcdf-captura',
    pagina: clean(body.pagina),
    referrer: clean(body.referrer),
    utm_source: clean(body.utm_source),
    utm_medium: clean(body.utm_medium),
    utm_campaign: clean(body.utm_campaign),
    utm_content: clean(body.utm_content),
    utm_term: clean(body.utm_term),
    user_agent: clean(req.headers['user-agent'])
  };

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(lead)
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Supabase insert failed', response.status, detail);
      return json(res, 502, { ok: false, error: 'Não consegui salvar a inscrição agora.' });
    }

    let activeCampaign = { skipped: true };
    try {
      activeCampaign = await sendLeadToActiveCampaign(lead);
    } catch (error) {
      console.error('ActiveCampaign sync failed', error.status || '', error.data || error.message);
      activeCampaign = { ok: false };
    }

    return json(res, 200, { ok: true, activeCampaign });
  } catch (error) {
    console.error(error);
    return json(res, 502, { ok: false, error: 'Falha temporária ao conectar com o Supabase.' });
  }
}

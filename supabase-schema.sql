create table if not exists public.pcdf_aula_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nome text not null,
  email text not null,
  whatsapp text not null,
  origem text default 'aula-pcdf-captura',
  pagina text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  user_agent text
);

create unique index if not exists pcdf_aula_leads_email_whatsapp_idx
  on public.pcdf_aula_leads (lower(email), whatsapp);

alter table public.pcdf_aula_leads enable row level security;

-- Não crie policy pública de insert. A LP grava via API serverless na Vercel usando SERVICE_ROLE_KEY.
-- Assim a chave sensível nunca aparece no navegador.

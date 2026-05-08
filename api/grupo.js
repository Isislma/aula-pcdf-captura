export default function handler(req, res) {
  const fallbackUrl = '/obrigado';
  const groupUrl = process.env.WHATSAPP_GROUP_URL;

  if (!groupUrl || !/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//.test(groupUrl)) {
    res.writeHead(302, { Location: fallbackUrl });
    res.end();
    return;
  }

  res.writeHead(302, {
    Location: groupUrl,
    'Cache-Control': 'no-store, max-age=0',
  });
  res.end();
}

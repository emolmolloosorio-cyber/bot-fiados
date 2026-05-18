// api/whatsapp.js — Bot WhatsApp Fiados
// Busca imagen pre-generada en Supabase Storage y la envía por WhatsApp
const twilio = require('twilio');
const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN  = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const SB_URL      = process.env.SB_URL;
const SB_KEY      = process.env.SB_KEY;

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const norm   = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const fmtNum = n => parseFloat(n||0).toFixed(2);

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const body   = req.body || {};
  const from   = body.From || '';
  const msgRaw = (body.Body || '').trim();
  const msg    = norm(msgRaw);

  if (!msg) return res.status(200).end();

  const client = twilio(ACCOUNT_SID, AUTH_TOKEN);
  const enviar = async (texto, mediaUrl) => {
    const opts = { from: FROM_NUMBER, to: from, body: texto };
    if (mediaUrl) opts.mediaUrl = [mediaUrl];
    await client.messages.create(opts);
  };

  try {
    const [clientes, cuentas] = await Promise.all([
      sbGet('clientes?order=nombre'),
      sbGet('cuentas?order=cliente_id,numero')
    ]);

    // Buscar cliente ignorando tildes y mayúsculas
    const cli = clientes.find(c =>
      norm(c.nombre).includes(msg) || msg.includes(norm(c.nombre))
    );

    if (!cli) {
      await enviar(`No encontré ningún cliente con "${msgRaw}". Verifica el nombre e intenta de nuevo.`);
      return res.status(200).end();
    }

    const cuenta = cuentas.find(c =>
      c.cliente_id === cli.id && (c.estado === 'activa' || c.estado === 'pendiente')
    );

    if (!cuenta) {
      await enviar(`${cli.nombre} no tiene fiado activo actualmente.`);
      return res.status(200).end();
    }

    // FIX 1: bucket se llama "Recibos" con R mayúscula
    const fileName  = `recibo-cliente-${cli.id}.png`;
    const publicUrl = `${SB_URL}/storage/v1/object/public/Recibos/${fileName}`;

    // Verificar que la imagen existe
    const check = await fetch(publicUrl, { method: 'HEAD' });
    if (!check.ok) {
      await enviar(
        `El recibo de *${cli.nombre}* aún no ha sido generado.\n` +
        `Abre la app, busca al cliente y toca "🧾 Recibo" para generarlo. Luego vuelve a escribir aquí.`
      );
      return res.status(200).end();
    }

    // FIX 2: sin ?t=timestamp — Twilio necesita URL limpia para descargar la imagen
    await enviar(
      `Estado de cuenta de *${cli.nombre}*\nSaldo pendiente: *S/ ${fmtNum(cuenta.saldo)}*`,
      publicUrl
    );

    return res.status(200).end();

  } catch (e) {
    console.error('Error bot:', e.message);
    await enviar('Ocurrió un error. Intenta de nuevo.').catch(()=>{});
    return res.status(200).end();
  }
};

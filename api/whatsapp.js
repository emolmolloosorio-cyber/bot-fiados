// api/whatsapp.js — Bot WhatsApp Fiados
// Flujo: recibe nombre → busca cliente → genera recibo → sube a Supabase Storage → envía imagen por Twilio

const twilio = require('twilio');

// ── Configuración (variables de entorno en Vercel) ──
const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN  = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const SB_URL      = process.env.SB_URL;
const SB_KEY      = process.env.SB_KEY;

// ── Helper Supabase REST ──
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ── Subir imagen a Supabase Storage ──
async function subirImagen(buffer, fileName) {
  const res = await fetch(`${SB_URL}/storage/v1/object/recibos/${fileName}`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'image/png',
      'x-upsert': 'true'
    },
    body: buffer
  });
  if (!res.ok) throw new Error(await res.text());
  return `${SB_URL}/storage/v1/object/public/recibos/${fileName}`;
}

// ── Normalizar texto ──
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const fmtNum = n => parseFloat(n || 0).toFixed(2);
const fechaDisplay = iso => iso.split('-').reverse().join('/');

// ── Generar HTML del recibo ──
function generarHTML(cli, cuenta, visitas, items, pagos) {
  const porFecha = {};
  visitas.forEach(v => { (porFecha[v.fecha] = porFecha[v.fecha] || []).push(v); });

  const diasHtml = Object.entries(porFecha)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, vsDelDia]) => {
      const totalDia = vsDelDia.reduce((s, v) => s + parseFloat(v.total_visita || 0), 0);
      const nVisitas = vsDelDia.length;
      const visitasHtml = vsDelDia.map((v, idx) => {
        const its = items.filter(it => it.visita_id === v.id);
        const prodHtml = its.map(it =>
          `<div class="prod-item"><span class="prod-name">${it.producto}</span><span class="prod-price">S/ ${fmtNum(it.precio)}</span></div>`
        ).join('');
        const labelHtml = nVisitas > 1 ? `<div class="visita-label">VISITA ${idx + 1}</div>` : '';
        const subHtml   = nVisitas > 1 ? `<div class="subtotal">subtotal <span>S/ ${fmtNum(v.total_visita)}</span></div>` : '';
        return `<div class="visita">${labelHtml}<div class="productos">${prodHtml}</div>${subHtml}</div>`;
      }).join('');
      const nLabel = nVisitas > 1 ? `<span class="nvisitas">${nVisitas} visitas</span>` : '';
      return `<div class="dia">
        <div class="dia-header">
          <span><span class="dia-fecha">${fechaDisplay(fecha)}</span>${nLabel}</span>
          <span class="dia-total">S/ ${fmtNum(totalDia)}</span>
        </div>${visitasHtml}</div>`;
    }).join('');

  const abonosHtml = pagos.length ? `
    <div class="abonos-section">
      <div class="abonos-title">Abonos realizados</div>
      ${pagos.map(p => `<div class="abono-row"><span>${fechaDisplay(p.fecha)}${p.nota ? ' · ' + p.nota : ''}</span><span>− S/ ${fmtNum(p.monto)}</span></div>`).join('')}
    </div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,serif;color:#1a1a1a;background:#fff;padding:32px 28px;width:480px}
    .titulo{font-size:20px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px}
    .hr{border:none;border-top:2px dashed #bbb;margin:10px 0 14px}
    .cliente{font-size:14px;margin-bottom:14px}
    .cliente strong{font-weight:700}
    .dia{margin-bottom:2px}
    .dia-header{display:flex;justify-content:space-between;align-items:baseline;padding:7px 0 5px;border-bottom:1.5px solid #333}
    .dia-fecha{font-size:13px;font-weight:700;font-family:-apple-system,sans-serif}
    .nvisitas{font-size:10px;color:#999;font-style:italic;margin-left:5px}
    .dia-total{font-size:13px;font-weight:700;font-family:-apple-system,sans-serif}
    .visita{padding:5px 0 5px 10px;border-bottom:0.5px solid #eee}
    .visita:last-child{border-bottom:0.5px solid #ddd}
    .visita-label{font-size:9px;color:#aaa;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px}
    .productos{display:grid;grid-template-columns:1fr 1fr;gap:1px 8px}
    .prod-item{display:flex;justify-content:space-between;padding:2px 0;border-bottom:0.5px solid #f5f5f5}
    .prod-item:last-child{border-bottom:none}
    .prod-name{font-size:11px;color:#333}
    .prod-price{font-size:11px;color:#666;font-weight:600;font-family:-apple-system,sans-serif}
    .subtotal{display:flex;justify-content:flex-end;font-size:10px;color:#999;padding:3px 0 1px;border-top:0.5px dashed #ddd;margin-top:3px}
    .subtotal span{margin-left:4px;font-weight:700;color:#666;font-family:-apple-system,sans-serif}
    .abonos-section{margin-top:10px;border-top:1px dashed #ccc;padding-top:8px}
    .abonos-title{font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px}
    .abono-row{display:flex;justify-content:space-between;font-size:12px;padding:2px 0;color:#166534;font-family:-apple-system,sans-serif}
    .total-wrap{background:#f0f0f0;border-radius:7px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-top:14px}
    .total-label{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
    .total-monto{font-size:22px;font-weight:700;font-family:-apple-system,sans-serif}
    .gracias{text-align:center;font-size:12px;color:#999;margin-top:12px;font-style:italic}
  </style></head><body>
    <div class="titulo">Estado de Cuenta — Fiado</div>
    <hr class="hr">
    <div class="cliente"><strong>Cliente:</strong> ${cli.nombre}.</div>
    ${diasHtml}${abonosHtml}
    <div class="total-wrap">
      <span class="total-label">Saldo a pagar</span>
      <span class="total-monto">S/ ${fmtNum(cuenta.saldo)}</span>
    </div>
    <div class="gracias">Gracias por su preferencia</div>
  </body></html>`;
}

// ── Handler principal ──
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
    const [clientes, cuentas, visitas, items, pagos] = await Promise.all([
      sbGet('clientes?order=nombre'),
      sbGet('cuentas?order=cliente_id,numero'),
      sbGet('visitas?order=fecha,created_at'),
      sbGet('items_visita?order=id'),
      sbGet('pagos?order=fecha')
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

    const vsCuenta  = visitas.filter(v => v.cuenta_id === cuenta.id);
    const itsCuenta = items.filter(it => vsCuenta.some(v => v.id === it.visita_id));
    const pgCuenta  = pagos.filter(p => p.cuenta_id === cuenta.id);

    // Generar imagen con Puppeteer via node-html-to-image
    const nodeHtmlToImage = require('node-html-to-image');
    const html   = generarHTML(cli, cuenta, vsCuenta, itsCuenta, pgCuenta);
    const imgBuf = await nodeHtmlToImage({
      html,
      type: 'png',
      puppeteerArgs: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });

    // Subir a Supabase Storage y obtener URL pública
    const fileName  = `recibo-${cli.id}-${Date.now()}.png`;
    const publicUrl = await subirImagen(imgBuf, fileName);

    // Enviar imagen por WhatsApp
    await enviar(`Estado de cuenta de *${cli.nombre}*\nSaldo pendiente: *S/ ${fmtNum(cuenta.saldo)}*`, publicUrl);

    return res.status(200).end();

  } catch (e) {
    console.error('Error bot:', e.message);
    await enviar('Ocurrió un error. Intenta de nuevo en un momento.').catch(() => {});
    return res.status(200).end();
  }
};

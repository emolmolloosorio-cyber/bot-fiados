// api/whatsapp.js — Bot WhatsApp Fiados
// Usa Canvas para generar la imagen sin Puppeteer/Chrome

const twilio = require('twilio');
const { createCanvas } = require('canvas');

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

const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const fmtNum = n => parseFloat(n||0).toFixed(2);
const fechaDisplay = iso => iso.split('-').reverse().join('/');

function generarImagen(cli, cuenta, visitas, items) {
  const porFecha = {};
  visitas.forEach(v => { (porFecha[v.fecha] = porFecha[v.fecha]||[]).push(v); });

  const lineas = [];
  lineas.push({ tipo: 'titulo', texto: 'ESTADO DE CUENTA — FIADO' });
  lineas.push({ tipo: 'sep' });
  lineas.push({ tipo: 'cliente', texto: `Cliente: ${cli.nombre}` });
  lineas.push({ tipo: 'espacio' });

  Object.entries(porFecha).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([fecha, vsDelDia]) => {
    const totalDia = vsDelDia.reduce((s,v)=>s+parseFloat(v.total_visita||0),0);
    const nVisitas = vsDelDia.length;
    lineas.push({ tipo: 'fecha', izq: fechaDisplay(fecha), der: `S/ ${fmtNum(totalDia)}` });
    vsDelDia.forEach((v, idx) => {
      const its = items.filter(it => it.visita_id === v.id);
      if (nVisitas > 1) lineas.push({ tipo: 'visita_label', texto: `Visita ${idx+1}` });
      for (let i = 0; i < its.length; i += 2) {
        lineas.push({ tipo: 'producto2col',
          col1: `  ${its[i].producto}`, pr1: `S/ ${fmtNum(its[i].precio)}`,
          col2: its[i+1] ? its[i+1].producto : '',
          pr2:  its[i+1] ? `S/ ${fmtNum(its[i+1].precio)}` : ''
        });
      }
      if (nVisitas > 1) {
        const sub = its.reduce((s,it)=>s+parseFloat(it.precio||0),0);
        lineas.push({ tipo: 'subtotal', texto: `S/ ${fmtNum(sub)}` });
      }
    });
    lineas.push({ tipo: 'espacio' });
  });

  lineas.push({ tipo: 'sep2' });
  lineas.push({ tipo: 'total', izq: 'SALDO A PAGAR', der: `S/ ${fmtNum(cuenta.saldo)}` });
  lineas.push({ tipo: 'sep2' });
  lineas.push({ tipo: 'espacio' });
  lineas.push({ tipo: 'gracias', texto: 'Gracias por su preferencia' });
  lineas.push({ tipo: 'espacio' });

  const W = 500, PADDING = 28, LINE_H = 22;
  const H = lineas.length * LINE_H + PADDING * 2 + 40;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  let y = PADDING + 10;

  lineas.forEach(l => {
    ctx.fillStyle = '#1a1a1a';
    switch(l.tipo) {
      case 'titulo':
        ctx.font = 'bold 16px serif'; ctx.fillText(l.texto, PADDING, y); y += LINE_H + 4; break;
      case 'sep':
        ctx.setLineDash([4,4]); ctx.strokeStyle = '#bbbbbb'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(PADDING, y); ctx.lineTo(W-PADDING, y); ctx.stroke();
        y += LINE_H; break;
      case 'sep2':
        ctx.setLineDash([]); ctx.strokeStyle = '#333333'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(PADDING, y); ctx.lineTo(W-PADDING, y); ctx.stroke();
        y += 8; break;
      case 'cliente':
        ctx.font = 'bold 13px serif'; ctx.fillText(l.texto, PADDING, y); y += LINE_H; break;
      case 'espacio':
        y += LINE_H * 0.5; break;
      case 'fecha':
        ctx.font = 'bold 13px sans-serif'; ctx.fillText(l.izq, PADDING, y);
        ctx.textAlign = 'right'; ctx.fillText(l.der, W-PADDING, y); ctx.textAlign = 'left';
        ctx.setLineDash([]); ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(PADDING, y+4); ctx.lineTo(W-PADDING, y+4); ctx.stroke();
        y += LINE_H + 4; break;
      case 'visita_label':
        ctx.font = '10px sans-serif'; ctx.fillStyle = '#aaaaaa';
        ctx.fillText(l.texto.toUpperCase(), PADDING+8, y); ctx.fillStyle = '#1a1a1a';
        y += LINE_H * 0.8; break;
      case 'producto2col': {
        const midX = W / 2;
        ctx.font = '11px serif'; ctx.fillText(l.col1, PADDING, y);
        ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(l.pr1, midX-10, y);
        ctx.textAlign = 'left';
        if (l.col2) {
          ctx.font = '11px serif'; ctx.fillText(l.col2, midX+10, y);
          ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(l.pr2, W-PADDING, y);
          ctx.textAlign = 'left';
        }
        y += LINE_H; break;
      }
      case 'subtotal':
        ctx.font = '10px sans-serif'; ctx.fillStyle = '#999999';
        ctx.textAlign = 'right'; ctx.fillText('subtotal ' + l.texto, W-PADDING, y);
        ctx.textAlign = 'left'; ctx.fillStyle = '#1a1a1a'; y += LINE_H * 0.9; break;
      case 'total':
        ctx.font = 'bold 14px sans-serif'; ctx.fillText(l.izq, PADDING, y);
        ctx.textAlign = 'right'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(l.der, W-PADDING, y);
        ctx.textAlign = 'left'; y += LINE_H + 6; break;
      case 'gracias':
        ctx.font = 'italic 11px serif'; ctx.fillStyle = '#999999';
        ctx.textAlign = 'center'; ctx.fillText(l.texto, W/2, y);
        ctx.textAlign = 'left'; ctx.fillStyle = '#1a1a1a'; y += LINE_H; break;
    }
  });

  return canvas.toBuffer('image/png');
}

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
    const [clientes, cuentas, visitas, items] = await Promise.all([
      sbGet('clientes?order=nombre'),
      sbGet('cuentas?order=cliente_id,numero'),
      sbGet('visitas?order=fecha,created_at'),
      sbGet('items_visita?order=id')
    ]);

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

    const imgBuf    = generarImagen(cli, cuenta, vsCuenta, itsCuenta);
    const fileName  = `recibo-${cli.id}-${Date.now()}.png`;
    const publicUrl = await subirImagen(imgBuf, fileName);

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

// api/whatsapp.js — Bot WhatsApp Fiados
const twilio = require('twilio');
const { ImageResponse } = require('@vercel/og');

const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN  = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const SB_URL      = process.env.SB_URL;
const SB_KEY      = process.env.SB_KEY;

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Range-Unit': 'items',
      'Range': '0-9999'
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const norm     = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const fmtNum   = n => parseFloat(n || 0).toFixed(2);
const fmtFecha = iso => iso.split('-').reverse().join('/');

// Helper: nodo simple
const el = (type, style, children) => ({
  type,
  props: {
    style: { display: 'flex', flexDirection: 'column', ...style },
    children
  }
});

// Fila izquierda-derecha
const row = (l, r, sL = {}, sR = {}) => ({
  type: 'div',
  props: {
    style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    children: [
      { type: 'span', props: { style: sL, children: l } },
      { type: 'span', props: { style: sR, children: r } }
    ]
  }
});

// Separador
const sep = (style = {}) => ({
  type: 'div',
  props: { style: { width: '100%', height: '1px', ...style } }
});

async function generarImagenRecibo(cli, cuenta, visitas, items, pagos) {
  const vs = visitas
    .filter(v => v.cuenta_id === cuenta.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porFecha = {};
  vs.forEach(v => {
    if (!porFecha[v.fecha]) porFecha[v.fecha] = [];
    porFecha[v.fecha].push(v);
  });

  const pg = pagos.filter(p => p.cuenta_id === cuenta.id);
  const saldo = parseFloat(cuenta.saldo || 0);

  // Altura dinámica
  let lineas = 10;
  Object.values(porFecha).forEach(vsDelDia => {
    lineas += 2;
    vsDelDia.forEach(v => {
      const its = items.filter(it => it.visita_id === v.id);
      lineas += Math.max(its.length, 1) + (vsDelDia.length > 1 ? 2 : 0);
    });
  });
  if (pg.length) lineas += 2 + pg.length;
  const altura = Math.max(500, lineas * 26 + 100);

  // Construir nodos de días
  const diasNodes = Object.entries(porFecha).map(([fecha, vsDelDia]) => {
    const totalDia = vsDelDia.reduce((s, v) => s + parseFloat(v.total_visita || 0), 0);

    const visitasNodes = vsDelDia.map((v, idx) => {
      const its = items.filter(it => it.visita_id === v.id);
      const labelNode = vsDelDia.length > 1
        ? { type: 'span', props: { style: { fontSize: '10px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }, children: `Visita ${idx + 1}` } }
        : null;

      const productosNodes = its.length > 0
        ? its.map(it => row(it.producto, `S/ ${fmtNum(it.precio)}`,
            { fontSize: '12px', color: '#333' },
            { fontSize: '12px', fontWeight: '600' }
          ))
        : [{ type: 'span', props: { style: { fontSize: '12px', color: '#666' }, children: `Total: S/ ${fmtNum(v.total_visita)}` } }];

      const subtotalNode = vsDelDia.length > 1
        ? { type: 'span', props: { style: { fontSize: '11px', color: '#999', textAlign: 'right', marginTop: '2px' }, children: `Subtotal: S/ ${fmtNum(v.total_visita)}` } }
        : null;

      return el('div', { paddingLeft: '8px', marginBottom: '4px', gap: '1px' },
        [labelNode, ...productosNodes, subtotalNode].filter(Boolean)
      );
    });

    return el('div', { marginBottom: '10px', gap: '0px' }, [
      row(fmtFecha(fecha), `S/ ${fmtNum(totalDia)}`,
        { fontSize: '13px', fontWeight: 'bold' },
        { fontSize: '13px', fontWeight: 'bold' }
      ),
      sep({ background: '#333', marginBottom: '5px' }),
      ...visitasNodes
    ]);
  });

  // Nodo abonos
  const abonosNode = pg.length > 0
    ? el('div', { borderTop: '1px dashed #ccc', paddingTop: '8px', marginTop: '4px', gap: '3px' }, [
        { type: 'span', props: { style: { fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }, children: 'Abonos realizados' } },
        ...pg.map(p => row(
          fmtFecha(p.fecha) + (p.nota ? ` (${p.nota})` : ''),
          `−S/ ${fmtNum(p.monto)}`,
          { fontSize: '12px' },
          { fontSize: '12px', color: '#166534', fontWeight: '600' }
        ))
      ])
    : null;

  const imageResponse = new ImageResponse(
    el('div',
      { width: '600px', minHeight: `${altura}px`, background: '#fff', fontFamily: 'Georgia, serif', color: '#1a1a1a', padding: '32px 28px', gap: '0px' },
      [
        // Título
        { type: 'span', props: { style: { fontSize: '18px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }, children: 'ESTADO DE CUENTA — FIADO' } },
        sep({ background: '#bbb', borderTop: '2px dashed #bbb', margin: '10px 0 14px' }),
        // Cliente
        el('div', { flexDirection: 'row', marginBottom: '2px', gap: '4px' }, [
          { type: 'span', props: { style: { fontSize: '15px', fontWeight: 'bold' }, children: 'Cliente: ' } },
          { type: 'span', props: { style: { fontSize: '15px' }, children: cli.nombre } }
        ]),
        { type: 'span', props: { style: { fontSize: '12px', color: '#888', marginBottom: '16px', fontStyle: 'italic' }, children: `Cuenta #${cuenta.numero}` } },
        // Días
        ...diasNodes,
        // Abonos
        ...(abonosNode ? [abonosNode] : []),
        // Total
        el('div',
          { flexDirection: 'row', justifyContent: 'space-between', background: '#f0f0f0', borderRadius: '8px', padding: '12px 16px', marginTop: '16px' },
          [
            { type: 'span', props: { style: { fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: 'SALDO A PAGAR' } },
            { type: 'span', props: { style: { fontSize: '24px', fontWeight: 'bold' }, children: `S/ ${fmtNum(saldo)}` } }
          ]
        ),
        { type: 'span', props: { style: { textAlign: 'center', fontSize: '12px', color: '#999', marginTop: '12px', fontStyle: 'italic' }, children: 'Gracias por su preferencia' } }
      ].filter(Boolean)
    ),
    { width: 600, height: altura }
  );

  return imageResponse.arrayBuffer();
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
    const [clientes, cuentas, visitas, items, pagos] = await Promise.all([
      sbGet('clientes?order=nombre'),
      sbGet('cuentas?order=cliente_id,numero'),
      sbGet('visitas?order=fecha,created_at&limit=10000'),
      sbGet('items_visita?order=id&limit=10000'),
      sbGet('pagos?order=fecha')
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

    const fileName  = `recibo-cliente-${cli.id}.png`;
    const publicUrl = `${SB_URL}/storage/v1/object/public/Recibos/${fileName}`;

    // Verificar si ya existe imagen
    const check = await fetch(publicUrl, { method: 'HEAD' });

    if (!check.ok) {
      await enviar(`Generando recibo de *${cli.nombre}*... un momento ⏳`);

      const imgBuffer = await generarImagenRecibo(cli, cuenta, visitas, items, pagos);

      const upload = await fetch(`${SB_URL}/storage/v1/object/Recibos/${fileName}`, {
        method: 'PUT',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type': 'image/png',
          'x-upsert': 'true'
        },
        body: imgBuffer
      });

      if (!upload.ok) {
        const err = await upload.text();
        console.error('Error subiendo imagen:', err);
        await enviar(`⚠️ No se pudo generar la imagen. Saldo de *${cli.nombre}*: *S/ ${fmtNum(cuenta.saldo)}*`);
        return res.status(200).end();
      }
    }

    await enviar(
      `Estado de cuenta de *${cli.nombre}*\nSaldo pendiente: *S/ ${fmtNum(cuenta.saldo)}*`,
      publicUrl
    );
    return res.status(200).end();

  } catch (e) {
    console.error('Error bot:', e.message);
    await enviar('Ocurrió un error. Intenta de nuevo.').catch(() => {});
    return res.status(200).end();
  }
};

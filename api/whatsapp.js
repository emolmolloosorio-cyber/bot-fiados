// api/whatsapp.js — Bot WhatsApp Fiados
// Genera imagen del recibo automáticamente con @vercel/og si no existe en Storage
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

  // Calcular altura dinámica
  let numLineas = 8;
  Object.values(porFecha).forEach(vsDelDia => {
    numLineas += 2;
    vsDelDia.forEach(v => {
      const its = items.filter(it => it.visita_id === v.id);
      numLineas += Math.max(its.length, 1) + (vsDelDia.length > 1 ? 2 : 0);
    });
  });
  if (pg.length) numLineas += 2 + pg.length;
  const altura = Math.max(500, numLineas * 26 + 120);

  const R = (type, style, children) => ({ type, props: { style, children } });
  const Row = (l, r, styleL = {}, styleR = {}) => R('div', { display:'flex', justifyContent:'space-between', width:'100%' }, [
    R('span', { ...styleL }, l),
    R('span', { ...styleR }, r)
  ]);

  const diasNodes = Object.entries(porFecha).map(([fecha, vsDelDia]) => {
    const totalDia = vsDelDia.reduce((s, v) => s + parseFloat(v.total_visita || 0), 0);
    return R('div', { marginBottom: '10px' }, [
      Row(fmtFecha(fecha), `S/ ${fmtNum(totalDia)}`,
        { fontSize:'13px', fontWeight:'bold' },
        { fontSize:'13px', fontWeight:'bold' }
      ),
      R('div', { borderTop:'1.5px solid #333', marginBottom:'5px' }),
      ...vsDelDia.map((v, idx) => {
        const its = items.filter(it => it.visita_id === v.id);
        return R('div', { paddingLeft:'8px', marginBottom:'4px' }, [
          vsDelDia.length > 1 ? R('div', { fontSize:'10px', color:'#aaa', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'2px' }, `Visita ${idx+1}`) : null,
          its.length > 0
            ? R('div', { display:'flex', flexDirection:'column', gap:'1px' },
                its.map(it => Row(it.producto, `S/ ${fmtNum(it.precio)}`,
                  { fontSize:'12px', color:'#333' },
                  { fontSize:'12px', fontWeight:'600', paddingLeft:'8px' }
                ))
              )
            : R('div', { fontSize:'12px', color:'#666' }, `Total: S/ ${fmtNum(v.total_visita)}`),
          vsDelDia.length > 1 ? R('div', { fontSize:'11px', color:'#999', textAlign:'right', marginTop:'2px' }, `Subtotal: S/ ${fmtNum(v.total_visita)}`) : null
        ].filter(Boolean));
      })
    ]);
  });

  const abonosNode = pg.length > 0 ? R('div', { borderTop:'1px dashed #ccc', paddingTop:'8px', marginTop:'4px' }, [
    R('div', { fontSize:'11px', color:'#999', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'5px' }, 'Abonos realizados'),
    ...pg.map(p => Row(
      fmtFecha(p.fecha) + (p.nota ? ` (${p.nota})` : ''),
      `−S/ ${fmtNum(p.monto)}`,
      { fontSize:'12px' },
      { fontSize:'12px', color:'#166534', fontWeight:'600' }
    ))
  ]) : null;

  const imageResponse = new ImageResponse(
    R('div',
      { width:'600px', minHeight:`${altura}px`, background:'#fff', fontFamily:'Georgia,serif', color:'#1a1a1a', padding:'32px 28px', display:'flex', flexDirection:'column' },
      [
        R('div', { fontSize:'18px', fontWeight:'bold', letterSpacing:'1px', textTransform:'uppercase', marginBottom:'4px' }, 'ESTADO DE CUENTA — FIADO'),
        R('div', { borderTop:'2px dashed #bbb', margin:'10px 0 14px' }),
        R('div', { fontSize:'15px', marginBottom:'4px' }, [
          R('span', { fontWeight:'bold' }, 'Cliente: '),
          R('span', {}, cli.nombre)
        ]),
        R('div', { fontSize:'12px', color:'#888', marginBottom:'16px', fontStyle:'italic' }, `Cuenta #${cuenta.numero}`),
        ...diasNodes,
        abonosNode,
        R('div', { background:'#f0f0f0', borderRadius:'8px', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'16px' }, [
          R('span', { fontSize:'13px', fontWeight:'bold', textTransform:'uppercase', letterSpacing:'0.5px' }, 'SALDO A PAGAR'),
          R('span', { fontSize:'24px', fontWeight:'bold' }, `S/ ${fmtNum(saldo)}`)
        ]),
        R('div', { textAlign:'center', fontSize:'12px', color:'#999', marginTop:'12px', fontStyle:'italic' }, 'Gracias por su preferencia 🙏')
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
      // No existe — generar y subir
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

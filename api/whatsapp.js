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
      lineas += Math.ceil(Math.max(its.length, 1) / 2) + (vsDelDia.length > 1 ? 2 : 0);
    });
  });
  if (pg.length) lineas += 2 + pg.length;
  const altura = Math.max(500, lineas * 30 + 140);

  // Productos en dos columnas como la app
  const productosEnColumnas = (its) => {
    if (its.length === 0) return [];
    const filas = [];
    for (let i = 0; i < its.length; i += 2) {
      const izq = its[i];
      const der = its[i + 1] || null;
      filas.push({
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'row', width: '100%', borderBottom: '0.5px solid #f0f0f0', padding: '3px 0' },
          children: [
            // Columna izquierda
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '50%', paddingRight: '12px' },
                children: [
                  { type: 'span', props: { style: { fontSize: '13px', color: '#333', fontFamily: 'Georgia, serif' }, children: izq.producto } },
                  { type: 'span', props: { style: { fontSize: '13px', fontWeight: '600', color: '#555' }, children: `S/ ${fmtNum(izq.precio)}` } }
                ]
              }
            },
            // Columna derecha
            der ? {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '50%', paddingLeft: '12px', borderLeft: '0.5px solid #eee' },
                children: [
                  { type: 'span', props: { style: { fontSize: '13px', color: '#333', fontFamily: 'Georgia, serif' }, children: der.producto } },
                  { type: 'span', props: { style: { fontSize: '13px', fontWeight: '600', color: '#555' }, children: `S/ ${fmtNum(der.precio)}` } }
                ]
              }
            } : { type: 'div', props: { style: { display: 'flex', width: '50%' }, children: '' } }
          ]
        }
      });
    }
    return filas;
  };

  // Nodos de días
  const diasNodes = Object.entries(porFecha).map(([fecha, vsDelDia]) => {
    const totalDia = vsDelDia.reduce((s, v) => s + parseFloat(v.total_visita || 0), 0);
    const nv = vsDelDia.length;

    const visitasNodes = vsDelDia.map((v, idx) => {
      const its = items.filter(it => it.visita_id === v.id);
      const labelNode = nv > 1 ? {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'row' },
          children: { type: 'span', props: { style: { fontSize: '10px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '3px', marginTop: '4px' }, children: `Visita ${idx + 1}` } }
        }
      } : null;

      const prodNodes = its.length > 0
        ? productosEnColumnas(its)
        : [{
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'row' },
              children: { type: 'span', props: { style: { fontSize: '13px', color: '#666' }, children: `Total: S/ ${fmtNum(v.total_visita)}` } }
            }
          }];

      const subtotalNode = nv > 1 ? {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', borderTop: '0.5px dashed #ddd', paddingTop: '3px', marginTop: '2px' },
          children: { type: 'span', props: { style: { fontSize: '11px', color: '#999' }, children: `subtotal  S/ ${fmtNum(v.total_visita)}` } }
        }
      } : null;

      return {
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'column', paddingLeft: '10px', marginBottom: '4px' },
          children: [labelNode, ...prodNodes, subtotalNode].filter(Boolean)
        }
      };
    });

    return {
      type: 'div',
      props: {
        style: { display: 'flex', flexDirection: 'column', marginBottom: '12px' },
        children: [
          // Header del día
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0 5px', borderBottom: '2px solid #333' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: '8px' },
                    children: [
                      { type: 'span', props: { style: { fontSize: '15px', fontWeight: 'bold' }, children: fmtFecha(fecha) } },
                      nv > 1 ? { type: 'span', props: { style: { fontSize: '11px', color: '#999', fontStyle: 'italic' }, children: `${nv} visitas` } } : { type: 'span', props: { style: { display: 'none' }, children: '' } }
                    ]
                  }
                },
                { type: 'span', props: { style: { fontSize: '15px', fontWeight: 'bold' }, children: `S/ ${fmtNum(totalDia)}` } }
              ]
            }
          },
          ...visitasNodes
        ]
      }
    };
  });

  // Abonos
  const abonosNode = pg.length > 0 ? {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', borderTop: '1px dashed #ccc', paddingTop: '10px', marginTop: '6px', gap: '3px' },
      children: [
        { type: 'span', props: { style: { fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }, children: 'Abonos realizados' } },
        ...pg.map(p => ({
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between' },
            children: [
              { type: 'span', props: { style: { fontSize: '13px' }, children: fmtFecha(p.fecha) + (p.nota ? ` · ${p.nota}` : '') } },
              { type: 'span', props: { style: { fontSize: '13px', color: '#166534', fontWeight: '600' }, children: `−S/ ${fmtNum(p.monto)}` } }
            ]
          }
        }))
      ]
    }
  } : null;

  const imageResponse = new ImageResponse(
    {
      type: 'div',
      props: {
        style: { display: 'flex', flexDirection: 'column', width: '700px', minHeight: `${altura}px`, background: '#ffffff', fontFamily: 'Georgia, serif', color: '#1a1a1a', padding: '36px 32px' },
        children: [
          // Título
          { type: 'span', props: { style: { fontSize: '22px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '6px' }, children: 'ESTADO DE CUENTA — FIADO' } },
          // Línea punteada
          { type: 'div', props: { style: { display: 'flex', borderTop: '2px dashed #bbb', marginBottom: '16px', marginTop: '8px' } } },
          // Cliente
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'row', gap: '6px', marginBottom: '2px' },
              children: [
                { type: 'span', props: { style: { fontSize: '16px', fontWeight: 'bold' }, children: 'Cliente:' } },
                { type: 'span', props: { style: { fontSize: '16px' }, children: ` ${cli.nombre}.` } }
              ]
            }
          },
          { type: 'span', props: { style: { fontSize: '12px', color: '#888', fontStyle: 'italic', marginBottom: '20px' }, children: `Cuenta #${cuenta.numero}` } },
          // Días
          ...diasNodes,
          // Abonos
          ...(abonosNode ? [abonosNode] : []),
          // Total
          {
            type: 'div',
            props: {
              style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', background: '#f0f0f0', borderRadius: '10px', padding: '14px 20px', marginTop: '18px' },
              children: [
                { type: 'span', props: { style: { fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }, children: 'SALDO A PAGAR' } },
                { type: 'span', props: { style: { fontSize: '28px', fontWeight: 'bold' }, children: `S/ ${fmtNum(saldo)}` } }
              ]
            }
          },
          { type: 'span', props: { style: { textAlign: 'center', fontSize: '13px', color: '#999', marginTop: '14px', fontStyle: 'italic' }, children: 'Gracias por su preferencia 🙌' } }
        ].filter(Boolean)
      }
    },
    { width: 700, height: altura }
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
        console.error('Error subiendo imagen:', await upload.text());
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

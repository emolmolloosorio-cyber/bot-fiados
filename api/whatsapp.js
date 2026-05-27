// api/whatsapp.js - Bot WhatsApp Fiados
import sharp from "sharp";
import TextToSVG from "text-to-svg";
import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN  = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const SB_URL      = process.env.SB_URL;
const SB_KEY      = process.env.SB_KEY;
const RECEIPTS_BUCKET = "Recibos";
const textToSvg = TextToSVG.loadSync();

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbUpsert(table, data) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
}

async function uploadReceipt(fileName, pngBuffer) {
  const res = await fetch(`${SB_URL}/storage/v1/object/${RECEIPTS_BUCKET}/${fileName}`, {
    method: "PUT",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "image/png",
      "x-upsert": "true"
    },
    body: pngBuffer
  });
  if (!res.ok) throw new Error(await res.text());
}

async function getSesion(telefono) {
  const res = await fetch(
    `${SB_URL}/rest/v1/sesiones_bot?telefono=eq.${encodeURIComponent(telefono)}`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    }
  );
  const rows = await res.json();
  return rows[0] || null;
}

async function setSesion(telefono, estado, datos = {}) {
  await sbUpsert("sesiones_bot", {
    telefono,
    estado,
    datos,
    updated_at: new Date().toISOString()
  });
}

async function clearSesion(telefono) {
  await fetch(
    `${SB_URL}/rest/v1/sesiones_bot?telefono=eq.${encodeURIComponent(telefono)}`,
    {
      method: "DELETE",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`
      }
    }
  );
}

const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const fmtNum = n => parseFloat(n || 0).toFixed(2);
const fmt = n => `S/ ${fmtNum(n)}`;
const escapeXml = s => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");
const short = (s, max = 34) => {
  const text = String(s ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
};
const fechaDisplay = iso => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

async function getCuentaActiva(cli) {
  const cuentas = await sbGet(`cuentas?cliente_id=eq.${cli.id}&order=numero`);
  return cuentas.find(c => c.estado === "activa" || c.estado === "pendiente") || null;
}

async function getReceiptData(cuenta) {
  const [visitas, pagos] = await Promise.all([
    sbGet(`visitas?cuenta_id=eq.${cuenta.id}&order=fecha,created_at`),
    sbGet(`pagos?cuenta_id=eq.${cuenta.id}&order=fecha`)
  ]);

  const visitaIds = visitas.map(v => v.id);
  const items = visitaIds.length
    ? await sbGet(`items_visita?visita_id=in.(${visitaIds.join(",")})&order=id`)
    : [];

  return { visitas, items, pagos };
}

function receiptSvg(cli, cuenta, data) {
  const width = 896;
  const margin = 48;
  const right = width - margin;
  const mid = width / 2;
  const body = [];

  const visitasPorFecha = new Map();
  for (const visita of data.visitas) {
    if (!visitasPorFecha.has(visita.fecha)) visitasPorFecha.set(visita.fecha, []);
    visitasPorFecha.get(visita.fecha).push(visita);
  }

  let y = 92;
  const textWidth = (value, size) => textToSvg.getMetrics(String(value ?? ""), { fontSize: size }).width;
  const text = (x, yPos, value, size, weight = 400, fill = "#1f1f1f", anchor = "start") => {
    const clean = String(value ?? "");
    const metrics = textToSvg.getMetrics(clean, { fontSize: size });
    const px = anchor === "end" ? x - metrics.width : anchor === "middle" ? x - metrics.width / 2 : x;
    const stroke = weight >= 800 ? 0.65 : weight >= 700 ? 0.35 : 0;
    const path = textToSvg.getPath(clean, { x: px, y: yPos, fontSize: size });
    body.push(path.replace("<path ", `<path fill="${fill}" stroke="${fill}" stroke-width="${stroke}" `));
  };
  const line = (yPos, color = "#d8d8d8", stroke = 1.5, dash = "", x1 = margin, x2 = right) => {
    body.push(`<line x1="${x1}" y1="${yPos}" x2="${x2}" y2="${yPos}" stroke="${color}" stroke-width="${stroke}" ${dash}/>`); 
  };
  text(margin, y, "ESTADO DE CUENTA \u2014 FIADO", 38, 800);
  y += 30;
  line(y, "#b8b8b8", 3, 'stroke-dasharray="12 10"');
  y += 58;

  text(margin, y, "Cliente:", 30, 800);
  text(margin + textWidth("Cliente: ", 30), y, `${cli.nombre}.`, 30, 400);
  y += 58;

  if (!visitasPorFecha.size) {
    text(margin, y, "Sin movimientos registrados.", 24, 400, "#666");
    y += 50;
  }

  for (const [fecha, visitas] of visitasPorFecha.entries()) {
    const totalDia = visitas.reduce((s, v) => s + parseFloat(v.total_visita || 0), 0);
    text(margin, y, fechaDisplay(fecha), 27, 800);
    text(right, y, fmt(totalDia), 27, 800, "#1f1f1f", "end");
    y += 17;
    line(y, "#2a2a2a", 2);
    y += 37;

    visitas.forEach((visita, index) => {
      const its = data.items.filter(it => it.visita_id === visita.id);

      if (visitas.length > 1) {
        text(margin + 20, y - 10, `VISITA ${index + 1}`, 16, 700, "#aaa");
        y += 20;
      }

      for (let i = 0; i < its.length; i += 2) {
        const first = its[i];
        const second = its[i + 1];
        const rowY = y;

        text(margin + 20, rowY, short(first.producto, 20), 25, 400, "#333");
        text(mid - 2, rowY, fmt(first.precio), 22, 800, "#666", "end");
        line(rowY + 17, "#eeeeee", 1, "", margin + 20, mid - 2);

        if (second) {
          text(mid + 18, rowY, short(second.producto, 20), 25, 400, "#333");
          text(right, rowY, fmt(second.precio), 22, 800, "#666", "end");
          line(rowY + 17, "#eeeeee", 1, "", mid + 18, right);
        }

        y += 31;
      }

      if (visitas.length > 1) {
        text(right, y + 4, `subtotal ${fmt(visita.total_visita)}`, 17, 700, "#777", "end");
        y += 24;
      }
    });

    line(y + 2, "#d8d8d8", 1.5);
    y += 47;
  }

  if (data.pagos.length) {
    y += 2;
    line(y, "#cccccc", 1.5, 'stroke-dasharray="8 8"');
    y += 34;
    text(margin, y, "ABONOS REALIZADOS", 17, 700, "#999");
    y += 28;

    for (const pago of data.pagos) {
      const nota = pago.nota ? ` (${short(pago.nota, 18)})` : "";
      text(margin, y, `${fechaDisplay(pago.fecha)}${nota}`, 20, 400, "#333");
      text(right, y, `- ${fmt(pago.monto)}`, 20, 700, "#166534", "end");
      y += 28;
    }
    y += 18;
  }

  body.push(`<rect x="${margin}" y="${y}" width="${width - margin * 2}" height="90" rx="12" fill="#eeeeee"/>`);
  text(margin + 28, y + 58, "SALDO A PAGAR", 27, 800, "#1f1f1f");
  text(right - 28, y + 64, fmt(cuenta.saldo), 45, 900, "#171717", "end");
  y += 142;
  text(mid, y, "Gracias por su preferencia", 26, 400, "#999", "middle");

  const height = Math.ceil(y + 54);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#ffffff"/>`,
    ...body,
    "</svg>"
  ].join("");
}

async function crearReciboImagen(cli, cuenta) {
  const data = await getReceiptData(cuenta);
  const svg = receiptSvg(cli, cuenta, data);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const fileName = `recibo-cliente-${cli.id}.png`;
  await uploadReceipt(fileName, png);
  return `${SB_URL}/storage/v1/object/public/${RECEIPTS_BUCKET}/${fileName}?v=${Date.now()}`;
}

async function enviarRecibo(cli, enviar) {
  const cuenta = await getCuentaActiva(cli);

  if (!cuenta) {
    await enviar(`${cli.nombre} no tiene fiado activo actualmente.`);
    return;
  }

  const mediaUrl = await crearReciboImagen(cli, cuenta);
  await enviar(
    `Estado de cuenta de *${cli.nombre}*\nSaldo pendiente: *S/ ${fmtNum(cuenta.saldo)}*`,
    mediaUrl
  );
}

export default async function handler(req, res) {
  // Cron keep-alive ping
  if (req.method === "GET") return res.status(200).json({ ok: true });
  if (req.method !== "POST") return res.status(405).end();

  const body   = req.body || {};
  const from   = body.From || "";
  const msgRaw = (body.Body || "").trim();
  const msg    = norm(msgRaw);

  if (!msg) return res.status(200).end();

  const client = twilio(ACCOUNT_SID, AUTH_TOKEN);
  const enviar = async (texto, mediaUrl) => {
    const opts = { from: FROM_NUMBER, to: from, body: texto };
    if (mediaUrl) opts.mediaUrl = [mediaUrl];
    await client.messages.create(opts);
  };

  try {
    const sesion = await getSesion(from);

    if (sesion && sesion.estado === "eligiendo") {
      const opcion = parseInt(msg, 10);
      const candidatos = sesion.datos.candidatos;

      if (isNaN(opcion) || opcion < 1 || opcion > candidatos.length) {
        await enviar(
          `Responde con un numero del 1 al ${candidatos.length}, o escribe otro nombre para buscar de nuevo.`
        );
        return res.status(200).end();
      }

      await clearSesion(from);
      await enviarRecibo(candidatos[opcion - 1], enviar);
      return res.status(200).end();
    }

    const clientes = await sbGet("clientes?estado=eq.activo&order=nombre");
    const candidatos = clientes.filter(c =>
      norm(c.nombre).includes(msg) || msg.includes(norm(c.nombre))
    );

    if (candidatos.length === 0) {
      await enviar(
        `No encontre ningun cliente con "${msgRaw}".\nVerifica el nombre e intenta de nuevo.`
      );
      return res.status(200).end();
    }

    if (candidatos.length > 1) {
      const lista = candidatos
        .map((c, i) => `${i + 1}. ${c.nombre}`)
        .join("\n");

      await setSesion(from, "eligiendo", { candidatos });
      await enviar(`Encontre ${candidatos.length} clientes:\n${lista}\n\nResponde con el numero.`);
      return res.status(200).end();
    }

    await enviarRecibo(candidatos[0], enviar);
    return res.status(200).end();

  } catch (e) {
    console.error("Error bot:", e.message);
    await enviar("Ocurrio un error. Intenta de nuevo.").catch(() => {});
    return res.status(200).end();
  }
}

// api/whatsapp.js — Bot WhatsApp Fiados
import twilio from "twilio";

const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN  = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const SB_URL      = process.env.SB_URL;
const SB_KEY      = process.env.SB_KEY;

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

const norm   = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const fmtNum = n => parseFloat(n || 0).toFixed(2);

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
    // Cargar sesión activa del usuario
    const sesion = await getSesion(from);

    // ── ESTADO: esperando que elija un número de la lista ──
    if (sesion && sesion.estado === "eligiendo") {
      const opcion = parseInt(msg);
      const candidatos = sesion.datos.candidatos;

      if (isNaN(opcion) || opcion < 1 || opcion > candidatos.length) {
        await enviar(
          `Responde con un número del 1 al ${candidatos.length}, o escribe otro nombre para buscar de nuevo.`
        );
        return res.status(200).end();
      }

      const cli = candidatos[opcion - 1];

      // Cargar cuentas solo para este cliente
      const cuentas = await sbGet(
        `cuentas?cliente_id=eq.${cli.id}&order=numero`
      );

      const cuenta = cuentas.find(c =>
        c.estado === "activa" || c.estado === "pendiente"
      );

      await clearSesion(from);

      if (!cuenta) {
        await enviar(`${cli.nombre} no tiene fiado activo actualmente.`);
        return res.status(200).end();
      }

      const fileName  = `recibo-cliente-${cli.id}.png`;
      const publicUrl = `${SB_URL}/storage/v1/object/public/Recibos/${fileName}`;
      const check     = await fetch(publicUrl, { method: "HEAD" });

      if (!check.ok) {
        await enviar(
          `El recibo de *${cli.nombre}* aún no ha sido generado.\n` +
          `Abre la app, busca al cliente y toca "🧾 Recibo". Luego vuelve a escribir aquí.`
        );
        return res.status(200).end();
      }

      await enviar(
        `Estado de cuenta de *${cli.nombre}*\nSaldo pendiente: *S/ ${fmtNum(cuenta.saldo)}*`,
        publicUrl
      );

      return res.status(200).end();
    }

    // ── BÚSQUEDA NORMAL ──
    const clientes = await sbGet("clientes?estado=eq.activo&order=nombre");

    const candidatos = clientes.filter(c =>
      norm(c.nombre).includes(msg) || msg.includes(norm(c.nombre))
    );

    // Sin resultados
    if (candidatos.length === 0) {
      await enviar(
        `No encontré ningún cliente con "${msgRaw}".\nVerifica el nombre e intenta de nuevo.`
      );
      return res.status(200).end();
    }

    // Múltiples coincidencias → pedir que elija
    if (candidatos.length > 1) {
      const lista = candidatos
        .map((c, i) => `${i + 1}. ${c.nombre}`)
        .join("\n");

      await setSesion(from, "eligiendo", { candidatos });
      await enviar(`Encontré ${candidatos.length} clientes:\n${lista}\n\nResponde con el número.`);
      return res.status(200).end();
    }

    // Una sola coincidencia → directo
    const cli = candidatos[0];
    const cuentas = await sbGet(
      `cuentas?cliente_id=eq.${cli.id}&order=numero`
    );

    const cuenta = cuentas.find(c =>
      c.estado === "activa" || c.estado === "pendiente"
    );

    if (!cuenta) {
      await enviar(`${cli.nombre} no tiene fiado activo actualmente.`);
      return res.status(200).end();
    }

    const fileName  = `recibo-cliente-${cli.id}.png`;
    const publicUrl = `${SB_URL}/storage/v1/object/public/Recibos/${fileName}`;
    const check     = await fetch(publicUrl, { method: "HEAD" });

    if (!check.ok) {
      await enviar(
        `El recibo de *${cli.nombre}* aún no ha sido generado.\n` +
        `Abre la app, busca al cliente y toca "🧾 Recibo". Luego vuelve a escribir aquí.`
      );
      return res.status(200).end();
    }

    await enviar(
      `Estado de cuenta de *${cli.nombre}*\nSaldo pendiente: *S/ ${fmtNum(cuenta.saldo)}*`,
      publicUrl
    );

    return res.status(200).end();

  } catch (e) {
    console.error("Error bot:", e.message);
    await enviar("Ocurrió un error. Intenta de nuevo.").catch(() => {});
    return res.status(200).end();
  }
}

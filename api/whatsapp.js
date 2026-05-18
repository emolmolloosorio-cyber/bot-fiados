import twilio from "twilio";
import { ImageResponse } from "@vercel/og";

const ACCOUNT_SID = process.env.TWILIO_SID;
const AUTH_TOKEN = process.env.TWILIO_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM;
const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_KEY;

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

const norm = s =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const fmtNum = n => parseFloat(n || 0).toFixed(2);

const fmtFecha = iso =>
  iso.split("-").reverse().join("/");


async function generarImagenRecibo(
  cli,
  cuenta,
  visitas,
  items,
  pagos
) {

  const vs = visitas
    .filter(v => v.cuenta_id === cuenta.id)
    .sort(
      (a, b) => a.fecha.localeCompare(b.fecha)
    );

  const porFecha = {};

  vs.forEach(v => {
    if (!porFecha[v.fecha]) {
      porFecha[v.fecha] = [];
    }

    porFecha[v.fecha].push(v);
  });

  const pg = pagos.filter(
    p => p.cuenta_id === cuenta.id
  );

  const saldo = parseFloat(
    cuenta.saldo || 0
  );


  let lineas = 10;

  Object.values(porFecha).forEach(
    vsDelDia => {

      lineas += 2;

      vsDelDia.forEach(v => {

        const its = items.filter(
          it => it.visita_id === v.id
        );

        lineas += Math.ceil(
          Math.max(
            its.length,
            1
          ) / 2
        );
      });
    }
  );

  const altura = Math.max(
    500,
    lineas * 30 + 140
  );


  const imageResponse =
    new ImageResponse(

      {
        type: "div",

        props: {

          style: {
            display: "flex",
            flexDirection: "column",
            width: "700px",
            minHeight: `${altura}px`,
            background: "#ffffff",
            padding: "40px"
          },

          children: [

            {
              type: "div",

              props: {
                style: {
                  display: "flex",
                  fontSize: "28px",
                  fontWeight: "800",
                  marginBottom: "15px"
                },

                children:
                  "ESTADO DE CUENTA — FIADO"
              }
            },


            {
              type: "div",

              props: {
                style: {
                  display: "flex",
                  marginBottom: "20px"
                },

                children:
                  `Cliente: ${cli.nombre}`
              }
            },


            ...Object.entries(
              porFecha
            ).map(

              ([fecha, vsDelDia]) => {

                const totalDia =
                  vsDelDia.reduce(

                    (s, v) =>
                      s +
                      parseFloat(
                        v.total_visita || 0
                      ),

                    0
                  );


                return {

                  type: "div",

                  props: {

                    style: {
                      display: "flex",
                      flexDirection:
                        "column",
                      marginBottom:
                        "15px"
                    },

                    children: [

                      {
                        type:
                          "div",

                        props: {

                          style: {
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            marginBottom:
                              "5px"
                          },

                          children: [

                            fmtFecha(
                              fecha
                            ),

                            `S/ ${fmtNum(
                              totalDia
                            )}`
                          ]
                        }
                      }
                    ]
                  }
                };
              }
            ),


            {
              type: "div",

              props: {

                style: {
                  display: "flex",
                  justifyContent:
                    "space-between",
                  marginTop:
                    "20px"
                },

                children: [

                  "SALDO A PAGAR",

                  `S/ ${fmtNum(
                    saldo
                  )}`
                ]
              }
            }
          ]
        }
      },

      {
        width: 700,
        height: altura
      }
    );


  return imageResponse.arrayBuffer();
}



export default async function handler(
  req,
  res
) {

  if (
    req.method !== "POST"
  ) {

    return res
      .status(405)
      .end();
  }


  const body =
    req.body || {};

  const from =
    body.From || "";

  const msgRaw =
    (
      body.Body || ""
    ).trim();

  const msg =
    norm(msgRaw);


  if (!msg) {

    return res
      .status(200)
      .end();
  }


  const client =
    twilio(
      ACCOUNT_SID,
      AUTH_TOKEN
    );


  const enviar =
    async (
      texto,
      mediaUrl
    ) => {

      const opts = {

        from:
          FROM_NUMBER,

        to:
          from,

        body:
          texto
      };

      if (mediaUrl) {

        opts.mediaUrl = [
          mediaUrl
        ];
      }

      await client
        .messages
        .create(opts);
    };


  try {

    const [
      clientes,
      cuentas,
      visitas,
      items,
      pagos
    ] =
      await Promise.all([

        sbGet(
          "clientes?order=nombre"
        ),

        sbGet(
          "cuentas?order=cliente_id,numero"
        ),

        sbGet(
          "visitas?order=fecha,created_at&limit=10000"
        ),

        sbGet(
          "items_visita?order=id&limit=10000"
        ),

        sbGet(
          "pagos?order=fecha"
        )
      ]);


    const cli =
      clientes.find(
        c =>

          norm(
            c.nombre
          ).includes(msg)

          ||

          msg.includes(
            norm(
              c.nombre
            )
          )
      );


    if (!cli) {

      await enviar(
        `No encontré ningún cliente con "${msgRaw}".`
      );

      return res
        .status(200)
        .end();
    }


    const cuenta =
      cuentas.find(
        c =>

          c.cliente_id ===
            cli.id

          &&

          (
            c.estado ===
              "activa"

            ||

            c.estado ===
              "pendiente"
          )
      );


    if (!cuenta) {

      await enviar(
        `${cli.nombre} no tiene fiado activo actualmente.`
      );

      return res
        .status(200)
        .end();
    }


    const fileName =
      `recibo-cliente-${cli.id}.png`;


    const publicUrl =
      `${SB_URL}/storage/v1/object/public/Recibos/${fileName}`;


    const check =
      await fetch(
        publicUrl,
        {
          method:
            "HEAD"
        }
      );


    if (!check.ok) {

      await enviar(
        `Generando recibo de *${cli.nombre}*... ⏳`
      );


      const imgBuffer =
        await generarImagenRecibo(

          cli,
          cuenta,
          visitas,
          items,
          pagos
        );


      const upload =
        await fetch(

          `${SB_URL}/storage/v1/object/Recibos/${fileName}`,

          {
            method:
              "PUT",

            headers: {

              apikey:
                SB_KEY,

              Authorization:
                `Bearer ${SB_KEY}`,

              "Content-Type":
                "image/png",

              "x-upsert":
                "true"
            },

            body:
              imgBuffer
          }
        );


      if (
        !upload.ok
      ) {

        console.error(
          await upload.text()
        );

        await enviar(
          `⚠️ No se pudo generar el recibo.`
        );

        return res
          .status(200)
          .end();
      }
    }


    await enviar(

      `Estado de cuenta de *${cli.nombre}*\nSaldo pendiente: *S/ ${fmtNum(cuenta.saldo)}*`,

      publicUrl
    );


    return res
      .status(200)
      .end();

  } catch (e) {

    console.error(
      "Error bot:",
      e
    );

    await enviar(
      "Ocurrió un error. Intenta de nuevo."
    ).catch(
      () => {}
    );

    return res
      .status(200)
      .end();
  }
}

import { ImageResponse } from "@vercel/og";


function fmtNum(n) {
  return Number(n).toFixed(2);
}

function fmtFecha(fecha) {
  const d = new Date(fecha);
  return d.toLocaleDateString("es-PE");
}


async function generarImagenRecibo(cli, cuenta, visitas, items) {
  const vs = visitas
    .filter(v => v.cuenta_id === cuenta.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porFecha = {};

  vs.forEach(v => {
    if (!porFecha[v.fecha]) {
      porFecha[v.fecha] = [];
    }

    porFecha[v.fecha].push(v);
  });

  const saldo = parseFloat(cuenta.saldo || 0);

  const renderProductos = (its) => {
    const filas = [];

    for (let i = 0; i < its.length; i += 2) {
      const izq = its[i];
      const der = its[i + 1];

      filas.push({
        type: "div",
        props: {
          style: {
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "5px"
          },

          children: [
            `${izq.producto} - S/ ${fmtNum(izq.precio)}`,
            der
              ? `${der.producto} - S/ ${fmtNum(der.precio)}`
              : ""
          ]
        }
      });
    }

    return filas;
  };


  return new ImageResponse(
    {
      type: "div",

      props: {
        style: {
          display: "flex",
          flexDirection: "column",
          width: "700px",
          background: "white",
          padding: "40px"
        },

        children: [
          {
            type: "div",
            props: {
              style: {
                fontSize: "28px",
                fontWeight: "bold",
                marginBottom: "20px"
              },

              children: "ESTADO DE CUENTA — FIADO"
            }
          },

          {
            type: "div",
            props: {
              style: {
                marginBottom: "20px"
              },

              children: `Cliente: ${cli.nombre}`
            }
          },

          ...Object.entries(porFecha).map(([fecha, visitasDia]) => {

            const totalDia = visitasDia.reduce(
              (sum, v) => sum + Number(v.total_visita),
              0
            );

            const productos = visitasDia.flatMap(
              v => items.filter(
                i => i.visita_id === v.id
              )
            );

            return {
              type: "div",

              props: {
                style: {
                  marginBottom: "20px"
                },

                children: [
                  {
                    type: "div",

                    props: {
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        fontWeight: "bold",
                        marginBottom: "10px"
                      },

                      children: [
                        fmtFecha(fecha),
                        `S/ ${fmtNum(totalDia)}`
                      ]
                    }
                  },

                  ...renderProductos(productos)
                ]
              }
            };
          }),

          {
            type: "div",

            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                marginTop: "30px",
                fontWeight: "bold",
                fontSize: "24px"
              },

              children: [
                "SALDO A PAGAR",
                `S/ ${fmtNum(saldo)}`
              ]
            }
          }
        ]
      }
    },

    {
      width: 700,
      height: 900
    }
  );
}



export default async function handler(req, res) {
  try {

    // 🔹 Datos de prueba
    const cli = {
      nombre: "Juan Pérez"
    };

    const cuenta = {
      id: 1,
      numero: 1,
      saldo: 35
    };

    const visitas = [
      {
        id: 1,
        cuenta_id: 1,
        fecha: "2025-01-10",
        total_visita: 15
      },

      {
        id: 2,
        cuenta_id: 1,
        fecha: "2025-01-12",
        total_visita: 20
      }
    ];

    const items = [
      {
        visita_id: 1,
        producto: "Arroz",
        precio: 8
      },

      {
        visita_id: 1,
        producto: "Aceite",
        precio: 7
      },

      {
        visita_id: 2,
        producto: "Azúcar",
        precio: 10
      },

      {
        visita_id: 2,
        producto: "Leche",
        precio: 10
      }
    ];


    return generarImagenRecibo(
      cli,
      cuenta,
      visitas,
      items
    );

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}

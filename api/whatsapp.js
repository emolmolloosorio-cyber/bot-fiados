import { ImageResponse } from "@vercel/og";


function fmtNum(n) {
  return Number(n).toFixed(2);
}

function fmtFecha(fecha) {
  const d = new Date(fecha);
  return d.toLocaleDateString("es-PE");
}


async function generarImagenRecibo(cli, cuenta, visitas, items, pagos) {
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
      const der = its[i + 1] || null;

      filas.push({
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "row",
            width: "100%",
            marginBottom: "4px"
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  width: "50%",
                  paddingRight: "10px"
                },
                children: [
                  {
                    type: "span",
                    props: {
                      style: {
                        display: "flex",
                        fontSize: "14px"
                      },
                      children: izq.producto
                    }
                  },
                  {
                    type: "span",
                    props: {
                      style: {
                        display: "flex",
                        fontSize: "14px"
                      },
                      children: `S/ ${fmtNum(izq.precio)}`
                    }
                  }
                ]
              }
            },

            der && {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  width: "50%",
                  paddingLeft: "10px"
                },
                children: [
                  {
                    type: "span",
                    props: {
                      style: {
                        display: "flex",
                        fontSize: "14px"
                      },
                      children: der.producto
                    }
                  },
                  {
                    type: "span",
                    props: {
                      style: {
                        display: "flex",
                        fontSize: "14px"
                      },
                      children: `S/ ${fmtNum(der.precio)}`
                    }
                  }
                ]
              }
            }
          ].filter(Boolean)
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
                display: "flex",
                fontSize: "28px",
                fontWeight: "800",
                marginBottom: "20px"
              },
              children: "ESTADO DE CUENTA — FIADO"
            }
          },

          {
            type: "div",
            props: {
              style: {
                display: "flex",
                flexDirection: "column",
                marginBottom: "20px"
              },

              children: [
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      fontSize: "18px"
                    },
                    children: `Cliente: ${cli.nombre}`
                  }
                },

                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      fontSize: "14px"
                    },
                    children: `Cuenta #${cuenta.numero}`
                  }
                }
              ]
            }
          },


          ...Object.entries(porFecha).map(([fecha, vsDelDia]) => {
            const totalDia = vsDelDia.reduce(
              (s, v) => s + parseFloat(v.total_visita || 0),
              0
            );

            const allItems = vsDelDia.flatMap(
              v => items.filter(it => it.visita_id === v.id)
            );

            return {
              type: "div",
              props: {
                style: {
                  display: "flex",
                  flexDirection: "column",
                  marginBottom: "20px"
                },

                children: [
                  {
                    type: "div",
                    props: {
                      style: {
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "10px"
                      },

                      children: [
                        {
                          type: "span",
                          props: {
                            style: {
                              display: "flex",
                              fontWeight: "bold"
                            },
                            children: fmtFecha(fecha)
                          }
                        },

                        {
                          type: "span",
                          props: {
                            style: {
                              display: "flex",
                              fontWeight: "bold"
                            },
                            children: `S/ ${fmtNum(totalDia)}`
                          }
                        }
                      ]
                    }
                  },

                  ...renderProductos(allItems)
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
                marginTop: "20px"
              },

              children: [
                {
                  type: "span",
                  props: {
                    style: {
                      display: "flex",
                      fontWeight: "bold",
                      fontSize: "18px"
                    },
                    children: "SALDO A PAGAR"
                  }
                },

                {
                  type: "span",
                  props: {
                    style: {
                      display: "flex",
                      fontWeight: "bold",
                      fontSize: "30px"
                    },
                    children: `S/ ${fmtNum(saldo)}`
                  }
                }
              ]
            }
          }
        ]
      }
    },
    {
      width: 700
    }
  );
}



export default async function handler(req, res) {
  try {

    if (req.method !== "GET") {
      return res.status(405).json({
        error: "Método no permitido"
      });
    }


    return res.status(200).json({
      ok: true,
      message: "Servidor funcionando en Vercel"
    });

  } catch (error) {

    return res.status(500).json({
      error: error.message
    });

  }
}

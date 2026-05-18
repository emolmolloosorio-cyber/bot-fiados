async function generarImagenRecibo(cli, cuenta, visitas, items, pagos) {

  const vs = visitas
    .filter(v => v.cuenta_id === cuenta.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porFecha = {};

  vs.forEach(v => {
    if (!porFecha[v.fecha]) porFecha[v.fecha] = [];
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
    lineas * 34 + 160
  );


  const productosEnColumnas = its => {

    const filas = [];

    for (let i = 0; i < its.length; i += 2) {

      const izq = its[i];
      const der = its[i + 1];

      filas.push({

        type: "div",

        props: {

          style: {
            display: "flex",
            flexDirection: "row",
            width: "100%",
            borderBottom: "1px solid #ececec",
            padding: "4px 0"
          },

          children: [

            {
              type: "div",

              props: {

                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  width: "50%",
                  paddingRight: "10px"
                },

                children: [

                  {
                    type: "span",
                    props: {
                      style: {
                        fontSize: "14px",
                        fontFamily: "Georgia",
                        color: "#333"
                      },
                      children: izq.producto
                    }
                  },

                  {
                    type: "span",
                    props: {
                      style: {
                        fontSize: "14px",
                        fontWeight: "700",
                        color: "#555"
                      },
                      children: `S/ ${fmtNum(izq.precio)}`
                    }
                  }
                ]
              }
            },


            der ? {

              type: "div",

              props: {

                style: {
                  display: "flex",
                  justifyContent: "space-between",
                  width: "50%",
                  paddingLeft: "10px"
                },

                children: [

                  {
                    type: "span",
                    props: {
                      style: {
                        fontSize: "14px",
                        fontFamily: "Georgia",
                        color: "#333"
                      },
                      children: der.producto
                    }
                  },

                  {
                    type: "span",
                    props: {
                      style: {
                        fontSize: "14px",
                        fontWeight: "700",
                        color: "#555"
                      },
                      children: `S/ ${fmtNum(der.precio)}`
                    }
                  }
                ]
              }
            } : null
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
          minHeight: `${altura}px`,
          background: "#ffffff",
          padding: "40px",
          fontFamily: "Georgia",
          color: "#222"
        },

        children: [

          {
            type: "div",

            props: {

              style: {
                display: "flex",
                fontSize: "32px",
                fontWeight: "800",
                marginBottom: "10px"
              },

              children:
                "ESTADO DE CUENTA — FIADO"
            }
          },


          {
            type: "div",

            props: {
              style: {
                borderTop:
                  "4px dashed #bbb",
                marginBottom: "25px"
              }
            }
          },


          {
            type: "div",

            props: {

              style: {
                fontSize: "18px",
                marginBottom: "5px"
              },

              children:
                `Cliente: ${cli.nombre}.`
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

              const allItems =
                vsDelDia.flatMap(
                  v =>
                    items.filter(
                      it =>
                        it.visita_id === v.id
                    )
                );

              return {

                type: "div",

                props: {

                  style: {
                    marginBottom: "22px"
                  },

                  children: [

                    {
                      type: "div",

                      props: {

                        style: {
                          display: "flex",
                          justifyContent:
                            "space-between",
                          borderBottom:
                            "2px solid #333",
                          paddingBottom: "6px",
                          marginBottom: "8px"
                        },

                        children: [

                          {
                            type: "span",
                            props: {
                              style: {
                                fontSize: "16px",
                                fontWeight: "700"
                              },
                              children:
                                fmtFecha(fecha)
                            }
                          },

                          {
                            type: "span",
                            props: {
                              style: {
                                fontSize: "16px",
                                fontWeight: "700"
                              },
                              children:
                                `S/ ${fmtNum(totalDia)}`
                            }
                          }
                        ]
                      }
                    },


                    ...productosEnColumnas(
                      allItems
                    )
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
                alignItems: "center",
                background: "#f3f3f3",
                borderRadius: "12px",
                padding: "18px 22px",
                marginTop: "20px"
              },

              children: [

                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: "18px",
                      fontWeight: "700"
                    },
                    children:
                      "SALDO A PAGAR"
                  }
                },

                {
                  type: "span",
                  props: {
                    style: {
                      fontSize: "36px",
                      fontWeight: "800"
                    },
                    children:
                      `S/ ${fmtNum(saldo)}`
                  }
                }
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
  ).arrayBuffer();
}

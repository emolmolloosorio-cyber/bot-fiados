async function generarImagenRecibo(cli, cuenta, visitas, items, pagos) {
  const vs = visitas
    .filter(v => v.cuenta_id === cuenta.id)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porFecha = {};
  vs.forEach(v => {
    if (!porFecha[v.fecha]) porFecha[v.fecha] = [];
    porFecha[v.fecha].push(v);
  });

  const saldo = parseFloat(cuenta.saldo || 0);

  const renderProductos = (its) => {
    const filas = [];
    for (let i = 0; i < its.length; i += 2) {
      const izq = its[i];
      const der = its[i + 1] || null;
      filas.push({
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'row', width: '100%', marginBottom: '4px' }, // Flex añadido
          children: [
            {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '50%', paddingRight: '10px' }, // Flex añadido
                children: [
                  { type: 'span', props: { style: { fontSize: '14px', color: '#444' }, children: izq.producto } },
                  { type: 'span', props: { style: { fontSize: '14px', color: '#444' }, children: `S/ ${fmtNum(izq.precio)}` } }
                ]
              }
            },
            der ? {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', width: '50%', paddingLeft: '10px' }, // Flex añadido
                children: [
                  { type: 'span', props: { style: { fontSize: '14px', color: '#444' }, children: der.producto } },
                  { type: 'span', props: { style: { fontSize: '14px', color: '#444' }, children: `S/ ${fmtNum(der.precio)}` } }
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
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '700px',
          background: '#ffffff',
          padding: '40px',
          fontFamily: 'sans-serif'
        },
        children: [
          { 
            type: 'div', 
            props: { 
              style: { 
                display: 'flex', // Flex añadido
                fontSize: '28px', 
                fontWeight: '800', 
                fontFamily: 'Georgia, serif', 
                letterSpacing: '0.5px',
                marginBottom: '10px'
              }, 
              children: 'ESTADO DE CUENTA — FIADO' 
            } 
          },
          { type: 'div', props: { style: { display: 'flex', borderTop: '2px dashed #ddd', marginBottom: '20px' } } },
          { 
            type: 'div', 
            props: { 
              style: { display: 'flex', flexDirection: 'column', marginBottom: '30px' }, // Contenedor flex para los textos del cliente
              children: [
                { type: 'div', props: { style: { display: 'flex', fontSize: '18px', fontWeight: '700' }, children: `Cliente: ${cli.nombre}.` } },
                { type: 'div', props: { style: { display: 'flex', fontSize: '14px', color: '#999' }, children: `Cuenta #${cuenta.numero}` } }
              ]
            }
          },

          ...Object.entries(porFecha).map(([fecha, vsDelDia]) => {
            const totalDia = vsDelDia.reduce((s, v) => s + parseFloat(v.total_visita || 0), 0);
            const allItems = vsDelDia.flatMap(v => items.filter(it => it.visita_id === v.id));

            return {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', marginBottom: '25px' },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: { 
                        display: 'flex', 
                        flexDirection: 'row',
                        justifyContent: 'space-between', 
                        borderBottom: '2px solid #000', 
                        paddingBottom: '5px', 
                        marginBottom: '10px' 
                      },
                      children: [
                        { type: 'span', props: { style: { display: 'flex', fontSize: '16px', fontWeight: 'bold' }, children: fmtFecha(fecha) } },
                        { type: 'span', props: { style: { display: 'flex', fontSize: '16px', fontWeight: 'bold' }, children: `S/ ${fmtNum(totalDia)}` } }
                      ]
                    }
                  },
                  ...renderProductos(allItems)
                ]
              }
            };
          }),

          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f1f3f4',
                borderRadius: '12px',
                padding: '25px 30px',
                marginTop: '20px'
              },
              children: [
                { type: 'span', props: { style: { display: 'flex', fontSize: '18px', fontWeight: '700', color: '#202124' }, children: 'SALDO A PAGAR' } },
                { type: 'span', props: { style: { display: 'flex', fontSize: '36px', fontWeight: '800', color: '#000' }, children: `S/ ${fmtNum(saldo)}` } }
              ]
            }
          },

          { 
            type: 'div', 
            props: { 
              style: { 
                display: 'flex',
                marginTop: '25px', 
                justifyContent: 'center',
                fontSize: '15px', 
                color: '#70757a'
              }, 
              children: 'Gracias por su preferencia 🙌' 
            } 
          }
        ]
      }
    },
    { width: 700 }
  );
}

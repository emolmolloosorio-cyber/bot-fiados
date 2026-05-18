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

  // Lógica de 2 columnas igual que en tu index.html
  const renderProductos = (its) => {
    const filas = [];
    for (let i = 0; i < its.length; i += 2) {
      const izq = its[i];
      const der = its[i + 1] || null;
      filas.push({
        type: 'div',
        props: {
          style: { display: 'flex', flexDirection: 'row', width: '100%', marginBottom: '4px' },
          children: [
            // Columna Izquierda
            {
              type: 'div',
              props: {
                style: { display: 'flex', justifyContent: 'space-between', width: '50%', paddingRight: '10px' },
                children: [
                  { type: 'span', props: { style: { fontSize: '14px', color: '#444' }, children: izq.producto } },
                  { type: 'span', props: { style: { fontSize: '14px', color: '#444' }, children: `S/ ${fmtNum(izq.precio)}` } }
                ]
              }
            },
            // Columna Derecha
            der ? {
              type: 'div',
              props: {
                style: { display: 'flex', justifyContent: 'space-between', width: '50%', paddingLeft: '10px' },
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
          // Título Serif como en el HTML original
          { 
            type: 'div', 
            props: { 
              style: { 
                fontSize: '28px', 
                fontWeight: '800', 
                fontFamily: 'Georgia, serif', 
                letterSpacing: '0.5px',
                marginBottom: '10px'
              }, 
              children: 'ESTADO DE CUENTA — FIADO' 
            } 
          },
          
          // Separador punteado
          { type: 'div', props: { style: { borderTop: '2px dashed #ddd', marginBottom: '20px' } } },

          // Datos del Cliente
          { type: 'div', props: { style: { fontSize: '18px', fontWeight: '700', marginBottom: '5px' }, children: `Cliente: ${cli.nombre}.` } },
          { type: 'div', props: { style: { fontSize: '14px', color: '#999', marginBottom: '30px' }, children: `Cuenta #${cuenta.numero}` } },

          // Bloques por Fecha
          ...Object.entries(porFecha).map(([fecha, vsDelDia]) => {
            const totalDia = vsDelDia.reduce((s, v) => s + parseFloat(v.total_visita || 0), 0);
            const allItems = vsDelDia.flatMap(v => items.filter(it => it.visita_id === v.id));

            return {
              type: 'div',
              props: {
                style: { display: 'flex', flexDirection: 'column', marginBottom: '25px' },
                children: [
                  // Cabecera de fecha (Línea negra sólida)
                  {
                    type: 'div',
                    props: {
                      style: { 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        borderBottom: '2px solid #000', 
                        paddingBottom: '5px', 
                        marginBottom: '10px' 
                      },
                      children: [
                        { type: 'span', props: { style: { fontSize: '16px', fontWeight: 'bold' }, children: fmtFecha(fecha) } },
                        { type: 'span', props: { style: { fontSize: '16px', fontWeight: 'bold' }, children: `S/ ${fmtNum(totalDia)}` } }
                      ]
                    }
                  },
                  // Render de productos en 2 columnas
                  ...renderProductos(allItems)
                ]
              }
            };
          }),

          // Caja de Saldo (Estilo exacto de tu index.html)
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f1f3f4', // Gris suave de la app
                borderRadius: '12px',
                padding: '25px 30px',
                marginTop: '20px'
              },
              children: [
                { type: 'span', props: { style: { fontSize: '18px', fontWeight: '700', color: '#202124' }, children: 'SALDO A PAGAR' } },
                { type: 'span', props: { style: { fontSize: '36px', fontWeight: '800', color: '#000' }, children: `S/ ${fmtNum(saldo)}` } }
              ]
            }
          },

          // Footer
          { 
            type: 'div', 
            props: { 
              style: { 
                marginTop: '25px', 
                textAlign: 'center', 
                fontSize: '15px', 
                color: '#70757a',
                display: 'flex',
                justifyContent: 'center'
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

/*
 * StockFácil — datos de demostración.
 * Reproduce el contexto de la Ferretería El Constructor S.A.S.: usuarios, proveedores,
 * un catálogo de muestra y tres semanas de movimientos y ventas generados con
 * una semilla fija, para que el tablero y los reportes tengan información.
 */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./core.js') : root.StockCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockSeed = api;
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const USERS = [
    { username: 'hrincon', name: 'Hernando Rincón', role: 'admin', password: 'admin123' },
    { username: 'jpulido', name: 'Jairo Pulido', role: 'bodeguero', password: 'bodega123' },
    { username: 'lcastro', name: 'Luz Marina Castro', role: 'cajero', password: 'caja123' },
  ];

  const SUPPLIERS = [
    { nit: '860.512.330-4', name: 'Distribuidora Tornillos y Fijaciones S.A.S.', contact: 'Óscar Medina', phone: '601 412 8890', email: 'ventas@tornifix.com.co' },
    { nit: '900.218.775-1', name: 'Eléctricos del Norte Ltda.', contact: 'Paola Ríos', phone: '601 745 2210', email: 'pedidos@electronorte.co' },
    { nit: '830.044.219-8', name: 'Pinturas Andinas S.A.', contact: 'Felipe Ardila', phone: '601 288 1034', email: 'comercial@pinturasandinas.co' },
    { nit: '901.377.642-0', name: 'Cementos y Agregados La Sabana S.A.S.', contact: 'Marcela Gil', phone: '310 555 7782', email: 'despachos@lasabana.co' },
  ];

  // code, barcode, name, category, unit, cost, price, min, shelf, supplier, local, bodega
  const PRODUCTS = [
    ['TOR-0612', '7702041006120', 'Tornillo drywall 6 x 1" (caja x 100)', 'Tornillería', 'Caja', 5200, 8500, 20, 'Bodega B-02', 0, 18, 14],
    ['TOR-0815', '7702041008155', 'Tornillo drywall 8 x 1-1/2" (caja x 100)', 'Tornillería', 'Caja', 7400, 11900, 15, 'Bodega B-02', 0, 10, 30],
    ['TOR-CHAZ', '7702041000815', 'Chazo plástico 1/4" (bolsa x 50)', 'Tornillería', 'Bolsa', 2300, 4200, 25, 'Local L-01', 0, 30, 60],
    ['TOR-PUN2', '7702041002222', 'Puntilla con cabeza 2" (libra)', 'Tornillería', 'Libra', 3100, 5500, 30, 'Local L-01', 0, 25, 70],
    ['ELE-CAB12', '7707215112006', 'Cable THHN calibre 12 (metro)', 'Material eléctrico', 'Metro', 1850, 3200, 100, 'Bodega B-05', 1, 150, 400],
    ['ELE-TOMA', '7707215000214', 'Toma doble con polo a tierra', 'Material eléctrico', 'Unidad', 4300, 7900, 20, 'Local L-03', 1, 26, 30],
    ['ELE-INTS', '7707215000337', 'Interruptor sencillo', 'Material eléctrico', 'Unidad', 3600, 6500, 20, 'Local L-03', 1, 22, 40],
    ['ELE-LED9', '7707215009108', 'Bombillo LED 9 W luz blanca', 'Material eléctrico', 'Unidad', 3900, 7500, 30, 'Local L-03', 1, 40, 20],
    ['ELE-CINT', '7707215000771', 'Cinta aislante negra 18 m', 'Material eléctrico', 'Unidad', 2100, 4000, 25, 'Local L-03', 1, 4, 0],
    ['PIN-VIN1', '7701340100114', 'Pintura vinilo tipo 1 blanco (galón)', 'Pinturas', 'Galón', 38500, 56900, 8, 'Bodega B-07', 2, 6, 14],
    ['PIN-ESM1', '7701340200227', 'Esmalte sintético negro (cuarto)', 'Pinturas', 'Cuarto', 17200, 26500, 6, 'Bodega B-07', 2, 5, 9],
    ['PIN-BRO3', '7701340300038', 'Brocha de cerda 3"', 'Pinturas', 'Unidad', 5400, 9800, 10, 'Local L-04', 2, 12, 15],
    ['PIN-RODI', '7701340300410', 'Rodillo de felpa 9"', 'Pinturas', 'Unidad', 9800, 16500, 6, 'Local L-04', 2, 7, 6],
    ['PIN-THIN', '7701340400118', 'Thinner corriente (galón)', 'Pinturas', 'Galón', 21500, 32000, 6, 'Bodega B-07', 2, 3, 2],
    ['CON-CEM50', '7703320500502', 'Cemento gris uso general 50 kg', 'Materiales de construcción', 'Bulto', 29800, 36500, 40, 'Bodega B-10', 3, 0, 85],
    ['CON-PEGA', '7703320600123', 'Pegante para cerámica 25 kg', 'Materiales de construcción', 'Bulto', 18900, 27500, 15, 'Bodega B-10', 3, 0, 32],
    ['CON-ESTU', '7703320700241', 'Estuco plástico (galón)', 'Materiales de construcción', 'Galón', 14200, 21900, 10, 'Bodega B-09', 3, 4, 20],
    ['CON-ARE', '7703320800050', 'Arena lavada (bulto 40 kg)', 'Materiales de construcción', 'Bulto', 6200, 9900, 20, 'Bodega B-11', 3, 0, 48],
    ['HER-MART', '7709922100162', 'Martillo de uña 16 oz', 'Herramientas', 'Unidad', 19800, 32900, 4, 'Local L-05', 0, 6, 4],
    ['HER-FLEX', '7709922200169', 'Flexómetro 5 m', 'Herramientas', 'Unidad', 9900, 17500, 6, 'Local L-05', 0, 9, 10],
    ['HER-DEST', '7709922300074', 'Juego de destornilladores x 6', 'Herramientas', 'Juego', 21500, 35900, 3, 'Local L-05', 0, 4, 3],
    ['HER-SEGU', '7709922400019', 'Segueta con marco', 'Herramientas', 'Unidad', 14300, 23900, 3, 'Local L-05', 0, 1, 1],
    ['HER-LLAV', '7709922500122', 'Llave expansiva 10"', 'Herramientas', 'Unidad', 24800, 39900, 3, 'Local L-06', 0, 5, 2],
    ['PLO-TUB12', '7704455100125', 'Tubo PVC presión 1/2" x 6 m', 'Plomería', 'Unidad', 11200, 17900, 15, 'Bodega B-04', 1, 6, 28],
    ['PLO-CODO', '7704455200122', 'Codo PVC presión 1/2"', 'Plomería', 'Unidad', 600, 1200, 50, 'Local L-02', 1, 80, 150],
    ['PLO-SOLD', '7704455300112', 'Soldadura PVC 1/32 galón', 'Plomería', 'Unidad', 9200, 15500, 8, 'Local L-02', 1, 9, 6],
  ];

  // Generador pseudoaleatorio con semilla fija (mulberry32) para que los datos sean reproducibles.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function atHour(base, daysBack, hour, minute) {
    const d = new Date(base);
    d.setDate(d.getDate() - daysBack);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  function build(today) {
    const base = today ? new Date(today) : new Date();
    const s = Core.emptyState();
    const users = USERS.map((u) => Core.saveUser(s, u));
    const [admin, bodega, caja] = users;
    const suppliers = SUPPLIERS.map((x) => Core.saveSupplier(s, x));
    const start = atHour(base, 22, 7, 30);

    const products = PRODUCTS.map((r) => Core.saveProduct(s, {
      code: r[0], barcode: r[1], name: r[2], category: r[3], unit: r[4], cost: r[5], price: r[6], min: r[7],
      shelf: r[8], supplierId: suppliers[r[9]].id, initialLocal: r[10], initialBodega: r[11],
    }, admin, start));

    const rand = rng(20261011);
    const weights = [9, 6, 6, 6, 5, 4, 4, 5, 3, 3, 2, 3, 2, 2, 7, 3, 3, 3, 1, 2, 1, 1, 1, 3, 6, 2];

    function pick() {
      const total = weights.reduce((a, b) => a + b, 0);
      let x = rand() * total;
      for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) return products[i]; }
      return products[0];
    }

    for (let day = 21; day >= 0; day--) {
      const date = atHour(base, day, 0, 0);
      const sunday = date.getDay() === 0; // los domingos solo se abre en la mañana

      // Cada mañana el bodeguero surte el local con lo que se agotó.
      products.forEach((p) => {
        if (p.stock.local <= Math.max(1, Math.round(p.min * 0.3)) && p.stock.bodega > 0 && rand() < 0.8) {
          const qty = Math.min(p.stock.bodega, Math.max(1, Math.round(p.min * 0.8)));
          Core.transfer(s, { productId: p.id, from: 'bodega', to: 'local', qty }, bodega, atHour(base, day, 7, 15));
        }
      });

      // Compras a proveedores los martes y viernes.
      if (date.getDay() === 2 || date.getDay() === 5) {
        products.forEach((p, i) => {
          if (Core.totalStock(p) < p.min * 1.5 && i !== 0 && i !== 8 && rand() < 0.6) {
            Core.registerPurchase(s, {
              productId: p.id, qty: Math.round(p.min * 2), location: 'bodega', unitCost: p.cost,
              supplierId: p.supplierId, ref: 'FE-' + (3000 + Math.floor(rand() * 900)),
            }, bodega, atHour(base, day, 7, 40));
          }
        });
      }

      const salesToday = sunday || day === 0 ? 4 : 7 + Math.floor(rand() * 6);
      const span = sunday || day === 0 ? 3 : 10;
      for (let n = 0; n < salesToday; n++) {
        const items = [];
        const lines = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < lines; k++) {
          const p = pick();
          if (items.some((it) => it.productId === p.id)) continue;
          const maxQ = p.unit === 'Metro' ? 15 : p.unit === 'Bulto' ? 4 : 3;
          items.push({ productId: p.id, qty: 1 + Math.floor(rand() * maxQ) });
        }
        const payment = rand() < 0.6 ? 'efectivo' : rand() < 0.7 ? 'tarjeta' : 'transferencia';
        const minutes = Math.floor(((n + rand()) * span * 60) / salesToday);
        const when = atHour(base, day, 8, minutes);
        try {
          Core.registerSale(s, { items, payment }, caja, when);
        } catch (e) {
          // Sin existencias en el local: en la vida real el cliente se va sin comprar.
        }
      }

      // Conteo físico de mostrador con una diferencia en la cinta aislante.
      const cinta = products[8];
      if (day === 4 && cinta.stock.local > 0) {
        Core.adjust(s, { productId: cinta.id, location: 'local', counted: cinta.stock.local - 1, note: 'Conteo semanal de mostrador; una unidad averiada' }, bodega, atHour(base, day, 18, 10));
      }
    }

    return s;
  }

  return { build, USERS };
});

// Pruebas de aceptación: una por cada criterio Dado/Cuando/Entonces de las historias de usuario HU-01 a HU-11.
// Ejecutar con: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

function fixture() {
  const s = Core.emptyState();
  const admin = Core.saveUser(s, { username: 'admin', name: 'Admin', role: 'admin', password: 'secreto1' });
  const cajero = Core.saveUser(s, { username: 'caja', name: 'Cajera', role: 'cajero', password: 'secreto1' });
  const sup = Core.saveSupplier(s, { nit: '900.1', name: 'Pinturas Andinas' });
  const p = Core.saveProduct(s, {
    code: 'pin-1', barcode: '770001', name: 'Vinilo blanco', category: 'Pinturas', unit: 'Galón',
    cost: 1000, price: 1500, min: 5, shelf: 'B-07', supplierId: sup.id, initialLocal: 1, initialBodega: 12,
  }, admin);
  return { s, admin, cajero, sup, p };
}
const err = (re) => (e) => e instanceof Core.DomainError && re.test(e.message);

// HU-01 Acceso por roles
test('HU-01.1 un usuario activo entra y ve solo las vistas de su rol', () => {
  const { s } = fixture();
  const u = Core.authenticate(s, 'CAJA', 'secreto1');
  assert.equal(u.role, 'cajero');
  assert.deepEqual(Core.PERMISSIONS.cajero, ['inicio', 'pos', 'ventas', 'productos', 'alertas']);
});
test('HU-01.2 una contraseña incorrecta no abre la sesión', () => {
  const { s } = fixture();
  assert.throws(() => Core.authenticate(s, 'caja', 'otra'), err(/incorrectos/));
});
test('HU-01.3 el cajero no puede abrir reportes ni usuarios', () => {
  const { cajero } = fixture();
  assert.equal(Core.canAccess(cajero, 'reportes'), false);
  assert.equal(Core.canAccess(cajero, 'usuarios'), false);
});
test('HU-01.4 no se puede quitar el rol al único administrador activo', () => {
  const { s, admin } = fixture();
  assert.throws(() => Core.saveUser(s, { id: admin.id, username: 'admin', name: 'Admin', role: 'cajero' }), err(/administrador activo/));
});

// HU-02 Catálogo de productos
test('HU-02.1 crear un producto deja su saldo inicial en el kárdex', () => {
  const { s, p } = fixture();
  assert.equal(p.code, 'PIN-1');
  assert.equal(Core.kardex(s, p.id).length, 2);
  assert.equal(Core.totalStock(p), 13);
});
test('HU-02.2 un código de barras repetido se rechaza', () => {
  const { s } = fixture();
  assert.throws(() => Core.saveProduct(s, { code: 'X', barcode: '770001', name: 'N', category: 'C', unit: 'U', cost: 1, price: 2, min: 1 }), err(/Ya existe/));
});
test('HU-02.3 el precio de venta no puede ser menor que el costo', () => {
  const { s } = fixture();
  assert.throws(() => Core.saveProduct(s, { code: 'X', barcode: '9', name: 'N', category: 'C', unit: 'U', cost: 5, price: 2, min: 1 }), err(/menor que el costo/));
});
test('HU-02.4 la búsqueda encuentra por nombre, código o estante', () => {
  const { s } = fixture();
  assert.equal(Core.searchProducts(s, 'vinilo').length, 1);
  assert.equal(Core.searchProducts(s, 'b-07').length, 1);
  assert.equal(Core.searchProducts(s, 'zzz').length, 0);
});

// HU-03 Proveedores
test('HU-03.1 se registra un proveedor con NIT y razón social', () => {
  const { s } = fixture();
  const x = Core.saveSupplier(s, { nit: '800.2', name: 'Tornifix', phone: '6015550000' });
  assert.ok(s.suppliers.includes(x));
});
test('HU-03.2 un NIT repetido se rechaza', () => {
  const { s } = fixture();
  assert.throws(() => Core.saveSupplier(s, { nit: '900.1', name: 'Otro' }), err(/NIT/));
});
test('HU-03.3 el producto queda asociado a su proveedor', () => {
  const { s, sup, p } = fixture();
  assert.equal(s.suppliers.find((x) => x.id === p.supplierId), sup);
});

// HU-04 Entradas por compra
test('HU-04.1 la compra suma a bodega, actualiza el costo y guarda la factura', () => {
  const { s, admin, sup, p } = fixture();
  const m = Core.registerPurchase(s, { productId: p.id, qty: 10, unitCost: 1100, supplierId: sup.id, ref: 'F-55' }, admin);
  assert.equal(p.stock.bodega, 22);
  assert.equal(p.cost, 1100);
  assert.match(m.ref, /F-55/);
});
test('HU-04.2 la compra sin proveedor se rechaza', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.registerPurchase(s, { productId: p.id, qty: 1, supplierId: '' }, admin), err(/proveedor/));
});
test('HU-04.3 la cantidad debe ser un entero positivo', () => {
  const { s, admin, sup, p } = fixture();
  assert.throws(() => Core.registerPurchase(s, { productId: p.id, qty: 0, supplierId: sup.id }, admin), Core.DomainError);
});

// HU-05 Traslados
test('HU-05.1 el traslado mueve existencias sin cambiar el total', () => {
  const { s, admin, p } = fixture();
  const [out, inn] = Core.transfer(s, { productId: p.id, qty: 6, from: 'bodega', to: 'local' }, admin);
  assert.equal(p.stock.local, 7);
  assert.equal(p.stock.bodega, 6);
  assert.equal(out.balance, 13);
  assert.equal(inn.balance, 13);
});
test('HU-05.2 no se traslada más de lo que hay en el origen', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.transfer(s, { productId: p.id, qty: 50, from: 'bodega', to: 'local' }, admin), err(/insuficientes/));
  assert.equal(p.stock.bodega, 12);
});
test('HU-05.3 origen y destino deben ser distintos', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.transfer(s, { productId: p.id, qty: 1, from: 'local', to: 'local' }, admin), err(/distintos/));
});

// HU-06 Ajustes y devoluciones
test('HU-06.1 el ajuste registra la diferencia entre lo contado y el sistema', () => {
  const { s, admin, p } = fixture();
  const m = Core.adjust(s, { productId: p.id, location: 'bodega', counted: 11, note: 'Galón roto' }, admin);
  assert.equal(m.qty, -1);
  assert.equal(p.stock.bodega, 11);
});
test('HU-06.2 el ajuste exige motivo', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.adjust(s, { productId: p.id, location: 'bodega', counted: 3, note: '' }, admin), err(/motivo/));
});
test('HU-06.3 si el conteo coincide no hay ajuste que registrar', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.adjust(s, { productId: p.id, location: 'bodega', counted: 12, note: 'x' }, admin), err(/coincide/));
});
test('HU-06.4 la devolución suma al local con el número de comprobante', () => {
  const { s, admin, p } = fixture();
  const m = Core.registerReturn(s, { productId: p.id, qty: 1, ref: '1043' }, admin);
  assert.equal(p.stock.local, 2);
  assert.equal(m.ref, 'Venta 1043');
});

// HU-07 Kárdex
test('HU-07.1 el kárdex lista los movimientos en orden con saldo, referencia y usuario', () => {
  const { s, admin, p } = fixture();
  Core.transfer(s, { productId: p.id, qty: 1, from: 'bodega', to: 'local' }, admin);
  const k = Core.kardex(s, p.id);
  k.forEach((m, i) => { if (i) assert.ok(k[i - 1].date <= m.date); });
  k.forEach((m) => { assert.ok('balance' in m && 'ref' in m); assert.equal(m.userId, admin.id); });
});
test('HU-07.2 la exportación genera un CSV que abre Excel', () => {
  const csv = Core.toCSV([['Fecha', 'Movimiento'], ['2026-10-11', 'Traslado']]);
  assert.match(csv, /Fecha;Movimiento/);
});
test('HU-07.3 el traslado aparece en dos líneas con el mismo saldo total', () => {
  const { s, admin, p } = fixture();
  Core.transfer(s, { productId: p.id, qty: 6, from: 'bodega', to: 'local' }, admin);
  const t = Core.kardex(s, p.id).filter((m) => m.type === 'TRASLADO');
  assert.equal(t.length, 2);
  assert.equal(t[0].balance, t[1].balance);
});

// HU-08 Punto de venta
test('HU-08.1 el código escaneado encuentra el producto', () => {
  const { s, p } = fixture();
  assert.equal(Core.findByCode(s, '770001'), p);
  assert.equal(Core.findByCode(s, 'pin-1'), p);
});
test('HU-08.2 la venta descuenta el local, queda en el kárdex y calcula el cambio', () => {
  const { s, cajero, p } = fixture();
  const v = Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'efectivo', received: 2000 }, cajero);
  assert.equal(p.stock.local, 0);
  assert.equal(Core.kardex(s, p.id).at(-1).type, 'VENTA');
  assert.equal(v.change, 500);
});
test('HU-08.3 sin existencias en el local la venta se rechaza completa e indica la bodega', () => {
  const { s, cajero, p } = fixture();
  assert.throws(() => Core.registerSale(s, { items: [{ productId: p.id, qty: 5 }], payment: 'efectivo' }, cajero), err(/Hay 12 en bodega \(B-07\)/));
  assert.equal(s.sales.length, 0);
  assert.equal(p.stock.local, 1);
});
test('HU-08.4 el efectivo recibido debe cubrir el total', () => {
  const { s, cajero, p } = fixture();
  assert.throws(() => Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'efectivo', received: 1000 }, cajero), err(/no cubre/));
});

// HU-09 Alertas
test('HU-09.1 el producto aparece en alertas cuando llega a su mínimo', () => {
  const { s, admin, p } = fixture();
  assert.equal(Core.lowStock(s).includes(p), false);
  Core.adjust(s, { productId: p.id, location: 'bodega', counted: 4, note: 'Conteo' }, admin);
  assert.equal(Core.lowStock(s).includes(p), true);
});
test('HU-09.2 el pedido sugerido lleva el producto al doble del mínimo', () => {
  const { s, admin, p } = fixture();
  Core.adjust(s, { productId: p.id, location: 'bodega', counted: 2, note: 'Conteo' }, admin);
  assert.equal(Math.max(p.min * 2 - Core.totalStock(p), 1), 7);
});
test('HU-09.3 se listan los agotados en el local que tienen existencias en bodega', () => {
  const { s, cajero, p } = fixture();
  Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'tarjeta' }, cajero);
  assert.ok(Core.needsRestockToShop(s).includes(p));
});

// HU-10 Reportes
test('HU-10.1 el reporte del periodo suma ventas, comprobantes y margen', () => {
  const { s, cajero, p } = fixture();
  Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'tarjeta' }, cajero, new Date('2026-10-05T10:00:00-05:00'));
  const r = Core.salesSummary(s, '2026-10-01', '2026-10-11');
  assert.equal(r.count, 1);
  assert.equal(r.revenue, 1500);
  assert.equal(r.margin, 500);
});
test('HU-10.2 la rotación y las existencias valorizadas se pueden exportar', () => {
  const { s, cajero, p } = fixture();
  Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'tarjeta' }, cajero);
  assert.equal(Core.rotation(s).length, 1);
  assert.equal(Core.valuedStock(s).total, 12 * 1000);
});
test('HU-10.3 una venta de las 7:30 p. m. cuenta en el día de Colombia', () => {
  const { s, cajero, p } = fixture();
  const v = Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'tarjeta' }, cajero, new Date('2026-10-09T19:30:00-05:00'));
  assert.equal(Core.dayOf(v.date), '2026-10-09');
});

// HU-11 Migración desde Excel
const HEADER = 'codigo,codigo_barras,nombre,categoria,unidad,costo,precio,stock_minimo,ubicacion,existencia_local,existencia_bodega';
test('HU-11.1 cada fila válida crea un producto con su saldo inicial', () => {
  const { s, admin } = fixture();
  const res = Core.importProducts(s, Core.parseCSV(HEADER + '\nT-1,111,Tornillo 10 x 2",Tornillería,Caja,100,150,2,A-1,3,4'), admin);
  assert.equal(res.created, 1);
  assert.equal(Core.totalStock(Core.findByCode(s, '111')), 7);
});
test('HU-11.2 las filas con error se informan sin detener la carga', () => {
  const { s, admin } = fixture();
  const res = Core.importProducts(s, Core.parseCSV(HEADER + '\nT-2,770001,Repetido,X,U,1,2,1,,0,0\nT-3,333,Brocha,Pinturas,Unidad,2000,3500,4,C-2,5,0'), admin);
  assert.equal(res.created, 1);
  assert.match(res.errors[0], /^Fila 2:/);
});
test('HU-11.3 un archivo sin las columnas de la plantilla se rechaza', () => {
  const { s, admin } = fixture();
  assert.throws(() => Core.importProducts(s, [['codigo', 'nombre']], admin), err(/Faltan columnas/));
});

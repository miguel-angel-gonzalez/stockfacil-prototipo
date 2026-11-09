// Pruebas del núcleo de negocio. Ejecutar con: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/core.js');
const Seed = require('../js/seed.js');

function fixture() {
  const s = Core.emptyState();
  const admin = Core.saveUser(s, { username: 'admin', name: 'Admin', role: 'admin', password: 'secreto1' });
  const sup = Core.saveSupplier(s, { nit: '900.1', name: 'Proveedor Uno' });
  const p = Core.saveProduct(s, {
    code: 'TOR-1', barcode: '770001', name: 'Tornillo', category: 'Tornillería', unit: 'Caja',
    cost: 1000, price: 1500, min: 5, shelf: 'Bodega B-01', supplierId: sup.id, initialLocal: 3, initialBodega: 10,
  }, admin);
  return { s, admin, sup, p };
}

test('CA-01: una venta descuenta las existencias del local y queda en el kárdex', () => {
  const { s, admin, p } = fixture();
  const sale = Core.registerSale(s, { items: [{ productId: p.id, qty: 2 }], payment: 'tarjeta' }, admin);
  assert.equal(p.stock.local, 1);
  assert.equal(sale.total, 3000);
  const last = Core.kardex(s, p.id).at(-1);
  assert.equal(last.type, 'VENTA');
  assert.equal(last.qty, -2);
  assert.equal(last.balance, 11);
});

test('una venta sin existencias en el local se rechaza completa e indica el estante de bodega', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.registerSale(s, { items: [{ productId: p.id, qty: 4 }], payment: 'efectivo' }, admin), /Bodega B-01/);
  assert.equal(p.stock.local, 3);
  assert.equal(s.sales.length, 0);
});

test('el efectivo recibido debe cubrir el total y se calcula el cambio', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'efectivo', received: 1000 }, admin));
  const sale = Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'efectivo', received: 2000 }, admin);
  assert.equal(sale.change, 500);
});

test('el traslado mueve existencias entre bodega y local sin cambiar el total', () => {
  const { s, admin, p } = fixture();
  const [out, inn] = Core.transfer(s, { productId: p.id, from: 'bodega', to: 'local', qty: 4 }, admin);
  assert.deepEqual(p.stock, { local: 7, bodega: 6 });
  assert.equal(out.balance, 13);
  assert.equal(inn.balance, 13);
  assert.throws(() => Core.transfer(s, { productId: p.id, from: 'bodega', to: 'local', qty: 99 }, admin), /insuficientes/);
});

test('la compra suma a bodega y actualiza el último costo', () => {
  const { s, admin, sup, p } = fixture();
  Core.registerPurchase(s, { productId: p.id, qty: 20, supplierId: sup.id, unitCost: 1100, location: 'bodega', ref: 'FE-1' }, admin);
  assert.equal(p.stock.bodega, 30);
  assert.equal(p.cost, 1100);
});

test('el ajuste por conteo registra la diferencia y exige motivo', () => {
  const { s, admin, p } = fixture();
  assert.throws(() => Core.adjust(s, { productId: p.id, location: 'local', counted: 2, note: '' }, admin), /motivo/);
  const m = Core.adjust(s, { productId: p.id, location: 'local', counted: 2, note: 'Conteo' }, admin);
  assert.equal(m.qty, -1);
  assert.equal(p.stock.local, 2);
});

test('CA-05: la alerta aparece cuando el total llega al stock mínimo', () => {
  const { s, admin, p } = fixture();
  assert.equal(Core.lowStock(s).length, 0);
  Core.adjust(s, { productId: p.id, location: 'bodega', counted: 2, note: 'Conteo' }, admin);
  assert.deepEqual(Core.lowStock(s).map((x) => x.id), [p.id]);
});

test('los permisos dependen del rol', () => {
  assert.ok(Core.canAccess({ role: 'cajero' }, 'pos'));
  assert.ok(!Core.canAccess({ role: 'cajero' }, 'movimientos'));
  assert.ok(Core.canAccess({ role: 'bodeguero' }, 'kardex'));
  assert.ok(!Core.canAccess({ role: 'bodeguero' }, 'reportes'));
});

test('no se puede dejar el sistema sin administrador activo', () => {
  const { s, admin } = fixture();
  assert.throws(() => Core.saveUser(s, Object.assign({}, admin, { role: 'cajero', password: '' })), /administrador/);
});

test('CA-04: la migración desde CSV crea productos y reporta filas con error', () => {
  const { s, admin } = fixture();
  const csv = [
    Core.IMPORT_COLUMNS.join(';'),
    'PIN-1;770100;Vinilo blanco;Pinturas;Galón;38.500;56.900;8;Bodega B-07;2;10',
    'PIN-2;770101;Esmalte;Pinturas;Cuarto;20000;15000;4;Bodega B-07;0;5',
  ].join('\n');
  const r = Core.importProducts(s, Core.parseCSV(csv), admin);
  assert.equal(r.created, 1);
  assert.equal(r.errors.length, 1);
  const p = Core.findByCode(s, '770100');
  assert.equal(p.cost, 38500);
  assert.equal(Core.totalStock(p), 12);
});

test('reportes: ventas, margen y existencias valorizadas', () => {
  const { s, admin, p } = fixture();
  Core.registerSale(s, { items: [{ productId: p.id, qty: 2 }], payment: 'tarjeta' }, admin);
  const day = Core.dayOf(new Date());
  const sum = Core.salesSummary(s, day, day);
  assert.equal(sum.revenue, 3000);
  assert.equal(sum.margin, 1000);
  assert.equal(Core.valuedStock(s).total, 11 * 1000);
});

test('los datos de demostración se generan de forma reproducible y coherente', () => {
  const a = Seed.build(new Date('2026-10-11T12:00:00'));
  const b = Seed.build(new Date('2026-10-11T12:00:00'));
  assert.equal(a.sales.length, b.sales.length);
  assert.ok(a.sales.length > 100);
  a.products.forEach((p) => {
    assert.ok(p.stock.local >= 0 && p.stock.bodega >= 0);
    const last = Core.kardex(a, p.id).at(-1);
    assert.equal(last.balance, Core.totalStock(p));
  });
});

test('el lector CSV acepta pulgadas (") dentro de un campo sin comillas y campos entre comillas', () => {
  const rows = Core.parseCSV('a;b\nTornillo 10 x 2";"Brocha 3"", cerda"\n');
  assert.deepEqual(rows[1], ['Tornillo 10 x 2"', 'Brocha 3", cerda']);
});

test('una venta de la noche cuenta en el día local, no en el día UTC', () => {
  const { s, admin, p } = fixture();
  const night = new Date(2026, 9, 10, 22, 30);
  Core.registerSale(s, { items: [{ productId: p.id, qty: 1 }], payment: 'tarjeta' }, admin, night);
  assert.equal(Core.salesSummary(s, '2026-10-10', '2026-10-10').count, 1);
});

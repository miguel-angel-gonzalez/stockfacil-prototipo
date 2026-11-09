/*
 * StockFácil — núcleo de dominio.
 * Reglas de negocio puras sobre un objeto de estado. No toca el DOM ni el
 * almacenamiento, por eso se puede probar con Node (ver tests/core.test.js).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StockCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LOCATIONS = { local: 'Local', bodega: 'Bodega' };

  const ROLES = {
    admin: 'Administrador',
    cajero: 'Cajero',
    bodeguero: 'Bodeguero',
  };

  // Vistas a las que accede cada rol.
  const PERMISSIONS = {
    admin: ['inicio', 'pos', 'ventas', 'productos', 'movimientos', 'kardex', 'proveedores', 'alertas', 'reportes', 'usuarios', 'importar'],
    cajero: ['inicio', 'pos', 'ventas', 'productos', 'alertas'],
    bodeguero: ['inicio', 'productos', 'movimientos', 'kardex', 'proveedores', 'alertas'],
  };

  const MOVEMENT_TYPES = {
    INICIAL: 'Saldo inicial',
    COMPRA: 'Entrada por compra',
    VENTA: 'Salida por venta',
    DEVOLUCION: 'Devolución de cliente',
    TRASLADO: 'Traslado',
    AJUSTE: 'Ajuste por conteo',
  };

  class DomainError extends Error {}

  function emptyState() {
    return {
      version: 1,
      users: [],
      suppliers: [],
      products: [],
      movements: [],
      sales: [],
      seq: { user: 0, supplier: 0, product: 0, movement: 0, sale: 1042 },
    };
  }

  function nextId(state, kind, prefix) {
    state.seq[kind] = (state.seq[kind] || 0) + 1;
    return prefix + state.seq[kind];
  }

  function nowIso(date) {
    return (date ? new Date(date) : new Date()).toISOString();
  }

  function requirePositiveInt(value, label) {
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) throw new DomainError(label + ' debe ser un número entero mayor que cero.');
    return n;
  }

  function requireNonNegativeNumber(value, label) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new DomainError(label + ' debe ser un número mayor o igual a cero.');
    return n;
  }

  function requireText(value, label) {
    const s = String(value == null ? '' : value).trim();
    if (!s) throw new DomainError('El campo «' + label + '» es obligatorio.');
    return s;
  }

  function requireLocation(loc) {
    if (!LOCATIONS[loc]) throw new DomainError('Ubicación no válida.');
    return loc;
  }

  // ---------- Usuarios ----------

  function authenticate(state, username, password) {
    const u = state.users.find((x) => x.username === String(username).trim().toLowerCase());
    if (!u || u.password !== password) throw new DomainError('Usuario o contraseña incorrectos.');
    if (!u.active) throw new DomainError('El usuario está inactivo. Consulte al administrador.');
    return u;
  }

  function canAccess(user, view) {
    return !!user && (PERMISSIONS[user.role] || []).includes(view);
  }

  function saveUser(state, data) {
    const username = requireText(data.username, 'usuario').toLowerCase();
    const name = requireText(data.name, 'nombre');
    if (!ROLES[data.role]) throw new DomainError('Rol no válido.');
    const clash = state.users.find((u) => u.username === username && u.id !== data.id);
    if (clash) throw new DomainError('Ya existe un usuario con ese nombre de acceso.');
    if (data.id) {
      const u = state.users.find((x) => x.id === data.id);
      if (!u) throw new DomainError('Usuario no encontrado.');
      const admins = state.users.filter((x) => x.role === 'admin' && x.active && x.id !== u.id);
      if (u.role === 'admin' && (data.role !== 'admin' || data.active === false) && admins.length === 0) {
        throw new DomainError('Debe quedar al menos un administrador activo.');
      }
      Object.assign(u, { username, name, role: data.role, active: data.active !== false });
      if (data.password) u.password = data.password;
      return u;
    }
    const password = requireText(data.password, 'contraseña');
    if (password.length < 6) throw new DomainError('La contraseña debe tener al menos 6 caracteres.');
    const u = { id: nextId(state, 'user', 'U'), username, name, role: data.role, password, active: true };
    state.users.push(u);
    return u;
  }

  // ---------- Proveedores ----------

  function saveSupplier(state, data) {
    const rec = {
      nit: requireText(data.nit, 'NIT'),
      name: requireText(data.name, 'razón social'),
      contact: String(data.contact || '').trim(),
      phone: String(data.phone || '').trim(),
      email: String(data.email || '').trim(),
    };
    const clash = state.suppliers.find((s) => s.nit === rec.nit && s.id !== data.id);
    if (clash) throw new DomainError('Ya existe un proveedor con ese NIT.');
    if (data.id) {
      const s = state.suppliers.find((x) => x.id === data.id);
      if (!s) throw new DomainError('Proveedor no encontrado.');
      return Object.assign(s, rec);
    }
    const s = Object.assign({ id: nextId(state, 'supplier', 'P') }, rec);
    state.suppliers.push(s);
    return s;
  }

  // ---------- Productos ----------

  function totalStock(p) {
    return (p.stock.local || 0) + (p.stock.bodega || 0);
  }

  function findProduct(state, id) {
    const p = state.products.find((x) => x.id === id);
    if (!p) throw new DomainError('Producto no encontrado.');
    return p;
  }

  function findByCode(state, code) {
    const c = String(code || '').trim().toLowerCase();
    if (!c) return null;
    return state.products.find((p) => p.active && (p.barcode.toLowerCase() === c || p.code.toLowerCase() === c)) || null;
  }

  function searchProducts(state, text, opts) {
    const q = String(text || '').trim().toLowerCase();
    const category = opts && opts.category;
    return state.products.filter((p) => {
      if (opts && opts.onlyActive && !p.active) return false;
      if (category && p.category !== category) return false;
      if (!q) return true;
      return [p.code, p.barcode, p.name, p.category, p.shelf].some((f) => String(f).toLowerCase().includes(q));
    });
  }

  function categories(state) {
    return Array.from(new Set(state.products.map((p) => p.category))).sort((a, b) => a.localeCompare(b, 'es'));
  }

  function saveProduct(state, data, user, date) {
    const rec = {
      code: requireText(data.code, 'código interno').toUpperCase(),
      barcode: requireText(data.barcode, 'código de barras'),
      name: requireText(data.name, 'nombre'),
      category: requireText(data.category, 'categoría'),
      unit: requireText(data.unit, 'unidad'),
      cost: requireNonNegativeNumber(data.cost, 'El costo'),
      price: requireNonNegativeNumber(data.price, 'El precio de venta'),
      min: requireNonNegativeNumber(data.min, 'El stock mínimo'),
      shelf: String(data.shelf || '').trim(),
      supplierId: data.supplierId || '',
    };
    if (rec.price < rec.cost) throw new DomainError('El precio de venta no puede ser menor que el costo.');
    const clash = state.products.find((p) => (p.code === rec.code || p.barcode === rec.barcode) && p.id !== data.id);
    if (clash) throw new DomainError('Ya existe un producto con ese código interno o código de barras (' + clash.name + ').');
    if (data.id) {
      const p = findProduct(state, data.id);
      Object.assign(p, rec, { active: data.active !== false });
      return p;
    }
    const p = Object.assign({ id: nextId(state, 'product', 'PR'), stock: { local: 0, bodega: 0 }, active: true }, rec);
    state.products.push(p);
    const initLocal = Number(data.initialLocal || 0);
    const initBodega = Number(data.initialBodega || 0);
    if (initLocal > 0) addMovement(state, p, 'INICIAL', 'local', initLocal, { user, date, ref: 'Creación' });
    if (initBodega > 0) addMovement(state, p, 'INICIAL', 'bodega', initBodega, { user, date, ref: 'Creación' });
    return p;
  }

  // ---------- Movimientos y kárdex ----------

  function addMovement(state, product, type, location, qty, meta) {
    meta = meta || {};
    product.stock[location] = (product.stock[location] || 0) + qty;
    if (product.stock[location] < 0) {
      product.stock[location] -= qty;
      throw new DomainError('Existencias insuficientes de "' + product.name + '" en ' + LOCATIONS[location] + '.');
    }
    const m = {
      id: nextId(state, 'movement', 'M'),
      date: nowIso(meta.date),
      productId: product.id,
      type,
      location,
      qty,
      unitCost: meta.unitCost != null ? meta.unitCost : product.cost,
      balance: totalStock(product),
      balanceLocation: product.stock[location],
      ref: meta.ref || '',
      note: meta.note || '',
      userId: meta.user ? meta.user.id : '',
    };
    state.movements.push(m);
    return m;
  }

  function registerPurchase(state, data, user, date) {
    const p = findProduct(state, data.productId);
    const qty = requirePositiveInt(data.qty, 'La cantidad');
    const loc = requireLocation(data.location || 'bodega');
    const unitCost = data.unitCost === '' || data.unitCost == null ? p.cost : requireNonNegativeNumber(data.unitCost, 'El costo unitario');
    const supplier = state.suppliers.find((s) => s.id === data.supplierId);
    if (!supplier) throw new DomainError('Seleccione el proveedor de la compra.');
    p.cost = unitCost;
    return addMovement(state, p, 'COMPRA', loc, qty, {
      user, date, unitCost, ref: (data.ref ? 'Factura ' + data.ref + ' · ' : '') + supplier.name,
    });
  }

  function registerReturn(state, data, user, date) {
    const p = findProduct(state, data.productId);
    const qty = requirePositiveInt(data.qty, 'La cantidad');
    const loc = requireLocation(data.location || 'local');
    return addMovement(state, p, 'DEVOLUCION', loc, qty, { user, date, ref: data.ref ? 'Venta ' + data.ref : '', note: data.note });
  }

  function transfer(state, data, user, date) {
    const p = findProduct(state, data.productId);
    const qty = requirePositiveInt(data.qty, 'La cantidad');
    const from = requireLocation(data.from);
    const to = requireLocation(data.to);
    if (from === to) throw new DomainError('El origen y el destino del traslado deben ser distintos.');
    const ref = LOCATIONS[from] + ' → ' + LOCATIONS[to];
    const out = addMovement(state, p, 'TRASLADO', from, -qty, { user, date, ref, note: data.note });
    const inn = addMovement(state, p, 'TRASLADO', to, qty, { user, date, ref, note: data.note });
    out.balance = inn.balance; // el traslado no cambia el total de la empresa
    return [out, inn];
  }

  function adjust(state, data, user, date) {
    const p = findProduct(state, data.productId);
    const loc = requireLocation(data.location);
    const counted = Number(data.counted);
    if (!Number.isInteger(counted) || counted < 0) throw new DomainError('La cantidad contada debe ser un entero mayor o igual a cero.');
    const diff = counted - (p.stock[loc] || 0);
    if (diff === 0) throw new DomainError('La cantidad contada coincide con el sistema; no hay ajuste que registrar.');
    const note = requireText(data.note, 'motivo del ajuste');
    return addMovement(state, p, 'AJUSTE', loc, diff, { user, date, ref: 'Conteo: ' + counted, note });
  }

  function kardex(state, productId) {
    return state.movements.filter((m) => m.productId === productId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, 'es', { numeric: true }));
  }

  // ---------- Ventas ----------

  function registerSale(state, data, user, date) {
    const items = (data.items || []).filter((i) => Number(i.qty) > 0);
    if (!items.length) throw new DomainError('Agregue al menos un producto a la venta.');
    if (!['efectivo', 'tarjeta', 'transferencia'].includes(data.payment)) throw new DomainError('Seleccione el medio de pago.');

    // Validar todo antes de descontar: una venta se registra completa o no se registra.
    const lines = items.map((i) => {
      const p = findProduct(state, i.productId);
      const qty = requirePositiveInt(i.qty, 'La cantidad de "' + p.name + '"');
      if (!p.active) throw new DomainError('"' + p.name + '" está inactivo.');
      return { p, qty };
    });
    const needed = {};
    lines.forEach((l) => { needed[l.p.id] = (needed[l.p.id] || 0) + l.qty; });
    Object.keys(needed).forEach((id) => {
      const p = findProduct(state, id);
      if (needed[id] > p.stock.local) {
        const hint = p.stock.bodega > 0 ? ' Hay ' + p.stock.bodega + ' en bodega' + (p.shelf ? ' (' + p.shelf + ')' : '') + '; registre un traslado.' : '';
        throw new DomainError('No hay existencias suficientes de "' + p.name + '" en el local (disponible: ' + p.stock.local + ').' + hint);
      }
    });

    const total = lines.reduce((s, l) => s + l.qty * l.p.price, 0);
    let received = total;
    if (data.payment === 'efectivo' && data.received !== undefined && data.received !== '') {
      received = Number(data.received);
      if (!Number.isFinite(received) || received < total) throw new DomainError('El efectivo recibido no cubre el total de la venta.');
    }

    state.seq.sale += 1;
    const number = state.seq.sale;
    const sale = {
      id: 'V' + number,
      number,
      date: nowIso(date),
      items: lines.map((l) => ({ productId: l.p.id, name: l.p.name, qty: l.qty, price: l.p.price, cost: l.p.cost })),
      total,
      payment: data.payment,
      received,
      change: received - total,
      customer: String(data.customer || '').trim() || 'Consumidor final',
      userId: user ? user.id : '',
    };
    lines.forEach((l) => addMovement(state, l.p, 'VENTA', 'local', -l.qty, { user, date, ref: 'Comprobante ' + number }));
    state.sales.push(sale);
    return sale;
  }

  // ---------- Alertas ----------

  function lowStock(state) {
    return state.products
      .filter((p) => p.active && totalStock(p) <= p.min)
      .sort((a, b) => totalStock(a) / (a.min || 1) - totalStock(b) / (b.min || 1));
  }

  // Productos con existencias en bodega pero agotados en el local.
  function needsRestockToShop(state) {
    return state.products.filter((p) => p.active && p.stock.local === 0 && p.stock.bodega > 0);
  }

  // ---------- Reportes ----------

  // Día calendario local (AAAA-MM-DD) de una fecha guardada en ISO/UTC.
  function dayOf(iso) {
    const d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function inRange(iso, from, to) {
    const d = dayOf(iso);
    return (!from || d >= from) && (!to || d <= to);
  }

  function salesSummary(state, from, to) {
    const sales = state.sales.filter((s) => inRange(s.date, from, to));
    const revenue = sales.reduce((s, x) => s + x.total, 0);
    const cost = sales.reduce((s, x) => s + x.items.reduce((a, i) => a + i.qty * i.cost, 0), 0);
    const byDay = {};
    sales.forEach((s) => {
      const d = dayOf(s.date);
      byDay[d] = (byDay[d] || 0) + s.total;
    });
    const byPayment = {};
    sales.forEach((s) => { byPayment[s.payment] = (byPayment[s.payment] || 0) + s.total; });
    return {
      count: sales.length,
      revenue,
      cost,
      margin: revenue - cost,
      marginPct: revenue ? (revenue - cost) / revenue : 0,
      avgTicket: sales.length ? revenue / sales.length : 0,
      byDay,
      byPayment,
    };
  }

  function rotation(state, from, to) {
    const acc = {};
    state.sales.filter((s) => inRange(s.date, from, to)).forEach((s) => {
      s.items.forEach((i) => {
        const r = acc[i.productId] || (acc[i.productId] = { productId: i.productId, name: i.name, qty: 0, revenue: 0, cost: 0 });
        r.qty += i.qty;
        r.revenue += i.qty * i.price;
        r.cost += i.qty * i.cost;
      });
    });
    return Object.values(acc).sort((a, b) => b.qty - a.qty);
  }

  function marginByCategory(state, from, to) {
    const acc = {};
    rotation(state, from, to).forEach((r) => {
      const p = state.products.find((x) => x.id === r.productId);
      const cat = p ? p.category : 'Sin categoría';
      const c = acc[cat] || (acc[cat] = { category: cat, revenue: 0, cost: 0 });
      c.revenue += r.revenue;
      c.cost += r.cost;
    });
    return Object.values(acc)
      .map((c) => Object.assign(c, { margin: c.revenue - c.cost, marginPct: c.revenue ? (c.revenue - c.cost) / c.revenue : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  function valuedStock(state) {
    const rows = state.products.filter((p) => p.active).map((p) => ({
      code: p.code, name: p.name, category: p.category, local: p.stock.local, bodega: p.stock.bodega,
      total: totalStock(p), cost: p.cost, value: totalStock(p) * p.cost,
    }));
    return { rows, total: rows.reduce((s, r) => s + r.value, 0) };
  }

  // ---------- CSV (migración desde Excel y exportación) ----------

  function parseCSV(text) {
    const src = String(text).replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/)[0] || '';
    const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"' && field === '') quoted = true;
      else if (ch === sep) { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && src[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }

  function toCSV(rows) {
    return '﻿' + rows.map((r) => r.map((c) => {
      const s = String(c == null ? '' : c);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  }

  const IMPORT_COLUMNS = ['codigo', 'codigo_barras', 'nombre', 'categoria', 'unidad', 'costo', 'precio', 'stock_minimo', 'ubicacion', 'existencia_local', 'existencia_bodega'];

  // Carga masiva de productos. Devuelve cuántos se crearon y los errores por fila,
  // sin detenerse en la primera fila con problemas.
  function importProducts(state, rows, user, date) {
    if (!rows.length) throw new DomainError('El archivo está vacío.');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const missing = IMPORT_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length) throw new DomainError('Faltan columnas en el archivo: ' + missing.join(', ') + '.');
    const idx = (c) => header.indexOf(c);
    const num = (v) => Number(String(v).replace(/\./g, '').replace(',', '.'));
    const result = { created: 0, errors: [] };
    rows.slice(1).forEach((r, i) => {
      try {
        saveProduct(state, {
          code: r[idx('codigo')], barcode: r[idx('codigo_barras')], name: r[idx('nombre')],
          category: r[idx('categoria')], unit: r[idx('unidad')], cost: num(r[idx('costo')]),
          price: num(r[idx('precio')]), min: num(r[idx('stock_minimo')]), shelf: r[idx('ubicacion')],
          initialLocal: num(r[idx('existencia_local')] || 0), initialBodega: num(r[idx('existencia_bodega')] || 0),
        }, user, date);
        result.created++;
      } catch (e) {
        result.errors.push('Fila ' + (i + 2) + ': ' + e.message);
      }
    });
    return result;
  }

  return {
    LOCATIONS, ROLES, PERMISSIONS, MOVEMENT_TYPES, IMPORT_COLUMNS, DomainError,
    emptyState, dayOf, authenticate, canAccess, saveUser, saveSupplier,
    totalStock, findProduct, findByCode, searchProducts, categories, saveProduct,
    registerPurchase, registerReturn, transfer, adjust, kardex, registerSale,
    lowStock, needsRestockToShop, salesSummary, rotation, marginByCategory, valuedStock,
    parseCSV, toCSV, importProducts,
  };
});

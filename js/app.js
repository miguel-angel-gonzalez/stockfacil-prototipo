/*
 * StockFácil — interfaz del prototipo.
 * Enrutador por hash (#/vista), vistas por rol y formularios que llaman a core.js.
 */
(function () {
  'use strict';
  const Core = window.StockCore;
  const Store = window.StockStore;

  let state = Store.load();
  let user = null;
  let cart = [];

  const VIEWS = {
    inicio: { title: 'Inicio', render: viewHome },
    pos: { title: 'Punto de venta', render: viewPos },
    ventas: { title: 'Ventas', render: viewSales },
    productos: { title: 'Productos', render: viewProducts },
    movimientos: { title: 'Movimientos de inventario', render: viewMovements },
    kardex: { title: 'Kárdex', render: viewKardex },
    proveedores: { title: 'Proveedores', render: viewSuppliers },
    alertas: { title: 'Alertas de stock', render: viewAlerts },
    reportes: { title: 'Reportes', render: viewReports },
    usuarios: { title: 'Usuarios', render: viewUsers },
    importar: { title: 'Migración desde Excel', render: viewImport },
  };

  // ---------- utilidades ----------
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  const money = (n) => cop.format(Math.round(n || 0));
  const int = (n) => new Intl.NumberFormat('es-CO').format(n || 0);
  const pct = (n) => (n * 100).toFixed(1).replace('.', ',') + ' %';
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtDateTime = (iso) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const localDay = (d) => Core.dayOf(d || new Date());
  const userName = (id) => (state.users.find((u) => u.id === id) || {}).name || '';
  const supplierName = (id) => (state.suppliers.find((s) => s.id === id) || {}).name || '';
  const productName = (id) => (state.products.find((p) => p.id === id) || {}).name || '';
  const PAYMENTS = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };

  function persist() { Store.save(state); refreshChrome(); }

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (kind || 'ok');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  // Ejecuta una operación de dominio, guarda y muestra el resultado o el error de negocio.
  function attempt(fn, okMsg) {
    try {
      const r = fn();
      persist();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      return r;
    } catch (e) {
      if (!(e instanceof Core.DomainError)) console.error(e);
      toast(e.message, 'error');
      return undefined;
    }
  }

  function formData(form) {
    const d = {};
    new FormData(form).forEach((v, k) => { d[k] = typeof v === 'string' ? v.trim() : v; });
    return d;
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function openModal(html, onReady) {
    $('#modal-body').innerHTML = html;
    const dlg = $('#modal');
    if (!dlg.open) dlg.showModal();
    $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', closeModal));
    if (onReady) onReady(dlg);
  }
  function closeModal() { const d = $('#modal'); if (d.open) d.close(); }

  function productOptions(selected, filter) {
    return state.products.filter((p) => p.active && (!filter || filter(p)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('');
  }

  function stockBadge(p) {
    const t = Core.totalStock(p);
    if (!p.active) return '<span class="badge muted">Inactivo</span>';
    if (t === 0) return '<span class="badge danger">Agotado</span>';
    if (t <= p.min) return '<span class="badge warn">Bajo mínimo</span>';
    return '<span class="badge ok">Normal</span>';
  }

  function routeParams() {
    const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
    return { view: path || 'inicio', params: new URLSearchParams(query || '') };
  }

  // ---------- sesión y navegación ----------
  function showLogin() {
    user = null;
    Store.setSession(null);
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#login-form').reset();
    $('#login-error').textContent = '';
    setTimeout(() => $('#login-form [name=username]').focus(), 0);
  }

  function startSession(u) {
    user = u;
    Store.setSession(u.id);
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#who-name').textContent = u.name;
    $('#who-role').textContent = Core.ROLES[u.role];
    if (!location.hash || !Core.canAccess(user, routeParams().view)) location.hash = user.role === 'cajero' ? '#/pos' : '#/inicio';
    render();
  }

  function refreshChrome() {
    if (!user) return;
    const low = Core.lowStock(state).length;
    const pill = $('#alert-pill');
    pill.hidden = low === 0 || !Core.canAccess(user, 'alertas');
    pill.textContent = low + (low === 1 ? ' producto bajo mínimo' : ' productos bajo mínimo');
    const { view } = routeParams();
    $('#nav').innerHTML = Object.keys(VIEWS).filter((v) => Core.canAccess(user, v)).map((v) =>
      `<a href="#/${v}" class="${v === view ? 'active' : ''}">${esc(VIEWS[v].title)}${v === 'alertas' && low ? `<span class="count">${low}</span>` : ''}</a>`).join('');
    const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#today').textContent = today.charAt(0).toUpperCase() + today.slice(1);
  }

  function render() {
    if (!user) return;
    const { view, params } = routeParams();
    if (!VIEWS[view] || !Core.canAccess(user, view)) {
      location.hash = '#/inicio';
      return;
    }
    refreshChrome();
    $('#view-title').textContent = VIEWS[view].title;
    document.title = VIEWS[view].title + ' · StockFácil';
    // Se reemplaza el contenedor para que los eventos de la vista anterior no se acumulen.
    const old = $('#view');
    const fresh = old.cloneNode(false);
    old.replaceWith(fresh);
    VIEWS[view].render(fresh, params);
  }

  // ---------- Inicio ----------
  function viewHome(el) {
    const today = localDay();
    const monthStart = today.slice(0, 8) + '01';
    const day = Core.salesSummary(state, today, today);
    const month = Core.salesSummary(state, monthStart, today);
    const stock = Core.valuedStock(state);
    const low = Core.lowStock(state);
    const shop = Core.needsRestockToShop(state);
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(localDay(d)); }
    const series = Core.salesSummary(state, days[0], today).byDay;
    const max = Math.max(1, ...days.map((d) => series[d] || 0));
    const recent = state.movements.slice(-8).reverse();

    el.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Ventas de hoy</span><strong>${money(day.revenue)}</strong><small>${day.count} comprobantes</small></div>
        <div class="kpi"><span>Ventas del mes</span><strong>${money(month.revenue)}</strong><small>Margen ${pct(month.marginPct)}</small></div>
        <div class="kpi"><span>Inventario valorizado</span><strong>${money(stock.total)}</strong><small>${stock.rows.length} referencias activas</small></div>
        <div class="kpi ${low.length ? 'kpi-warn' : ''}"><span>Bajo stock mínimo</span><strong>${low.length}</strong><small>${shop.length} agotados en local con existencias en bodega</small></div>
      </div>
      <div class="grid-2">
        <section class="card">
          <h2>Ventas de los últimos 14 días</h2>
          <div class="bars">${days.map((d) => {
            const v = series[d] || 0;
            return `<div class="bar" title="${d}: ${money(v)}"><i style="height:${Math.round((v / max) * 100)}%"></i><span>${d.slice(8)}</span></div>`;
          }).join('')}</div>
        </section>
        <section class="card">
          <h2>Requieren atención</h2>
          ${low.length || shop.length ? `<ul class="plain">
            ${low.slice(0, 5).map((p) => `<li><span class="badge ${Core.totalStock(p) ? 'warn' : 'danger'}">${Core.totalStock(p)} / mín. ${p.min}</span> ${esc(p.name)}</li>`).join('')}
            ${shop.slice(0, 4).map((p) => `<li><span class="badge info">Bodega ${p.stock.bodega}</span> ${esc(p.name)} <small>agotado en el local · ${esc(p.shelf)}</small></li>`).join('')}
          </ul>` : '<p class="empty">Todo el inventario está por encima del mínimo.</p>'}
          ${Core.canAccess(user, 'alertas') ? '<a class="link" href="#/alertas">Ver todas las alertas</a>' : ''}
        </section>
      </div>
      <section class="card">
        <h2>Últimos movimientos</h2>
        <table class="table">
          <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Ubicación</th><th class="num">Cantidad</th><th>Referencia</th></tr></thead>
          <tbody>${recent.map((m) => `<tr><td>${fmtDateTime(m.date)}</td><td>${esc(productName(m.productId))}</td><td>${Core.MOVEMENT_TYPES[m.type]}</td><td>${Core.LOCATIONS[m.location]}</td><td class="num ${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td>${esc(m.ref)}</td></tr>`).join('')}</tbody>
        </table>
      </section>`;
  }

  // ---------- Punto de venta ----------
  function viewPos(el) {
    el.innerHTML = `
      <div class="pos-layout">
        <section class="card">
          <form id="scan" class="scan" autocomplete="off">
            <input name="q" id="scan-input" placeholder="Escanee el código de barras o escriba el nombre del producto" aria-label="Buscar producto">
            <button class="btn primary" type="submit">Agregar</button>
          </form>
          <div id="suggest" class="suggest"></div>
          <table class="table cart">
            <thead><tr><th>Producto</th><th class="num">Disp. local</th><th class="num">Precio</th><th class="num">Cant.</th><th class="num">Subtotal</th><th></th></tr></thead>
            <tbody id="cart-body"></tbody>
          </table>
        </section>
        <section class="card checkout">
          <h2>Cobro</h2>
          <div class="total-box"><span>Total</span><strong id="cart-total">$ 0</strong><small id="cart-items">0 artículos</small></div>
          <form id="pay">
            <label>Cliente<input name="customer" placeholder="Consumidor final"></label>
            <label>Medio de pago<select name="payment">${Object.entries(PAYMENTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
            <label id="received-wrap">Efectivo recibido<input name="received" type="number" min="0" step="50" inputmode="numeric"></label>
            <p class="change" id="change"></p>
            <button class="btn primary block lg" type="submit">Registrar venta</button>
            <button class="btn ghost block" type="button" id="clear-cart">Vaciar</button>
          </form>
        </section>
      </div>`;

    const input = $('#scan-input');
    const suggest = $('#suggest');

    function addToCart(p) {
      const line = cart.find((l) => l.productId === p.id);
      if (line) line.qty += 1; else cart.push({ productId: p.id, qty: 1 });
      input.value = '';
      suggest.innerHTML = '';
      drawCart();
      input.focus();
    }

    function drawCart() {
      const body = $('#cart-body');
      if (!cart.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty">Escanee un producto para comenzar la venta.</td></tr>';
      } else {
        body.innerHTML = cart.map((l, i) => {
          const p = Core.findProduct(state, l.productId);
          const short = l.qty > p.stock.local;
          return `<tr class="${short ? 'row-warn' : ''}">
            <td><strong>${esc(p.name)}</strong><br><small>${esc(p.barcode)}${short && p.stock.bodega ? ` · hay ${p.stock.bodega} en ${esc(p.shelf)}` : ''}</small></td>
            <td class="num">${p.stock.local}</td><td class="num">${money(p.price)}</td>
            <td class="num"><input class="qty" type="number" min="1" value="${l.qty}" data-i="${i}" aria-label="Cantidad"></td>
            <td class="num">${money(p.price * l.qty)}</td>
            <td><button class="icon-btn" data-del="${i}" title="Quitar" aria-label="Quitar">×</button></td></tr>`;
        }).join('');
      }
      const total = cart.reduce((s, l) => s + Core.findProduct(state, l.productId).price * l.qty, 0);
      const units = cart.reduce((s, l) => s + l.qty, 0);
      $('#cart-total').textContent = money(total);
      $('#cart-items').textContent = units + (units === 1 ? ' artículo' : ' artículos');
      const rec = Number($('#pay [name=received]').value || 0);
      const isCash = $('#pay [name=payment]').value === 'efectivo';
      $('#received-wrap').hidden = !isCash;
      $('#change').textContent = isCash && rec ? (rec >= total ? 'Cambio: ' + money(rec - total) : 'Falta: ' + money(total - rec)) : '';
    }

    $('#scan').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      const exact = Core.findByCode(state, q);
      if (exact) return addToCart(exact);
      const found = Core.searchProducts(state, q, { onlyActive: true });
      if (found.length === 1) return addToCart(found[0]);
      if (!found.length) toast('No se encontró ningún producto con "' + q + '".', 'error');
    });
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (q.length < 2 || /^\d{6,}$/.test(q)) { suggest.innerHTML = ''; return; }
      const found = Core.searchProducts(state, q, { onlyActive: true }).slice(0, 6);
      suggest.innerHTML = found.map((p) => `<button type="button" data-p="${p.id}"><span>${esc(p.name)}</span><small>Local ${p.stock.local} · Bodega ${p.stock.bodega} · ${money(p.price)}</small></button>`).join('');
    });
    suggest.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-p]');
      if (b) addToCart(Core.findProduct(state, b.dataset.p));
    });
    $('#cart-body').addEventListener('change', (ev) => {
      if (ev.target.matches('.qty')) {
        cart[ev.target.dataset.i].qty = Math.max(1, parseInt(ev.target.value, 10) || 1);
        drawCart();
      }
    });
    $('#cart-body').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-del]');
      if (b) { cart.splice(Number(b.dataset.del), 1); drawCart(); }
    });
    $('#pay').addEventListener('input', drawCart);
    $('#clear-cart').addEventListener('click', () => { cart = []; drawCart(); input.focus(); });
    $('#pay').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = formData(ev.target);
      const sale = attempt(() => Core.registerSale(state, { items: cart, payment: d.payment, received: d.payment === 'efectivo' ? d.received : '', customer: d.customer }, user),
        (s) => 'Venta registrada. Comprobante N.º ' + s.number + '.');
      if (sale) {
        cart = [];
        ev.target.reset();
        drawCart();
        showReceipt(sale);
      }
    });
    drawCart();
    input.focus();
  }

  function receiptHtml(sale) {
    return `<div class="receipt">
      <h3>Ferretería El Constructor S.A.S.</h3>
      <p>NIT 900.456.781-3<br>Cra. 70 # 74-21, Las Ferias, Bogotá<br>Tel. 601 251 4477</p>
      <p class="r-title">Comprobante de venta N.º ${sale.number}</p>
      <p>${new Date(sale.date).toLocaleString('es-CO')}<br>Cliente: ${esc(sale.customer)}<br>Atendió: ${esc(userName(sale.userId))}</p>
      <table>${sale.items.map((i) => `<tr><td colspan="2">${esc(i.name)}</td></tr><tr><td>${i.qty} x ${money(i.price)}</td><td class="num">${money(i.qty * i.price)}</td></tr>`).join('')}</table>
      <table class="r-total"><tr><td>TOTAL</td><td class="num">${money(sale.total)}</td></tr>
      <tr><td>${PAYMENTS[sale.payment]}</td><td class="num">${money(sale.received)}</td></tr>
      ${sale.payment === 'efectivo' ? `<tr><td>Cambio</td><td class="num">${money(sale.change)}</td></tr>` : ''}</table>
      <p class="r-foot">Documento interno de control, no es factura electrónica.<br>Gracias por su compra.</p>
    </div>`;
  }

  function showReceipt(sale) {
    openModal(`<div class="modal-head"><h2>Comprobante N.º ${sale.number}</h2><button class="icon-btn" data-close aria-label="Cerrar">×</button></div>
      ${receiptHtml(sale)}
      <div class="modal-actions"><button class="btn ghost" data-close>Cerrar</button><button class="btn primary" id="print-receipt">Imprimir</button></div>`, () => {
      $('#print-receipt').addEventListener('click', () => {
        $('#print-area').innerHTML = receiptHtml(sale);
        document.body.classList.add('print-receipt');
        window.print();
        document.body.classList.remove('print-receipt');
      });
    });
  }

  // ---------- Ventas ----------
  function viewSales(el, params) {
    const to = params.get('hasta') || localDay();
    const fromDefault = new Date(); fromDefault.setDate(fromDefault.getDate() - 6);
    const from = params.get('desde') || localDay(fromDefault);
    const sales = state.sales.filter((s) => Core.dayOf(s.date) >= from && Core.dayOf(s.date) <= to).reverse();
    const total = sales.reduce((a, s) => a + s.total, 0);
    el.innerHTML = `
      <form class="toolbar" id="range"><label>Desde<input type="date" name="desde" value="${from}"></label><label>Hasta<input type="date" name="hasta" value="${to}"></label><button class="btn">Filtrar</button>
      <span class="spacer"></span><span class="muted">${sales.length} ventas · ${money(total)}</span></form>
      <section class="card"><table class="table">
        <thead><tr><th>N.º</th><th>Fecha</th><th>Cliente</th><th class="num">Artículos</th><th>Pago</th><th>Cajero</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${sales.map((s) => `<tr><td>${s.number}</td><td>${fmtDateTime(s.date)}</td><td>${esc(s.customer)}</td><td class="num">${s.items.reduce((a, i) => a + i.qty, 0)}</td><td>${PAYMENTS[s.payment]}</td><td>${esc(userName(s.userId))}</td><td class="num">${money(s.total)}</td><td><button class="btn sm ghost" data-sale="${s.id}">Comprobante</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">No hay ventas en el periodo.</td></tr>'}</tbody>
      </table></section>`;
    $('#range').addEventListener('submit', (ev) => { ev.preventDefault(); const d = formData(ev.target); location.hash = `#/ventas?desde=${d.desde}&hasta=${d.hasta}`; });
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-sale]'); if (b) showReceipt(state.sales.find((s) => s.id === b.dataset.sale)); });
  }

  // ---------- Productos ----------
  function viewProducts(el, params) {
    const canEdit = user.role !== 'cajero';
    const q = params.get('q') || '';
    const cat = params.get('cat') || '';
    const list = Core.searchProducts(state, q, { category: cat }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    el.innerHTML = `
      <form class="toolbar" id="filter">
        <input name="q" value="${esc(q)}" placeholder="Buscar por código, nombre o ubicación" class="grow">
        <select name="cat"><option value="">Todas las categorías</option>${Core.categories(state).map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <button class="btn">Buscar</button>
        ${canEdit ? '<span class="spacer"></span><button class="btn primary" type="button" id="new-product">Nuevo producto</button>' : ''}
      </form>
      <section class="card"><table class="table">
        <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Ubicación</th><th class="num">Local</th><th class="num">Bodega</th><th class="num">Mín.</th><th class="num">Precio</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map((p) => `<tr>
          <td><code>${esc(p.code)}</code></td><td>${esc(p.name)}<br><small>${esc(p.barcode)}</small></td><td>${esc(p.category)}</td><td>${esc(p.shelf)}</td>
          <td class="num">${p.stock.local}</td><td class="num">${p.stock.bodega}</td><td class="num">${p.min}</td><td class="num">${money(p.price)}</td><td>${stockBadge(p)}</td>
          <td class="actions">${canEdit ? `<button class="btn sm ghost" data-edit="${p.id}">Editar</button><a class="btn sm ghost" href="#/kardex?p=${p.id}">Kárdex</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">No hay productos que coincidan.</td></tr>'}</tbody>
      </table></section>`;
    $('#filter').addEventListener('submit', (ev) => { ev.preventDefault(); const d = formData(ev.target); location.hash = `#/productos?q=${encodeURIComponent(d.q)}&cat=${encodeURIComponent(d.cat)}`; });
    if (canEdit) {
      $('#new-product').addEventListener('click', () => productForm());
      el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-edit]'); if (b) productForm(Core.findProduct(state, b.dataset.edit)); });
    }
  }

  function productForm(p) {
    const isNew = !p;
    p = p || { code: '', barcode: '', name: '', category: '', unit: 'Unidad', cost: '', price: '', min: '', shelf: '', supplierId: '', active: true };
    openModal(`<div class="modal-head"><h2>${isNew ? 'Nuevo producto' : 'Editar producto'}</h2><button class="icon-btn" data-close aria-label="Cerrar">×</button></div>
      <form id="pf" class="form-grid">
        <label>Código interno<input name="code" value="${esc(p.code)}" required></label>
        <label>Código de barras<input name="barcode" value="${esc(p.barcode)}" required></label>
        <label class="span-2">Nombre<input name="name" value="${esc(p.name)}" required></label>
        <label>Categoría<input name="category" value="${esc(p.category)}" list="cats" required><datalist id="cats">${Core.categories(state).map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label>Unidad<input name="unit" value="${esc(p.unit)}" required></label>
        <label>Costo (COP)<input name="cost" type="number" min="0" value="${p.cost}" required></label>
        <label>Precio de venta (COP)<input name="price" type="number" min="0" value="${p.price}" required></label>
        <label>Stock mínimo<input name="min" type="number" min="0" value="${p.min}" required></label>
        <label>Ubicación (estante)<input name="shelf" value="${esc(p.shelf)}" placeholder="Bodega B-02"></label>
        <label class="span-2">Proveedor habitual<select name="supplierId"><option value="">Sin proveedor</option>${state.suppliers.map((s) => `<option value="${s.id}" ${s.id === p.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        ${isNew ? '<label>Existencia inicial en local<input name="initialLocal" type="number" min="0" value="0"></label><label>Existencia inicial en bodega<input name="initialBodega" type="number" min="0" value="0"></label>'
          : `<label class="check span-2"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Producto activo</label>`}
        <div class="modal-actions span-2"><button class="btn ghost" type="button" data-close>Cancelar</button><button class="btn primary">Guardar</button></div>
      </form>`, () => {
      $('#pf').addEventListener('submit', (ev) => {
        ev.preventDefault();
        const d = formData(ev.target);
        if (!isNew) { d.id = p.id; d.active = !!ev.target.active.checked; }
        if (attempt(() => Core.saveProduct(state, d, user), 'Producto guardado.')) { closeModal(); render(); }
      });
    });
  }

  // ---------- Movimientos ----------
  function viewMovements(el, params) {
    const tab = params.get('tab') || 'compra';
    const pre = params.get('p') || '';
    const tabs = { compra: 'Entrada por compra', traslado: 'Traslado', ajuste: 'Ajuste por conteo', devolucion: 'Devolución' };
    const locOptions = (sel) => Object.entries(Core.LOCATIONS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
    const forms = {
      compra: `<label class="span-2">Producto<select name="productId" required>${productOptions(pre)}</select></label>
        <label>Proveedor<select name="supplierId" required><option value="">Seleccione</option>${state.suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
        <label>N.º de factura del proveedor<input name="ref" placeholder="FE-3418"></label>
        <label>Cantidad<input name="qty" type="number" min="1" required></label>
        <label>Costo unitario (COP)<input name="unitCost" type="number" min="0" placeholder="Último costo"></label>
        <label>Ubicación de destino<select name="location">${locOptions('bodega')}</select></label>`,
      traslado: `<label class="span-2">Producto<select name="productId" required>${productOptions(pre)}</select></label>
        <label>Desde<select name="from">${locOptions('bodega')}</select></label>
        <label>Hacia<select name="to">${locOptions('local')}</select></label>
        <label>Cantidad<input name="qty" type="number" min="1" required></label>
        <label>Observación<input name="note"></label>`,
      ajuste: `<label class="span-2">Producto<select name="productId" required>${productOptions(pre)}</select></label>
        <label>Ubicación contada<select name="location">${locOptions('local')}</select></label>
        <label>Cantidad contada físicamente<input name="counted" type="number" min="0" required></label>
        <label class="span-2">Motivo<input name="note" required placeholder="Conteo semanal, producto averiado, etc."></label>`,
      devolucion: `<label class="span-2">Producto<select name="productId" required>${productOptions(pre)}</select></label>
        <label>N.º de comprobante de venta<input name="ref"></label>
        <label>Cantidad devuelta<input name="qty" type="number" min="1" required></label>
        <label>Reingresa a<select name="location">${locOptions('local')}</select></label>
        <label>Motivo<input name="note"></label>`,
    };
    const recent = state.movements.filter((m) => m.type !== 'VENTA').slice(-12).reverse();
    el.innerHTML = `
      <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<a href="#/movimientos?tab=${k}${pre ? '&p=' + pre : ''}" class="${k === tab ? 'active' : ''}">${v}</a>`).join('')}</div>
      <section class="card">
        <form id="mf" class="form-grid">${forms[tab]}
          <p class="hint span-2" id="mf-hint"></p>
          <div class="modal-actions span-2"><button class="btn primary">Registrar ${tabs[tab].toLowerCase()}</button></div>
        </form>
      </section>
      <section class="card"><h2>Movimientos recientes (sin ventas)</h2><table class="table">
        <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Ubicación</th><th class="num">Cantidad</th><th>Referencia</th><th>Usuario</th></tr></thead>
        <tbody>${recent.map((m) => `<tr><td>${fmtDateTime(m.date)}</td><td>${esc(productName(m.productId))}</td><td>${Core.MOVEMENT_TYPES[m.type]}</td><td>${Core.LOCATIONS[m.location]}</td><td class="num ${m.qty < 0 ? 'neg' : 'pos'}">${m.qty > 0 ? '+' : ''}${m.qty}</td><td>${esc(m.ref)}${m.note ? ' · ' + esc(m.note) : ''}</td><td>${esc(userName(m.userId))}</td></tr>`).join('')}</tbody>
      </table></section>`;
    const form = $('#mf');
    const hint = () => {
      const p = state.products.find((x) => x.id === form.productId.value);
      $('#mf-hint').textContent = p ? `Existencias actuales: local ${p.stock.local}, bodega ${p.stock.bodega} (${p.shelf}). Mínimo ${p.min}. Último costo ${money(p.cost)}.` : '';
    };
    form.productId.addEventListener('change', hint);
    hint();
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const d = formData(form);
      const ops = { compra: Core.registerPurchase, traslado: Core.transfer, ajuste: Core.adjust, devolucion: Core.registerReturn };
      if (attempt(() => ops[tab](state, d, user), tabs[tab] + ' registrado en el kárdex.')) render();
    });
  }

  // ---------- Kárdex ----------
  function viewKardex(el, params) {
    const pid = params.get('p') || (state.products.find((p) => p.active) || {}).id;
    const p = state.products.find((x) => x.id === pid);
    const rows = p ? Core.kardex(state, p.id) : [];
    el.innerHTML = `
      <form class="toolbar" id="kf"><select name="p" class="grow">${productOptions(pid)}</select><button class="btn">Consultar</button><span class="spacer"></span><button class="btn ghost" type="button" id="kx">Exportar a Excel (CSV)</button></form>
      ${p ? `<div class="kpis small">
        <div class="kpi"><span>Local</span><strong>${p.stock.local}</strong></div>
        <div class="kpi"><span>Bodega</span><strong>${p.stock.bodega}</strong><small>${esc(p.shelf)}</small></div>
        <div class="kpi"><span>Total</span><strong>${Core.totalStock(p)}</strong><small>Mínimo ${p.min} · ${stockBadge(p)}</small></div>
        <div class="kpi"><span>Valor al costo</span><strong>${money(Core.totalStock(p) * p.cost)}</strong><small>${money(p.cost)} c/u</small></div>
      </div>` : ''}
      <section class="card"><table class="table">
        <thead><tr><th>Fecha</th><th>Movimiento</th><th>Ubicación</th><th class="num">Entrada</th><th class="num">Salida</th><th class="num">Saldo total</th><th>Referencia</th><th>Usuario</th></tr></thead>
        <tbody>${rows.slice().reverse().map((m) => `<tr><td>${fmtDateTime(m.date)}</td><td>${Core.MOVEMENT_TYPES[m.type]}</td><td>${Core.LOCATIONS[m.location]}</td><td class="num pos">${m.qty > 0 ? m.qty : ''}</td><td class="num neg">${m.qty < 0 ? -m.qty : ''}</td><td class="num"><strong>${m.balance}</strong></td><td>${esc(m.ref)}${m.note ? ' · ' + esc(m.note) : ''}</td><td>${esc(userName(m.userId))}</td></tr>`).join('')}</tbody>
      </table></section>`;
    $('#kf').addEventListener('submit', (ev) => { ev.preventDefault(); location.hash = '#/kardex?p=' + formData(ev.target).p; });
    $('#kx').addEventListener('click', () => {
      download('kardex_' + p.code + '.csv', Core.toCSV([['Fecha', 'Movimiento', 'Ubicación', 'Entrada', 'Salida', 'Saldo', 'Referencia', 'Usuario']]
        .concat(rows.map((m) => [new Date(m.date).toLocaleString('es-CO'), Core.MOVEMENT_TYPES[m.type], Core.LOCATIONS[m.location], m.qty > 0 ? m.qty : '', m.qty < 0 ? -m.qty : '', m.balance, m.ref, userName(m.userId)]))));
    });
  }

  // ---------- Proveedores ----------
  function viewSuppliers(el) {
    const count = (id) => state.products.filter((p) => p.supplierId === id).length;
    el.innerHTML = `
      <div class="toolbar"><span class="muted">${state.suppliers.length} proveedores registrados</span><span class="spacer"></span><button class="btn primary" id="new-sup">Nuevo proveedor</button></div>
      <section class="card"><table class="table">
        <thead><tr><th>NIT</th><th>Razón social</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th class="num">Productos</th><th></th></tr></thead>
        <tbody>${state.suppliers.map((s) => `<tr><td>${esc(s.nit)}</td><td>${esc(s.name)}</td><td>${esc(s.contact)}</td><td>${esc(s.phone)}</td><td>${esc(s.email)}</td><td class="num">${count(s.id)}</td><td><button class="btn sm ghost" data-edit="${s.id}">Editar</button></td></tr>`).join('')}</tbody>
      </table></section>`;
    const form = (s) => {
      s = s || {};
      openModal(`<div class="modal-head"><h2>${s.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h2><button class="icon-btn" data-close aria-label="Cerrar">×</button></div>
        <form id="sf" class="form-grid">
          <label>NIT<input name="nit" value="${esc(s.nit)}" required></label>
          <label>Razón social<input name="name" value="${esc(s.name)}" required></label>
          <label>Contacto<input name="contact" value="${esc(s.contact)}"></label>
          <label>Teléfono<input name="phone" value="${esc(s.phone)}"></label>
          <label class="span-2">Correo<input name="email" type="email" value="${esc(s.email)}"></label>
          <div class="modal-actions span-2"><button class="btn ghost" type="button" data-close>Cancelar</button><button class="btn primary">Guardar</button></div>
        </form>`, () => {
        $('#sf').addEventListener('submit', (ev) => {
          ev.preventDefault();
          const d = formData(ev.target); d.id = s.id;
          if (attempt(() => Core.saveSupplier(state, d), 'Proveedor guardado.')) { closeModal(); render(); }
        });
      });
    };
    $('#new-sup').addEventListener('click', () => form());
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-edit]'); if (b) form(state.suppliers.find((s) => s.id === b.dataset.edit)); });
  }

  // ---------- Alertas ----------
  function viewAlerts(el) {
    const low = Core.lowStock(state);
    const shop = Core.needsRestockToShop(state);
    const canMove = Core.canAccess(user, 'movimientos');
    el.innerHTML = `
      <section class="card"><h2>Productos en o por debajo del stock mínimo</h2>
        <table class="table"><thead><tr><th>Producto</th><th class="num">Local</th><th class="num">Bodega</th><th class="num">Total</th><th class="num">Mínimo</th><th class="num">Pedido sugerido</th><th>Proveedor</th><th></th></tr></thead>
        <tbody>${low.map((p) => `<tr><td>${esc(p.name)}<br><small>${esc(p.code)}</small></td><td class="num">${p.stock.local}</td><td class="num">${p.stock.bodega}</td><td class="num"><strong>${Core.totalStock(p)}</strong></td><td class="num">${p.min}</td><td class="num">${Math.max(p.min * 2 - Core.totalStock(p), 1)} ${esc(p.unit.toLowerCase())}</td><td>${esc(supplierName(p.supplierId))}</td>
          <td>${canMove ? `<a class="btn sm" href="#/movimientos?tab=compra&p=${p.id}">Registrar compra</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No hay productos bajo el mínimo.</td></tr>'}</tbody></table>
        <p class="hint">El pedido sugerido lleva el producto al doble de su stock mínimo.</p>
      </section>
      <section class="card"><h2>Agotados en el local con existencias en bodega</h2>
        <table class="table"><thead><tr><th>Producto</th><th>Ubicación en bodega</th><th class="num">Bodega</th><th></th></tr></thead>
        <tbody>${shop.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.shelf)}</td><td class="num">${p.stock.bodega}</td><td>${canMove ? `<a class="btn sm" href="#/movimientos?tab=traslado&p=${p.id}">Trasladar al local</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Ningún producto en esta situación.</td></tr>'}</tbody></table>
      </section>`;
  }

  // ---------- Reportes ----------
  function viewReports(el, params) {
    const to = params.get('hasta') || localDay();
    const from = params.get('desde') || to.slice(0, 8) + '01';
    const sum = Core.salesSummary(state, from, to);
    const rot = Core.rotation(state, from, to);
    const cats = Core.marginByCategory(state, from, to);
    const stock = Core.valuedStock(state);
    const unsold = state.products.filter((p) => p.active && !rot.some((r) => r.productId === p.id));
    el.innerHTML = `
      <form class="toolbar no-print" id="rf"><label>Desde<input type="date" name="desde" value="${from}"></label><label>Hasta<input type="date" name="hasta" value="${to}"></label><button class="btn">Generar</button>
        <span class="spacer"></span><button class="btn ghost" type="button" data-x="rot">Rotación (CSV)</button><button class="btn ghost" type="button" data-x="stock">Existencias (CSV)</button><button class="btn primary" type="button" id="print">Imprimir o guardar PDF</button></form>
      <p class="print-only">Ferretería El Constructor S.A.S. · Reporte de ventas del ${from} al ${to}</p>
      <div class="kpis">
        <div class="kpi"><span>Ventas</span><strong>${money(sum.revenue)}</strong><small>${sum.count} comprobantes</small></div>
        <div class="kpi"><span>Costo de lo vendido</span><strong>${money(sum.cost)}</strong></div>
        <div class="kpi"><span>Margen bruto</span><strong>${money(sum.margin)}</strong><small>${pct(sum.marginPct)}</small></div>
        <div class="kpi"><span>Ticket promedio</span><strong>${money(sum.avgTicket)}</strong><small>${Object.entries(sum.byPayment).map(([k, v]) => PAYMENTS[k] + ' ' + pct(v / (sum.revenue || 1))).join(' · ')}</small></div>
      </div>
      <div class="grid-2">
        <section class="card"><h2>Productos de mayor rotación</h2><table class="table">
          <thead><tr><th>Producto</th><th class="num">Unidades</th><th class="num">Ventas</th><th class="num">Margen</th></tr></thead>
          <tbody>${rot.slice(0, 10).map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${int(r.qty)}</td><td class="num">${money(r.revenue)}</td><td class="num">${pct((r.revenue - r.cost) / (r.revenue || 1))}</td></tr>`).join('')}</tbody></table>
          ${unsold.length ? `<p class="hint">Sin ventas en el periodo: ${unsold.map((p) => esc(p.name)).join(', ')}.</p>` : ''}
        </section>
        <section class="card"><h2>Margen por categoría</h2><table class="table">
          <thead><tr><th>Categoría</th><th class="num">Ventas</th><th class="num">Margen</th><th class="num">%</th></tr></thead>
          <tbody>${cats.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${money(c.revenue)}</td><td class="num">${money(c.margin)}</td><td class="num">${pct(c.marginPct)}</td></tr>`).join('')}</tbody></table>
        </section>
      </div>
      <section class="card"><h2>Existencias valorizadas al costo · total ${money(stock.total)}</h2><table class="table">
        <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th class="num">Local</th><th class="num">Bodega</th><th class="num">Costo</th><th class="num">Valor</th></tr></thead>
        <tbody>${stock.rows.slice().sort((a, b) => b.value - a.value).map((r) => `<tr><td><code>${esc(r.code)}</code></td><td>${esc(r.name)}</td><td>${esc(r.category)}</td><td class="num">${r.local}</td><td class="num">${r.bodega}</td><td class="num">${money(r.cost)}</td><td class="num">${money(r.value)}</td></tr>`).join('')}</tbody></table>
      </section>`;
    $('#rf').addEventListener('submit', (ev) => { ev.preventDefault(); const d = formData(ev.target); location.hash = `#/reportes?desde=${d.desde}&hasta=${d.hasta}`; });
    $('#print').addEventListener('click', () => window.print());
    $$('[data-x]', el).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.x === 'rot') {
        download(`rotacion_${from}_${to}.csv`, Core.toCSV([['Producto', 'Unidades', 'Ventas', 'Costo', 'Margen']].concat(rot.map((r) => [r.name, r.qty, r.revenue, r.cost, r.revenue - r.cost]))));
      } else {
        download(`existencias_${localDay()}.csv`, Core.toCSV([['Código', 'Producto', 'Categoría', 'Local', 'Bodega', 'Total', 'Costo', 'Valor']].concat(stock.rows.map((r) => [r.code, r.name, r.category, r.local, r.bodega, r.total, r.cost, r.value]))));
      }
    }));
  }

  // ---------- Usuarios ----------
  function viewUsers(el) {
    el.innerHTML = `
      <div class="toolbar"><span class="muted">Los permisos dependen del rol: el cajero vende y consulta, el bodeguero administra el inventario y el administrador accede a todo.</span><span class="spacer"></span><button class="btn primary" id="new-user">Nuevo usuario</button></div>
      <section class="card"><table class="table">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
        <tbody>${state.users.map((u) => `<tr><td><code>${esc(u.username)}</code></td><td>${esc(u.name)}</td><td>${Core.ROLES[u.role]}</td><td>${u.active ? '<span class="badge ok">Activo</span>' : '<span class="badge muted">Inactivo</span>'}</td><td><button class="btn sm ghost" data-edit="${u.id}">Editar</button></td></tr>`).join('')}</tbody>
      </table></section>
      <section class="card danger-zone"><h2>Datos de demostración</h2><p>Restablece el catálogo, los proveedores, las ventas y los movimientos de ejemplo. Se pierden los cambios hechos en este navegador.</p><button class="btn danger" id="reset">Restablecer datos</button></section>`;
    const form = (u) => {
      u = u || { role: 'cajero', active: true };
      openModal(`<div class="modal-head"><h2>${u.id ? 'Editar usuario' : 'Nuevo usuario'}</h2><button class="icon-btn" data-close aria-label="Cerrar">×</button></div>
        <form id="uf" class="form-grid">
          <label>Usuario<input name="username" value="${esc(u.username)}" required></label>
          <label>Nombre completo<input name="name" value="${esc(u.name)}" required></label>
          <label>Rol<select name="role">${Object.entries(Core.ROLES).map(([k, v]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>${u.id ? 'Nueva contraseña (opcional)' : 'Contraseña'}<input name="password" type="password" ${u.id ? '' : 'required minlength="6"'}></label>
          ${u.id ? `<label class="check span-2"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Usuario activo</label>` : ''}
          <div class="modal-actions span-2"><button class="btn ghost" type="button" data-close>Cancelar</button><button class="btn primary">Guardar</button></div>
        </form>`, () => {
        $('#uf').addEventListener('submit', (ev) => {
          ev.preventDefault();
          const d = formData(ev.target);
          if (u.id) { d.id = u.id; d.active = !!ev.target.active.checked; }
          if (attempt(() => Core.saveUser(state, d), 'Usuario guardado.')) { closeModal(); render(); }
        });
      });
    };
    $('#new-user').addEventListener('click', () => form());
    el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-edit]'); if (b) form(state.users.find((x) => x.id === b.dataset.edit)); });
    $('#reset').addEventListener('click', () => {
      if (!confirm('¿Restablecer todos los datos de demostración?')) return;
      state = Store.reset();
      cart = [];
      const again = state.users.find((x) => x.username === user.username);
      if (again) { startSession(again); toast('Datos restablecidos.'); } else showLogin();
    });
  }

  // ---------- Migración ----------
  function viewImport(el) {
    el.innerHTML = `
      <section class="card">
        <h2>Cargar productos desde un archivo CSV</h2>
        <p>Guarde la hoja de Excel del inventario como «CSV (delimitado por comas)» o «CSV UTF-8» con las columnas de la plantilla. Cada fila crea un producto con su saldo inicial en el kárdex. Las filas con errores se informan y no detienen la carga.</p>
        <div class="toolbar"><button class="btn ghost" id="tpl">Descargar plantilla</button><input type="file" id="file" accept=".csv,text/csv"><button class="btn primary" id="run">Importar</button></div>
        <p class="hint">Columnas: ${Core.IMPORT_COLUMNS.join(', ')}.</p>
        <div id="result"></div>
      </section>`;
    $('#tpl').addEventListener('click', () => download('plantilla_productos.csv', Core.toCSV([Core.IMPORT_COLUMNS,
      ['TOR-1020', '7702041010202', 'Tornillo autoperforante 10 x 2" (caja x 100)', 'Tornillería', 'Caja', '9800', '15900', '10', 'Bodega B-02', '5', '20']])));
    $('#run').addEventListener('click', () => {
      const f = $('#file').files[0];
      if (!f) return toast('Seleccione un archivo CSV.', 'error');
      const reader = new FileReader();
      reader.onload = () => {
        const r = attempt(() => Core.importProducts(state, Core.parseCSV(reader.result), user));
        if (!r) return;
        $('#result').innerHTML = `<p><strong>${r.created}</strong> productos creados${r.errors.length ? ` y <strong>${r.errors.length}</strong> filas con errores:` : '.'}</p>${r.errors.length ? `<ul class="errors">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}`;
        toast('Importación terminada: ' + r.created + ' productos.');
      };
      reader.readAsText(f, 'utf-8');
    });
  }

  // ---------- arranque ----------
  $('#login-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const d = formData(ev.target);
    try {
      startSession(Core.authenticate(state, d.username, d.password));
    } catch (e) {
      $('#login-error').textContent = e.message;
    }
  });
  $('#logout').addEventListener('click', () => { cart = []; location.hash = ''; showLogin(); });
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', () => { state = Store.load(); render(); });

  const saved = Store.readSession();
  const savedUser = saved && state.users.find((u) => u.id === saved && u.active);
  if (savedUser) startSession(savedUser); else showLogin();
})();

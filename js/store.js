/*
 * StockFácil — persistencia del prototipo.
 * Guarda el estado en localStorage del navegador. En la versión final esta capa
 * se reemplaza por llamadas a la API REST (Node.js/NestJS + PostgreSQL) sin
 * cambiar las reglas de negocio de core.js.
 */
(function (root) {
  'use strict';
  const KEY = 'stockfacil.v1';
  const SESSION_KEY = 'stockfacil.session';

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  const Store = {
    load() {
      const raw = safeGet(KEY);
      if (raw) {
        try { return JSON.parse(raw); } catch (e) { /* datos dañados: se regeneran */ }
      }
      const fresh = root.StockSeed.build();
      Store.save(fresh);
      return fresh;
    },
    save(state) {
      if (!safeSet(KEY, JSON.stringify(state))) {
        root.alert('No se pudieron guardar los datos en este navegador (almacenamiento lleno o bloqueado).');
      }
    },
    reset() {
      const fresh = root.StockSeed.build();
      Store.save(fresh);
      return fresh;
    },
    setSession(userId) {
      try { userId ? sessionStorage.setItem(SESSION_KEY, userId) : sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* sin sesión persistente */ }
    },
    readSession() {
      try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
    },
  };

  root.StockStore = Store;
})(window);

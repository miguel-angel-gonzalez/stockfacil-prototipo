# StockFácil · Prototipo funcional

Prototipo funcional de **StockFácil**, el sistema web de gestión de inventario y ventas
formulado para la Ferretería El Constructor S.A.S. (Bogotá). Corresponde a la
Actividad 4 del curso Proyecto de Software (Corporación Universitaria Iberoamericana).

Autor: Miguel Ángel González Noreña.

## Requisitos

- Un navegador actual: Google Chrome, Microsoft Edge o Firefox.
- Opcional: Node.js 18 o superior, solo para servir la aplicación por HTTP o ejecutar las pruebas.

No necesita base de datos, instalación de paquetes ni conexión a internet.

## Cómo ejecutarlo

**Opción 1. Abrir el archivo (la más sencilla)**

1. Descomprima el archivo `StockFacil-prototipo.zip`.
2. Abra `index.html` con doble clic. La aplicación se abre en el navegador.

**Opción 2. Con Node.js**

```bash
cd prototipo
npm start
```

Abra http://localhost:8080. Para usar otro puerto: `PORT=3000 npm start`.

## Usuarios de demostración

| Usuario | Contraseña | Rol | Puede |
|---|---|---|---|
| `hrincon` | `admin123` | Administrador | Todo el sistema |
| `lcastro` | `caja123` | Cajero | Vender, consultar ventas, productos y alertas |
| `jpulido` | `bodega123` | Bodeguero | Productos, movimientos, kárdex, proveedores y alertas |

La primera vez se cargan datos de ejemplo: 26 productos, 4 proveedores y unas tres semanas de
ventas y movimientos. Los cambios se guardan en el navegador (`localStorage`). Para volver al
estado inicial: *Usuarios → Restablecer datos* (como administrador).

## Funcionalidades

- Inicio de sesión con tres roles y menú según los permisos de cada rol.
- Catálogo de productos con código interno, código de barras, categoría, unidad, costo, precio,
  stock mínimo, ubicación en estante y proveedor habitual.
- Existencias separadas por ubicación: local de ventas y bodega.
- Movimientos de inventario: entrada por compra, traslado entre bodega y local, ajuste por conteo
  físico y devolución de cliente. Todos quedan en el kárdex con fecha, usuario y saldo.
- Punto de venta: lectura de código de barras (el lector funciona como teclado y envía Enter),
  búsqueda por nombre, cálculo del cambio, comprobante imprimible en formato de 80 mm. Una venta
  descuenta automáticamente las existencias del local y avisa si el producto está en bodega.
- Alertas de stock mínimo con pedido sugerido y lista de productos agotados en el local que sí
  tienen existencias en bodega.
- Reportes por periodo: ventas, costo, margen, ticket promedio, rotación de productos, margen por
  categoría y existencias valorizadas. Exportación a CSV (se abre en Excel) e impresión o PDF.
- Proveedores y usuarios (crear, editar, activar o desactivar).
- Migración desde Excel: carga masiva de productos con un archivo CSV y reporte de filas con error.

## Estructura

```
index.html        Estructura de la interfaz
css/styles.css    Estilos
js/core.js        Reglas de negocio (sin interfaz; se prueba con Node)
js/seed.js        Datos de demostración reproducibles
js/store.js       Persistencia en localStorage
js/app.js         Vistas, navegación y formularios
server.js         Servidor estático opcional sin dependencias
tests/            Pruebas unitarias del núcleo y pruebas de aceptación (HU-01 a HU-11)
```

## Pruebas

```bash
npm test
```

Ejecuta 51 pruebas con el ejecutor nativo de Node (`node --test`): 14 pruebas unitarias del
núcleo (`tests/core.test.js`) y 37 pruebas de aceptación (`tests/aceptacion.test.js`), una por
cada criterio Dado/Cuando/Entonces de las historias de usuario HU-01 a HU-11. Incluyen los
criterios CA-01 (la venta descuenta existencias), CA-04 (migración) y CA-05 (alertas de stock
mínimo) de la formulación.

## Alcance del prototipo

Es un prototipo evolutivo de la interfaz y de las reglas de negocio. La autenticación y el
almacenamiento son locales al navegador; en la versión final se reemplazan por la API en
Node.js/NestJS con PostgreSQL, contraseñas cifradas y HTTPS, como se definió en la formulación
del proyecto. El comprobante es un documento interno y no reemplaza la factura electrónica.

# POSsystem Evolution — Sistema POS y Administración

Sistema completo de Punto de Venta (POS) con dashboard administrativo (ERM) para un negocio mayorista de víveres y productos generales.

## 🚀 Inicio rápido

1. Abre `index.html` en cualquier navegador moderno (Chrome, Edge, Firefox)
2. Inicia sesión con: **admin** / **admin**
3. Para mejores resultados sirve los archivos con un servidor local:
   ```bash
   python3 -m http.server 8000
   # luego abre http://localhost:8000
   ```

## 📦 Estructura

```
pos-system/
├── index.html              # Estructura principal
├── css/
│   ├── main.css            # Estilos globales (login, modal, toasts)
│   ├── pos.css             # Estilos del POS (idéntico a la imagen)
│   └── dashboard.css       # Estilos del dashboard y módulos
├── js/
│   ├── data.js             # Modelo de datos + seed
│   ├── app.js              # Login, navegación, modales
│   ├── pos.js              # Lógica del POS
│   ├── dashboard.js        # Vista de resumen
│   └── modules.js          # Todos los módulos admin
└── README.md
```

## 🛒 POS — Punto de Venta

Replica exacta del diseño POSsystem Evolution:
- **Header**: código/nombre/dirección del cliente (editables), número de recibo
- **Totales**: Subtotal, IVA, Total en tiempo real
- **Tabla de items**: N.°, Código, Descripción, Cantidad, Precio, Subtotal, Oferta
- **Botones F2-F12**: Buscar, Vincular, Cantidad, Balanza, Devolución, Pendiente, Cobrar, Suspender, Reembolso, Precios, Clientes
- **Atajos de teclado**: F2, F4, F8, F12
- **Status bar**: Cajero, versión, fecha y hora en vivo

## 📊 Dashboard (ERM)

Barra de herramientas con los módulos:

### Principal
- **Resumen**: KPIs, gráfico de ventas, top productos, actividad reciente
- **Punto de Venta**: atajo al POS

### Operaciones
- **Compras (Entradas)**: registrar entradas de mercancía, ver listado, KPIs
- **Inventario**: 24 productos pre-cargados, valorización, exportación CSV
- **Ventas**: historial, búsqueda, filtros
- **Cuentas por Cobrar (CxC)**: facturas pendientes, registrar pagos
- **Cuentas por Pagar (CxP)**: facturas a proveedores, registrar pagos

### Entidades
- **Clientes**: 6 clientes pre-cargados, gestión completa
- **Proveedores**: 6 proveedores pre-cargados
- **Empleados**: gestión de personal

### Finanzas
- **Contabilidad**: libro diario de ingresos y egresos
- **Caja / Bancos**: movimientos de efectivo
- **Reportes**: 6 reportes (inventario, ventas, CxC, PyG, compras, top productos)

### Sistema
- **Usuarios**: gestión de usuarios y roles
- **Configuración**: empresa, impuestos, facturación, POS, datos (con respaldo JSON)

## 💾 Persistencia

Todos los datos se guardan automáticamente en `localStorage` del navegador.
- Exportar respaldo: Configuración → Datos → Exportar JSON
- Importar respaldo: Configuración → Datos → Importar
- Restablecer demo: Configuración → Datos → Restablecer

## 🔐 Usuarios de prueba

| Usuario  | Contraseña | Rol         |
|----------|------------|-------------|
| admin    | admin      | admin       |
| cajero1  | admin      | cashier     |
| supervisor | admin    | supervisor  |

## ✨ Características

- ✅ POS idéntico al de la imagen (logo owl, tabla roja, botones F2-F12)
- ✅ Cálculo automático de IVA (16% incluido en precios)
- ✅ Multiples métodos de pago (efectivo, tarjeta, transferencia, crédito, mixto)
- ✅ Venta a crédito genera automáticamente CxC
- ✅ Compra a crédito genera automáticamente CxP
- ✅ Todos los movimientos actualizan contabilidad
- ✅ Stock se descuenta automáticamente al vender
- ✅ Stock aumenta al registrar compras
- ✅ Reportes con exportación a CSV
- ✅ Búsqueda en todos los módulos
- ✅ Filtros por estado, fecha, categoría
- ✅ Responsive design
- ✅ Toasts de notificación
- ✅ Modales genéricos para formularios
- ✅ Atajos de teclado (F2, F4, F8, F12, Esc)

## 🧪 Datos de demo

- 24 productos en 8 categorías
- 6 clientes con saldos
- 6 proveedores con deudas
- 5 documentos CxC
- 6 documentos CxP
- 5 compras
- 5 ventas
- 9 movimientos contables
- 5 usuarios
- 3 movimientos de caja

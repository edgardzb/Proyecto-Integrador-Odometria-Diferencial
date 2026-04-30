# Wheel Track Monitor

Sistema de monitoreo en tiempo real para encoders de rueda con odometría diferencial. Desarrollado como proyecto integrador para aprender sobre robótica móvil, servidores Node.js y visualización de datos en el frontend.

---

## Descripción

El sistema simula (o conecta con hardware real) dos ruedas con sensores de encoder. Cada vez que la rueda da una vuelta completa, un punto de referencia pasa por un sensor que incrementa un contador de **ticks**. Con esos ticks se calcula:

- Distancia recorrida por cada rueda
- Velocidad en tiempo real (m/s)
- Posición y orientación del robot en el plano (odometría diferencial)
- Trayectoria dibujada en un mapa 2D interactivo

---

## Estructura del proyecto

```
/
├── server-left.js     # Servidor Express para rueda izquierda  → puerto 3000
├── server-right.js    # Servidor Express para rueda derecha    → puerto 3001
├── index.html         # Frontend completo (sin dependencias externas)
├── package.json
└── package-lock.json
```

---

## Requisitos

- [Node.js](https://nodejs.org/) v18 o superior
- npm

---

## Instalación y uso

**1. Instalar dependencias**

```bash
npm install
```

**2. Iniciar ambos servidores** (en terminales separadas)

```bash
# Terminal 1
node server-left.js

# Terminal 2
node server-right.js
```

**3. Abrir el frontend**

Abre `index.html` con **Live Server** en VS Code, o directamente en el navegador.

> Los servidores deben estar corriendo antes de abrir el frontend. El punto de estado de cada rueda se muestra en **verde** cuando hay conexión y en **rojo** cuando no.

---

## API de los servidores

Ambos servidores exponen los mismos endpoints:

| Método | Ruta      | Descripción                                      |
|--------|-----------|--------------------------------------------------|
| GET    | `/ticks`  | Retorna el valor actual de ticks `{ ticksL }` / `{ ticksR }` |
| POST   | `/tick`   | Incrementa el contador manualmente (pruebas)     |
| POST   | `/reset`  | Setea el contador a un valor dado `{ value: N }` |

**Ejemplo:**

```bash
# Leer ticks
curl http://localhost:3000/ticks

# Resetear a 0
curl -X POST http://localhost:3000/reset \
  -H "Content-Type: application/json" \
  -d '{"value": 0}'
```

---

## Parámetros físicos

| Parámetro               | Valor        |
|-------------------------|--------------|
| Diámetro de rueda       | 140 mm       |
| Circunferencia          | π × 0.14 ≈ 0.4398 m |
| Separación entre ruedas | 300 mm (valor de prueba) |
| Polling del frontend    | 50 ms        |
| Intervalo de gráficas   | 200 ms       |

> Para cambiar la separación entre ruedas, edita la variable `L` en `index.html`:
> ```js
> const L = 0.30; // metros
> ```

---

## Funcionalidades del frontend

### Monitoreo de ticks
- Contador de ticks por rueda en tiempo real
- Distancia recorrida acumulada por rueda (m)
- Indicador de estado de conexión por puerto

### Velocidad
- Gráfica de velocidad L y R en tiempo real (m/s)
- Cards con el valor numérico de velocidad actual

### Odometría diferencial
- Cálculo de posición global X/Y del robot
- Ángulo de orientación θ en grados
- Distancia total recorrida
- Los 4 ejes: global, local del carro, rueda L y rueda R

### Mapa de trayectoria 2D
- Canvas interactivo con la trayectoria del robot
- **Modo seguir** — el mapa sigue al robot automáticamente con autozoom
- **Modo libre** — navegación manual con arrastrar, scroll para zoom y botones +/−
- Representación visual del carro con orientación y ruedas

### Gráficas laterales
- Historial del ángulo θ
- Diferencia de ticks L − R (indica curvas y derrapes)

### Control de reproducción
| Botón | Acción |
|-------|--------|
| ▶     | Play — reanuda la lectura en vivo |
| ⏸     | Pause — congela todo sin perder datos |
| ■     | Stop — pausa y resetea la sesión |
| ◀◀    | Retroceder un frame (solo en pausa) |
| ▶▶    | Adelantar un frame (solo en pausa) |

> Al retroceder, la trayectoria futura aparece en **color pálido punteado**. Al adelantar vuelve al color original.

### Log general
- Registro con timestamp de eventos: `TICK`, `ODO`, `SPEED`, `WARN`
- Filtros por categoría activables/desactivables
- Alerta automática (`WARN`) si la diferencia de ticks supera 5
- Exportación a `.txt` con secciones de configuración, ticks, odometría, trayectoria y log completo

---

## Conectar hardware real

En `server-left.js` y `server-right.js`, el `setInterval` de simulación se reemplaza con la lógica real del sensor. Ejemplo con puerto serial (Arduino):

```js
const { SerialPort } = require('serialport');
const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600 });

port.on('data', () => {
  ticksL++; // cada dato recibido = una vuelta detectada
});
```

---

## Licencia

Proyecto académico — uso libre para aprendizaje.

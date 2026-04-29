const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors());
app.use(express.json());

let ticksR = 0;

// Simula el sensor — reemplaza esto con tu lógica real de hardware
setInterval(() => {
  if (Math.random() > 0.4) ticksR++;
}, 500);

app.get("/ticks", (req, res) => {
  res.json({ ticksR });
});

// Incremento manual (pruebas)
app.post("/tick", (req, res) => {
  ticksR++;
  res.json({ ticksR });
});

// Reset/set desde el frontend al dar Play desde un frame retrocedido
app.post("/reset", (req, res) => {
  const val = req.body.value ?? 0;
  ticksR = val;
  res.json({ ticksR });
});

app.listen(3001, () => {
  console.log("Servidor RIGHT en http://localhost:3001");
});
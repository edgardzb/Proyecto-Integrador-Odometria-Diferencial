const express = require("express");
const cors    = require("cors");
const app     = express();

app.use(cors());
app.use(express.json());

let ticksL = 0;

// Simula el sensor — reemplaza esto con tu lógica real de hardware
setInterval(() => {
  if (Math.random() > 0.4) ticksL++;
}, 500);

app.get("/ticks", (req, res) => {
  res.json({ ticksL });
});

// Incremento manual (pruebas)
app.post("/tick", (req, res) => {
  ticksL++;
  res.json({ ticksL });
});

// Reset/set desde el frontend al dar Play desde un frame retrocedido
app.post("/reset", (req, res) => {
  const val = req.body.value ?? 0;
  ticksL = val;
  res.json({ ticksL });
});

app.listen(3000, () => {
  console.log("Servidor LEFT en http://localhost:3000");
});
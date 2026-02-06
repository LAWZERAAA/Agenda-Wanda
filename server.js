const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let agendamentos = [];

app.post("/agendar", (req, res) => {
  const { nome, email, data, horario } = req.body;

  if (!nome || !data || !horario) {
    return res.status(400).json({ erro: "Dados obrigatórios ausentes" });
  }

  agendamentos.push({
    id: Date.now(),
    nome,
    email: email || null,
    data,
    horario
  });

  res.json({ sucesso: true });
});

app.get("/horarios", (req, res) => {
  res.json(["08:00", "09:00", "10:00", "14:00", "15:00", "16:00"]);
});

app.get("/admin/agendamentos", (req, res) => {
  res.json(agendamentos);
});

app.listen(3000, () => {
  console.log("Servidor rodando em http://localhost:3000");
});

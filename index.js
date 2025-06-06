// src/index.js
const express = require("express");
const bodyParser = require("body-parser");

const { detectIntent } = require("./services/dialogflowService");
const {
  buscarHorariosDisponiveis,
  agendarServico,
} = require("./controllers/agendamentoController");
const {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
} = require("./controllers/clienteController");
const {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
} = require("./controllers/gerenciamentoController");
const { formatarData } = require("./utils/formatters");
const { normalizarServico, SERVICOS_VALIDOS } = require("./utils/intentHelper");

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const agendamentosPendentes = new Map();

app.post("/webhook", async (req, res) => {
  const msg = req.body.Body || req.body.text;
  const from = req.body.From || req.body.sessionId;
  const profileName = req.body.ProfileName || "Cliente";

  if (!msg || !from) {
    return res.status(400).send("Requisição inválida: Body ou From ausentes.");
  }

  const sessionId = from;
  let resposta = "";

  try {
    const [response] = await detectIntent(sessionId, msg);
    const intent = response.queryResult.intent?.displayName || "default";
    const parametros = response.queryResult.parameters?.fields || {};

    const cliente = await encontrarOuCriarCliente(from, profileName);

    switch (intent) {
      case "welcome_intent":
        resposta =
          "Olá! Bem-vindo à barbearia. Qual serviço deseja agendar? (Corte, Barba ou Sobrancelha)";
        break;

      case "escolha_servico": {
        const servicoNome = parametros?.servico?.stringValue;
        if (!servicoNome) {
          resposta =
            "Por favor, informe um serviço válido: Corte, Barba ou Sobrancelha.";
          break;
        }

        const servicoNormalizado = normalizarServico(servicoNome);
        const servicoInfo = SERVICOS_VALIDOS[servicoNormalizado];

        if (!servicoInfo) {
          resposta = `Serviço '${servicoNome}' não encontrado.`;
          break;
        }

        let agendamento = agendamentosPendentes.get(from) || {
          servicos: [],
          servicoIds: [],
          confirmationStep: "initial",
        };

        if (!agendamento.servicos.includes(servicoInfo.nome)) {
          agendamento.servicos.push(servicoInfo.nome);
          agendamento.servicoIds.push(servicoInfo.id);
        }

        const horarios = await buscarHorariosDisponiveis();

        if (!horarios || horarios.length === 0) {
          resposta = "Nenhum horário disponível no momento. Tente mais tarde.";
          break;
        }

        resposta = `Serviço escolhido: *${agendamento.servicos.join(", ")}*
Horários disponíveis:\n\n`;
        resposta += horarios
          .map((h, i) => `${i + 1}. ${formatarData(h.dia_horario)}`)
          .join("\n");
        resposta +=
          "\n\nEscolha um número ou digite um horário (ex: Sexta 10:00)";

        agendamento.confirmationStep = "awaiting_date_time";
        agendamentosPendentes.set(from, agendamento);
        break;
      }

      case "cancelar_agendamento": {
        const agendamentos = await listarAgendamentosAtivos(cliente.id);
        if (!agendamentos.length) {
          resposta = "Você não possui agendamentos ativos.";
        } else {
          resposta = "Você tem os seguintes agendamentos:\n\n";
          agendamentos.forEach((a, i) => {
            resposta += `${i + 1}. ${a.servico} em ${formatarData(
              a.dia_horario
            )}\n`;
          });
          resposta +=
            "\nResponda com o número do agendamento que deseja cancelar.";
          agendamentosPendentes.set(from, {
            clienteId: cliente.id,
            agendamentosAtivos: agendamentos,
            confirmationStep: "selecionar_cancelamento",
          });
        }
        break;
      }

      default:
        resposta = "Desculpe, não entendi sua mensagem. Poderia reformular?";
    }

    res.json({ reply: resposta });
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

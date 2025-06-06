// src/index.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");

const { detectIntent } = require("./services/dialogflowService");
const {
  buscarHorariosDisponiveis,
  agendarServico,
} = require("./controllers/agendamentoController");
const { encontrarOuCriarCliente, atualizarNomeCliente } = require("./controllers/clienteController");
const {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
} = require("./controllers/gerenciamentoController");
const { formatarData } = require("./utils/formatters");
const { normalizarServico, SERVICOS_VALIDOS } = require("./utils/intentHelper");
const { MessagingResponse } = require("twilio").twiml;

const app = express();
const port = process.env.PORT || 3000;

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
    const cliente = await encontrarOuCriarCliente(from, profileName);
    const pendente = agendamentosPendentes.get(from);
    const twiml = new MessagingResponse();


    if (pendente) {
      switch (pendente.confirmationStep) {
        case "awaiting_date_time": {
          const escolha = parseInt(msg.trim(), 10) - 1;
          if (
            !isNaN(escolha) &&
            pendente.horarios &&
            pendente.horarios[escolha]
          ) {
            const horario = pendente.horarios[escolha];
            pendente.horarioEscolhido = horario;
            pendente.horarioId = horario.id;
            pendente.confirmationStep = "confirmar_nome";
            agendamentosPendentes.set(from, pendente);
            resposta = `Posso usar o nome do seu perfil, "${cliente.nome}", para o agendamento?\nResponda com 1 para confirmar ou digite o nome desejado.`;
          } else {
            resposta = "Opção inválida. Envie o número do horário desejado.";
          }
          twiml.message(resposta);
          return res.type("text/xml").send(twiml.toString());
        }

        case "selecionar_cancelamento": {
          const indice = parseInt(msg.trim(), 10) - 1;
          if (
            isNaN(indice) ||
            !pendente.agendamentosAtivos ||
            !pendente.agendamentosAtivos[indice]
          ) {
            resposta =
              "Opção inválida. Responda com o número do agendamento para cancelar.";
          } else {
            const agendamentoId = pendente.agendamentosAtivos[indice].id;
            const resultado = await cancelarAgendamento(agendamentoId);
            resposta = resultado.success
              ? "Agendamento cancelado com sucesso!"
              : resultado.message;
            agendamentosPendentes.delete(from);
          }
          twiml.message(resposta);
          return res.type("text/xml").send(twiml.toString());
        }

        case "selecionar_reagendamento": {
          const indice = parseInt(msg.trim(), 10) - 1;
          if (
            isNaN(indice) ||
            !pendente.agendamentosAtivos ||
            !pendente.agendamentosAtivos[indice]
          ) {
            resposta =
              "Opção inválida. Informe o número do agendamento que deseja reagendar.";
            twiml.message(resposta);
            return res.type("text/xml").send(twiml.toString());
          }

          const agendamentoId = pendente.agendamentosAtivos[indice].id;
          const horarios = await buscarHorariosDisponiveis();

          if (!horarios.length) {
            resposta = "Nenhum horário disponível para reagendar.";
            agendamentosPendentes.delete(from);
            twiml.message(resposta);
            return res.type("text/xml").send(twiml.toString());
          }

          resposta =
            "Escolha o novo horário:\n\n" +
            horarios
              .map((h, i) => `${i + 1}. ${formatarData(h.dia_horario)}`)
              .join("\n");

          agendamentosPendentes.set(from, {
            agendamentoId,
            horarios,
            confirmationStep: "selecionar_novo_horario",
          });
          twiml.message(resposta);
          return res.type("text/xml").send(twiml.toString());
        }

        case "selecionar_novo_horario": {
          const indice = parseInt(msg.trim(), 10) - 1;
          if (
            !isNaN(indice) &&
            pendente.horarios &&
            pendente.horarios[indice]
          ) {
            const horario = pendente.horarios[indice];
            const resultado = await reagendarAgendamento(
              pendente.agendamentoId,
              horario.id
            );
            resposta = resultado.success
              ? `✅ Agendamento reagendado para ${formatarData(
                  horario.dia_horario
                )}.`
              : resultado.message;
            agendamentosPendentes.delete(from);
          } else {
            resposta = "Opção inválida. Envie o número do novo horário.";
          }
          twiml.message(resposta);
          return res.type("text/xml").send(twiml.toString());
        }

        case "confirmar_nome": {
          const texto = msg.trim();
          if (/^(1|s|sim)$/i.test(texto)) {
            pendente.nomeConfirmado = cliente.nome;
          } else {
            const nomeAtualizado = texto;
            await atualizarNomeCliente(cliente.id, nomeAtualizado);
            cliente.nome = nomeAtualizado;
            pendente.nomeConfirmado = nomeAtualizado;
          }
          pendente.confirmationStep = "confirmar_agendamento";
          agendamentosPendentes.set(from, pendente);
          resposta = `Confirma o agendamento de *${pendente.servicos.join(", ")}* para *${pendente.nomeConfirmado}* em ${formatarData(
            pendente.horarioEscolhido.dia_horario
          )}?\n(1-Sim / 2-Não)`;
          twiml.message(resposta);
          return res.type("text/xml").send(twiml.toString());
        }

        case "confirmar_agendamento": {
          if (/^(1|s|sim)$/i.test(msg.trim())) {
            const resultado = await agendarServico(
              cliente.id,
              pendente.horarioId,
              pendente.servicoIds
            );
            resposta = resultado.success
              ? `✅ ${cliente.nome}, seu agendamento de ${pendente.servicos.join(", ")} para ${formatarData(
                  pendente.horarioEscolhido.dia_horario
                )} foi confirmado!`
              : resultado.message;
          } else {
            resposta = "Agendamento cancelado. Como posso ajudar?";
          }
          agendamentosPendentes.delete(from);
          twiml.message(resposta);
          return res.type("text/xml").send(twiml.toString());
        }
      }
    }

    const [response] = await detectIntent(sessionId, msg);
    const intent = response.queryResult.intent?.displayName || "default";
    const parametros = response.queryResult.parameters?.fields || {};

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
        agendamento.horarios = horarios;
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

      case "reagendar_agendamento": {
        const agendamentos = await listarAgendamentosAtivos(cliente.id);
        if (!agendamentos.length) {
          resposta = "Você não possui agendamentos ativos.";
        } else {
          resposta = "Escolha o agendamento para reagendar:\n\n";
          agendamentos.forEach((a, i) => {
            resposta += `${i + 1}. ${a.servico} em ${formatarData(
              a.dia_horario
            )}\n`;
          });
          resposta +=
            "\nResponda com o número do agendamento que deseja reagendar.";
          agendamentosPendentes.set(from, {
            clienteId: cliente.id,
            agendamentosAtivos: agendamentos,
            confirmationStep: "selecionar_reagendamento",
          });
        }
        break;
      }

      default:
        resposta = "Desculpe, não entendi sua mensagem. Poderia reformular?";
    }

    twiml.message(resposta);
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

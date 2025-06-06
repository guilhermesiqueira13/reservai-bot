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
const {
  formatarData,
  formatarHora,
  formatarDia,
  separarDiasPorSemana,
} = require("./utils/formatters");
const { normalizarServico, SERVICOS_VALIDOS } = require("./utils/intentHelper");
const { obterServicoPorNome } = require("./services/servicoService");
const { MessagingResponse } = require("twilio").twiml;

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const agendamentosPendentes = new Map();
const conversas = new Map();

app.post("/webhook", async (req, res) => {
  const msg = req.body.Body || req.body.text;
  const from = req.body.From || req.body.sessionId;
  const profileName = req.body.ProfileName || "Cliente";

  if (!msg || !from) {
    return res.status(400).send("Requisição inválida: Body ou From ausentes.");
  }

  const sessionId = from;
  const log = conversas.get(from) || [];
  log.push({ from: 'cliente', text: msg });
  conversas.set(from, log);
  let resposta = "";

  try {
    const cliente = await encontrarOuCriarCliente(from, profileName);
    const pendente = agendamentosPendentes.get(from);
    const twiml = new MessagingResponse();
    const sendReply = (texto) => {
      const conversa = conversas.get(from) || [];
      conversa.push({ from: 'bot', text: texto });
      conversas.set(from, conversa);
      console.log(`Fluxo da conversa (${from}):`);
      conversa.forEach((m) => {
        const autor = m.from === 'cliente' ? 'Cliente' : 'Bot';
        console.log(`${autor}: ${m.text}`);
      });
      twiml.message(texto);
      return res.type("text/xml").send(twiml.toString());
    };


    if (pendente) {
      switch (pendente.confirmationStep) {

        case "escolher_dia": {
          const textoDia = msg.trim().toLowerCase();
          if ((textoDia === "0" || textoDia === "mais") && pendente.diasFuturos && pendente.diasFuturos.length) {
            pendente.diasDisponiveis = pendente.diasFuturos;
            pendente.diasFuturos = [];
            agendamentosPendentes.set(from, pendente);
            resposta =
              "Datas futuras disponíveis:\n\n" +
              pendente.diasDisponiveis
                .map((d, i) => `${i + 1}. ${formatarDia(d)}`)
                .join("\n") +
              "\n\nResponda com o número do dia desejado.";
            return sendReply(resposta);
          }

          const indice = parseInt(textoDia, 10) - 1;
          if (!isNaN(indice) && pendente.diasDisponiveis && pendente.diasDisponiveis[indice]) {
            const dia = pendente.diasDisponiveis[indice];
            const horariosDia = pendente.todosHorarios.filter(
              (h) => new Date(h.dia_horario).toISOString().split("T")[0] === dia
            );
            pendente.horarios = horariosDia;
            pendente.diaEscolhido = dia;
            pendente.confirmationStep = "escolher_horario";
            agendamentosPendentes.set(from, pendente);
            resposta =
              `Horários disponíveis para *${formatarDia(dia)}*:\n\n` +
              horariosDia
                .map((h, i) => `${i + 1}. ${formatarHora(h.dia_horario)}`)
                .join("\n") +
              "\n\nResponda com o número do horário desejado.";
          } else {
            resposta = "Opção inválida. Escolha um dos dias informados.";
          }
          return sendReply(resposta);
        }
        case "escolher_horario": {
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
            resposta =
              `Podemos usar o nome *${cliente.nome}* para o agendamento?` +
              "\n1 - Sim" +
              "\n2 - Informar outro nome";
          } else {
            resposta = "Opção inválida. Envie o número do horário desejado.";
          }
          return sendReply(resposta);
        }

        case "selecionar_cancelamento": {
          const indice = parseInt(msg.trim(), 10) - 1;
          if (
            isNaN(indice) ||
            !pendente.agendamentosAtivos ||
            !pendente.agendamentosAtivos[indice]
          ) {
            resposta =
              "Opção inválida. Envie o número correspondente ao agendamento que deseja cancelar.";
          } else {
            const agendamento = pendente.agendamentosAtivos[indice];
            const resultado = await cancelarAgendamento(
              agendamento.id,
              pendente.clienteId
            );
            resposta = resultado.success
              ? `Agendamento de ${agendamento.servico} em ${formatarData(
                  agendamento.dia_horario
                )} cancelado com sucesso!`
              : resultado.message;
            agendamentosPendentes.delete(from);
          }
          return sendReply(resposta);
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
            return sendReply(resposta);
          }

          const agendamentoId = pendente.agendamentosAtivos[indice].id;
          const horarios = await buscarHorariosDisponiveis();

          if (!horarios.length) {
            resposta = "Nenhum horário disponível para reagendar.";
            agendamentosPendentes.delete(from);
            return sendReply(resposta);
          }

          const diasDisponiveis = Array.from(
            new Set(
              horarios.map((h) =>
                new Date(h.dia_horario).toISOString().split("T")[0]
              )
            )
          ).filter((d) => new Date(d).getDay() !== 0);

          const { diasSemana, diasFuturos } = separarDiasPorSemana(diasDisponiveis);

          resposta =
            "Escolha o novo dia:\n\n" +
            diasSemana.map((d, i) => `${i + 1}. ${formatarDia(d)}`).join("\n");

          if (diasFuturos.length) {
            resposta += "\n0. Ver mais datas";
          }

          agendamentosPendentes.set(from, {
            agendamentoId,
            todosHorarios: horarios,
            diasDisponiveis: diasSemana,
            diasFuturos,
            confirmationStep: "selecionar_novo_dia",
          });
          return sendReply(resposta);
        }

        case "selecionar_novo_dia": {
          const textoDia = msg.trim().toLowerCase();
          if ((textoDia === "0" || textoDia === "mais") && pendente.diasFuturos && pendente.diasFuturos.length) {
            pendente.diasDisponiveis = pendente.diasFuturos;
            pendente.diasFuturos = [];
            agendamentosPendentes.set(from, pendente);
            resposta =
              "Datas futuras disponíveis:\n\n" +
              pendente.diasDisponiveis
                .map((d, i) => `${i + 1}. ${formatarDia(d)}`)
                .join("\n") +
              "\n\nResponda com o número do dia desejado.";
            return sendReply(resposta);
          }

          const indice = parseInt(textoDia, 10) - 1;
          if (!isNaN(indice) && pendente.diasDisponiveis && pendente.diasDisponiveis[indice]) {
            const dia = pendente.diasDisponiveis[indice];
            const horariosDia = pendente.todosHorarios.filter(
              (h) => new Date(h.dia_horario).toISOString().split("T")[0] === dia
            );
            pendente.horarios = horariosDia;
            pendente.diaEscolhido = dia;
            pendente.confirmationStep = "selecionar_novo_horario";
            agendamentosPendentes.set(from, pendente);
            resposta =
              `Horários disponíveis para *${formatarDia(dia)}*:\n\n` +
              horariosDia
                .map((h, i) => `${i + 1}. ${formatarHora(h.dia_horario)}`)
                .join("\n") +
              "\n\nResponda com o número do horário desejado.";
          } else {
            resposta = "Opção inválida. Escolha um dos dias informados.";
          }
          return sendReply(resposta);
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
          return sendReply(resposta);
        }

        case "confirmar_nome": {
          const texto = msg.trim();
          if (/^(1|s|sim)$/i.test(texto)) {
            pendente.nomeConfirmado = cliente.nome;
            pendente.confirmationStep = "confirmar_agendamento";
          } else if (/^(2|n|nao|não)$/i.test(texto)) {
            pendente.confirmationStep = "informar_nome";
            resposta = "Qual nome devemos usar no agendamento?";
            agendamentosPendentes.set(from, pendente);
            return sendReply(resposta);
          } else {
            const nomeAtualizado = texto;
            await atualizarNomeCliente(cliente.id, nomeAtualizado);
            cliente.nome = nomeAtualizado;
            pendente.nomeConfirmado = nomeAtualizado;
            pendente.confirmationStep = "confirmar_agendamento";
          }
          agendamentosPendentes.set(from, pendente);
          resposta = `Confirma o agendamento de *${pendente.servicos.join(", ")}* para *${pendente.nomeConfirmado || cliente.nome}* em ${formatarData(
            pendente.horarioEscolhido.dia_horario
          )}?\n(1-Sim / 2-Não)`;
          return sendReply(resposta);
      }

        case "informar_nome": {
          const nomeAtualizado = msg.trim();
          await atualizarNomeCliente(cliente.id, nomeAtualizado);
          cliente.nome = nomeAtualizado;
          pendente.nomeConfirmado = nomeAtualizado;
          pendente.confirmationStep = "confirmar_agendamento";
          agendamentosPendentes.set(from, pendente);
          resposta = `Confirma o agendamento de *${pendente.servicos.join(", ")}* para *${pendente.nomeConfirmado}* em ${formatarData(
            pendente.horarioEscolhido.dia_horario
          )}?\n(1-Sim / 2-Não)`;
          return sendReply(resposta);
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
          return sendReply(resposta);
        }
      }
    }

    const [response] = await detectIntent(sessionId, msg);
    const intent = response.queryResult.intent?.displayName || "default";
    const parametros = response.queryResult.parameters?.fields || {};

    switch (intent) {
      case "welcome_intent":
        resposta =
          "Olá! Bem-vindo à barbearia. Qual serviço deseja agendar? (Corte, Barba ou Corte + Barba)";
        break;

      case "escolha_servico": {
        const servicoNome = parametros?.servico?.stringValue;
        if (!servicoNome) {
          resposta =
            "Por favor, informe um serviço válido: Corte, Barba ou Corte + Barba.";
          break;
        }

        const servicoNormalizado = normalizarServico(servicoNome);
        const servicoBase = SERVICOS_VALIDOS[servicoNormalizado];

        if (!servicoBase) {
          resposta = `Serviço '${servicoNome}' não encontrado.`;
          break;
        }

        const servico = await obterServicoPorNome(servicoBase);
        if (!servico) {
          resposta = `Serviço '${servicoBase}' não disponível no momento.`;
          break;
        }

        let agendamento = agendamentosPendentes.get(from) || {
          servicos: [],
          servicoIds: [],
          confirmationStep: "initial",
        };

        if (!agendamento.servicos.includes(servico.nome)) {
          agendamento.servicos.push(servico.nome);
          agendamento.servicoIds.push(servico.id);
        }
        const horarios = await buscarHorariosDisponiveis();

        if (!horarios || horarios.length === 0) {
          resposta = "Nenhum horário disponível no momento. Tente mais tarde.";
          break;
        }

        const diasDisponiveis = Array.from(
          new Set(
            horarios.map((h) =>
              new Date(h.dia_horario).toISOString().split("T")[0]
            )
          )
        ).filter((d) => new Date(d).getDay() !== 0);

        const { diasSemana, diasFuturos } = separarDiasPorSemana(diasDisponiveis);

        resposta =
          `Serviço escolhido: *${agendamento.servicos.join(", ")}*\n` +
          "Quando deseja agendar? Escolha a data:\n\n" +
          diasSemana.map((d, i) => `${i + 1}. ${formatarDia(d)}`).join("\n");

        if (diasFuturos.length) {
          resposta += "\n0. Ver mais datas";
        }

        agendamento.confirmationStep = "escolher_dia";
        agendamento.todosHorarios = horarios;
        agendamento.diasDisponiveis = diasSemana;
        agendamento.diasFuturos = diasFuturos;
        agendamentosPendentes.set(from, agendamento);
        break;
      }

        case "cancelar_agendamento": {
          const agendamentos = await listarAgendamentosAtivos(cliente.id);
          if (!agendamentos.length) {
            resposta = "Você não possui agendamentos ativos.";
          } else {
            resposta = "Escolha o agendamento que deseja cancelar:\n\n";
            agendamentos.forEach((a, i) => {
              resposta += `${i + 1}. ${a.servico} em ${formatarData(
                a.dia_horario
              )}\n`;
            });
            resposta += "\nEnvie o número correspondente.";
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
            resposta += "\nEnvie o número correspondente.";
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

    return sendReply(resposta);
  } catch (err) {
    console.error("Erro no webhook:", err);
    res.status(500).send("Erro interno do servidor.");
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

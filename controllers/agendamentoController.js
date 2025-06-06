const pool = require("../config/db");

async function buscarHorariosDisponiveis() {
  try {
    const [rows] = await pool.query(
      `SELECT id, dia_horario, dia_semana
       FROM horarios_disponiveis
       WHERE disponivel = TRUE
       AND dia_horario >= NOW()
       AND DAYOFWEEK(dia_horario) BETWEEN 2 AND 7
       ORDER BY dia_horario`
    );

    const vistos = new Set();
    const unicos = [];
    for (const r of rows) {
      const chave = new Date(r.dia_horario).getTime();
      if (!vistos.has(chave)) {
        vistos.add(chave);
        unicos.push(r);
      }
    }
    return unicos;
  } catch (error) {
    console.error("Erro ao buscar horários disponíveis:", error);
    throw new Error("Erro ao buscar horários disponíveis.");
  }
}

async function agendarServico(clienteId, horarioId, servicoIds) {
  const connection = await pool.getConnection();
  try {
    // Validar entradas
    if (!clienteId || !horarioId) {
      return { success: false, message: "Cliente ou horário inválido." };
    }
    if (!Array.isArray(servicoIds) || servicoIds.length === 0) {
      return { success: false, message: "Nenhum serviço selecionado." };
    }

    await connection.beginTransaction();

    // Verificar se o horário está disponível
    const [horario] = await connection.query(
      "SELECT disponivel FROM horarios_disponiveis WHERE id = ?",
      [horarioId]
    );
    if (!horario.length || !horario[0].disponivel) {
      await connection.rollback();
      return { success: false, message: "Horário indisponível." };
    }

    // Criar o agendamento
    const [result] = await connection.query(
      `INSERT INTO agendamentos (cliente_id, horario_id, status, data_agendamento)
       VALUES (?, ?, 'ativo', NOW())`,
      [clienteId, horarioId]
    );
    const agendamentoId = result.insertId;

    // Associar serviços ao agendamento
    for (const servicoId of servicoIds) {
      await connection.query(
        `INSERT INTO agendamentos_servicos (agendamento_id, servico_id)
         VALUES (?, ?)`,
        [agendamentoId, servicoId]
      );
    }

    // Marcar horário como indisponível
    await connection.query(
      "UPDATE horarios_disponiveis SET disponivel = FALSE WHERE id = ?",
      [horarioId]
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao agendar serviço:", error);
    return {
      success: false,
      message: "Ops, algo deu errado ao agendar. Tente novamente.",
    };
  } finally {
    connection.release();
  }
}

module.exports = { buscarHorariosDisponiveis, agendarServico };

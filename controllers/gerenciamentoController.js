// gerenciamentoController.js
const pool = require("../config/db");

async function cancelarAgendamento(agendamentoId, clienteId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT horario_id FROM agendamentos WHERE id = ? AND cliente_id = ? AND status = "ativo"',
      [agendamentoId, clienteId]
    );

    if (!rows.length) {
      await connection.rollback();
      return {
        success: false,
        message: "Agendamento não encontrado ou já cancelado.",
      };
    }

    await connection.query(
      'UPDATE agendamentos SET status = "cancelado" WHERE id = ? AND cliente_id = ?',
      [agendamentoId, clienteId]
    );

    await connection.query(
      "UPDATE horarios_disponiveis SET disponivel = TRUE WHERE id = ?",
      [rows[0].horario_id]
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error("Erro em cancelarAgendamento:", error);
    return {
      success: false,
      message: "Erro interno ao cancelar o agendamento.",
    };
  } finally {
    connection.release();
  }
}

// Resto do arquivo permanece igual
async function listarAgendamentosAtivos(clienteId) {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.horario_id, s.nome AS servico, h.dia_horario
       FROM agendamentos a
       JOIN agendamentos_servicos asv ON a.id = asv.agendamento_id
       JOIN servicos s ON asv.servico_id = s.id
       JOIN horarios_disponiveis h ON a.horario_id = h.id
       WHERE a.cliente_id = ? AND a.status = 'ativo'`,
      [clienteId]
    );
    return rows;
  } catch (error) {
    console.error("Erro ao listar agendamentos ativos:", error);
    throw new Error("Erro ao listar agendamentos ativos.");
  }
}

async function reagendarAgendamento(agendamentoId, novoHorarioId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [agendamento] = await connection.query(
      'SELECT horario_id FROM agendamentos WHERE id = ? AND status = "ativo"',
      [agendamentoId]
    );
    if (!agendamento.length) {
      await connection.rollback();
      return {
        success: false,
        message: "Agendamento não encontrado ou já cancelado.",
      };
    }

    const [novoHorario] = await connection.query(
      "SELECT disponivel FROM horarios_disponiveis WHERE id = ?",
      [novoHorarioId]
    );
    if (!novoHorario.length || !novoHorario[0].disponivel) {
      await connection.rollback();
      return { success: false, message: "Novo horário indisponível." };
    }

    await connection.query("UPDATE agendamentos SET horario_id = ? WHERE id = ?", [
      novoHorarioId,
      agendamentoId,
    ]);

    await connection.query(
      "UPDATE horarios_disponiveis SET disponivel = TRUE WHERE id = ?",
      [agendamento[0].horario_id]
    );

    await connection.query(
      "UPDATE horarios_disponiveis SET disponivel = FALSE WHERE id = ?",
      [novoHorarioId]
    );

    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao reagendar:", error);
    return {
      success: false,
      message: "Ops, algo deu errado ao reagendar. Tente novamente.",
    };
  } finally {
    connection.release();
  }
}

module.exports = {
  listarAgendamentosAtivos,
  cancelarAgendamento,
  reagendarAgendamento,
};

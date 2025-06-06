const pool = require('../config/db');

async function obterServicoPorNome(nome) {
  try {
    const [rows] = await pool.query(
      'SELECT id, nome FROM servicos WHERE nome = ? LIMIT 1',
      [nome]
    );
    return rows[0] || null;
  } catch (error) {
    console.error('Erro ao buscar serviço:', error);
    return null;
  }
}

module.exports = { obterServicoPorNome };

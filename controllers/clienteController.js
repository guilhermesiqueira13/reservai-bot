const pool = require("../config/db");

// Encontra ou cria um cliente no banco de dados.
// Se o cliente existir, ele é retornado. Se não, um novo é criado
// utilizando o nome fornecido (geralmente vindo do WhatsApp).
async function encontrarOuCriarCliente(telefone, profileName = "Cliente") {
  let client;
  try {
    client = await pool.getConnection();
    let [rows] = await client.query(
      "SELECT id, nome, telefone FROM clientes WHERE telefone = ?",
      [telefone]
    );

    let cliente;
    if (rows.length > 0) {
      cliente = rows[0];
    } else {
      // Cliente não encontrado, cria um novo
      const nomeParaSalvar = profileName || "Cliente"; // Usa profileName se existir, senão 'Cliente'
      const [result] = await client.query(
        "INSERT INTO clientes (nome, telefone) VALUES (?, ?)",
        [nomeParaSalvar, telefone]
      );
      cliente = {
        id: result.insertId,
        nome: nomeParaSalvar,
        telefone: telefone,
      };
      console.log(`Novo cliente criado: ${nomeParaSalvar}`);
    }
    return cliente;
  } catch (error) {
    console.error("Erro ao encontrar ou criar cliente:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

// Atualiza o nome de um cliente existente.
async function atualizarNomeCliente(clienteId, novoNome) {
  let client;

  try {
    client = await pool.getConnection();
    const [result] = await client.query(
      "UPDATE clientes SET nome = ? WHERE id = ?",
      [novoNome, clienteId]
    );
    if (result.affectedRows > 0) {
      console.log(`Nome do cliente ${clienteId} atualizado para: ${novoNome}`);
      // Retorna o cliente atualizado ou um sinal de sucesso
      const [updatedRows] = await client.query(
        "SELECT id, nome, telefone FROM clientes WHERE id = ?",
        [clienteId]
      );

      console.log(updatedRows);

      return updatedRows[0];
    }
    return null;
  } catch (error) {
    console.error("Erro ao atualizar nome do cliente:", error);
    throw error;
  } finally {
    if (client) client.release();
  }
}

module.exports = {
  encontrarOuCriarCliente,
  atualizarNomeCliente,
};

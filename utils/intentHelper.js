function normalizarServico(servicoNome) {
  return servicoNome
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[+&]/g, "e");
}

// Mapeia variações digitadas para o nome do serviço no banco
const SERVICOS_VALIDOS = {
  corte: "Corte",
  cortarcabelo: "Corte",
  barba: "Barba",
  fazerbarba: "Barba",
  cortebarba: "Corte + Barba",
  corteebarba: "Corte + Barba",
};

module.exports = {
  normalizarServico,
  SERVICOS_VALIDOS,
};

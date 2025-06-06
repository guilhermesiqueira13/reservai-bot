function normalizarServico(servicoNome) {
  return servicoNome.toLowerCase().replace(/\s+/g, "");
}

const SERVICOS_VALIDOS = {
  corte: { id: 1, nome: "Corte" },
  cortarcabelo: { id: 1, nome: "Corte" },
  barba: { id: 2, nome: "Barba" },
  fazerbarba: { id: 2, nome: "Barba" },
  sobrancelha: { id: 3, nome: "Sobrancelha" },
  fazersobrancelha: { id: 3, nome: "Sobrancelha" },
};

module.exports = {
  normalizarServico,
  SERVICOS_VALIDOS,
};

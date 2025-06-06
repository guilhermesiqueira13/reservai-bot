function formatarData(dia_horario) {
  const data = new Date(dia_horario);
  if (isNaN(data.getTime())) return "Data inválida";
  const options = {
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const formatted = new Intl.DateTimeFormat("pt-BR", options).format(data);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getDateFromWeekdayAndTime(diaSemanaStr, horaStr) {
  const diasDaSemana = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
  ];
  const diaSemanaIndex = diasDaSemana.findIndex((d) =>
    d.includes(diaSemanaStr.replace("-feira", ""))
  );
  if (diaSemanaIndex === -1) return null;

  const [hora, minuto = "00"] = horaStr.split(":");
  const hoje = new Date();
  let data = new Date(hoje);

  const diferencaDias = (diaSemanaIndex - hoje.getDay() + 7) % 7;
  data.setDate(hoje.getDate() + diferencaDias);
  data.setHours(parseInt(hora, 10), parseInt(minuto, 10), 0, 0);

  if (data < hoje && diferencaDias === 0) {
    data.setDate(data.getDate() + 7);
  }
  return data;
}

function encontrarHorarioProximo(horarioSolicitadoStr, horariosDisponiveis) {
  if (
    !horarioSolicitadoStr ||
    !horariosDisponiveis ||
    !horariosDisponiveis.length
  )
    return null;
  const solicitado = new Date(horarioSolicitadoStr);
  if (isNaN(solicitado.getTime())) return null;

  return horariosDisponiveis.reduce(
    (maisProximo, horario) => {
      const disponivel = new Date(horario.dia_horario);
      if (isNaN(disponivel.getTime())) return maisProximo;
      const diferenca = Math.abs(solicitado - disponivel);
      if (diferenca < maisProximo.diferenca) {
        return { horario, diferenca };
      }
      return maisProximo;
    },
    { horario: null, diferenca: Infinity }
  ).horario;
}

module.exports = {
  formatarData,
  getDateFromWeekdayAndTime,
  encontrarHorarioProximo,
};

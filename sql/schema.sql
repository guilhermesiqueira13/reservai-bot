DROP DATABASE IF EXISTS barbearia;
CREATE DATABASE barbearia;
USE barbearia;

-- Tabela de clientes
CREATE TABLE clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telefone VARCHAR(50) UNIQUE NOT NULL,
    nome VARCHAR(100) NOT NULL,
    verified_at DATETIME DEFAULT NULL
);

-- Tabela de serviços
CREATE TABLE servicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE,
    descricao TEXT,
    duracao TIME NOT NULL
);

-- Inserção de novos serviços
DELETE FROM servicos; -- Apaga os serviços antigos (opcional)

INSERT INTO servicos (nome, descricao, duracao) VALUES
('Corte', 'Corte masculino padrão', '00:30:00'),  -- 30 minutos
('Barba', 'Modelagem e aparo de barba', '00:30:00'),  -- 30 minutos
('Corte + Barba', 'Corte e modelagem de barba', '01:00:00');  -- 1 hora (Corte + Barba)

-- Tabela de horários disponíveis
CREATE TABLE horarios_disponiveis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dia_horario DATETIME NOT NULL,
    dia_semana VARCHAR(20) NOT NULL,
    disponivel BOOLEAN DEFAULT TRUE
);
CREATE INDEX idx_horarios_data ON horarios_disponiveis (dia_horario);

-- Tabela de agendamentos
CREATE TABLE agendamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT NOT NULL,
    horario_id INT NOT NULL,
    status ENUM('ativo', 'cancelado') DEFAULT 'ativo',
    data_agendamento DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    FOREIGN KEY (horario_id) REFERENCES horarios_disponiveis(id)
);
CREATE INDEX idx_agendamentos_cliente_status ON agendamentos (cliente_id, status);

-- Tabela de junção para múltiplos serviços por agendamento
CREATE TABLE agendamentos_servicos (
    agendamento_id INT NOT NULL,
    servico_id INT NOT NULL,
    PRIMARY KEY (agendamento_id, servico_id),
    FOREIGN KEY (agendamento_id) REFERENCES agendamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE CASCADE
);

-- Evento de criação automática de horários
DELIMITER $$

CREATE EVENT IF NOT EXISTS gerar_horarios_diarios
ON SCHEDULE EVERY 1 DAY
STARTS NOW()
DO
BEGIN
  DECLARE i INT DEFAULT 0;
  DECLARE data_base DATE DEFAULT CURDATE();
  DECLARE hora_inicio TIME;
  DECLARE duracao TIME;

  -- remove horários que já passaram
  DELETE FROM horarios_disponiveis
  WHERE dia_horario < CURDATE();

  -- gera os horários para os próximos 30 dias, de segunda a sábado
  WHILE i < 30 DO
    IF DAYOFWEEK(DATE_ADD(data_base, INTERVAL i DAY)) BETWEEN 2 AND 7 THEN
      -- horários de Corte e Barba (30 min)
      SET hora_inicio = '09:00:00';
      SET duracao = '00:30:00';

      WHILE hora_inicio < '18:00:00' DO
        INSERT INTO horarios_disponiveis (dia_horario, dia_semana, disponivel)
        VALUES (
          CONCAT(DATE_ADD(data_base, INTERVAL i DAY), ' ', hora_inicio),
          DAYNAME(DATE_ADD(data_base, INTERVAL i DAY)),
          TRUE
        );
        SET hora_inicio = ADDTIME(hora_inicio, duracao);
      END WHILE;

      -- horários para Corte + Barba (1 hora)
      SET hora_inicio = '09:00:00';
      SET duracao = '01:00:00';

      WHILE hora_inicio < '18:00:00' DO
        INSERT INTO horarios_disponiveis (dia_horario, dia_semana, disponivel)
        VALUES (
          CONCAT(DATE_ADD(data_base, INTERVAL i DAY), ' ', hora_inicio),
          DAYNAME(DATE_ADD(data_base, INTERVAL i DAY)),
          TRUE
        );
        SET hora_inicio = ADDTIME(hora_inicio, duracao);
      END WHILE;
    END IF;

    SET i = i + 1;
  END WHILE;
END$$
DELIMITER ;

import express from "express";
import cors from "cors";
import pkg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// SECRET do JWT
//const SECRET = process.env.JWT_SECRET;
const SECRET = "fhb085432uj67hetfvs2789f5432bnk5oiqvc529"

// conexão com o PostgreSQL
const pool = new Pool({
  //connectionString: process.env.DATABASE_URL,
  connectionString: "postgresql://postgres:deiYRuSStHtAOTBBhHLZvDVLjUAeHNwI@interchange.proxy.rlwy.net:21596/railway",
});

//Middleware de proteção de rotas
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).json({ error: "Token não fornecido" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" })
  }
}

// rota de inserção
app.post("/api/insert", authMiddleware, async (req, res) => {
  try {
    const { table, data } = req.body;

    if (!table || !data || typeof data !== "object") {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    const columns = Object.keys(data).join(", ");
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");

    const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;

    const result = await pool.query(query, values);
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Erro ao inserir:", err);
    res.status(500).json({ error: "Erro ao inserir no Banco de Dados" });
  }
});

//rota de inserção de envios
app.post("/api/envios", authMiddleware, async (req, res) => {
  try {
    const { id_model, arquivo } = req.body;

    if (!id_model || !arquivo) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes." });
    }

    // Converte base64 pra bytes
    const fileBuffer = Buffer.from(arquivo, "base64");

    // Insere na tabela envios
    const insertResult = await pool.query(
      "INSERT INTO envios (id_model, arquivo) VALUES ($1, $2) RETURNING id",
      [id_model, fileBuffer]
    );

    const id_envio = insertResult.rows[0].id;

    // Aguarda 5 segundos para o processamento ocorrer
    await new Promise((resolve) => setTimeout(resolve, 25000));

    // Busca na tabela processados
    const processadoResult = await pool.query(
      "SELECT * FROM processados WHERE id_envio = $1",
      [Number(id_envio)]
    );

    if (processadoResult.rows.length === 0) {
      return res.status(404).json({
        message: "Nenhum registro encontrado em 'processados' ainda.",
        id_envio,
      });
    }

    // Retorna o resultado em formato JSON
    res.status(200).json(processadoResult.rows[0]);

  } catch (err) {
    console.error("Erro ao salvar e buscar processado:", err);
    res.status(500).json({ error: "Erro ao salvar ou buscar dados." });
  }
});

// rota de fetch marcações
app.get("/api/fetch", authMiddleware, async (req, res) => {
  try {
    const { table, id_model } = req.query; // usa query params

    // Validação básica
    if (!table || !id_model) {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    // Tabelas permitidas
    const allowedTables = ['marcacoes', 'modelos', 'orders'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: "Nome de tabela inválido" });
    }

    // Query segura
    const query = `SELECT * FROM ${table} WHERE id_model = $1`;
    const result = await pool.query(query, [Number(id_model)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Erro no fetch:", err);
    res.status(500).json({ error: "Erro na aquisição dos dados" });
  }
});

// rota de fetch modelos
app.get("/api/models", authMiddleware, async (req, res) => {
  try {
    const { table } = req.query; // usa query params

    // Validação básica
    if (!table) {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    // Tabelas permitidas
    const allowedTables = ['marcacoes', 'modelos', 'usuarios'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: "Nome de tabela inválido" });
    }

    // Query segura
    const query = `SELECT * FROM ${table} WHERE ativo=true`;
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Erro no fetch:", err);
    res.status(500).json({ error: "Erro na aquisição dos dados" });
  }
});

// rota de fetch usuarios
app.get("/api/users", authMiddleware, async (req, res) => {
  try {
    // Query segura
    const query = `SELECT * FROM usuarios`;
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Erro no fetch:", err);
    res.status(500).json({ error: "Erro na aquisição dos dados" });
  }
});

// rota de fetch envios
app.get("/api/envios", authMiddleware, async (req, res) => {
  try {
    const query = `SELECT * FROM envios ORDER BY criacao DESC LIMIT 200`;
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Erro no fetch:", err);
    res.status(500).json({ error: "Erro na aquisição dos dados" });
  }
});

// rota de fetch modelo (específico)
app.get("/api/model/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    const query = `SELECT * FROM modelos WHERE id = $1`;
    const result = await pool.query(query, [Number(id)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Erro no fetch:", err);
    res.status(500).json({ error: "Erro na aquisição dos dados" });
  }
});

// rota de fetch processado (específico)
app.get("/api/processado/:id_envio", authMiddleware, async (req, res) => {
  try {
    const { id_envio } = req.params;

    // Validação básica
    if (!id_envio || isNaN(id_envio)) {
      return res.status(400).json({ error: "Requisição inválida: id_envio ausente ou não numérico." });
    }

    const query = "SELECT * FROM processados WHERE id_envio = $1";
    const result = await pool.query(query, [Number(id_envio)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado." });
    }

    return res.status(200).json(result.rows[0]);

  } catch (err) {
    console.error("Erro no fetch /processado:", err);
    return res.status(500).json({ error: "Erro interno ao adquirir dados." });
  }
});

//rota de delete
app.delete("/api/delete", authMiddleware, async (req, res) => {
  try {
    const { table, id } = req.query;

    // Validação básica
    if (!table || !id) {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    // Tabelas permitidas
    const allowedTables = ['marcacoes', 'modelos', 'usuarios'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: "Nome de tabela inválido" });
    }

    // Query segura usando prepared statement
    const query = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [Number(id)]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json({ message: "Registro deletado com sucesso", deleted: result.rows[0] });
  } catch (err) {
    console.error("Erro no delete:", err);
    res.status(500).json({ error: "Erro ao deletar registro" });
  }
});

//desativa um modelo
app.patch("/api/deactivate", authMiddleware, async (req, res) => {
  try {
    const { table, id } = req.query;

    // Validação básica
    if (!table || !id) {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    // Tabelas permitidas
    const allowedTables = ['marcacoes', 'modelos', 'orders'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: "Nome de tabela inválido" });
    }

    // Query segura usando prepared statement
    const query = `UPDATE ${table} SET ativo = false WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [Number(id)]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json({ message: "Registro desativado com sucesso", updated: result.rows[0] });
  } catch (err) {
    console.error("Erro no delete:", err);
    res.status(500).json({ error: "Erro ao desativar registro" });
  }
});

//atualiza um modelo
app.patch("/api/update/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { documento, modelo } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    const query = `
      UPDATE modelos
      SET documento = $1, modelo = $2
      WHERE id = $3
      RETURNING *;
    `;

    const result = await pool.query(query, [documento, modelo, Number(id)]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json({ message: "Registro atualizado com sucesso", updated: result.rows[0] });
  } catch (err) {
    console.error("Erro no update:", err);
    res.status(500).json({ error: "Erro ao atualizar registro" });
  }
});


//atualiza um referência de um modelo
app.patch("/api/reference/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { referencia } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Requisição inválida" });
    }

    const query = `
      UPDATE modelos
      SET referencia = $1
      WHERE id = $2
      RETURNING *;
    `;

    const result = await pool.query(query, [referencia, Number(id)]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    res.status(200).json({ message: "Registro atualizado com sucesso", updated: result.rows[0] });
  } catch (err) {
    console.error("Erro no update:", err);
    res.status(500).json({ error: "Erro ao atualizar registro" });
  }
});


//Rota de Registro de usuários
app.post("/api/register", authMiddleware, async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: "Preencha todos os campos" })
    }

    const hash = await bcrypt.hash(senha, 10);

    const result = await pool.query(
      "INSERT INTO usuarios (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, email", [nome, email, hash]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao registrar usuário" })
  }
})


//Rota de autenticação
app.post("/api/login", async (req, res) => {
  console.log("aqui")
  try {

    const { email, senha } = req.body;

    const result = await pool.query("SELECT * FROM usuarios WHERE email = $1", [email]);

    console.log(result)

    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Usuário não encontrado" })
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(senha, user.senha_hash);

    if (!match) {
      return res.status(401).json({ error: "Senha incorreta" })

    }

    const token = jwt.sign(
      { id: user.id, nome: user.nome, email: user.email },
      SECRET
    )

    res.json({ token });


  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao autenticar usuário" })
  }
})






// inicia o servidor
app.listen(5000, () =>
  console.log("Servidor rodando em http://localhost:5000")
);

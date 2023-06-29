import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import dayjs from "dayjs";

const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

mongoClient.connect()
    .then(() => db = mongoClient.db())
    .catch((err) => console.log(err.message));

app.post("/participants", async (req, res) => {
    const { name } = req.body;

    try {
        // se participante já existe na coleção, retorna erro
        const participant = await db.collection("participants").findOne({ name: name });
        if (participant) return res.status(409).send("Nome em uso!");

        // não exisitindo, insere participante na coleção
        await db.collection("participants").insertOne({ name, lastStatus: Date.now() });

        // insere mensagem de entrada na sala na coleção messages
        await db.collection("messages").insertOne(
            {
                from: name,
                to: 'Todos',
                text: 'entra na sala...',
                type: 'status',
                time: dayjs().format('HH:mm:ss')
            }
        );

        res.sendStatus(201);

    } catch (err) {
        res.status(500).send(err.message);
    }

});

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray();
        res.send(participants);

    } catch (err) {
        res.status(500).send(err.message);
    }
})

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
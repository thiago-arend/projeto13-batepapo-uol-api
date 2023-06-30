import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
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

    const nameSchema = joi.object({
        name: joi.string().min(1).required()
    });
    
    const validation = nameSchema.validate(req.body, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(det => det.message);
        return res.status(422).send(errors);
    }

    try {
        const participant = await db.collection("participants").findOne({ name: name }); // se participante já existe na sala/coleção, retorna erro
        if (participant) return res.status(409).send("Nome em uso!");

        await db.collection("participants").insertOne({ name, lastStatus: Date.now() }); // não exisitindo, insere participante na sala/coleção

        await db.collection("messages").insertOne( // insere mensagem de entrada na sala na coleção messages
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
});

// **************** finalizar com as mensagens personalizadas e validações *****************
/*
app.get("/messages", async(req, res) => {
    const { user } = req.headers;
    const { limit } = req.query;

    try {
        const messages = await db.collection("messages").find().toArray();
        res.send(messages);
    } catch(err) {

    }
});
*/

// **************** problema com o encoding *****************
app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const { user: from } = req.headers; // renomeia o atributo para 'from'
    console.log(from);

    try {
        const participant = await db.collection("participants").findOne({ name: from }); // se participante não existe na sala/coleção, retorna erro
        if (!participant) return res.sendStatus(422);

        await db.collection("messages").insertOne({ from, to, text, type, time: dayjs().format("HH:mm:ss") });

        res.sendStatus(201);

    } catch (err) {
        res.status(500).send(err.message);
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
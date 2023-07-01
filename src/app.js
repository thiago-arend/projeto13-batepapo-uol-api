import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

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

    const stpName = stripHtml(name).result.trim();

    try {
        const participant = await db.collection("participants").findOne({ name: stpName }); // se participante já existe na sala/coleção, retorna erro
        if (participant) return res.status(409).send("Nome em uso!");

        await db.collection("participants").insertOne({ name: stpName, lastStatus: Date.now() }); // não exisitindo, insere participante na sala/coleção

        await db.collection("messages").insertOne( // insere mensagem de entrada na sala na coleção messages
            {
                from: stpName,
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

app.get("/messages", async (req, res) => {
    const { user } = req.headers;
    const { limit } = req.query;

    const criterio = {
        $or: [
            { type: "message" },
            { to: "Todos" },
            { $and: [{ type: "private_message" }, { to: user }] },
            { $and: [{ type: "private_message" }, { from: user }] }
        ]
    }

    const limitSchema = joi.object({
        limit: joi.number().integer().min(1)
    });

    const validation = limitSchema.validate(req.query, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(det => det.message);
        return res.status(422).send(errors);
    }

    try {
        let messages;
        if (limit)
            messages = await db.collection("messages").find(criterio).sort({ $natural: -1 }).limit(parseInt(limit)).toArray();
        else
            messages = await db.collection("messages").find(criterio).sort({ $natural: -1 }).toArray();
        res.send(messages);

    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const { user: from } = req.headers; // renomeia o atributo para 'from'

    if (!from) return res.sendStatus(422);

    const messageSchema = joi.object({
        to: joi.string().min(1).required(),
        text: joi.string().min(1).required(),
        type: joi.any().valid("message", "private_message").required()
    });

    const messageObject = { to, text, type };
    const validation = messageSchema.validate(messageObject, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(det => det.message);
        return res.status(422).send(errors);
    }

    const arrayToStrip = [from, to, text, type];
    const [stpFrom, stpTo, stpText, stpType] = arrayToStrip.map(e => stripHtml(e).result.trim());
    const validMessageObject = { to: stpTo, text: stpText, type: stpType };

    try {
        const participant = await db.collection("participants").findOne({ name: stpFrom }); // se participante não existe na sala/coleção, retorna erro
        if (!participant) return res.sendStatus(422);

        await db.collection("messages").insertOne(
            { from: stpFrom, ...validMessageObject, time: dayjs().format("HH:mm:ss") });

        res.sendStatus(201);

    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete("/messages/:id", async (req, res) => {
    const { id } = req.params;
    const { user } = req.headers;

    try {
        const msgExists = await db.collection("messages").findOne({ _id: new ObjectId(id) });
        if (!msgExists) return res.sendStatus(404); // mensagem inexistente
        const correctSender = await db.collection("messages").deleteOne({ _id: new ObjectId(id) }, { from: user });
        if (correctSender.deletedCount === 0) return res.sendStatus(401); // se não conseguiu deletar, mensagem não pertence ao usuário
        res.sendStatus(200); // sucesso
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put("/messages/:id", async (req, res) => {
    const { to, text, type } = req.body;
    const { user: from } = req.headers; // renomeia o atributo para 'from'
    const { id } = req.params;

    if (!from) return res.sendStatus(422);

    const messageSchema = joi.object({
        to: joi.string().min(1).required(),
        text: joi.string().min(1).required(),
        type: joi.any().valid("message", "private_message").required()
    });

    const messageObject = { to, text, type };
    const validation = messageSchema.validate(messageObject, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(det => det.message);
        return res.status(422).send(errors);
    }

    const arrayToStrip = [from, to, text, type];
    const [stpFrom, stpTo, stpText, stpType] = arrayToStrip.map(e => stripHtml(e).result.trim());
    const validMessageObject = { to: stpTo, text: stpText, type: stpType };

    try {
        const participant = await db.collection("participants").findOne({ name: stpFrom }); // se participante não existe na sala/coleção, retorna erro
        if (!participant) return res.sendStatus(422);

        const msgExists = await db.collection("messages").findOne({_id: new ObjectId(id)});
        if (!msgExists) return res.sendStatus(404);
        const updateSucess = await db.collection("messages").updateOne({$and: [{_id: new ObjectId(id)}, {from: from}]}, {$set: validMessageObject});
        if (updateSucess.matchedCount === 0) return res.sendStatus(401);

    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post("/status", async (req, res) => {
    const { user: name } = req.headers; // renomeia o atributo para 'name'

    const nameSchema = joi.object({
        name: joi.string().min(1).required()
    });

    const validation = nameSchema.validate({ name }, { abortEarly: false });
    if (validation.error) {
        const errors = validation.error.details.map(det => det.message);
        return res.status(404).send(errors);
    }

    const stpName = stripHtml(name).result.trim();

    try {
        const update = await db.collection("participants").updateOne({ name: stpName }, { $set: { lastStatus: Date.now() } });
        if (update.matchedCount === 0) return res.sendStatus(404);

        res.sendStatus(200);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// remoção dos usuarios inativos
const INTERVAL_TIME = 15000;
const MAX_TIME = 10000;
setInterval(async () => {
    const nowTimestamp = Date.now();

    try {
        const inativeUsers = await db.collection("participants").find({ lastStatus: { $lt: nowTimestamp - MAX_TIME } }).toArray();
        const messages = inativeUsers.map((u) => {
            return {
                from: u.name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time: dayjs().format("HH:mm:ss")
            };
        });

        await db.collection("participants").deleteMany({ lastStatus: { $lt: nowTimestamp - MAX_TIME } });
        await db.collection("messages").insertMany(messages);

    } catch (err) {
        console.log(err.message);
    }

}, INTERVAL_TIME);

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
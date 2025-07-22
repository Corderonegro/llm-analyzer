
const express = require("express");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/analyze", async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: "URL requerida" });
    }

    try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        const llmTxtUrl = new URL("/llm.txt", url).href;
        const llmTxtRes = await fetch(llmTxtUrl);
        const llmTxt = llmTxtRes.ok;

        const faqSchema = $('script[type="application/ld+json"]')
            .toArray()
            .some(el => {
                try {
                    const json = JSON.parse($(el).html());
                    return json["@type"] === "FAQPage" || (Array.isArray(json) && json.some(j => j["@type"] === "FAQPage"));
                } catch {
                    return false;
                }
            });

        const author = $("meta[name='author']").attr("content") ||
                       $("meta[property='article:author']").attr("content") ||
                       $("a[rel='author']").length > 0;

        const domain = new URL(url).hostname.replace(/^www\./, "");
        const wikidataRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${domain}&language=es&format=json`);
        const wikidataJson = await wikidataRes.json();
        const wikidata = wikidataJson.search && wikidataJson.search.length > 0;

        res.json({
            llmTxt,
            faqSchema,
            author,
            wikidata,
            score: calcularScore({ llmTxt, faqSchema, author, wikidata }),
            optimizations: calcularOptimizaciones({ llmTxt, faqSchema, author, wikidata })
        });
    } catch (err) {
        res.status(500).json({ error: "Error al analizar el sitio." });
    }
});

function calcularScore(data) {
    let score = 100;
    if (!data.llmTxt) score -= 20;
    if (!data.faqSchema) score -= 15;
    if (!data.author) score -= 25;
    if (!data.wikidata) score -= 10;
    return Math.max(0, score);
}

function calcularOptimizaciones(data) {
    let count = 0;
    if (!data.llmTxt) count++;
    if (!data.faqSchema) count++;
    if (!data.author) count++;
    if (!data.wikidata) count++;
    return count;
}

app.listen(3000, () => console.log("Servidor LLM Analyzer escuchando en puerto 3000"));

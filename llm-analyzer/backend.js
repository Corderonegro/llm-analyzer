
// Written by Corderonegro.be with friendly Ia help
// fran@corderonegro.be
// backend.js - Backend Express para analizar sitios web con IA-friendly checks

const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Helper para detectar schema FAQ
function detectFAQSchema(html) {
    try {
        const $ = cheerio.load(html);
        let found = false;
        $('script[type="application/ld+json"]').each((i, el) => {
            const content = $(el).html();
            if (content.includes('"@type":"FAQPage"')) found = true;
        });
        return found;
    } catch (e) {
        return false;
    }
}

// Helper para detectar meta author o etiquetas author
function detectAuthor(html) {
    const lower = html.toLowerCase();
    return lower.includes('meta name="author"') || lower.includes('<author') || lower.includes('rel="author"');
}

// Verificación de WikiData
async function checkWikidata(domain) {
    const query = `
        SELECT ?item WHERE {
          ?item wdt:P856 ?website .
          FILTER(CONTAINS(STR(?website), "${domain}"))
        } LIMIT 1
    `;
    const url = 'https://query.wikidata.org/sparql?query=' + encodeURIComponent(query) + '&format=json';
    try {
        const res = await fetch(url);
        const json = await res.json();
        return json.results.bindings.length > 0;
    } catch {
        return false;
    }
}

// Endpoint principal
app.get('/analyze', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'URL es requerida' });

    try {
        const response = await fetch(targetUrl);
        const html = await response.text();
        const domain = new URL(targetUrl).hostname;

        // Intentamos encontrar llm.txt
        const llmTxtResponse = await fetch(targetUrl.replace(/\/$/, '') + '/llm.txt');
        const llmTxtFound = llmTxtResponse.status === 200;

        const faq = detectFAQSchema(html);
        const author = detectAuthor(html);
        const wikidata = await checkWikidata(domain);

        res.json({
            url: targetUrl,
            llmTxt: llmTxtFound,
            faqSchema: faq,
            author,
            wikidata
        });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo analizar el sitio', detail: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🔍 LLM Analyzer backend activo en http://localhost:${PORT}`);
});

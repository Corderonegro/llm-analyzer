// Written by Corderonegro.be with friendly IA help
// fran@corderonegro.be

const express = require('express');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Helpers mejorados para JSON-LD y detección de Wikipedia/Wikidata

function parseJsonLD(html) {
    const $ = cheerio.load(html);
    const jsonldBlocks = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const json = JSON.parse($(el).html());
            if (Array.isArray(json)) {
                jsonldBlocks.push(...json);
            } else {
                jsonldBlocks.push(json);
            }
        } catch (e) {
            // ignorar errores de parsing
        }
    });
    return jsonldBlocks;
}

function detectFAQSchema(html) {
    const blocks = parseJsonLD(html);
    return blocks.some(block => block['@type'] === 'FAQPage');
}

function detectAuthor(html) {
    const blocks = parseJsonLD(html);
    return blocks.some(block =>
        block.author && (
            typeof block.author === 'object' ||
            (Array.isArray(block.author) && block.author.length > 0)
        )
    );
}

function detectWikipediaOrWikidataLink(html) {
    const blocks = parseJsonLD(html);
    for (const block of blocks) {
        const sameAs = block.sameAs;
        if (typeof sameAs === 'string') {
            if (sameAs.includes('wikidata.org') || sameAs.includes('wikipedia.org')) {
                return true;
            }
        }
        if (Array.isArray(sameAs)) {
            if (sameAs.some(url => url.includes('wikidata.org') || url.includes('wikipedia.org'))) {
                return true;
            }
        }
    }
    return false;
}

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
        const hasWikiLink = detectWikipediaOrWikidataLink(html);
        const wikidata = hasWikiLink || await checkWikidata(domain);

        const result = {
            url: targetUrl,
            llmTxt: llmTxtFound,
            faqSchema: faq,
            author,
            wikidata,
            score: calcularScore({ llmTxt: llmTxtFound, faqSchema: faq, author, wikidata }),
            optimizations: calcularOptimizaciones({ llmTxt: llmTxtFound, faqSchema: faq, author, wikidata })
        };

        console.log(result); // Log para debugging
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'No se pudo analizar el sitio', detail: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🔍 LLM Analyzer backend activo en http://localhost:${PORT}`);
});

// Score y optimizaciones
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

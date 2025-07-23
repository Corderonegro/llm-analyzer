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

ffunction detectAuthor(html) {
    const blocks = parseJsonLD(html);

    return blocks.some(block => {
        // Caso clásico: author explícito
        if (block.author) {
            const author = block.author;
            if (typeof author === 'object') return true;
            if (Array.isArray(author) && author.length > 0) return true;
        }

        // E-A-T ampliado: otros campos posibles
        if (block.creator && typeof block.creator === 'object') return true;
        if (block.publisher && typeof block.publisher === 'object') return true;

        // Bloque suelto del tipo Person
        if (block['@type']) {
            const type = Array.isArray(block['@type']) ? block['@type'] : [block['@type']];
            if (type.includes("Person")) return true;
        }

        return false;
    });
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

function detectOpenStreetMap(html) {
    return html.includes('openstreetmap.org') || html.includes('leaflet') || html.includes('schema.org/Place') || html.includes('schema.org/PostalAddress');
}

function detectTechnicalLLMChecks(html) {
    const $ = cheerio.load(html);
    const hasMetaDescription = $('meta[name="description"]').length > 0;
    const hasSemanticTags = $('article, section, main, header').length > 0;
    const hasLang = $('html[lang]').length > 0;
    return hasMetaDescription && hasSemanticTags && hasLang;
}

function isValidUrl(url) {
    try {
        const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
        return parsed.hostname.includes('.');
    } catch {
        return false;
    }
}

// Endpoint principal
app.get('/analyze', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || !isValidUrl(targetUrl)) {
        return res.status(400).json({ error: 'URL inválida' });
    }

    let normalizedUrl = targetUrl.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
        const response = await fetch(normalizedUrl);
        const html = await response.text();
        const domain = new URL(normalizedUrl).hostname;

        const llmTxtResponse = await fetch(normalizedUrl.replace(/\/$/, '') + '/llm.txt');
        const llmTxtFound = llmTxtResponse.status === 200;

        const faq = detectFAQSchema(html);
        const author = detectAuthor(html);
        const hasWikiLink = detectWikipediaOrWikidataLink(html);
        const wikidata = hasWikiLink || await checkWikidata(domain);
        const openstreet = detectOpenStreetMap(html);
        const llmTech = detectTechnicalLLMChecks(html);

        const result = {
            url: normalizedUrl,
            llmTxt: llmTxtFound,
            faqSchema: faq,
            author,
            wikidata,
            openstreet,
            llmTech,
            score: calcularScore({ llmTxt: llmTxtFound, faqSchema: faq, author, wikidata, openstreet, llmTech }),
            optimizations: calcularOptimizaciones({ llmTxt: llmTxtFound, faqSchema: faq, author, wikidata, openstreet, llmTech })
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
    if (!data.llmTxt) score -= 25;
    if (!data.faqSchema) score -= 18;
    if (!data.author) score -= 20;
    if (!data.wikidata) score -= 15;
    if (!data.openstreet) score -= 10;
    if (!data.llmTech) score -= 12;
    return Math.max(0, score);
}

function calcularOptimizaciones(data) {
    let count = 0;
    if (!data.llmTxt) count++;
    if (!data.faqSchema) count++;
    if (!data.author) count++;
    if (!data.wikidata) count++;
    if (!data.openstreet) count++;
    if (!data.llmTech) count++;
    return count;
}

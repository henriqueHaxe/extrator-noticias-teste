const express = require('express');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

// Automatic local .env loader fallback for local development
if (!process.env.GEMINI_API_KEY && fs.existsSync('.env')) {
  try {
    const envContent = fs.readFileSync('.env', 'utf-8');
    const lines = envContent.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (key) {
          process.env[key] = value;
        }
      }
    }
    console.log('Arquivo .env carregado localmente com sucesso.');
  } catch (e) {
    console.error('Erro ao ler o arquivo .env:', e);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Read Gemini API Key from environment variables (important for security on public repos)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Optimized HTML cleaning function to drastically reduce tokens
function cleanHTML(html) {
  if (!html) return '';
  
  // 1. Remove HTML comments
  let clean = html.replace(/<!--[\s\S]*?-->/g, '');
  
  // 2. Remove scripts, styles, navigation, headers, footers and typical ad elements
  clean = clean.replace(/<(script|style|noscript|iframe|header|footer|nav|aside)[^>]*>([\s\S]*?)<\/\1>/gi, '');
  
  // 3. Remove other HTML tags but replace with newlines to keep text lines separated
  clean = clean.replace(/<[^>]+>/g, '\n');
  
  // 4. Resolve common HTML entities
  clean = clean
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'");

  // 5. Split by line and filter out short lines, ads, cookies and social sharing boilerplate
  const lines = clean.split('\n');
  const filteredLines = [];
  
  const boilerplatePatterns = [
    /compartilhe/i,
    /compartilhar/i,
    /politica de privacidade/i,
    /política de privacidade/i,
    /termos de uso/i,
    /todos os direitos reservados/i,
    /leia também/i,
    /leia mais/i,
    /veja também/i,
    /veja mais/i,
    /inscreva-se/i,
    /cadastre-se/i,
    /cookie/i,
    /aceitar e continuar/i,
    /enviar por e-mail/i,
    /redes sociais/i,
    /fale conosco/i,
    /anuncie conosco/i
  ];

  for (let line of lines) {
    line = line.trim().replace(/\s+/g, ' ');
    if (line.length < 5) continue; // Skip single words, page buttons, short tag elements
    
    const isBoilerplate = boilerplatePatterns.some(pattern => pattern.test(line));
    if (!isBoilerplate) {
      filteredLines.push(line);
    }
  }

  // Join back using newline character
  return filteredLines.join('\n');
}

// POST endpoint to receive URL and extract clean text using Gemini
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL é obrigatória' });
  }

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Chave API não configurada. Por favor, defina a variável de ambiente GEMINI_API_KEY no servidor.' });
  }

  const startTime = Date.now();

  try {
    console.log(`Buscando conteúdo de: ${url}`);
    
    // Fetch target URL content
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Falha ao carregar a página: Status ${response.status}`);
    }

    const html = await response.text();
    
    // Attempt semantic article extraction using Mozilla Readability
    let cleanedText = '';
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (article && article.textContent) {
        cleanedText = article.textContent.trim().replace(/\s+/g, ' ');
        console.log('Extração semântica com Readability concluída com sucesso.');
      }
    } catch (e) {
      console.error('Falha ao usar o extrator de legibilidade, usando fallback:', e);
    }

    // Fallback to basic HTML regex cleanup if Readability returns empty
    if (!cleanedText) {
      cleanedText = cleanHTML(html);
      console.log('Usando fallback de limpeza de HTML padrão.');
    }

    if (!cleanedText) {
      throw new Error('Nenhum texto pôde ser extraído da página.');
    }

    // Truncate text to 20,000 characters to optimize tokens on long pages
    const truncatedText = cleanedText.substring(0, 20000);

    console.log('Enviando conteúdo para o Gemini API...');

    // Call Gemini 3.1 Flash Lite API (more efficient for free tier)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Você é um extrator de notícias profissional e especialista em limpeza de dados. 
Abaixo está o conteúdo de texto bruto extraído de um site de notícias. Sua tarefa é extrair APENAS a notícia principal, retornando-a de forma limpa, estruturada e perfeitamente legível.

Regras:
1. Extraia o Título principal e coloque-o em destaque no início.
2. Extraia o corpo principal do artigo de notícias, mantendo os parágrafos corretos e a ordem cronológica dos fatos.
3. Se houver informações relevantes como autor, data de publicação ou nome do portal, inclua de forma discreta no início ou fim.
4. Ignore completamente: propagandas, links patrocinados, menus de navegação, caixas de comentários, links de redes sociais, rodapés e textos secundários do site.
5. Retorne APENAS a notícia limpa em formato Markdown. Não adicione introduções ou explicações suas (como "Aqui está a notícia extraída:").

Conteúdo extraído do site:
---
${truncatedText}
---`
              }
            ]
          }
        ]
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({}));
      console.error('Erro da API do Gemini:', errorData);
      throw new Error(errorData.error?.message || 'Falha ao processar texto com a IA');
    }

    const geminiData = await geminiResponse.json();
    const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!extractedText) {
      throw new Error('A IA não retornou nenhum texto.');
    }

    const durationMs = Date.now() - startTime;
    const usage = geminiData.usageMetadata || {};

    res.json({
      text: extractedText,
      metrics: {
        durationMs,
        promptTokens: usage.promptTokenCount || 0,
        candidatesTokens: usage.candidatesTokenCount || 0,
        totalTokens: usage.totalTokenCount || 0
      }
    });

  } catch (error) {
    console.error('Erro no processamento:', error);
    res.status(500).json({ error: error.message || 'Erro interno no servidor' });
  }
});

// Serve frontend SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

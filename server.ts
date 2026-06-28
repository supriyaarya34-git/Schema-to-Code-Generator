import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';
const PORT = 3000;

async function createServer() {
  const app = express();
  app.use(express.json());

  // Shared Gemini client
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  // API endpoint for AI customization
  app.post('/api/customize', async (req, res) => {
    try {
      const { schema, prompt, fileType } = req.body;
      if (!schema) {
        return res.status(400).json({ error: 'Schema is required' });
      }

      const systemPrompt = `You are an expert database administrator and backend developer.
You help customize database-related code templates.
The user will provide:
1. A SQL database table schema.
2. A customization prompt (e.g., "make soft delete hard delete", "add a description parameter", "use PostgreSQL style").
3. The specific file type they want to customize ("sp", "xml", "datamanager", "model").

Based on the provided customization request, you must output the exact customized code.
CRITICAL: Output ONLY the source code itself. Do NOT wrap it in Markdown code blocks (do not include \`\`\`sql or similar backticks). Do NOT add explanatory text or preamble. Return the plain source code directly so the user can copy it.`;

      const contents = `Table Schema:
${schema}

File Type requested: ${fileType}

Customization Request:
${prompt}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
        },
      });

      res.json({ code: response.text || '' });
    } catch (error: any) {
      console.error('Gemini customizer error:', error);
      res.status(500).json({ error: error.message || 'Failed to customize code' });
    }
  });

  if (!isProd) {
    // In development, import vite and run as middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve built static files
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

createServer();

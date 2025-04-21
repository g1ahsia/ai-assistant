import express from 'express';
import cors from 'cors';
import { generateResponse } from './chatbotClient.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/chat', async (req, res) => {
  try {
    const { query } = req.body; // User input from the front-end
    const response = await generateResponse(query, 'multilingual-e5-large');
    res.json({ response });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

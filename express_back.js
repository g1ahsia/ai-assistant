import fs from 'fs';
import https from 'https';
import express from 'express';
import cors from 'cors';
import { generateResponse } from './chatbotClient.js';
import multer from 'multer';
import bodyParser from 'body-parser';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';


const pc = new Pinecone({
  apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
});

const app = express();
const PORT = 3000;
const indexName = 'the-transmission-of-the-dhamma-2018';
const model = 'multilingual-e5-large';

const allowedOrigins = ['https://g1ahsia.github.io', 'https://www.pannamitta.com', 'https://api.pannamitta.com'];

const upload = multer({ dest: 'uploads/' });

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

const options = {
  key: fs.readFileSync('/etc/ssl/privkey1.pem'), // Adjust path to your private key
  cert: fs.readFileSync('/etc/ssl/fullchain1.pem'), // Adjust path to your certificate
};

app.use(cors(corsOptions));  // Enable CORS with specific options
app.use(express.json());

app.post('/chat', async (req, res) => {
  try {
    const { query } = req.body; // User input from the front-end
    console.log('user query is ', query);
    const response = await generateResponse(query, 'multilingual-e5-large');
    res.json({ response });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/upload', upload.single('file'), (req, res) => {
  let filenameWithoutExtension = req.file.originalname.replace('.txt', '');
  console.log('Uploaded File:', req.file);
  console.log('Filename:', filenameWithoutExtension);  // Print the original filename

  let jsonData = {
    sections: []
  };

  let currentSection = {
    text: "",
    id: ""
  };

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  // Proceed to read the file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error reading file.' });
    }

    const parsedContent = data.split(/[\n\t]+/);  // Split by both newline and tab characters

    const concatenatedString = parsedContent.join(' '); // Join with a space between strings


    console.log('concatenatedString:', concatenatedString); // Log file content to check

    currentSection.id = filenameWithoutExtension;
    currentSection.text = concatenatedString;

    jsonData.sections.push(currentSection);


    embed(jsonData.sections);

    // Clean up the uploaded file
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    });

    res.json({ message: 'File successfully uploaded and parsed.', parsedContent });
  });
});

async function embed(data) {
  console.log('1. ', data);  // Now `data` will be the parsed JSON output

  // Batch the data into smaller chunks

  const embeddings = await pc.inference.embed(
    model,
    data.map(d => d.text),  // Use data here
    { inputType: 'passage', truncate: 'END' }
  );

  console.log('2. embedding ', embeddings[0]);

  const index = pc.index(indexName);

  const vectors = data.map((d, i) => ({
    id: d.id,
    values: embeddings[i].values,
    metadata: { text: d.text }
  }));

  await index.namespace('ns1').upsert(vectors);

  const stats = await index.describeIndexStats();

  console.log('3. index ', stats)


}

// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });


// Start the HTTPS server
https.createServer(options, app).listen(PORT, () => {
  console.log(`Server running securely on https://api.pannamitta.com:${PORT}/get`);
});

app.get('/get', async (req, res) => {
  try {
    // Simulate async operation (e.g., database fetch, etc.)
    const message = 'Express server is running and this route works!';
    
    // Send response
    res.status(200).json({ message });
  } catch (error) {
    res.status(500).json({ error: 'An error occurred!' });
  }
});

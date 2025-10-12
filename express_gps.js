import fs from 'fs';
import https from 'https';
import express from 'express';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from 'cors';
import dotenv from "dotenv";
import { generateResponse } from './chatbotClient_gps.js';
import multer from 'multer';
import bodyParser from 'body-parser';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import parseOfficeFile from "./officeParser.js";

const users = []; // Store users in-memory (use DB in production)
const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";

const pc = new Pinecone({
  apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
});

dotenv.config();
const app = express();
const PORT = 3001;
const indexName = 'gps';
const model = 'multilingual-e5-large';
const MAX_METADATA_SIZE = 40960; // Maximum allowed metadata size (in bytes)

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


// 📌 User Registration
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  console.log('username: ', username);
  console.log('email: ', email);
  console.log('password: ', password);

  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required!" });
  }

  // Additional validation: Check username length
  if (password.length < 3) {
    return res.status(400).json({ error: "password must be at least 3 characters long" });
  }

  console.log('Registered successfully');

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, email, password: hashedPassword });
  res.json({ message: "User registered successfully" });
});

// 📌 User Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log('email: ', email);
  console.log('password: ', password);
  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required!" });
  }

  const user = users.find((u) => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  console.log('Logged in successfully');
  const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: "1h" });
  res.json({ token });
});

// 📌 Protect Upload Endpoint
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

function splitTextIntoChunks(text, maxSize) {
    const chunks = [];
    let currentChunk = '';

    // console.log('splitting text: ', maxSize);
    text.split(' ').forEach(word => {
        // console.log('buffer length: ', Buffer.byteLength(currentChunk + ' ' + word, 'utf-8'));
        if (Buffer.byteLength(currentChunk + ' ' + word, 'utf-8') > maxSize) {
            chunks.push(currentChunk.trim());
            currentChunk = word; // Start a new chunk with the current word
        } else {
            currentChunk += ' ' + word;
        }
    });

    if (currentChunk) {
        chunks.push(currentChunk.trim()); // Add remaining chunk
    }

    return chunks;
}

// app.post('/embed-text', authenticate, async (req, res) => {
app.post('/embed-text', async (req, res) => {
  try {
    const { uuid, text } = req.body;

    // Check if UUID and text are provided
    if (!uuid || !text) {
      return res.status(400).json({ error: "UUID and text are required!" });
    }

    console.log('Received UUID:', uuid);
    console.log('Received text:', text);

    let jsonData = {
      sections: []
    };

    let currentSection = {
      text: "",
      id: ""
    };

    currentSection.id = uuid;
    currentSection.text = text;

    jsonData.sections.push(currentSection);

    upsertVector(jsonData.sections);

    // Send success response
    res.json({ message: `Vector with with UUID ${uuid} successfully embedded and stored in Pinecone!` });

  } catch (error) {
    console.error('Error embedding text:', error);
    res.status(500).json({ error: 'Failed to embed and store text in Pinecone' });
  }
});

app.post('/delete-vector', async (req, res) => {
  try {
    const { uuid } = req.body;

    // Check if UUID is provided
    if (!uuid) {
      return res.status(400).json({ error: "UUID is required!" });
    }

    removeVector(uuid);

    res.json({ message: `Vector with UUID ${uuid} deleted successfully` });
  } catch (error) {
    console.error('Error deleting vector:', error);
    res.status(500).json({ error: 'Failed to delete vector from Pinecone' });
  }
});



app.post('/upload', authenticate, upload.single('file'), (req, res) => {
  // let filenameWithoutExtension = req.file.originalname.replace('.txt', '');
  console.log('Uploaded File:', req.file);
  // console.log('Filename:', filenameWithoutExtension);  // Print the original filename

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

  let fileExtension = path.extname(req.file.originalname); // Get original file extension
  // let filePath = `${req.file.path}${fileExtension}`; 

  const filePath = req.file.path;
  const tempFilePath = `${req.file.path}${fileExtension}`;
  fs.copyFileSync(filePath, tempFilePath);


  console.log('tempFilePath: ', tempFilePath);

  parseOfficeFile(tempFilePath)
  .then((data) => {
    // console.log("Extracted Text:", data);

    currentSection.id = filePath;
    currentSection.text = data;

    jsonData.sections.push(currentSection);

    embed(jsonData.sections);

    // Clean up the uploaded file
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    });

    res.json({ message: 'File successfully uploaded and parsed.'});

  })
  .catch((err) => {
    console.error("Error Parsing File:", err);
  });
});

app.post('/chat', async (req, res) => {
  try {
    const { query, memory } = req.body; // User input from the front-end
    console.log('user query is ', query);
    const response = await generateResponse(query, 'multilingual-e5-large', memory);
    res.json({ response });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


async function upsertVector(data) {
  // Batch the data into smaller chunks

  console.log('upserting vector ', data);
  const embeddings = await pc.inference.embed(
    model,
    data.map(d => d.text),  // Use data here
    { inputType: 'passage', truncate: 'END' }
  );

  const index = pc.index(indexName);

  // 3/29/2025 Version Without Spitting text into chunks
  // const vectors = data.map((d, i) => ({
  //   id: d.id,
  //   values: embeddings[i].values,
  //   metadata: { text: d.text }
  // }));

  const vectors = data.map((d, i) => {
    const chunks = splitTextIntoChunks(d.text, MAX_METADATA_SIZE);
    return chunks.map((chunk, chunkIndex) => ({
        id: `${d.id}-${chunkIndex}`,  // Unique ID for each chunk
        values: embeddings[i].values,
        metadata: { text: chunk }
    }));
  }).flat(); // Flatten the array of chunks

  if (vectors.length === 0) {
      console.log('No valid vectors to upsert');
      return;
  }

  console.log('Number of vectors to upsert: ', vectors.length);

  await index.namespace('ns1').upsert(vectors);
  const stats = await index.describeIndexStats();

}

async function removeVector(uuid) {
    // Get Pinecone index instance

    console.log('removing vector ', uuid);

    const index = pc.index(indexName);

    // Delete the vector with the given UUID
    await index.namespace('ns1').deleteOne(uuid);

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

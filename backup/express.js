import fs from 'fs';
import http from 'http';
import https from 'https';
import express from 'express';
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from 'cors';
import dotenv from "dotenv";
import { generateResponse, interpretQuery, queryPinecone, generateSummary} from './chatbotClient.js';
import multer from 'multer';
import bodyParser from 'body-parser';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import parseOfficeFile from "./officeParser.js";
import { connectDB } from './db.js';  // Corrected import
import { createOrUpdateUser, updateUserPreferences, getUserPreferences } from './user.js';  // Corrected import
import { OAuth2Client } from 'google-auth-library';
import User from './user.js';
import decrypt from './decryption.js';

const CLIENT_ID = '58049448026-qb3gkpaigug5iobp7vnft7s4jl4n2a52.apps.googleusercontent.com'; // Your Google client ID here
const SECRET_KEY = process.env.JWT_SECRET || "E23DKSLT93LSL312K5";

const client = new OAuth2Client(CLIENT_ID);

const pc = new Pinecone({
  apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
});

dotenv.config();
const app = express();
const PORT = 3000;
// *** production
// const indexName = 'allen-dev';
const indexName = 'panlo-global';
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

//*** Production ***
const options = {
  key: fs.readFileSync('/etc/ssl/privkey1.pem'), // Adjust path to your private key
  cert: fs.readFileSync('/etc/ssl/fullchain1.pem'), // Adjust path to your certificate
};

app.use(cors(corsOptions));  // Enable CORS with specific options
app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
connectDB();


// Middleware to verify the Google ID token
const verifyGoogleToken = async (req, res, next) => {
  const idToken = req.headers.authorization?.split(' ')[1]; // Get token from "Authorization: Bearer <id_token>"

  if (!idToken) {
    return res.status(400).json({ error: "No ID token provided" });
  }

  try {
    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: CLIENT_ID, // Specify the client ID to verify the token was issued for your app
    });

    const payload = ticket.getPayload(); // This contains user info (e.g., email, name, etc.)
    console.log("Google token payload: ", payload);

    // Attach user information to the request (you can use this for further processing)
    req.user = payload;

    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error("Error verifying Google ID token:", error);
    return res.status(401).json({ error: "Invalid Google token" });
  }
};

// Middleware to verify jwt token
function verifyJwtToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  console.log('Recieved jwt token, ', token);

  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;  // now contains googleId, email, etc.
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(403).json({ error: "Invalid token" });
  }
}


// // 📌 User Registration
// app.post("/register", async (req, res) => {
//   const { username, email, password } = req.body;
//   console.log('username: ', username);
//   console.log('email: ', email);
//   console.log('password: ', password);

//   if (!username || !email || !password) {
//     return res.status(400).json({ error: "All fields are required!" });
//   }

//   // Additional validation: Check username length
//   if (password.length < 3) {
//     return res.status(400).json({ error: "password must be at least 3 characters long" });
//   }

//   console.log('Registered successfully');

//   const hashedPassword = await bcrypt.hash(password, 10);
//   users.push({ username, email, password: hashedPassword });
//   res.json({ message: "User registered successfully" });
// });

// // 📌 User Login
// app.post("/login", async (req, res) => {
//   const { email, password } = req.body;
//   console.log('email: ', email);
//   console.log('password: ', password);
//   if (!email || !password) {
//     return res.status(400).json({ error: "All fields are required!" });
//   }

//   const user = users.find((u) => u.email === email);
//   if (!user || !(await bcrypt.compare(password, user.password))) {
//     return res.status(401).json({ error: "Invalid credentials" });
//   }

//   console.log('Logged in successfully');
//   const token = jwt.sign({ email }, SECRET_KEY, { expiresIn: "1h" });
//   res.json({ token });
// });

// 📌 Protect Upload Endpoint
// const authenticate = (req, res, next) => {
//   const token = req.headers.authorization?.split(" ")[1];
//   if (!token) return res.status(401).json({ error: "Unauthorized" });

//   try {
//     const decoded = jwt.verify(token, SECRET_KEY);
//     req.user = decoded;
//     next();
//   } catch (err) {
//     res.status(401).json({ error: "Invalid token" });
//   }
// };

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

app.post('/embed-text', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, uuid, text, metadata, isEncrypted } = req.body;
    const encryptionKey = req.headers['x-encryption-key'];

    console.log('encryptionKey', encryptionKey);

    let decryptedText = text;
    let decryptedMetadata = metadata;

    if (isEncrypted && encryptionKey) {
      // Decrypt the text and metadata

      console.log('isEncrypted & encryptionKey');
      decryptedText = decrypt(text, encryptionKey);
      decryptedMetadata = JSON.parse(decrypt(metadata, encryptionKey));
    }

    // Check if UUID and text are provided
    if (!uuid || !text || !metadata) {
      return res.status(400).json({ error: "UUID, text, and metadata are required!" });
    }
    console.log('Received googleId:', googleId);
    console.log('Received UUID:', uuid);
    console.log('Received text:', decryptedText);
    console.log('Received metadata:', decryptedMetadata);

    // Ensure metadata has necessary fields
    const { filename, filepath, fileType, fileSize, createdAt, updatedAt, folderName } = decryptedMetadata;

    if (!filename || !filepath || !fileType || !fileSize || !createdAt || !updatedAt || !folderName) {
      return res.status(400).json({ error: "Metadata fields (filename, filepath, fileType, fileSize, createdAt, updatedAt, folderName) are required!" });
    }

    // Convert createdAt and updatedAt to timestamps (milliseconds since the Unix epoch)
    const createdAtTimestamp = new Date(createdAt).getTime();  // Convert to timestamp
    const updatedAtTimestamp = new Date(updatedAt).getTime();  // Convert to timestamp


    const updatedMetadata = {
      ...decryptedMetadata,
      createdAt: createdAtTimestamp,  // Store as timestamp
      updatedAt: updatedAtTimestamp,  // Store as timestamp
      text: decryptedText  // Add the original text to the metadata
    };

    let jsonData = {
      sections: []
    };

    let currentSection = {
      text: "",
      id: "",
      metadata: {}
    };

    currentSection.id = uuid;
    currentSection.text = text;
    currentSection.metadata = updatedMetadata;

    jsonData.sections.push(currentSection);

    await upsertVector(googleId, jsonData.sections);

    // Send success response
    res.json({ message: `Vector with with UUID ${uuid} successfully embedded and stored in Pinecone namespace`, uuid });

  } catch (error) {
    console.error('Error embedding text:', error);
    res.status(500).json({ error: 'Failed to embed and store text in Pinecone' });
  }
});

app.post('/delete-vector', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, uuid } = req.body;

    // Check if UUID is provided
    if (!uuid) {
      return res.status(400).json({ error: "UUID is required!" });
    }

    removeVector(googleId, uuid);

    res.json({ message: `Vector with UUID ${uuid} deleted successfully`, uuid });
  } catch (error) {
    console.error('Error deleting vector:', error);
    res.status(500).json({ error: 'Failed to delete vector from Pinecone' });
  }
});

app.post('/delete-vectors', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, uuids } = req.body;

    if (!uuids || !Array.isArray(uuids) || uuids.length === 0) {
      return res.status(400).json({ error: "A list of UUIDs is required." });
    }

    removeVectors(googleId, uuids);

    res.json({ message: "Batch delete successful", uuids });
  } catch (error) {
    console.error('Error in batch delete:', error);
    res.status(500).json({ error: 'Batch delete failed' });
  }
});



// app.post('/upload', authenticate, upload.single('file'), (req, res) => {
//   // let filenameWithoutExtension = req.file.originalname.replace('.txt', '');
//   console.log('Uploaded File:', req.file);
//   // console.log('Filename:', filenameWithoutExtension);  // Print the original filename

//   let jsonData = {
//     sections: []
//   };

//   let currentSection = {
//     text: "",
//     id: ""
//   };

//   if (!req.file) {
//     return res.status(400).json({ error: 'No file uploaded' });
//   }

//   let fileExtension = path.extname(req.file.originalname); // Get original file extension
//   // let filePath = `${req.file.path}${fileExtension}`; 

//   const filePath = req.file.path;
//   const tempFilePath = `${req.file.path}${fileExtension}`;
//   fs.copyFileSync(filePath, tempFilePath);


//   console.log('tempFilePath: ', tempFilePath);

//   parseOfficeFile(tempFilePath)
//   .then((data) => {
//     // console.log("Extracted Text:", data);

//     currentSection.id = filePath;
//     currentSection.text = data;

//     jsonData.sections.push(currentSection);

//     embed(jsonData.sections);

//     // Clean up the uploaded file
//     fs.unlink(filePath, (unlinkErr) => {
//       if (unlinkErr) {
//         console.error('Error deleting file:', unlinkErr);
//       }
//     });

//     res.json({ message: 'File successfully uploaded and parsed.'});

//   })
//   .catch((err) => {
//     console.error("Error Parsing File:", err);
//   });
// });


app.post('/chat', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, query, memory, answerMode, filters } = req.body; // User input from the front-end
    console.log('user query is ', query, ' googleId ', googleId, ' mode ', answerMode, ' filters ', filters);


    const user = await User.findOne({ googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const isExpired = user.isExpired();
    console.log('user.isExpired(): ', isExpired);
    console.log('About to check expiration condition...');

    if (isExpired) {
      console.log('User is expired, returning expiration message');
      return res.json({
        response: {
          aiResponse: "Your free trial has expired after 30 days. Please contact us for a quote or further discussion at g1ahsia@gmail.com.",
          citedSources: []
        }
      });
    }
    
    console.log('User is not expired, proceeding with normal response');
    // const filters = await interpretQuery(query);


    const response = await generateResponse(googleId, query, 'multilingual-e5-large', memory, answerMode, filters);

// const filters = {
//   updatedAt: {
//     '$gte': new Date('2024-09-10T00:00:00Z').getTime(),  // Start of the date range in ISO format
//     '$lte': new Date('2024-09-19T23:59:59Z').getTime()   // End of the date range in ISO format
//   }
// };

// const result = queryPinecone(googleId, query, 'multilingual-e5-large', 0.8, 100, filters);

// return;

    // const filters = {
    //   fileType: {
    //     "$eq": "PNG"  // This will match any file with type "png"
    //   }
    // }


    res.json({ response });
  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/generate-summary', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, text, filename, language } = req.body;
    
    // Validate required fields
    if (!googleId || !text || !filename) {
      return res.status(400).json({ error: 'googleId, text, and filename are required' });
    }

    // Check if user exists and is not expired
    const user = await User.findOne({ googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isExpired()) {
      return res.status(403).json({ 
        error: "Your free trial has expired after 30 days. Please contact us for a quote or further discussion at g1ahsia@gmail.com."
      });
    }

    console.log(`Generating summary for file: ${filename} (user: ${googleId}) in language: ${language || 'en'}`);

    // Use the generateSummary function from chatbotClient with language preference
    const result = await generateSummary(text, filename, language || 'en');

    res.json(result);

  } catch (error) {
    console.error('Error generating summary:', error);
    
    // Handle specific error messages from generateSummary
    if (error.message.includes('OpenAI API quota exceeded')) {
      return res.status(429).json({ 
        error: 'OpenAI API quota exceeded. Please try again later.' 
      });
    }
    
    if (error.message.includes('OpenAI API configuration error')) {
      return res.status(500).json({ 
        error: 'OpenAI API configuration error. Please contact support.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to generate summary',
      details: error.message
    });
  }
});

app.post('/findFiles', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, query, filters } = req.body; // User input from the front-end
    console.log('user query is ', query, ' googleId ', googleId, ' filters ', filters);

    const user = await User.findOne({ googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }


    // const filters = {
    //   updatedAt: {
    //     '$gte': new Date('2024-09-10T00:00:00Z').getTime(),  // Start of the date range in ISO format
    //     '$lte': new Date('2024-09-19T23:59:59Z').getTime()   // End of the date range in ISO format
    //   }
    // };

    const response = await queryPinecone(googleId, query, model, 0.83, 100, filters);

    const uuids = response.map(r => r.id.split('-').slice(0, 5).join('-'));
    res.json({ uuids });

  } catch (error) {
    console.error('Error generating response:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/getTranscription', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, uuid, chunks } = req.body;
    console.log('Getting transcription for UUID:', uuid, 'googleId:', googleId, 'chunks:', chunks);

    const user = await User.findOne({ googleId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!uuid) {
      return res.status(400).json({ error: 'UUID is required' });
    }

    const index = pc.index(indexName);
    const chunkCount = chunks || 1;
    
    let transcriptionParts = [];
    const vectorIds = [];
    
    // Always fetch chunks with index format (uuid-0, uuid-1, uuid-2, etc.)
    console.log(`Fetching ${chunkCount} chunks for UUID: ${uuid}`);
    
    const chunkPromises = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunkId = `${uuid}-${i}`;
      chunkPromises.push(
        index.namespace(googleId).fetch([chunkId]).then(response => {
          console.log(`Fetch response for ${chunkId}:`, JSON.stringify(response, null, 2));
          return {
            index: i,
            id: chunkId,
            data: response.records && response.records[chunkId] ? response.records[chunkId] : null,
            rawResponse: response
          };
        })
      );
    }
    
    // Fetch all chunks in parallel
    const chunkResults = await Promise.all(chunkPromises);

    console.log('chunkResults: ', chunkResults);
    
    // Process results in order
    for (const result of chunkResults) {
      if (result.data) {
        const text = result.data.metadata?.text || '';
        transcriptionParts.push(text);
        vectorIds.push(result.id);
        console.log(`Chunk ${result.index}: ${text.substring(0, 100)}...`);
      } else {
        console.warn(`Chunk ${result.id} not found`);
      }
    }

    if (transcriptionParts.length === 0) {
      return res.status(404).json({ error: 'No transcription found for this file' });
    }

    // Concatenate all text parts
    const fullTranscription = transcriptionParts.join(' ').trim();

    if (!fullTranscription) {
      return res.status(404).json({ error: 'No transcription text found in vector metadata' });
    }

    console.log(`Returning transcription with ${transcriptionParts.length} parts, total length: ${fullTranscription.length} characters`);

    res.json({ 
      transcription: fullTranscription,
      chunks: transcriptionParts.length,
      vectorIds: vectorIds
    });

  } catch (error) {
    console.error('Error fetching transcription:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/update-vector-metadata', async (req, res) => {
  try {
    const { googleId, updates } = req.body;
    
    if (!updates || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates array is required' });
    }
    
    await updateVectorMetadata(googleId, updates);
    
    res.json({ 
      success: true, 
      message: `Updated metadata for ${updates.length} vectors` 
    });
  } catch (error) {
    console.error('Error updating vector metadata:', error);
    res.status(500).json({ error: 'Failed to update vector metadata' });
  }
});


async function upsertVector(namespace, data) {
  // Batch the data into smaller chunks

  console.log('upserting vector ', data, ' in namespace ', namespace);

    // Normalize folderName and filename to lowercase
  const normalizedData = data.map(d => {
    // Normalize folderName and filename to lowercase
    const normalizedMetadata = { 
      ...d.metadata,
      folderName: d.metadata.folderName ? d.metadata.folderName.toLowerCase() : null,  // Convert folderName to lowercase
      filename: d.metadata.filename ? d.metadata.filename.toLowerCase() : null,  // Convert filename to lowercase
      filepath: d.metadata.filepath || null, // Preserve filepath as-is (case sensitive)
      fileType: d.metadata.fileType ? d.metadata.fileType.toLowerCase() : null  // Convert fileType to lowercase
    };

    return {
      ...d,
      metadata: normalizedMetadata
    };
  });

  const embeddings = await pc.inference.embed(
    model,
    normalizedData.map(d => d.text),  // Use data here
    { inputType: 'passage', truncate: 'END' }
  );

  const index = pc.index(indexName);

  // 3/29/2025 Version Without Spitting text into chunks
  const vectors = normalizedData.map((d, i) => ({
    id: d.id,
    // values: embeddings[i].values,
    values: embeddings.data[i].values,
    metadata: d.metadata
  }));

  console.log('vectors: ', vectors);

  await index.namespace(namespace).upsert(vectors);
  const stats = await index.describeIndexStats();

}

async function removeVector(namespace, uuid) {
    // Get Pinecone index instance

    console.log('removing vector ', uuid, ' from namespace ', namespace);

    const index = pc.index(indexName);

    // Delete the vector with the given UUID
    // await index.namespace('ns1').deleteOne(uuid);
    await index.namespace(namespace).deleteOne(uuid);

}

async function removeVectors(namespace, uuids) {
  try {
    const index = pc.index(indexName);
    await index.namespace(namespace).deleteMany(uuids);
    console.log(`✅ Deleted vectors:`, uuids);
  } catch (error) {
    console.error("❌ Error deleting vectors in batch:", error);
  }
}

// New endpoint for metadata-only updates
async function updateVectorMetadata(namespace, vectorUpdates) {
  console.log('Updating vector metadata in namespace:', namespace);
  console.log('Updates:', vectorUpdates);

  const index = pc.index(indexName);
  
  // Update each vector's metadata individually
  for (const update of vectorUpdates) {
    // Normalize metadata to lowercase (same as upsert)
    const normalizedMetadata = { 
      ...update.metadata,
      folderName: update.metadata.folderName ? update.metadata.folderName.toLowerCase() : null,
      filename: update.metadata.filename ? update.metadata.filename.toLowerCase() : null,
      filepath: update.metadata.filepath || null, // Preserve filepath as-is (case sensitive)
      fileType: update.metadata.fileType ? update.metadata.fileType.toLowerCase() : null,
      smartFolderNames: update.metadata.smartFolderNames || []
    };

    // Use Pinecone's update API - only updates metadata, no re-embedding
    await index.namespace(namespace).update({
      id: update.id,
      metadata: normalizedMetadata
    });
    
    console.log(`Updated metadata for vector ${update.id}`);
  }
  
  console.log('✅ Batch metadata update completed');
}

// *** Production Start the HTTPS server
https.createServer(options, app).listen(PORT, () => {
  console.log(`Server running securely on https://api.pannamitta.com:${PORT}/get`);
});

// http.createServer(app).listen(PORT, '0.0.0.0', () => {
//   console.log(`Server running on http://192.168.0.104:${PORT}`);
// });

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

// API route to handle user data
app.post('/register', verifyGoogleToken, async (req, res) => {
  const userData = req.body;

  try {
    // Check if googleId and email are present in userData
    if (!userData.googleId || !userData.email) {
      return res.status(400).json({ error: "Missing googleId or email in user data" });
    }

    // Create or update the user
    const savedUser = await createOrUpdateUser(userData);

    // Generate JWT token
    const jwt_token = jwt.sign(
      { googleId: userData.googleId, email: userData.email },
      SECRET_KEY
    );
    console.log('JWT_SECRET:', SECRET_KEY);

    // Send success response
    res.status(200).json({ message: "User registered successfully", jwt_token });
  } catch (error) {
    // Log error and send failure response
    console.error('Error during registration:', error);
    res.status(500).json({ error: "Error during registration", details: error.message });
  }
});

// Test endpoint for user registration (bypasses Google token verification)
app.post('/test-register', async (req, res) => {
  const userData = req.body;

  try {
    // Check if googleId and email are present in userData
    if (!userData.googleId || !userData.email) {
      return res.status(400).json({ error: "Missing googleId or email in user data" });
    }

    // Create or update the user
    const savedUser = await createOrUpdateUser(userData);

    // Generate JWT token
    const jwt_token = jwt.sign(
      { googleId: userData.googleId, email: userData.email },
      SECRET_KEY
    );

    // Send success response
    res.status(200).json({ message: "Test user registered successfully", jwt_token });
  } catch (error) {
    // Log error and send failure response
    console.error('Error during test registration:', error);
    res.status(500).json({ error: "Error during test registration", details: error.message });
  }
});




// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });



// API route to save user preferences
app.post("/api/preferences", async (req, res) => {
  try {
    const { googleId, preferences } = req.body;
    
    if (!googleId || !preferences) {
      return res.status(400).json({ error: "Missing googleId or preferences" });
    }

    // Find user and update preferences
    const user = await User.findOne({ googleId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update user preferences
    user.preferences = preferences;
    await user.save();

    console.log("Preferences saved for user:", googleId);
    res.status(200).json({ message: "Preferences saved successfully" });
  } catch (error) {
    console.error("Error saving preferences:", error);
    res.status(500).json({ error: "Error saving preferences", details: error.message });
  }
});

// API route to get user preferences
app.get("/api/preferences/:googleId", async (req, res) => {
  try {
    const { googleId } = req.params;
    
    if (!googleId) {
      return res.status(400).json({ error: "Missing googleId" });
    }

    // Find user and get preferences
    const user = await User.findOne({ googleId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    console.log("Preferences retrieved for user:", googleId);
    res.status(200).json({ preferences: user.preferences });
  } catch (error) {
    console.error("Error retrieving preferences:", error);
    res.status(500).json({ error: "Error retrieving preferences", details: error.message });
  }
});

// API route to query vectors from Pinecone
app.post('/query-vectors', verifyJwtToken, async (req, res) => {
  try {
    const { googleId, query, topK = 100, filter = {} } = req.body;
    
    if (!googleId) {
      return res.status(400).json({ error: "Missing googleId" });
    }

    // Ensure topK is an integer
    const topKInt = parseInt(topK, 10);
    if (isNaN(topKInt) || topKInt <= 0) {
      return res.status(400).json({ error: "topK must be a positive integer" });
    }

    console.log(`🔍 Querying vectors for user: ${googleId}`);
    console.log(`Query: "${query}", topK: ${topKInt}, filter:`, filter);

    const index = pc.index(indexName);
    
    if (query && query.trim() !== '') {
      // Query with text (embed the query first)
      const embeddings = await pc.inference.embed(
        model,
        [query],
        { inputType: 'passage', truncate: 'END' }
      );
      
      const queryResponse = await index.namespace(googleId).query({
        vector: embeddings.data[0].values,
        topK: topKInt,
        filter: filter,
        includeMetadata: true
      });
      
      console.log(`✅ Found ${queryResponse.matches.length} matching vectors`);
      res.json({ matches: queryResponse.matches });
      
    } else {
      // Query all vectors (no text query, just get all vectors)
      // First, get index stats to see how many vectors we have
      const stats = await index.describeIndexStats();
      console.log('🔍 Full stats from Pinecone:', JSON.stringify(stats, null, 2));
      
      const namespaceStats = stats.namespaces[googleId];
      console.log('🔍 Namespace stats for', googleId, ':', namespaceStats);
      
      if (!namespaceStats) {
        console.log(`⚠️ No vectors found in namespace: ${googleId}`);
        res.json({ matches: [] });
        return;
      }
      
      const totalVectors = namespaceStats.recordCount || namespaceStats.vectorCount || 0;
      console.log(`📊 Total vectors in namespace ${googleId}: ${totalVectors}`);
      
      // Use the smaller of topKInt and totalVectors, but at least 1
      const queryTopK = Math.max(1, Math.min(topKInt, totalVectors));
      console.log(`🔢 Using queryTopK: ${queryTopK} (topKInt: ${topKInt}, totalVectors: ${totalVectors})`);
      
      // Create a dummy vector of zeros for broad query
      const dummyVector = new Array(stats.dimension).fill(0);
      
      const queryResponse = await index.namespace(googleId).query({
        vector: dummyVector,
        topK: queryTopK,
        filter: filter,
        includeMetadata: true
      });
      
      console.log(`✅ Retrieved ${queryResponse.matches.length} vectors out of ${totalVectors} total`);
      res.json({ matches: queryResponse.matches });
    }
    
  } catch (error) {
    console.error('❌ Error querying vectors:', error);
    res.status(500).json({ error: 'Failed to query vectors', details: error.message });
  }
});

// Test endpoint to check index stats
app.get('/test-index-stats', async (req, res) => {
  try {
    console.log('🔍 Testing index stats...');
    const index = pc.index(indexName);
    const stats = await index.describeIndexStats();
    console.log('📊 Full stats:', JSON.stringify(stats, null, 2));
    res.json({ stats });
  } catch (error) {
    console.error('❌ Error getting index stats:', error);
    res.status(500).json({ error: error.message });
  }
});



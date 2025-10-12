import express from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Endpoint to handle file upload
app.post('/upload', upload.single('file'), (req, res) => {
  const filePath = req.file.path;

  // Read and parse the file
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Error reading file.' });
    }

    // Example of parsing: splitting by lines
    const parsedContent = data.split('\n');

    // Clean up the uploaded file
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    });

    // Respond with the parsed content
    res.json({ message: 'File successfully uploaded and parsed.', parsedContent });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

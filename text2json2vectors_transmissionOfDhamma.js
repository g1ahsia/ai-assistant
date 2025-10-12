import fs from "fs";
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({
  apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
});

const indexName = 'the-transmission-of-the-dhamma-2018';
const model = 'multilingual-e5-large';
const filename = './files/transmissionOfDhamma2018.txt';
const chapters = [0, 4, 9, 13, 16, 22, 25,32, 25, 41, 44, 46, 54, 66, 70, 75, 89, 93, 97, 103, 108, 110, 123, 127, 133, 135, 140, 143, 146, 154, 163, 168, 173, 176, 184, 197, 200, 205, 208, 221, 228, 230, 234, 246, 255, 260, 269, 275, 279, 286, 288, 290, 295, 304, 308, 320, 322, 333, 339, 347, 351, 356, 362, 363];
const MAX_VECTORS_PER_REQUEST = 96;  // Max number of vectors Pinecone can handle at once

// Using async/await to handle file reading and processing
async function outputDataToEmbed(filename) {
  try {
    // Use fs.promises.readFile to read file asynchronously
    const data = await fs.promises.readFile(filename, 'utf-8');
    
    // Function to parse the text and convert to JSON
    const parseText = (text) => {
      const lines = text.split("\n");

      let jsonData = {
        sections: []
      };

      let currentSection = {
        text: "",
        id: ""
      };

      // Loop through lines and parse
      lines.forEach(line => {
        line = line.trim();

        // console.log('line ', line);
        // console.log(`Line: "${line}", Type: ${typeof line}`);
        // Check if line contains a page number and it's the next page of previous page
        if (/^\d+$/.test(line)) {
          currentSection.id = line;
          // if (chapters.indexOf(parseInt(line)) !== -1) {
            console.log('new chapter ', line);
            console.log('currentSection ', currentSection.text)
            jsonData.sections.push(currentSection);
            currentSection = {
              text: "",
              id: ""
            };
          // }
        } else {
          // Add content lines
          // if (line === "") {
          //   line = "\n";
          // }
          // currentSection.text = currentSection.text + '\n' + line;
          currentSection.text = currentSection.text + ' ' + line;
        }
      });

      return jsonData;
    };

    // Parse the text and convert to JSON
    const jsonOutput = parseText(data);

    return jsonOutput.sections;  // Return the parsed JSON

  } catch (err) {
    console.error("Error reading or parsing file:", err);
    return null;  // Return null if there's an error
  }
}

// Function to split the data into smaller batches
function batchData(data, batchSize) {
  const batches = [];
  for (let i = 0; i < data.length; i += batchSize) {
    batches.push(data.slice(i, i + batchSize));
  }
  return batches;
}

async function main() {
  const data = await outputDataToEmbed(filename);  // Await the result
  // console.log('1. ', data);  // Now `data` will be the parsed JSON output

    // Batch the data into smaller chunks
  const batches = batchData(data, MAX_VECTORS_PER_REQUEST);


  for (let batch of batches) {
    const embeddings = await pc.inference.embed(
      model,
      batch.map(d => d.text),  // Use data here
      { inputType: 'passage', truncate: 'END' }
    );

    console.log('1. embedding ', embeddings[0]);

    const index = pc.index(indexName);

    const vectors = batch.map((d, i) => ({
      id: d.id,
      values: embeddings[i].values,
      metadata: { text: d.text }
    }));

    await index.namespace('ns1').upsert(vectors);

    const stats = await index.describeIndexStats();

    console.log('2. index ', stats)

  }

  // Further code for embeddings and Pinecone operations
  // if (data) {
    // Perform your Pinecone operations here
    // console.log('trying to embed');

  // }
}

main();  // Call the main function
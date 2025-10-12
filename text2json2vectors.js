import fs from "fs";
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({
  apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
});

const indexName = 'cct-manual-2014';
const model = 'multilingual-e5-large';
const filename = './files/English_CCT_KIT_2014.txt';

// Using async/await to handle file reading and processing
async function outputDataToEmbed(filename) {
  try {
    // Use fs.promises.readFile to read file asynchronously
    const data = await fs.promises.readFile(filename, 'utf-8');
    
    // Function to parse the text and convert to JSON
    const parseText = (text) => {
      var previousPageNumber = 0;
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

        // Check if line contains a page number and it's the next page of previous page
        if (/^\d+$/.test(line) && parseInt(line) == previousPageNumber + 1) {
          currentSection.id = line;

          if (previousPageNumber != 96) {
            jsonData.sections.push(currentSection);
            previousPageNumber = parseInt(line);
            currentSection = {
              text: "",
              id: ""
            };
          }
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

async function main() {
  const data = await outputDataToEmbed(filename);  // Await the result
  console.log('1. ', data);  // Now `data` will be the parsed JSON output

  // Further code for embeddings and Pinecone operations
  if (data) {
    // Perform your Pinecone operations here
    const embeddings = await pc.inference.embed(
      model,
      data.map(d => d.text),  // Use data here
      { inputType: 'passage', truncate: 'END' }
    );

    console.log('1. embedding ', embeddings[0]);

    const index = pc.index(indexName);

    const vectors = data.map((d, i) => ({
      id: d.id,
      values: embeddings[i].values,
      metadata: { text: d.text }
    }));

    await index.namespace('ns1').upsert(vectors);

    const stats = await index.describeIndexStats();

    console.log('2. index ', stats)
  }
}

main();  // Call the main function
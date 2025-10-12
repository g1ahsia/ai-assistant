import fs from "fs";
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({
  apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
});

const indexName = 'quickstart';

const model = 'multilingual-e5-large';

const filename = './files/English_CCT_KIT_2014.txt';

function outputDataToEmbed(filename) {

  // Reading the content from a text file
  fs.readFile(filename, 'utf-8', (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      return;
    }

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
        // if (line === "") return; // Skip empty lines

        // Check if line contains a page number and it's the next page of previous page
        if (/^\d+$/.test(line) && parseInt(line) == previousPageNumber+1) {
          // console.log('line contains a page number:' , line)
          currentSection.id = line;
          jsonData.sections.push(currentSection);
          previousPageNumber = parseInt(line);
            // console.log("Adding page number");
          currentSection = {
            text: "",
            id: ""
          };
        } else {
          // Add content lines
          // console.log('line contains not a page number', line)
          // console.log("Adding the next line: ", line);
            if (line === "") {
              line = "\n";
            }
          currentSection.text =  currentSection.text + '\n' + line;
        }
      });

      return jsonData;
    };

    // Parse the text and convert to JSON
    const jsonOutput = parseText(data);

    return jsonOutput;

    // Log the JSON output
    // console.log(JSON.stringify(jsonOutput, null, 2));
  });

}


var data = outputDataToEmbed(filename);
console.log('1. ', data);



//   console.log('1: ', jsonOutput.sections);

//   const data1 = [
//     { id: 'vec1', text: 'Apple is a popular fruit known for its sweetness and crisp texture.' },
//     { id: 'vec2', text: 'The tech company Apple is known for its innovative products like the iPhone.' }
// ];


//   console.log('2: ', data1);

//   const embeddings = pc.inference.embed(
//     model,
//     data1.map(d => d.text),
//     { inputType: 'passage', truncate: 'END' }
//   );

//   console.log('1. embedding ', embeddings[0]);

//   // Upsert the six generated vector embeddings into a new ns1 namespace in your index:

//   const index = pc.index(indexName);

//   const vectors = data1.map((d, i) => ({
//     id: d.id,
//     values: embeddings[i].values,
//     metadata: { text: d.text }
//   }));

//   index.namespace('ns1').upsert(vectors);


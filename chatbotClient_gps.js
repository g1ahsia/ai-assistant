import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { Memory } from './chatbotMemory.js';

const pc = new Pinecone({ apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX' });
const openai = new OpenAI();
// const indexName = 'cct-manual-2014';
const indexName = 'gps';
const index = pc.index(indexName);
const model = 'multilingual-e5-large';
// const memory = new Memory();

async function queryPinecone(query, model) {
  const embedding = await pc.inference.embed(model, [query], { inputType: 'query' });

  const queryResponse = await index.namespace('ns1').query({
    topK: 5, // Retrieve top 5 results
    vector: embedding[0].values,
    includeValues: true,
    includeMetadata: true,
  });

  return queryResponse.matches.filter(match => match.score >= 0.80); // Filter low-score matches
}

export async function generateResponse(userQuery, model, clientMemory) {
	const queryResponse = await queryPinecone(userQuery, model);

	console.log('pinecone response: ', queryResponse);

	const relevantText = queryResponse.length > 0
    ? queryResponse.map(match => match.metadata.text).join('\n')
    : 'No relevant information found in the database.';

  // Get the memory as a string (previous user inputs and AI responses)
  	// const memoryContext = memory.getMemoryAsString();

    const memoryContext = clientMemory.map(interaction => 
    `User: ${interaction.user}\nAI: ${interaction.ai}`
    ).join("\n");

  	console.log('client memory content: \n[', memoryContext, ']');

	const openaiResponse = await openai.chat.completions.create({
		model: 'gpt-4o-mini',
	    messages: [
	      { role: 'system', content: 'You are a helpful assistant with access to a knowledge database.' },
	      { role: 'user', content: `Here is the context: \n${relevantText}\n\n
	      							Here is some context from previous conversation: \n${memoryContext}\n\n
	      							Please provide the answer containing only the text from the context to the query: ${userQuery} \n\n
	    								If the context is empty, then ask to provide additional information in the query.`},
	   ],
	});
	// 	const openaiResponse = await openai.chat.completions.create({
	// 	model: 'gpt-4o-mini',
	//     messages: [
	//       { role: 'system', content: `You are a helpful assistant with access to a knowledge database. Always provide responses based only on the provided context and memory. Do not fabricate information outside of the given data.` },
	//       { role: 'assistant', content: `Based on the following context and memory, I will answer the user query:` },
	//       { role: 'assistant', content: `Here is the context from the knowledge base: \n ${relevantText}`},
	//       ...memoryContext, // Spreads the array of past interactions into the messages array
	//       { role: 'user', content: `${userQuery}`}
	//    ],
	// });

	const aiResponse = openaiResponse.choices[0].message.content;

	// memory.addInteraction(userQuery, aiResponse);
	
	const tokenUsage = openaiResponse.usage;

	console.log(`Prompt Tokens: ${tokenUsage.prompt_tokens}`);
	console.log(`Completion Tokens: ${tokenUsage.completion_tokens}`);
	console.log(`Total Tokens: ${tokenUsage.total_tokens}`);

	return aiResponse;
}


// const query1 = '如何成為一位謙遜的人？'; // Example query (replace with your actual query)
// generateResponse(query1, model).then(response => {
//   console.log('8. Generated Text:', response);
// }).catch(error => {
//   console.error('Error:', error);
// });

import readline from 'readline';
import { generateResponse } from './chatbotClient.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const chat = async () => {
  rl.question('You: ', async (userQuery) => {
    const response = await generateResponse(userQuery, 'multilingual-e5-large');
    console.log('Bot:', response);
    chat(); // Recursive call for continuous chatting
  });
};

chat();

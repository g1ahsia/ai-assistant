const chatWindow = document.getElementById('chat-window');
const queryInput = document.getElementById('query');
const sendButton = document.getElementById('send');

// Function to add a message to the chat window
const addMessage = (text, sender) => {
  const message = document.createElement('p');
  message.classList.add(sender);
  message.textContent = text;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight; // Scroll to the bottom
};

// Event listener for the send button
sendButton.addEventListener('click', async () => {
  const query = queryInput.value.trim();
  if (!query) return;

  // Display user query
  addMessage(query, 'user');
  queryInput.value = ''; // Clear input

  // Send query to the server
  try {
    const response = await fetch('https://54.221.145.150:3000/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    const data = await response.json();

    // Display chatbot response
    addMessage(data.response, 'bot');
  } catch (error) {
    console.error('Error:', error);
    addMessage('Error connecting to chatbot server.', 'bot');
  }
});

// Pressing Enter triggers the send button
queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendButton.click();
  }
});

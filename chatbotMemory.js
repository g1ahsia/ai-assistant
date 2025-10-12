export class Memory {
  constructor() {
    this.history = [];
    this.maxHistoryLength = 5;  // Store the last 5 interactions
  }

  // Add a new interaction (user's input + AI's response) to history
  addInteraction(userInput, aiResponse) {
    this.history.push({ user: userInput, ai: aiResponse });
    if (this.history.length > this.maxHistoryLength) {
      // Trim to the most recent interactions (keep only the latest `maxHistoryLength`)
      this.history.shift();
    }
  }

  // Get the memory as a formatted string to pass to OpenAI
  getMemoryAsString() {
    return this.history
      .map((interaction) => {
        return `User: ${interaction.user}\nAI: ${interaction.ai}`;
      })
      .join("\n");
  }

  // Get memory formatted as chat messages for OpenAI's API
  getMemoryAsChatMessages() {
    return this.history.flatMap((interaction) => [
      { role: "user", content: interaction.user },
      { role: "assistant", content: interaction.ai },
    ]);
  }

}

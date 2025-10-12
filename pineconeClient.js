import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pc = new Pinecone({
  apiKey: 'pcsk_6cUWc6_DW2EbgLmitznWXsTXbdYsLU4bs4gVLdywWVFXUBJ8GWNDVriFR94Pa98XTkDrX'
});

const indexName = 'quickstart';

const openai = new OpenAI();

const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
        { role: "system", content: "You are a helpful assistant." },
        {
            role: "user",
            content: "Write a haiku about recursion in programming.",
        },
    ],
});

console.log('AI Assistant', completion.choices[0].message);


//An index defines the dimension of vectors to be stored and the similarity metric to be used when querying them.

/*

await pc.createIndex({
  name: indexName,
  dimension: 1024, // Replace with your model dimensions
  metric: 'cosine', // Replace with your model metric
  spec: { 
    serverless: { 
      cloud: 'aws', 
      region: 'us-east-1' 
    }
  } 
});

*/

//A vector embedding is a series of numerical values that represent the meaning and relationships of words, sentences, and other data.
//Use Pinecone Inference to generate embeddings from sentences related to the word "apple":

const model = 'multilingual-e5-large';

const data = [
    { id: 'vec1', text: 'Apple is a popular fruit known for its sweetness and crisp texture.' },
    { id: 'vec2', text: 'The tech company Apple is known for its innovative products like the iPhone.' },
    { id: 'vec3', text: 'Many people enjoy eating apples as a healthy snack.' },
    { id: 'vec4', text: 'Apple Inc. has revolutionized the tech industry with its sleek designs and user-friendly interfaces.' },
    { id: 'vec5', text: 'An apple a day keeps the doctor away, as the saying goes.' },
    { id: 'vec6', text: 'Apple Computer Company was founded on April 1, 1976, by Steve Jobs, Steve Wozniak, and Ronald Wayne as a partnership.' },
    { id: 'vec7', text: '如何面對學員的不恭敬心：我們應該保持同理心，充滿慈心與愛心，善待他人，理解他人的苦。' },
    { id: 'vec8', text: '學員對我不禮貌時，我應該好好管教他們，讓他們成為聽話的人。' },
    { id: 'vec9', text: '老師很自我貢高，需要消彌自我中心，保持謙遜的心，這樣變成謙虛的人',},
    { id: 'vec10', text: '「內觀」（Vipassana），意思是如其本然地觀察事物，它是印度最古老的靜坐方法之一。此技巧在超過兩千五百多年前重新被釋迦牟尼佛發現並將之傳授，以它做為普遍性的解藥，治療普遍性的痛苦，它就是生活的藝術。 此無宗教派別之分的技巧的目標是徹底根除內心所有不淨雜染，達到究竟解脫和最崇高的快樂。它的宗旨不是純粹治療身體上的疾病，而是從根本上治愈人類的痛苦。內觀是通過自我觀察來達到自我轉化的方法。它專注在身與心之間的密切關聯，此身與心之間的密切關聯可以通過經過訓練的專注力直接體驗到，專注在那促成生命體、那持續不斷地聯繫及影響心之流的身體上的感受。也就是這種以觀察為基礎，深入身和心共同的根源處的自我探索旅程，得以消融心的不淨雜染，結果獲得一顆平衡的心，充滿著愛與慈悲。那操作人類思想、情緒、判斷力和感受的科學原則因此變得清楚。通過直接體驗就會明白，一個人成長或退步的本質是什麼，他又如何產生痛苦或從痛苦中解脫的。生活的品質變得有較強的覺知力、沒有幻覺了、有自主力及心境安詳平靜。傳承自從釋迦牟尼佛時代開始，內觀由一系列沒有間斷過的師承所傳承下來。雖然祖籍源自印度，內觀傳承的現任老師，葛印卡先生，卻是在緬甸出生和成長。在緬甸生活時，他幸運的能向當時身任政府高官的烏巴慶長者，也就是他的老師，學習內觀技巧。在接受烏巴慶長者長達十四年的指導後，葛印卡老師於196​​9年移居印度並開始傳授內觀。自此，得葛印卡老師教授的學生數以萬計，包括來自東、西方各國，不同種族及宗教​​的人士。 1982年，葛印卡老師開始委任助理老師協助他指導課程，以應付內觀課程日益增長的需求。課程簡介此內觀技巧在十日住宿課程裡傳授， 期間參加者須遵守課程所規定的行爲規範，學習基本方法及充分練習以便從中體驗內觀的效益。課程要求認真、勤奮地用功。訓練過程有三個步驟。第一是在課程期間不殺生、不偷盜、不可有任何性行爲、不說謊、及不服用麻醉品。這簡單的道德規範旨在使心平靜，否則激動、不安的心難以進行自我觀察的工作。 接下來的步驟是培養心的自主能力，學習將注意力鎖定在氣息之流不斷變化的自然實相-當氣息從鼻孔進來和出去時。 到了第四天，心開始較爲平靜和專注，這樣的心擁有較好的能力來練習內觀技巧：就是觀察全身所有的感受，了解它們的本質，學習對它們不起反應以培養平等心。 課程最後的一整天，參加者將學習對所有的眾生散發慈愛和善意-慈悲觀，也就是將自己在內觀課程中發展出的純淨善念與一切眾生分享。這整個練習其實是一項心的訓練。正如肢體運動可以促進身體健康，練習內觀可以培養健康的心。正因爲內觀能夠給人實實在在的幫助，所以非常重視保持此技巧的原始與純淨。傳授內觀是免費的，不存在商業性質。任何參與內觀教導的老​​師或服務人員都不收取任何物質報酬。 課程不收取任何費用，包括食宿全不收費。所有的開支是靠那些已完成課程並從中體驗到內觀的好處的學員們的捐獻，他們這麼做是爲了希望別人也有機會從中獲益。當然，唯有通過持續練習才能逐漸看到效果。期望在這十天內解決所有的問題並不切實際。無論如何， 參加者可以在這十天內學習到內觀的基本技巧，以應用於日常生活中。此技巧練習得愈多，脫離痛苦愈多，亦更接近究竟解脫的目標。即使是十天亦能對日常生活有明顯的幫助。歡迎每一位有誠意的人士前來參加此內觀課程，來親自體驗這技巧如何產生功效及衡量其益處。那些學習過內觀的人會發現它是一件寶貴的工具，藉之可以得到及和他人分享真正的快樂。'}
];

const embeddings = await pc.inference.embed(
  model,
  data.map(d => d.text),
  { inputType: 'passage', truncate: 'END' }
);

console.log('1. embedding ', embeddings[0]);

// Upsert the six generated vector embeddings into a new ns1 namespace in your index:

const index = pc.index(indexName);

const vectors = data.map((d, i) => ({
  id: d.id,
  values: embeddings[i].values,
  metadata: { text: d.text }
}));

await index.namespace('ns1').upsert(vectors);

// Use the describe_index_stats operation to check if the current vector count matches the number of vectors you upserted (6):

const stats = await index.describeIndexStats();

console.log('2. index ', stats)

//Search through the data to find items that are semantically similar to a query vector.

const query = [
  '我該如何保持謙虛，消彌自我的中心',
];

const embedding = await pc.inference.embed(
  model,
  query,
  { inputType: 'query' }
);


//Query the ns1 namespace for the three vectors that are most similar to the query vector, i.e., the vectors that represent the most relevant answers to your question:

const queryResponse = await index.namespace("ns1").query({
  topK: 6,
  vector: embedding[0].values,
  includeValues: true,
  includeMetadata: true
});

console.log('3. query ', query);
console.log('4. response ', queryResponse);


// Query Pinecone for similar vectors (this is an example)
async function queryPinecone(query) {
  const index = pc.Index(indexName); // Replace with your Pinecone index name
  const embedding = await pc.inference.embed(
    model,
    query,
    { inputType: 'query' }
  );

  // Query the Pinecone index (replace `query` with the actual query you want to use)
  const queryResponse = await index.namespace("ns1").query({
    topK: 3,
    vector: embedding[0].values,
    includeValues: true,
    includeMetadata: true
  });
  console.log('5. query ', query);
  console.log('6. response ', queryResponse);

    // Set a threshold score to filter results (e.g., 0.8)
  const threshold = 0.85;
  const filteredMatches = queryResponse.matches.filter(match => match.score >= threshold);

  console.log('7. filteredMatches ', filteredMatches);

  return filteredMatches; // Return the matches from the query response
}

const queryToSendToFunction = [
  'What is Apple as a tech company?',
];

// const queryResponseFromFunctionCall = await queryPinecone(queryToSendToFunction);

// console.log('queryResponseFromFunctionCall', queryResponseFromFunctionCall);



// Generate a response using OpenAI with the retrieved data
async function generateText(query) {

  const queryToSendToFunction = [query];

  // Step 1: Query Pinecone
  const queryResponse = await queryPinecone(queryToSendToFunction);

  // Step 2: Extract the relevant text from Pinecone response

  console.log('8. queryResponse ', queryResponse);

  // const relevantText = queryResponse.map(match => match.metadata.text).join('\n'); // Combine the text snippets
  
  const relevantText = queryResponse && queryResponse.length > 0
  ? queryResponse.map(match => match.metadata.text).join('\n') 
  : '';

  console.log('9. Relevant Text ', relevantText);

  // Step 3: Use OpenAI to generate text from the relevant information
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Or any available model
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant.',
      },
      {
        role: 'user',
        // content: `Here is the context: \n${relevantText}\n\nPlease provide the answer from rewriting the text in context to the query: ${query} \n\nIf the context is empty, then ask to provide additional information in the query.`,
        content: `Here is the context: \n${relevantText}\n\nPlease provide the answer containing only the text from the context to the query: ${query} \n\nIf the context is empty, then ask to provide additional information in the query.`,
        // content: `Here is the context: \n${relevantText}\n\nPlease provide the answer composed from the text in context to the query: ${query} \n\nIf the context is empty, then ask to provide additional information in the query.`,
      },
    ],
  });

  return response.choices[0].message.content; // Return the generated text
}

// Example usage:
const query1 = '請問蘋果是否每天都該吃一顆？'; // Example query (replace with your actual query)

generateText(query1).then(response => {
  console.log('8. Generated Text:', response);
}).catch(error => {
  console.error('Error:', error);
});


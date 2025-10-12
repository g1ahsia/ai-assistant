import dotenv from 'dotenv';
dotenv.config(); // Load environment variables

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { Memory } from './chatbotMemory.js';
import { format } from 'date-fns'; // Import date-fns for date formatting
import config from './config.js';

const pc = new Pinecone({ apiKey: config.pinecone.apiKey });
const openai = new OpenAI();
const indexName = config.pinecone.indexName;
const index = pc.index(indexName);
const model = config.model;

// Simple implementation of readLastLogin - replace with your actual implementation
async function readLastLogin(namespace) {
  // For now, return current date minus some days to simulate last login
  // Replace this with your actual last login tracking implementation
  const lastLogin = new Date();
  lastLogin.setDate(lastLogin.getDate() - 7); // Simulate 7 days ago
  return lastLogin.toISOString();
}

export async function queryPinecone(namespace, query, model, threshold, topK, filters = {}) {
  const embedding = await pc.inference.embed(model, [query], { inputType: 'query' });

  console.log('filters: ', filters);

  const queryOptions = {
    topK: topK, // Retrieve top k results
    // *** production
    // vector: embedding[0].values,
    vector: embedding.data[0].values,
    includeValues: true,
    includeMetadata: true
  };

  // Only add the filter if there is a valid filter
  if (filters && Object.keys(filters).length > 0) {
    queryOptions.filter = filters;
  }

  const queryResponse = await index.namespace(namespace).query(queryOptions);

  console.log('pinecone raw response: ', queryResponse);

  return queryResponse.matches.filter(match => match.score >= threshold); // Filter low-score matches
}

async function queryPineconeByIds(namespace, ids) {
  const queryResponse = await index.namespace(namespace).fetch(ids);

  // console.log('queryResponse:', queryResponse);

  return queryResponse;
}

export async function generateResponse(namespace, userQuery, model, clientMemory, answerMode, filters) {
  console.log('user query is ', userQuery, ' googleId ', namespace, ' mode ', answerMode, ' filters ', filters);

  const today = new Date();
  const lastLoginDate = new Date(await readLastLogin(namespace));
  const diffDays = Math.floor((today - lastLoginDate) / (1000 * 60 * 60 * 24));
  console.log('print diffDays: ', diffDays);

  // Handle new enhanced memory structure
  let memoryArray = [];
  let conversationContext = {};
  let recentTopics = [];
  
  if (clientMemory && typeof clientMemory === 'object') {
    if (Array.isArray(clientMemory)) {
      // Old format - array of memory entries
      memoryArray = clientMemory;
    } else {
      // New enhanced format - extract conversation history
      memoryArray = clientMemory.conversationHistory || [];
      conversationContext = clientMemory.conversationContext || {};
      recentTopics = clientMemory.recentTopics || [];
      console.log('Enhanced memory detected:', {
        historyLength: memoryArray.length,
        recentTopics,
        conversationContext
      });
    }
  }

  // Note: We used to have complex follow-up detection, but the enhanced system prompt 
  // now handles follow-ups intelligently by referencing conversation history

  const systemMessage = {
    role: 'system',
    content: `You are Panlo, an AI desktop assistant assisting in file management and content retrieval. Your name is Panlo. If anyone asks "what is your name", "who are you", or similar, always reply with "I'm Panlo." You help users by reading their files and file attributes and answering questions about them. If anyone asks "what you do" or similar, tell them what you can do for them.

IMPORTANT: When users make requests that refer to previous content without specifying what content, always look at the conversation history to understand what they're referring to. This applies to ANY language:

English examples:
- "Please translate to Japanese" = translate the content from my last response
- "Summarize it" = summarize the content from my last response  
- "What does that mean?" = explain the content from my last response
- "Translate this to English" = translate the content from my last response

Chinese examples:
- "翻譯成日文" = translate the content from my last response to Japanese
- "總結一下" = summarize the content from my last response
- "這是什麼意思？" = explain the content from my last response
- "翻譯成英文" = translate the content from my last response to English

Japanese examples:
- "日本語に翻訳して" = translate the content from my last response to Japanese
- "要約して" = summarize the content from my last response
- "これはどういう意味？" = explain the content from my last response

Spanish examples:
- "Traduce al japonés" = translate the content from my last response to Japanese
- "Resume esto" = summarize the content from my last response
- "¿Qué significa eso?" = explain the content from my last response

Always provide helpful responses for context-dependent requests by referencing the conversation history, regardless of the language used.

IMPORTANT: Always respond to the user in the SAME LANGUAGE as their query. If they ask in Chinese, respond in Chinese. If they ask in Japanese, respond in Japanese. If they ask in English, respond in English. Match their language exactly.`
  };

  // Build memory context from the array
  const memoryContext = memoryArray.map(interaction => 
    `User: ${interaction.user}\nAI: ${interaction.ai}\nCited Sources: ${interaction.citedSources}`
  ).join("\n");

  // Add enhanced context if available
  let enhancedContext = "";
  if (recentTopics.length > 0) {
    enhancedContext += `\nRecent conversation topics: ${recentTopics.join(', ')}\n`;
  }
  if (conversationContext.hasFollowUps) {
    enhancedContext += "User has been asking follow-up questions. Maintain consistency with previous responses.\n";
  }

  console.log('enhancedContext: ', enhancedContext);
  let queryResponse;
  let relevantText;

  // Include the folder filter into the userContent for AI to understand the context
  // if (Object.keys(filters).length > 0) {
  //   queryResponse = await queryPinecone(namespace, userQuery, model, 0.80, 10, filters);
  //   console.log("queryResponse: ", queryResponse);
  //   relevantText = queryResponse.length > 0
  //     ? queryResponse.map((match, i) =>
  //       `### Source: ${match.id}\n
  //       Filename: ${match.metadata.filename}\n
  //       File Type: ${match.metadata.fileType}\n
  //       Folder Name: ${match.metadata.folderName}\n
  //       Score: ${match.score.toFixed(2)})\n
  //       Content: ${match.metadata.text}`
  //       ).join('\n\n')
  //     : 'No relevant information found in the database.';

  // // Get the memory as a string (previous user inputs and AI responses)
  // // const memoryContext = memory.getMemoryAsString();

  //   // const filteredText = `The filter applied is: '${JSON.stringify(filters)}'`;
  //   // userContent = `Here are the files: \n${relevantText}\n\nPlease list the filenames and cite the sources at the end of the response you used in the exact format "**Sources**: Unique IDs exactly as shown in the context".`;
  //   userContent =
  //   answerMode === 'precise'
  //     ? `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **only based on the context** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context". If the context is empty, ask the user to provide more information.`
  //     : `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **using the context and your own knowledge** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context". If the context is empty, ask the user to provide more information.`;

  // Always perform fresh semantic search - the enhanced system prompt handles follow-ups intelligently
  queryResponse = await queryPinecone(namespace, userQuery, model, 0.10, 30, filters);
  console.log("pinecone raw response:", queryResponse);
  
  relevantText = queryResponse.length > 0
    ? queryResponse.map((match, i) =>
      `### Source: ${match.id}\n
      Filename: ${match.metadata.filename}\n
      File Type: ${match.metadata.fileType}\n
      Folder Name: ${match.metadata.folderName}\n
      Score: ${match.score.toFixed(2)})\n
      Content: ${match.metadata.text}`
      ).join('\n\n')
    : 'No relevant information found in the database.';
  // const userContent =
  //   answerMode === 'precise'
  //   ? `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **only based on the context** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context".\n\n  If the context is empty, ask the user to provide more information. If the cited sources contain almost identical information, such as similar filenames or content, ask the user if they want to remove duplicated copies.`
  //   : `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}\n\nPlease provide the answer **using the context and your own knowledge** to the query: ${userQuery}\n\n Cite any sources you used at the end of the response in the exact format "**Sources**: Unique IDs exactly as shown in the context". If the context is empty, ask the user to provide more information.`;

const userContent =
  answerMode === 'precise'
    ? `Here is the context from the user's documents: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}${enhancedContext}\n\nUser query: ${userQuery}

PRECISE MODE - EXTRACT PRIMARY CONTENT ONLY

CRITICAL: Your job is to find and extract THE ACTUAL CONTENT requested, not background/preparation information.

STEP 1: SYSTEMATIC SCAN OF ALL SOURCES
- Read every source completely, start to finish
- Identify all sections that relate to the query
- Do NOT stop after finding the first related section

STEP 2: CLASSIFY EACH SECTION BY TYPE
When you find multiple related sections, classify them:

TYPE A - DIRECT ANSWER CONTENT (This is what to extract):
   • The actual content that directly answers the query
   • Complete procedures, questions, statements, definitions, or instructions
   • Content often preceded by: "e.g.", "for example:", "following:", "such as:"
   • Specific wording, steps, or items to be used/followed

TYPE B - SUPPORTING CONTENT (Use only if Type A doesn't exist):
   • Additional related information
   • Supplementary guidelines or notes

TYPE C - META/CONTEXTUAL INFO (Avoid extracting this):
   • When to do something ("before X", "after Y", timing/scheduling)
   • Preparation or setup steps
   • Background rationale or explanations
   • Descriptions about the content rather than the content itself

SELECTION RULE: If the query asks for "the X" or "how to do X", extract the actual X itself (Type A), not information about when/why/how to prepare for X (Type C).

STEP 3: EXTRACT VERBATIM
- Copy complete text word-for-word, character-by-character
- Include ALL quoted text, examples, questions in full
- Preserve formatting: "...", [...], punctuation
- Combine seamlessly if content spans sources

CITE: "**Sources**: [IDs]"`
    : `Here is the context: \n${relevantText}\n\nHere is some context from previous conversation: \n${memoryContext}${enhancedContext}\n\nUser query: ${userQuery}

Your task:
1. Naturally understand the user's query using both the provided context and conversation history
2. If the query refers to previous content (like "translate to Japanese", "summarize it"), use the conversation history to understand what they mean
3. Provide the answer **using the context and your own knowledge** to the query
4. If the context is empty and you can't answer from conversation history, ask the user to provide more information
5. If you use context sources, cite them in this format: "**Sources**: Unique IDs exactly as shown in the context"`;

  console.log('user content: ', userContent);
  const messages = [
    systemMessage,
    { role: 'user', content: userContent }
  ];

  if (!openai) {
    throw new Error('OpenAI not available - API key missing');
  }

	const openaiResponse = await openai.chat.completions.create({
		model: 'gpt-4o-mini',
    max_tokens: 1024, // Limit response to 500 tokens
    messages: messages,
	});

  const { cleanedText: aiResponse, citedSources: citedSourceIds } = extractAndRemoveSources(openaiResponse.choices[0].message.content);

	const tokenUsage = openaiResponse.usage;

	console.log(`Prompt Tokens: ${tokenUsage.prompt_tokens}`);
	console.log(`Completion Tokens: ${tokenUsage.completion_tokens}`);
	console.log(`Total Tokens: ${tokenUsage.total_tokens}`);

  return {
    aiResponse: aiResponse,
    citedSources: citedSourceIds
  };

}

function extractAndRemoveSources(aiText) {
    console.log('openaiResponse:', aiText);

    // Match "**Sources**: ..." or "Sources: ..." (case-insensitive)
    const match = aiText.match(/[*]*Sources[*]*:\s*([^\n]+)/i);
    if (!match) return { cleanedText: aiText.trim(), citedSources: [] };

    console.log('Raw sources text:', match[1]);

    const citedSources = match[1]
        .split(',')
        .map(s => {
            const trimmed = s.trim();
            // Only remove quotes and extra whitespace, keep alphanumeric, spaces, hyphens, underscores, dots, slashes
            const cleaned = trimmed.replace(/['"]/g, '').trim();
            console.log(`Source cleaning: "${trimmed}" -> "${cleaned}"`);
            return cleaned;
        })
        .filter(Boolean);  // Remove empty strings

    console.log('Final citedSources:', citedSources);

    // Validate that these look like proper source IDs (should be alphanumeric with hyphens/underscores)
    const validSources = citedSources.filter(source => {
        const isValid = /^[a-zA-Z0-9_-]+$/.test(source) && source.length < 100;
        if (!isValid) {
            console.warn(`Invalid source ID detected: "${source}" - this looks like descriptive text, not a source ID`);
        }
        return isValid;
    });

    if (validSources.length !== citedSources.length) {
        console.warn(`Filtered out ${citedSources.length - validSources.length} invalid source IDs`);
    }

    const cleanedText = aiText.replace(match[0], '').trim();

    return {
        cleanedText,
        citedSources: validSources
    };
}

export async function interpretQuery(query) {
  // Prompt for GPT-4 to extract file type and date range from the query
  const today = format(new Date(), 'yyyy-MM-dd');

  const prompt = `
    You are a helpful assistant. Please extract the filename, file type (e.g., "png", "jpeg", "docx", "pdf"), folder name, and date ranges for both createdAt and updatedAt based on the following query. 

    Please return ONLY the JSON response with **no additional explanation** or text outside the JSON. The keys should be:
    - "filename" (e.g., fila name),
    - "fileType" (e.g., "png", "pdf", "docx", or an empty string if unknown),
    - "folderName" (e.g., "dana"),
    - "createdAt" (with "start" and "end" in "yyyy-MM-dd HH:mm:ss" format),
    - "updatedAt" (with "start" and "end" in "yyyy-MM-dd HH:mm:ss" format).

    Today's date is: ${today}

    Query: "${query}"

    Example output format (make it exact, no extra text):
    {
        "filename": "name of file",
        "fileType": "image",
        "folderName": "name of folder",
        "createdAt": {
            "start": "yyyy-MM-dd HH:mm:ss",
            "end": "yyyy-MM-dd HH:mm:ss"
        },
        "updatedAt": {
            "start": "yyyy-MM-dd HH:mm:ss",
            "end": "yyyy-MM-dd HH:mm:ss"
        }
    }

    ***If the query doesn't imply filename, folder name file type or date information, simply return a null output***
  `;

  // Send the prompt to GPT-4
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150
  });

  // Parse the response
  // Extract the response text
  let extractedData = response.choices[0].message.content.trim();
  console.log("Extracted Raw Filter Data:", extractedData); // Check the raw response

  // Regular expression to find JSON
  const jsonPattern = /\{.*\}/s; // This matches the first block of JSON

  // Use regex to find the JSON part of the response
  const match = extractedData.match(jsonPattern);

  if (match) {
    const jsonString = match[0]; // The matched JSON string

    // Try parsing the extracted JSON
    try {
      const parsedData = JSON.parse(jsonString);  // Parse the cleaned JSON

        // Build the query filter dynamically based on the provided filters
      const queryFilters = {};

      // if (parsedData.filename) {
      //   queryFilters.filename = parsedData.filename.toLowerCase();
      // }

      // if (parsedData.fileType) {
      //   queryFilters.fileType = parsedData.fileType.toLowerCase();
      // }

      // if (parsedData.folderName) {
      //   queryFilters.folderName = parsedData.folderName.toLowerCase();
      // }

      if (parsedData.createdAt) {
        if (parsedData.createdAt.start) {
          queryFilters['createdAt'] = queryFilters['createdAt'] || {};  // Initialize if not yet defined
          // Convert the start date to a timestamp using getTime()
          const startDate = new Date(parsedData.createdAt.start).getTime();
          queryFilters['createdAt']['$gte'] = startDate;  // Use Unix timestamp
        }
        if (parsedData.createdAt.end) {
          queryFilters['createdAt'] = queryFilters['createdAt'] || {};  // Initialize if not yet defined
          // Convert the end date to a timestamp using getTime()
          const endDate = new Date(parsedData.createdAt.end).getTime();
          queryFilters['createdAt']['$lte'] = endDate;  // Use Unix timestamp
        }
      }

      if (parsedData.updatedAt) {
        if (parsedData.updatedAt.start) {
          queryFilters['updatedAt'] = queryFilters['updatedAt'] || {};  // Initialize if not yet defined
          // Convert the start date to a timestamp using getTime()
          const startDate = new Date(parsedData.updatedAt.start).getTime();
          queryFilters['updatedAt']['$gte'] = startDate;  // Use Unix timestamp
        }
        if (parsedData.updatedAt.end) {
          queryFilters['updatedAt'] = queryFilters['updatedAt'] || {};  // Initialize if not yet defined
          // Convert the end date to a timestamp using getTime()
          const endDate = new Date(parsedData.updatedAt.end).getTime();
          queryFilters['updatedAt']['$lte'] = endDate;  // Use Unix timestamp
        }
      }

      console.log('query filters: ', queryFilters);

      return queryFilters;
    } catch (error) {
      console.error('Error parsing extracted JSON:', error);
      return null;
    }
  } else {
    console.error('No JSON found in response');
    return null;
  }

}

// Example usage
// const query = "幫我分析蕭光志兩個禮拜內的保險資料";
// interpretQuery(query).then(result => {
//   console.log("ai response for query:", result); // Expected: { fileType: "image", dateRange: { start: "2024-05-01", end: "2024-05-07" } }
// });



async function isFollowUpQuery(query) {
    const prompt = `
    You are a helpful assistant. Please analyze the following query and determine if it is a follow-up request to the previous responses.
    A follow-up query usually asks for more details, a summary, a clarification to the previous responses. 

    If it is a follow-up query, respond with 'yes'. If it is not a follow-up, respond with 'no'. 

    Query: "${query}"
    `;
    
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 100
        });

        const result = response.choices[0].message.content.trim().toLowerCase();
        
        // If it's a follow-up query, return 'yes', otherwise 'no'
        if (result === 'yes') {
            return true;
        } else {
            return false;
        }

    } catch (error) {
        console.error("Error determining follow-up query:", error);
        return { followUp: false, response: 'no' };  // Default to 'no' if error
    }
}

// Example usage:
const query = "提供更完整的描述"; // Example in Chinese meaning "Give me more details"
console.log(query);  // Output: { followUp: true, response: 'yes' }
isFollowUpQuery(query).then(result => {
    console.log(result);  // Output: { followUp: true, response: 'yes' }
});

// Function to generate summary using OpenAI
export async function generateSummary(text, filename, language = 'en') {
  try {
    console.log(`Generating summary for file: ${filename} in language: ${language}`);

    // Truncate text if it's too long (OpenAI has token limits)
    // Using a more conservative limit to avoid token limit issues
    const maxTextLength = 8000; // Approximately 2000 tokens
    const truncatedText = text.length > maxTextLength ? 
      text.substring(0, maxTextLength) + '...' : text;

    // Language-specific instructions
    const languageInstructions = {
      'en': 'Create a summary that captures the key points, main topics, and important details in 2-3 sentences.',
      'zh': '创建一个总结，用2-3句话概括关键要点、主要话题和重要细节。',
      'zh-TW': '建立一個摘要，用2-3句話概括關鍵要點、主要話題和重要細節。',
      'ja': '重要なポイント、主要なトピック、重要な詳細を2〜3文で要約してください。',
      'ko': '주요 요점, 주요 주제 및 중요한 세부 사항을 2-3문장으로 요약하세요.',
      'es': 'Crea un resumen que capture los puntos clave, temas principales y detalles importantes en 2-3 oraciones.',
      'fr': 'Créez un résumé qui capture les points clés, les sujets principaux et les détails importants en 2-3 phrases.',
      'de': 'Erstellen Sie eine Zusammenfassung, die die wichtigsten Punkte, Hauptthemen und wichtigen Details in 2-3 Sätzen erfasst.',
      'it': 'Crea un riassunto che catturi i punti chiave, i temi principali e i dettagli importanti in 2-3 frasi.',
      'pt': 'Crie um resumo que capture os pontos principais, tópicos principais e detalhes importantes em 2-3 frases.',
      'ru': 'Создайте резюме, которое охватывает ключевые моменты, основные темы и важные детали в 2-3 предложениях.',
      'ar': 'أنشئ ملخصًا يلتقط النقاط الرئيسية والمواضيع الأساسية والتفاصيل المهمة في 2-3 جمل.',
      'hi': 'मुख्य बिंदुओं, मुख्य विषयों और महत्वपूर्ण विवरणों को 2-3 वाक्यों में सारांशित करें।',
      'th': 'สร้างสรุปที่จับจุดสำคัญ หัวข้อหลัก และรายละเอียดสำคัญใน 2-3 ประโยค',
      'vi': 'Tạo bản tóm tắt nắm bắt các điểm chính, chủ đề chính và chi tiết quan trọng trong 2-3 câu.'
    };

    const instruction = languageInstructions[language] || languageInstructions['en'];
    
    // Language-specific prompt
    const languagePrompts = {
      'en': `Please provide a concise summary of the following document content from file "${filename}":\n\n${truncatedText}`,
      'zh': `请为文件"${filename}"的以下文档内容提供简洁的摘要：\n\n${truncatedText}`,
      'zh-TW': `請為檔案"${filename}"的以下文件內容提供簡潔的摘要：\n\n${truncatedText}`,
      'ja': `ファイル"${filename}"の以下の文書内容の簡潔な要約を提供してください：\n\n${truncatedText}`,
      'ko': `파일 "${filename}"의 다음 문서 내용에 대한 간결한 요약을 제공해주세요:\n\n${truncatedText}`,
      'es': `Proporciona un resumen conciso del siguiente contenido del documento del archivo "${filename}":\n\n${truncatedText}`,
      'fr': `Veuillez fournir un résumé concis du contenu suivant du document du fichier "${filename}":\n\n${truncatedText}`,
      'de': `Bitte geben Sie eine prägnante Zusammenfassung des folgenden Dokumentinhalts aus der Datei "${filename}" an:\n\n${truncatedText}`,
      'it': `Fornisci un riassunto conciso del seguente contenuto del documento dal file "${filename}":\n\n${truncatedText}`,
      'pt': `Forneça um resumo conciso do seguinte conteúdo do documento do arquivo "${filename}":\n\n${truncatedText}`,
      'ru': `Пожалуйста, предоставьте краткое резюме следующего содержимого документа из файла "${filename}":\n\n${truncatedText}`,
      'ar': `يرجى تقديم ملخص موجز للمحتوى التالي من الوثيقة من الملف "${filename}":\n\n${truncatedText}`,
      'hi': `फ़ाइल "${filename}" से निम्नलिखित दस्तावेज़ सामग्री का संक्षिप्त सारांश प्रदान करें:\n\n${truncatedText}`,
      'th': `กรุณาให้สรุปโดยย่อของเนื้อหาเอกสารต่อไปนี้จากไฟล์ "${filename}":\n\n${truncatedText}`,
      'vi': `Vui lòng cung cấp bản tóm tắt ngắn gọn về nội dung tài liệu sau từ tệp "${filename}":\n\n${truncatedText}`
    };

    const userPrompt = languagePrompts[language] || languagePrompts['en'];

    // Generate summary using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that creates concise, informative summaries of documents. ${instruction} Always respond in the language specified by the user.`
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    const summary = completion.choices[0]?.message?.content?.trim() || 'Unable to generate summary';

    console.log(`Summary generated for ${filename} in ${language}: ${summary.substring(0, 100)}...`);

    return {
      success: true,
      summary: summary,
      filename: filename,
      language: language
    };

  } catch (error) {
    console.error('Error generating summary:', error);
    
    // Handle specific OpenAI errors
    if (error.error?.type === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please try again later.');
    }
    
    if (error.error?.type === 'invalid_api_key') {
      throw new Error('OpenAI API configuration error. Please contact support.');
    }

    throw new Error(`Failed to generate summary: ${error.message}`);
  }
}

// const query1 = '如何成為一位謙遜的人？'; // Example query (replace with your actual query)
// generateResponse(query1, model).then(response => {
//   console.log('8. Generated Text:', response);
// }).catch(error => {
//   console.error('Error:', error);
// });

// generateSamplePrompts(model).then(response => {
//   console.log('8. Sample Text:', response);
// }).catch(error => {
//   console.error('Error:', error);
// });

